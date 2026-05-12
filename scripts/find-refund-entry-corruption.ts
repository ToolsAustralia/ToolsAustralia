#!/usr/bin/env npx tsx

/**
 * Find users whose major-draw entry rows were corrupted by the
 * `removeMajorDrawEntries` over-removal bug (refunds that walked
 * past the refund's own draw and decremented entries on a prior draw)
 * and/or by the `syncMajorDrawParticipation` admin-form clobber bug
 * (entriesBySource.membership force-set to totalEntries on every save).
 *
 * The audit is read-only. It builds, for each user with a RefundProcessed
 * event, the expected per-draw entry state from PaymentEvents alone and
 * compares it against the live MajorDraw documents. Any user whose
 * expected state diverges from live state is reported.
 *
 * Usage:
 *   npm run find:refund-entry-corruption
 *
 *   Options (positional `--key=value`):
 *     --since=YYYY-MM-DD     Only consider refunds processed on/after this date.
 *                            Default: 2025-01-01.
 *     --userId=<id>          Audit a single user by ObjectId.
 *     --email=<addr>         Audit a single user by email (case-insensitive).
 *     --verbose              Print every event/entry per user, not just the verdict.
 *     --strict-internal-consistency
 *                            Ignore ledger replay entirely. Only flag rows where
 *                            `sum(entriesBySource) !== totalEntries`. This is the
 *                            ZERO-FALSE-POSITIVE detector for the admin-clobber bug
 *                            (Bug 2 / Cody's April row). Use this mode for the first
 *                            production audit pass.
 *
 * Output: CSV to stdout, progress to stderr.
 *
 * Safety: read-only. No database writes are performed.
 *
 * Env: MONGODB_URI (from .env.local).
 */

import { config } from "dotenv";
import path from "path";
import mongoose from "mongoose";

config({ path: path.resolve(process.cwd(), ".env.local") });

type EventRow = {
  _id: string;
  eventType: string;
  userId: mongoose.Types.ObjectId;
  paymentIntentId: string;
  packageType: string;
  data: Record<string, unknown> & {
    entries?: number;
    grants?: { drawGrants?: Array<{ kind: string; drawId: string; sourceKey: string; entries: number }> };
    miniDrawId?: string;
    reversed?: { entries?: number; packageType?: string };
  };
  timestamp: Date;
};

type SourceKey =
  | "membership"
  | "one-time-package"
  | "upsell"
  | "mini-draw"
  | "bonus-entry-promo"
  | "promo-link"
  | "cancellation-upsell"
  | "referral";

type ExpectedRow = {
  totalEntries: number;
  entriesBySource: Partial<Record<SourceKey, number>>;
};

type ExpectedByDraw = Map<string, ExpectedRow>;

function parseArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=").slice(1).join("=") : undefined;
}

const SINCE = parseArg("since") ?? "2025-01-01";
const ARG_USER_ID = parseArg("userId");
const ARG_EMAIL = parseArg("email");
const VERBOSE = process.argv.includes("--verbose");
const STRICT_INTERNAL = process.argv.includes("--strict-internal-consistency");

function bumpSource(row: ExpectedRow, key: SourceKey, delta: number): void {
  row.entriesBySource[key] = (row.entriesBySource[key] ?? 0) + delta;
  row.totalEntries += delta;
}

