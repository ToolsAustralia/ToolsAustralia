#!/usr/bin/env npx tsx

/**
 * Repair major-draw entry rows that were corrupted by either:
 *
 *  1. The `removeMajorDrawEntries` over-removal bug — a refund of one draw's
 *     membership entries silently decremented an earlier draw's row.
 *  2. The `syncMajorDrawParticipation` admin-form clobber — saving from
 *     "Edit Entries" force-overwrote `entriesBySource.membership` to equal
 *     `totalEntries`, destroying the source breakdown.
 *
 * The fix reconstructs the expected per-draw state from the user's
 * PaymentEvent history (BenefitsGranted + RefundProcessed + drawGrants
 * ledger) and re-writes the user's row in each affected MajorDraw doc to
 * match.
 *
 * Usage:
 *   npm run fix:refund-entry-corruption -- --userId=<id> [--apply]
 *   npm run fix:refund-entry-corruption -- --email=<addr> [--apply]
 *   npm run fix:refund-entry-corruption -- --all [--apply]            # every user from find-refund-entry-corruption
 *   npm run fix:refund-entry-corruption:dry -- --all                  # dry run, even with --apply
 *
 * Flags:
 *   --userId=<id>          Target a single user by Mongo ObjectId.
 *   --email=<addr>         Target a single user by email (case-insensitive).
 *   --all                  Process every user with a RefundProcessed event since --since.
 *   --since=YYYY-MM-DD     Lower bound for --all (default 2025-01-01).
 *   --apply                Actually write changes. Without this flag, the
 *                          script is a no-op printout (dry-run).
 *   --restore-cancellation-upsell    Also restore the 100-entry cancellation
 *                          retention bonus to the draw that was active when
 *                          the user redeemed (looked up by
 *                          cancellationUpsellRedeemedAt). Off by default.
 *
 * Safety: defaults to dry-run output. The :dry npm variant force-disables
 *         --apply regardless of how it's invoked.
 *
 * Env: MONGODB_URI (from .env.local).
 */

import { config } from "dotenv";
import path from "path";
import mongoose from "mongoose";

config({ path: path.resolve(process.cwd(), ".env.local") });

type SourceKey =
  | "membership"
  | "one-time-package"
  | "upsell"
  | "mini-draw"
  | "bonus-entry-promo"
  | "promo-link"
  | "cancellation-upsell"
  | "referral";

type EventRow = {
  _id: string;
  eventType: string;
  userId: import("mongoose").Types.ObjectId;
  paymentIntentId: string;
  packageType: string;
  data: {
    entries?: number;
    grants?: { drawGrants?: Array<{ kind: string; drawId: string; sourceKey: string; entries: number }> };
    reversed?: { entries?: number; packageType?: string };
  };
  timestamp: Date;
};

function parseArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=").slice(1).join("=") : undefined;
}

const ARG_USER_ID = parseArg("userId");
const ARG_EMAIL = parseArg("email");
const ARG_ALL = process.argv.includes("--all");
const ARG_SINCE = parseArg("since") ?? "2025-01-01";
const ARG_APPLY = process.argv.includes("--apply");
const ARG_FORCE_DRY = process.argv.includes("--force-dry-run");
const ARG_RESTORE_CU = process.argv.includes("--restore-cancellation-upsell");

const DRY_RUN = ARG_FORCE_DRY || !ARG_APPLY;

if (!ARG_USER_ID && !ARG_EMAIL && !ARG_ALL) {
  console.error("Specify one of: --userId=<id>, --email=<addr>, --all");
  process.exit(1);
}

