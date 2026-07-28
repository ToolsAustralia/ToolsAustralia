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

/** Beat 2 — one-time pack holder, no subscription (acct: "onetime"). */
export async function setOneTimeHolder(): Promise<void> {
  await (await users()).updateOne(
    { email: MEMBER.email },
    {
      $unset: { subscription: "" },
      $set: { oneTimePackages: [{ packageId: "apprentice-pack", isActive: true, purchaseDate: new Date() }] },
    }
  );
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
export async function setPastDue(months: number): Promise<void> {
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
}

/**
 * Writes the member's streak entry bucket on the active draw. totalEntries is kept
 * equal to the bucket sum — EntryWallet renders the buckets while e2e/helpers/db.ts
 * entriesForUser() reads totalEntries, and a mismatch makes the two disagree on camera.
 */
async function setStreakEntries(streakEntries: number): Promise<void> {
  const db = await connectE2eDb();
  const membership = 15; // the seeded Tradie position (e2e/seed/draw.ts)
  const userId = new mongoose.Types.ObjectId(await memberUserId());
  await db.connection.collection("majordraws").updateOne(
    { status: "active" },
    {
      $set: {
        "entries.$[row].entriesBySource": { membership, streak: streakEntries },
        "entries.$[row].totalEntries": membership + streakEntries,
        "entries.$[row].lastUpdatedDate": new Date(),
        totalEntries: membership + streakEntries,
      },
    },
    { arrayFilters: [{ "row.userId": userId }] }
  );
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