function getOrInit(map: ExpectedByDraw, drawId: string): ExpectedRow {
  let row = map.get(drawId);
  if (!row) {
    row = { totalEntries: 0, entriesBySource: {} };
    map.set(drawId, row);
  }
  return row;
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

  // 1. Build the candidate user set.
  // - --userId / --email: single user, exact target.
  // - --strict-internal-consistency: every user with at least one major-draw
  //   entry row anywhere (we don't need a refund event to detect Bug 2).
  // - default: every user who has a RefundProcessed event since --since.
  let candidateUserIds: Array<mongoose.Types.ObjectId> = [];
  if (ARG_USER_ID) {
    candidateUserIds = [new mongoose.Types.ObjectId(ARG_USER_ID)];
  } else if (ARG_EMAIL) {
    const u = await usersColl.findOne(
      { email: { $regex: `^${ARG_EMAIL}$`, $options: "i" } },
      { projection: { _id: 1 } }
    );
    if (!u) {
      console.error(`No user found with email ${ARG_EMAIL}`);
      process.exit(1);
    }
    candidateUserIds = [u._id as mongoose.Types.ObjectId];
  } else if (STRICT_INTERNAL) {
    console.error(`Loading every userId with at least one major-draw entry row…`);
    const ids = await drawsColl.distinct("entries.userId");
    candidateUserIds = ids as unknown as Array<mongoose.Types.ObjectId>;
  } else {
    const sinceDate = new Date(SINCE);
    console.error(`Loading RefundProcessed userIds since ${sinceDate.toISOString()}…`);
    const refunded = await eventsColl.distinct("userId", {
      eventType: "RefundProcessed",
      timestamp: { $gte: sinceDate },
    });
    candidateUserIds = refunded as unknown as Array<mongoose.Types.ObjectId>;
  }
  console.error(
    `Auditing ${candidateUserIds.length} user(s) (mode: ${STRICT_INTERNAL ? "strict-internal-consistency" : "ledger-replay"})…`
  );

  // CSV header
  console.log(
    [
      "email",
      "userId",
      "drawId",
      "drawName",
      "drawStatus",
      "expectedTotal",
      "actualTotal",
      "totalDelta",
      "expectedBreakdown",
      "actualBreakdown",
      "breakdownDelta",
      "verdict",
    ].join(",")
  );

  let okCount = 0;
  let mismatchCount = 0;
  let inspected = 0;

  for (const userId of candidateUserIds) {
    inspected++;
    if (inspected % 25 === 0) {
      console.error(`  …inspected ${inspected}/${candidateUserIds.length}`);
    }

    const user = await usersColl.findOne(
      { _id: userId },
      { projection: { email: 1 } }
    );
    if (!user) continue;
    const email = (user.email as string) ?? "";

    if (STRICT_INTERNAL) {
      // Strict mode: pull every draw row this user has and flag any row where
      // sum(entriesBySource) !== totalEntries. Zero false positives.
      const drawsForUser = await drawsColl
        .find(
          { "entries.userId": userId },
          { projection: { name: 1, status: 1, entries: 1 } }
        )
        .toArray();
      for (const d of drawsForUser) {
        const userRow = (d.entries as Array<{ userId: { toString(): string }; totalEntries: number; entriesBySource: Record<string, number> }>).find(
          (e) => e.userId.toString() === userId.toString()
        );
        if (!userRow) continue;
        const sum = Object.values(userRow.entriesBySource ?? {}).reduce(
          (s, v) => s + (Number(v) || 0),
          0
        );
        if (sum === userRow.totalEntries) {
          if (VERBOSE) {
            console.log(
              [
                email,
                userId.toString(),
                d._id.toString(),
                (d.name as string) ?? "",
                (d.status as string) ?? "",
                userRow.totalEntries,
                userRow.totalEntries,
                0,
                `"sum=${sum}"`,
                `"sum=${sum}"`,
                `""`,
                "ok",
              ].join(",")
            );
          }
          okCount++;
          continue;
        }
        const breakdownStr = Object.entries(userRow.entriesBySource ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join("|");
        console.log(
          [
            email,
            userId.toString(),
            d._id.toString(),
            (d.name as string) ?? "",
            (d.status as string) ?? "",
            userRow.totalEntries,
            sum,
            sum - userRow.totalEntries,
            `"totalEntries=${userRow.totalEntries}"`,
            `"${breakdownStr}"`,
            `"sum-total=${sum - userRow.totalEntries}"`,
            "INTERNAL_INCONSISTENT",
          ].join(",")
        );
        mismatchCount++;
      }
      continue;
    }

    // 2. Load every PaymentEvent for the user, ordered by timestamp.
    const events = (await eventsColl
      .find({ userId })
      .sort({ timestamp: 1 })
      .toArray()) as EventRow[];

    // 3. Replay BenefitsGranted / RefundProcessed / BenefitsReversed to derive
    //    the expected per-draw state.
    const expected: ExpectedByDraw = new Map();

    for (const ev of events) {
      if (ev.eventType === "BenefitsGranted" || ev.eventType === "UpsellProcessed") {
        const grants = ev.data.grants?.drawGrants;
        if (grants?.length) {
          // Ledger path — authoritative.
          for (const g of grants) {
            if (g.kind !== "major") continue;
            const row = getOrInit(expected, g.drawId);
            bumpSource(row, g.sourceKey as SourceKey, g.entries);
          }
        } else {
          // Pre-ledger event: we can't attribute to a specific draw, so skip.
          // (The audit will flag any resulting unexplained delta.)
        }
      } else if (ev.eventType === "RefundProcessed" || ev.eventType === "RefundPartial") {
        // Subtract the reversed entries from the SAME draw they were granted to.
        const reversedPkgType = ev.data.reversed?.packageType ?? ev.packageType;
        const reversedEntries = ev.data.reversed?.entries ?? ev.data.entries ?? 0;
        if (reversedEntries <= 0) continue;
        const sourceKey = eventToSourceKey(reversedPkgType);
        if (!sourceKey) continue;

        // Find the matching BenefitsGranted (by paymentIntentId) to reuse its drawGrants.
        const grant = events.find(
          (e) =>
            (e.eventType === "BenefitsGranted" || e.eventType === "UpsellProcessed") &&
            e.paymentIntentId === ev.paymentIntentId
        );
        const grants = grant?.data.grants?.drawGrants;
        if (grants?.length) {
          for (const g of grants) {
            if (g.kind !== "major") continue;
            const row = getOrInit(expected, g.drawId);
            bumpSource(row, g.sourceKey as SourceKey, -g.entries);
          }
        }
        // If no ledger on the granting event, we can't attribute the refund;
        // the live data will diverge and the audit will flag the user.
      }
    }

    // 4. Cancellation upsell — the legacy code path silently wrote to the
    //    active draw using a sourceType that wasn't in the schema enum.
    //    If the user redeemed, expect +100 in *some* active-at-the-time
    //    draw. We can't know which one without the original active-draw
    //    snapshot, but we can record the +100 against user.accumulatedEntries
    //    and look for an equivalent ghost on draw rows.
    const fullUser = await usersColl.findOne(
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
    const redeemedCancUpsell = Boolean(fullUser?.cancellationUpsellRedeemed);

    // 5. Compare expected against actual MajorDraw rows.
    const actualDraws = await drawsColl
      .find(
        { "entries.userId": userId },
        { projection: { name: 1, status: 1, entries: 1 } }
      )
      .toArray();

    const actualByDraw = new Map<string, { name: string; status: string; row: { totalEntries: number; entriesBySource: Record<string, number> } }>();
    for (const d of actualDraws) {
      const userRow = (d.entries as Array<{ userId: { toString(): string }; totalEntries: number; entriesBySource: Record<string, number> }>).find(
        (e) => e.userId.toString() === userId.toString()
      );
      if (!userRow) continue;
      actualByDraw.set(d._id.toString(), {
        name: (d.name as string) ?? "",
        status: (d.status as string) ?? "",
        row: { totalEntries: userRow.totalEntries, entriesBySource: userRow.entriesBySource },
      });
    }

    const allDrawIds = new Set<string>([...expected.keys(), ...actualByDraw.keys()]);
    let userHasMismatch = false;
    for (const drawId of allDrawIds) {
      const exp = expected.get(drawId);
      const act = actualByDraw.get(drawId);
      const expTotal = exp?.totalEntries ?? 0;
      const actTotal = act?.row.totalEntries ?? 0;

      // Sum sourceKey deltas
      const sourceDelta: Record<string, number> = {};
      const allKeys = new Set<string>([
        ...Object.keys(exp?.entriesBySource ?? {}),
        ...Object.keys(act?.row.entriesBySource ?? {}),
      ]);
      for (const k of allKeys) {
        const e = (exp?.entriesBySource as Record<string, number> | undefined)?.[k] ?? 0;
        const a = (act?.row.entriesBySource as Record<string, number> | undefined)?.[k] ?? 0;
        if (e !== a) sourceDelta[k] = a - e;
      }

      const totalDelta = actTotal - expTotal;
      const breakdownDeltaStr = Object.entries(sourceDelta)
        .map(([k, v]) => `${k}${v >= 0 ? "+" : ""}${v}`)
        .join("|");

      let verdict = "ok";
      if (totalDelta !== 0 || Object.keys(sourceDelta).length > 0) {
        verdict = "MISMATCH";
        userHasMismatch = true;
      }

      // Suppress "ok" rows unless verbose.
      if (verdict === "ok" && !VERBOSE) continue;

      const expBreakdownStr = Object.entries(exp?.entriesBySource ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join("|");
      const actBreakdownStr = Object.entries(act?.row.entriesBySource ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join("|");

      console.log(
        [
          email,
          userId.toString(),
          drawId,
          act?.name ?? "",
          act?.status ?? "",
          expTotal,
          actTotal,
          totalDelta,
          `"${expBreakdownStr}"`,
          `"${actBreakdownStr}"`,
          `"${breakdownDeltaStr}"`,
          verdict,
        ].join(",")
      );
    }

    // Cancellation-upsell discrepancy summary row (not per-draw)
    if (redeemedCancUpsell && VERBOSE) {
      const totalLiveMajor = Array.from(actualByDraw.values()).reduce(
        (s, v) => s + v.row.totalEntries,
        0
      );
      const accumulated = (fullUser?.accumulatedEntries as number) ?? 0;
      const diff = accumulated - totalLiveMajor;
      console.log(
        [
          email,
          userId.toString(),
          "*cancUpsell*",
          "",
          "",
          accumulated,
          totalLiveMajor,
          diff,
          `"accumulatedEntries=${accumulated}"`,
          `"sumOfMajorDrawRows=${totalLiveMajor}"`,
          `"diff=${diff} (100 here suggests dropped cancellation-upsell entries)"`,
          diff === 0 ? "ok" : "INFO",
        ].join(",")
      );
    }

    if (userHasMismatch) mismatchCount++;
    else okCount++;
  }

  console.error(`Done. ok=${okCount}, mismatch=${mismatchCount}, totalAudited=${inspected}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