function eventToSourceKey(packageType: string): SourceKey | null {
  switch (packageType) {
    case "membership":
      return "membership";
    case "one-time":
      return "one-time-package";
    case "upsell":
      return "upsell";
    case "mini-draw":
      return "mini-draw";
    default:
      return null;
  }
}

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set (.env.local).");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) {
    console.error("Mongo connection is not ready");
    process.exit(1);
  }

  const usersColl = db.collection("users");
  const eventsColl = db.collection<EventRow>("paymentevents");
  const drawsColl = db.collection("majordraws");

  console.error(
    `Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY (writing to MongoDB)"}` +
      (ARG_RESTORE_CU ? " | restore-cancellation-upsell=ON" : "")
  );

  // Build target user list.
  let targets: Array<mongoose.Types.ObjectId> = [];
  if (ARG_USER_ID) {
    targets = [new mongoose.Types.ObjectId(ARG_USER_ID)];
  } else if (ARG_EMAIL) {
    const u = await usersColl.findOne(
      { email: { $regex: `^${ARG_EMAIL}$`, $options: "i" } },
      { projection: { _id: 1 } }
    );
    if (!u) {
      console.error(`No user found with email ${ARG_EMAIL}`);
      process.exit(1);
    }
    targets = [u._id as mongoose.Types.ObjectId];
  } else if (ARG_ALL) {
    const sinceDate = new Date(ARG_SINCE);
    console.error(`Loading users with RefundProcessed since ${sinceDate.toISOString()}…`);
    const ids = await eventsColl.distinct("userId", {
      eventType: "RefundProcessed",
      timestamp: { $gte: sinceDate },
    });
    targets = ids as unknown as Array<mongoose.Types.ObjectId>;
  }
  console.error(`Processing ${targets.length} user(s).`);

  let usersFixed = 0;
  let rowsRewritten = 0;
  let drawTotalsRecomputed = 0;

  for (const userId of targets) {
    const user = await usersColl.findOne(
      { _id: userId },
      {
        projection: {
          email: 1,
          accumulatedEntries: 1,
          cancellationUpsellRedeemed: 1,
          cancellationUpsellRedeemedAt: 1,
        },
      }
    );
    if (!user) {
      console.error(`  skip — user ${userId.toString()} not found`);
      continue;
    }
    const email = (user.email as string) ?? "";

    const events = (await eventsColl
      .find({ userId })
      .sort({ timestamp: 1 })
      .toArray()) as EventRow[];

    // Build the expected per-draw state from the ledger.
    type ExpectedRow = { totalEntries: number; entriesBySource: Partial<Record<SourceKey, number>> };
    const expected = new Map<string, ExpectedRow>();
    const bump = (drawId: string, key: SourceKey, delta: number): void => {
      let row = expected.get(drawId);
      if (!row) {
        row = { totalEntries: 0, entriesBySource: {} };
        expected.set(drawId, row);
      }
      row.entriesBySource[key] = (row.entriesBySource[key] ?? 0) + delta;
      row.totalEntries += delta;
    };

    for (const ev of events) {
      if (ev.eventType === "BenefitsGranted" || ev.eventType === "UpsellProcessed") {
        const drawGrants = ev.data.grants?.drawGrants;
        if (drawGrants?.length) {
          for (const g of drawGrants) {
            if (g.kind !== "major") continue;
            bump(g.drawId, g.sourceKey as SourceKey, g.entries);
          }
        }
        // Pre-ledger events: cannot reconstruct without external data.
        // Leave alone; the script will not touch draws we have no signal for.
      } else if (ev.eventType === "RefundProcessed" || ev.eventType === "RefundPartial") {
        const reversedPkgType = ev.data.reversed?.packageType ?? ev.packageType;
        const reversedEntries = ev.data.reversed?.entries ?? ev.data.entries ?? 0;
        if (reversedEntries <= 0) continue;
        const sourceKey = eventToSourceKey(reversedPkgType);
        if (!sourceKey) continue;
        const grant = events.find(
          (e) =>
            (e.eventType === "BenefitsGranted" || e.eventType === "UpsellProcessed") &&
            e.paymentIntentId === ev.paymentIntentId
        );
        const drawGrants = grant?.data.grants?.drawGrants;
        if (drawGrants?.length) {
          for (const g of drawGrants) {
            if (g.kind !== "major") continue;
            bump(g.drawId, g.sourceKey as SourceKey, -g.entries);
          }
        }
      }
    }

    // Optional: restore the cancellation upsell entries if requested.
    if (ARG_RESTORE_CU && user.cancellationUpsellRedeemed && user.cancellationUpsellRedeemedAt) {
      // Use the draw that was active when the user redeemed: the draw whose
      // activationDate <= redeemedAt <= drawDate. Fall back to the
      // most-recent-by-drawDate that's <= redeemedAt.
      const redeemedAt = new Date(user.cancellationUpsellRedeemedAt as string);
      const candidate = await drawsColl
        .find({ activationDate: { $lte: redeemedAt }, drawDate: { $gte: redeemedAt } })
        .sort({ activationDate: -1 })
        .limit(1)
        .toArray();
      if (candidate.length > 0) {
        bump(candidate[0]._id.toString(), "cancellation-upsell", 100);
      } else {
        console.error(
          `  warn — could not locate active draw for cancellation upsell at ${redeemedAt.toISOString()} (user ${userId.toString()})`
        );
      }
    }

    // Diff vs live state.
    const actualDraws = await drawsColl
      .find(
        { "entries.userId": userId },
        { projection: { name: 1, entries: 1 } }
      )
      .toArray();
    const actualByDraw = new Map<string, { name: string; row: { totalEntries: number; entriesBySource: Record<string, number>; firstAddedDate?: Date }; }>();
    for (const d of actualDraws) {
      const userRow = (d.entries as Array<{ userId: { toString(): string }; totalEntries: number; entriesBySource: Record<string, number>; firstAddedDate?: Date }>).find(
        (e) => e.userId.toString() === userId.toString()
      );
      if (!userRow) continue;
      actualByDraw.set(d._id.toString(), {
        name: (d.name as string) ?? "",
        row: { totalEntries: userRow.totalEntries, entriesBySource: userRow.entriesBySource, firstAddedDate: userRow.firstAddedDate },
      });
    }

    const allDrawIds = new Set<string>([...expected.keys(), ...actualByDraw.keys()]);
    let userTouched = false;

    for (const drawId of allDrawIds) {
      const exp = expected.get(drawId);
      const act = actualByDraw.get(drawId);
      const expTotal = exp?.totalEntries ?? 0;
      const expBreakdown = exp?.entriesBySource ?? {};
      const actTotal = act?.row.totalEntries ?? 0;
      const actBreakdown = act?.row.entriesBySource ?? {};

      const totalMatches = expTotal === actTotal;
      const allKeys = new Set<string>([...Object.keys(expBreakdown), ...Object.keys(actBreakdown)]);
      let breakdownMatches = true;
      for (const k of allKeys) {
        if ((expBreakdown as Record<string, number>)[k] !== (actBreakdown as Record<string, number>)[k]) {
          // Treat undefined vs 0 as equal.
          const e = (expBreakdown as Record<string, number>)[k] ?? 0;
          const a = (actBreakdown as Record<string, number>)[k] ?? 0;
          if (e !== a) {
            breakdownMatches = false;
            break;
          }
        }
      }
      if (totalMatches && breakdownMatches) continue;

      userTouched = true;
      console.error(
        `[plan] ${email} (${userId.toString()}) drawId=${drawId} drawName=${act?.name ?? "?"}: ` +
          `total ${actTotal} → ${expTotal}, breakdown ${JSON.stringify(actBreakdown)} → ${JSON.stringify(expBreakdown)}`
      );

      if (DRY_RUN) continue;

      // Apply: rewrite the user's entry row in this draw to match expected.
      if (expTotal <= 0) {
        // Remove the row entirely.
        await drawsColl.updateOne(
          { _id: new mongoose.Types.ObjectId(drawId) },
          { $pull: { entries: { userId } } } as unknown as Parameters<typeof drawsColl.updateOne>[1]
        );
      } else if (act) {
        // Existing row — update in place.
        await drawsColl.updateOne(
          { _id: new mongoose.Types.ObjectId(drawId), "entries.userId": userId },
          {
            $set: {
              "entries.$.totalEntries": expTotal,
              "entries.$.entriesBySource": expBreakdown,
              "entries.$.lastUpdatedDate": new Date(),
            },
          }
        );
      } else {
        // No existing row — push a new one.
        await drawsColl.updateOne(
          { _id: new mongoose.Types.ObjectId(drawId) },
          {
            $push: {
              entries: {
                userId,
                totalEntries: expTotal,
                entriesBySource: expBreakdown,
                firstAddedDate: new Date(),
                lastUpdatedDate: new Date(),
              },
            },
          } as unknown as Parameters<typeof drawsColl.updateOne>[1]
        );
      }
      rowsRewritten++;

      // Recompute draw.totalEntries.
      const refreshed = await drawsColl.findOne({ _id: new mongoose.Types.ObjectId(drawId) }, { projection: { entries: 1 } });
      if (refreshed) {
        const total = ((refreshed.entries as Array<{ totalEntries: number }>) || []).reduce(
          (s, e) => s + (e.totalEntries || 0),
          0
        );
        await drawsColl.updateOne(
          { _id: new mongoose.Types.ObjectId(drawId) },
          { $set: { totalEntries: total } }
        );
        drawTotalsRecomputed++;
      }
    }

    if (userTouched) usersFixed++;
  }

  console.error(
    `Done. ${DRY_RUN ? "Would fix" : "Fixed"}: users=${usersFixed}, rows=${rowsRewritten}, drawTotalsRecomputed=${drawTotalsRecomputed}`
  );
  if (DRY_RUN) {
    console.error("Re-run with --apply (and not the :dry npm variant) to write changes.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
