import type { Page } from "@playwright/test";
import mongoose from "mongoose";
import { connectE2eDb, MEMBER } from "../helpers/db";

/**
 * Membership Streak demo — state mutations for the @demo journey spec.
 *
 * The demo walks ONE member through their whole life by writing state directly
 * and reloading, so months compress into seconds while every number on screen
 * stays the real counter driving the real card.
 *
 * Field shapes verified against:
 *   - acct derivation: src/utils/dashboard/derive-dashboard-account-state.ts
 *     (pastdue → paused → active → onetime → none)
 *   - one-time detection: getActivePackage reads user.oneTimePackages[].isActive
 *   - streak counter: src/hooks/useDashboardState.ts reads subscription.streakMonths
 *   - entry buckets: EntryWallet sums entriesBySource; e2e/helpers/db.ts reads
 *     totalEntries — the two MUST stay equal (see e2e/seed/draw.ts).
 */

async function users() {
  const db = await connectE2eDb();
  return db.connection.collection("users");
}

/** The seeded member's _id as a string — needed for the celebration localStorage key. */
export async function memberUserId(): Promise<string> {
  const user = await (await users()).findOne({ email: MEMBER.email }, { projection: { _id: 1 } });
  if (!user) throw new Error("memberUserId: seeded member not found — run wipeAndSeed first");
  return String(user._id);
}

/** Beat 1 — registered account, never purchased (acct: "none"). */
export async function setNonMember(): Promise<void> {
  await (await users()).updateOne(
    { email: MEMBER.email },
    { $unset: { subscription: "", oneTimePackages: "" } }
  );
}

/**
 * Beat 2 — one-time pack holder, no subscription (acct: "onetime").
 *
 * Task-4 fix (round 4, Finding 3): also zero the draw's membership bucket and set the
 * one-time bucket to the Apprentice Pack's real grant (totalEntries: 3 —
 * src/data/membershipPackages.ts "apprentice-pack"). Without this the entries doc still
 * carried the seed baseline `{membership: 15}` (e2e/seed/draw.ts — meant for an ACTIVE
 * subscriber) straight through the guest/onetime beats: EntryWallet.tsx computes
 * `total = membership + oneTime + streak` from the RAW entries.membership prop even
 * though `isOneTime` only swaps the membership row's DISPLAY to "—" — it never zeroes
 * the number feeding the total. That's how the wallet read total "15" while its own
 * breakdown showed Membership "—" and One-time "0" (summing to zero) — total and
 * breakdown were reading two different membership values. Verified against
 * src/components/sections/dashboard/EntryWallet.tsx (`const membership = isCompleted ? 0
 * : entries.membership;` — no isOneTime guard) before changing seed data, per the task
 * brief. `setEntryBuckets` fully replaces entriesBySource (not a partial merge), so this
 * also clears anything a PRIOR beat may have left behind.
 */
export async function setOneTimeHolder(): Promise<void> {
  await (await users()).updateOne(
    { email: MEMBER.email },
    {
      $unset: { subscription: "" },
      $set: { oneTimePackages: [{ packageId: "apprentice-pack", isActive: true, purchaseDate: new Date() }] },
    }
  );
  await setEntryBuckets({ oneTime: 3 });
}

/** Active Tradie subscription at `months` consecutive renewals (acct: "active"). */
export async function setStreak(months: number, opts: { streakEntries?: number } = {}): Promise<void> {
  const now = new Date();
  const renewalIn12Days = new Date(now.getTime() + 12 * 24 * 3600 * 1000);
  await (await users()).updateOne(
    { email: MEMBER.email },
    {
      $unset: { oneTimePackages: "" },
      $set: {
        subscription: {
          packageId: "tradie-subscription",
          status: "active",
          isActive: true,
          startDate: new Date(now.getTime() - months * 30 * 24 * 3600 * 1000),
          endDate: renewalIn12Days,
          autoRenew: true,
          streakMonths: months,
          streakGeneration: 1,
        },
      },
    }
  );
  if (opts.streakEntries !== undefined) await setStreakEntries(opts.streakEntries);
}

/** Beat 8 — failed renewal (acct: "pastdue" → the at-risk card). */
export async function setPastDue(months: number, opts: { streakEntries?: number } = {}): Promise<void> {
  const now = new Date();
  await (await users()).updateOne(
    { email: MEMBER.email },
    {
      $unset: { oneTimePackages: "" },
      $set: {
        subscription: {
          packageId: "tradie-subscription",
          status: "past_due",
          isActive: false,
          startDate: new Date(now.getTime() - months * 30 * 24 * 3600 * 1000),
          endDate: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
          autoRenew: true,
          streakMonths: months,
          streakGeneration: 1,
        },
      },
    }
  );
  if (opts.streakEntries !== undefined) await setStreakEntries(opts.streakEntries);
}

/**
 * Writes the member's entry buckets on the active draw. totalEntries is kept equal to
 * the bucket sum — EntryWallet computes `total = membership + oneTime + streak` from
 * these same three numbers (src/components/sections/dashboard/EntryWallet.tsx) while
 * e2e/helpers/db.ts entriesForUser() reads totalEntries, and a mismatch makes the two
 * disagree on camera. Fully REPLACES entriesBySource (not a partial $set merge), so
 * whatever a prior beat left in an untouched bucket (e.g. a one-time holder's `oneTime`)
 * cannot bleed into a later beat that forgets to restate it.
 */
async function setEntryBuckets(buckets: { membership?: number; oneTime?: number; streak?: number }): Promise<void> {
  const db = await connectE2eDb();
  const membership = buckets.membership ?? 0;
  const oneTime = buckets.oneTime ?? 0;
  const streak = buckets.streak ?? 0;
  const total = membership + oneTime + streak;
  const userId = new mongoose.Types.ObjectId(await memberUserId());
  await db.connection.collection("majordraws").updateOne(
    { status: "active" },
    {
      $set: {
        "entries.$[row].entriesBySource": { membership, oneTime, streak },
        "entries.$[row].totalEntries": total,
        "entries.$[row].lastUpdatedDate": new Date(),
        totalEntries: total,
      },
    },
    { arrayFilters: [{ "row.userId": userId }] }
  );
}

/** Streak-only convenience wrapper — always the seeded Tradie membership grant (15, e2e/seed/draw.ts). */
async function setStreakEntries(streakEntries: number): Promise<void> {
  await setEntryBuckets({ membership: 15, streak: streakEntries });
}

/**
 * Beat 5 — arms the celebration. useStreakCelebration (src/hooks/useStreakCelebration.ts)
 * fires when the live counter EXCEEDS the persisted per-user marker and the new level sits
 * on a rung. A first-ever visit seeds the marker silently, so it must be planted BEFORE the
 * page that shows the milestone loads.
 */
export async function seedCelebrationMarker(page: Page, userId: string, lastSeen: number): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`ta-streak-seen:${userId}`, String(lastSeen)] as const
  );
}

/** The seeded draw is called "E2E Major Draw" — unshippable in a client video. */
export async function renameDemoDraw(name: string): Promise<void> {
  const db = await connectE2eDb();
  await db.connection.collection("majordraws").updateOne({ status: "active" }, { $set: { name } });
}
