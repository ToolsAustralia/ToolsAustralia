/**
 * Spec-facing helpers for the per-customer bonus-code journey.
 *
 * Two jobs, kept together because they are useless apart:
 *   1. `mintBonusCodeViaWebhook` — mint a customer's code through the REAL
 *      endpoint code, by shelling out to `e2e/lib/mint-bonus-code.ts` (read that
 *      file's header for why it is a separate process). Nothing here
 *      re-implements the mint; a spec that re-implemented it would prove
 *      nothing about the endpoint.
 *   2. The fixture + assertion readers the journey needs, which `db.ts` does not
 *      have: a campaign row, the customer's issuance, the per-SOURCE draw
 *      buckets (`entriesForUser` sums them all and so cannot tell a campaign
 *      grant from a pack grant), and the payment ledger's campaign receipt.
 *
 * Collection names are the mongoose default pluralizations. Neither
 * `monthlyentrycampaigns` nor `redeemableissuances` is written anywhere in
 * `src/`, so they were VERIFIED at runtime rather than guessed —
 * `Model.collection.name` printed `monthlyentrycampaigns`,
 * `redeemableissuances`, `paymentevents` (2026-08-27).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import mongoose from "mongoose";
import { connectE2eDb } from "./db";
import { REPO_ROOT } from "../lib/paths";

/**
 * `userId` is stored as an ObjectId on every collection this file reads, so the
 * filter must be one too. The previous shape — fetch the whole collection and
 * `String(r.userId) === userId` in JS — worked on a seeded DB but is the wrong
 * idiom to copy, and it silently degrades as the seed grows.
 */
const asUserId = (userId: string) => new mongoose.Types.ObjectId(userId);

/** The marker the child prints its one-line JSON result behind. */
const RESULT_PREFIX = "E2E_MINT_RESULT ";

/** Mirrors `BonusCodeTrigger` (src/utils/redeemables/bonus-code-policy.ts). */
export type BonusCodeTrigger = "cancel-click" | "checkout-start" | "one-time-purchase";

export interface MintResult {
  status: number;
  /** The audit row's outcome — the endpoint's own body is opaque `{ ok }` by design. */
  outcome: string | null;
  /** How many events reached the stubbed Klaviyo client. 0 means no email step ran. */
  klaviyoEmits: number;
}

/**
 * Mint (or re-arm) `email`'s bonus code for `trigger` by driving the real
 * `POST /api/bonus-codes/v1/issue` handler in a throwaway child process.
 *
 * Async on purpose: a `spawnSync` here would block the Playwright worker's event
 * loop for the child's whole lifetime, which also freezes the browser's CDP
 * connection mid-test.
 */
export async function mintBonusCodeViaWebhook(opts: {
  email: string;
  trigger: BonusCodeTrigger;
  timeoutMs?: number;
}): Promise<MintResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  // node + tsx's CLI directly, NOT `npx` behind a win32 shell: the shell wrapper
  // adds a cmd.exe layer that `child.kill()` cannot reach through, and it keeps
  // the stdio pipes open past the grandchild's own exit — which made the first
  // run hang for the full timeout even though the mint had already succeeded and
  // printed its result.
  const tsxCli = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const script = path.join(REPO_ROOT, "e2e", "lib", "mint-bonus-code.ts");
  const args = [tsxCli, script, "--email", opts.email, "--trigger", opts.trigger];

  const line = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: REPO_ROOT, env: process.env });
    let out = "";
    let err = "";
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill();
      done(() => reject(new Error(`mintBonusCodeViaWebhook timed out after ${timeoutMs}ms\n${out}\n${err}`)));
    }, timeoutMs);
    const scan = () => {
      // Resolve the moment the RESULT line lands rather than on process exit:
      // the child loads the route's whole module graph, and a stray open handle
      // in that graph must never be able to hang a test that already has its
      // answer. The child exits itself; this only stops us waiting on it.
      const found = out.split(/\r?\n/).find((l) => l.startsWith(RESULT_PREFIX));
      if (found) {
        child.kill();
        done(() => resolve(found));
      }
    };
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
      scan();
    });
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) => done(() => reject(e)));
    child.on("close", (code) =>
      done(() =>
        reject(new Error(`bonus-code mint child exited (${code}) without a result.\nSTDOUT:\n${out}\nSTDERR:\n${err}`))
      )
    );
  });

  return JSON.parse(line.slice(RESULT_PREFIX.length)) as MintResult;
}

export interface CampaignFixture {
  code: string;
  entriesAmount: number;
  validForHours: number;
}

/**
 * Ensures the `MonthlyEntryCampaign` the trigger's code resolves against exists,
 * in exactly the shape below. Written as a RAW document (the e2e idiom — no
 * `src/` model imports in specs), so every field the eligibility/redemption path
 * reads is spelled out here rather than relying on a mongoose default that a raw
 * insert would skip.
 *
 * IDEMPOTENT UPSERT, NEVER DELETE-THEN-INSERT. `beforeAll`/`afterAll` run ONCE
 * PER WORKER, and `playwright.config.ts` is `fullyParallel` — so the legs of this
 * spec land in different workers and their setup/teardown interleave. The
 * previous shape deleted the campaign AND every issuance against it, which fired
 * roughly 100s in, right inside the other leg's 180s wait for its grant: it
 * deleted the very issuance that leg was waiting to see redeemed. An upsert has
 * no such window, and `run.ts` -> `wipeAndSeed` -> `dropDatabase()` already
 * guarantees a clean database at the start of every run, so there is nothing
 * left for a teardown to do.
 *
 * `targetingMode: "all-active-subscribers"` + a trigger + `validForHours` is the
 * production shape: `CampaignService.isUserEligibleForCampaign` treats a trigger
 * campaign's mode as "no extra filter" rather than "members only", which is the
 * whole point for a `checkout-start` cohort that has not subscribed yet.
 * `campaignMode: "global"` mints a code-LESS issuance, so the customer types the
 * campaign code — which is what the Klaviyo email template hardcodes.
 */
export async function ensureBonusCodeCampaign(fixture: CampaignFixture): Promise<string> {
  const db = await connectE2eDb();
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const campaigns = db.connection.collection("monthlyentrycampaigns");
  await campaigns.updateOne(
    { code: fixture.code },
    {
      $set: {
        monthKey,
        name: `E2E bonus-code ${fixture.code}`,
        entriesAmount: fixture.entriesAmount,
        campaignMode: "global",
        targetingMode: "all-active-subscribers",
        startsAt: new Date(now.getTime() - 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        neverExpires: false,
        validForHours: fixture.validForHours,
        isActive: true,
        requiresPurchase: false,
        // "none" on purpose: the purchase gate is a separate rule with its own
        // unit coverage, and mixing it in here would let a purchase-window
        // mismatch fail this spec for a reason that has nothing to do with the
        // journey it proves.
        purchaseRequirement: "none",
        segmentConfig: { includeUserIds: [], excludeUserIds: [], requiresEmailVerified: false },
        updatedAt: now,
      },
      $setOnInsert: { code: fixture.code, createdAt: now },
    },
    { upsert: true }
  );
  const row = await campaigns.findOne({ code: fixture.code }, { projection: { _id: 1 } });
  if (!row) throw new Error(`bonus-code fixture campaign ${fixture.code} did not persist`);
  return String(row._id);
}

/** The fixture campaign's `_id`, which scopes every per-campaign read below. */
async function campaignIdFor(campaignCode: string): Promise<mongoose.Types.ObjectId | null> {
  const db = await connectE2eDb();
  const campaign = await db.connection
    .collection("monthlyentrycampaigns")
    .findOne({ code: campaignCode }, { projection: { _id: 1 } });
  return (campaign?._id as mongoose.Types.ObjectId | undefined) ?? null;
}

export interface IssuanceRow {
  status: string;
  entriesAmount: number;
  issuedAt: Date;
  expiresAt: Date;
  redeemedAt?: Date;
  redeemedEverAt?: Date;
  code?: string;
}

/** The customer's issuance for a campaign code, or null when they hold none. */
export async function issuanceFor(campaignCode: string, userId: string): Promise<IssuanceRow | null> {
  const db = await connectE2eDb();
  const campaignId = await campaignIdFor(campaignCode);
  if (!campaignId) return null;
  const row = await db.connection
    .collection("redeemableissuances")
    .findOne({ campaignId, userId: asUserId(userId) });
  return (row as IssuanceRow | null) ?? null;
}

/**
 * How many issuances this customer holds FOR THIS CAMPAIGN (0 = never minted).
 *
 * Scoped deliberately. Counting every campaign would make the negative leg fail
 * the day any unrelated issuance is minted on purchase — a failure with nothing
 * to do with bonus codes, in the test whose whole job is to prove the code did
 * nothing.
 */
export async function issuanceCountForUser(userId: string, campaignCode: string): Promise<number> {
  const db = await connectE2eDb();
  const campaignId = await campaignIdFor(campaignCode);
  if (!campaignId) return 0;
  return db.connection
    .collection("redeemableissuances")
    .countDocuments({ campaignId, userId: asUserId(userId) });
}

export interface DrawEntryBuckets {
  totalEntries: number;
  bySource: Record<string, number>;
}

/**
 * The active major draw's per-source buckets for one customer.
 * `entriesForUser` (db.ts) sums `totalEntries` only, so it cannot separate the
 * membership's own free entries from the campaign's — which is exactly the
 * distinction this journey exists to prove.
 */
export async function drawEntryBucketsFor(userId: string): Promise<DrawEntryBuckets> {
  const db = await connectE2eDb();
  // `entries` is an ARRAY on the draw document, so the projection is the whole
  // array either way — the per-user filter has to happen here, unlike the
  // top-level collections above.
  const draw = await db.connection
    .collection("majordraws")
    .findOne({ status: "active" }, { projection: { entries: 1 } });
  const rows = ((draw?.entries ?? []) as Array<{ userId?: unknown; totalEntries?: number; entriesBySource?: Record<string, number> }>)
    .filter((e) => String(e.userId) === String(userId));
  const bySource: Record<string, number> = {};
  let totalEntries = 0;
  for (const row of rows) {
    totalEntries += row.totalEntries ?? 0;
    for (const [key, value] of Object.entries(row.entriesBySource ?? {})) {
      bySource[key] = (bySource[key] ?? 0) + value;
    }
  }
  return { totalEntries, bySource };
}

export interface GrantLedger {
  baseEntries: number;
  campaignEntries: number;
  campaign?: { code: string; monthlyIssuanceId?: string; redemptionKind?: string };
  drawGrants: Array<{ kind: string; drawId: string; sourceKey: string; entries: number }>;
}

/**
 * `data.grants` off this purchase's `BenefitsGranted` payment event.
 *
 * Deterministic on purpose: more than one matching row means the caller's
 * "exactly once" assumption is already broken, and silently picking whichever
 * the driver returned first would hide a double grant behind a passing test.
 */
export async function grantLedgerFor(
  userId: string,
  packageType: "membership" | "one-time"
): Promise<GrantLedger | null> {
  const db = await connectE2eDb();
  const docs = await db.connection
    .collection("paymentevents")
    .find({ eventType: "BenefitsGranted", packageType, userId: asUserId(userId) })
    .toArray();
  if (docs.length > 1) {
    throw new Error(
      `Expected at most one BenefitsGranted "${packageType}" event for ${userId}, found ${docs.length} — that is a DOUBLE GRANT, not a helper problem.`
    );
  }
  return ((docs[0]?.data as { grants?: GrantLedger } | undefined)?.grants) ?? null;
}

/**
 * Polls until this purchase's `BenefitsGranted` doc EXISTS, whatever it says.
 *
 * The observable edge the negative leg needs. Waiting a flat 20s and calling
 * silence a pass is a false-PASS generator: a campaign grant that lands at 25s
 * on a slower machine leaves the leg GREEN while the visibility rule is broken —
 * the dangerous direction. The doc's existence proves the webhook ran; the
 * caller then adds a short settle tail and asserts the campaign side never moved.
 */
export async function waitForGrantLedger(
  userId: string,
  packageType: "membership" | "one-time",
  timeoutMs = 180_000
): Promise<GrantLedger> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ledger = await grantLedgerFor(userId, packageType);
    if (ledger) return ledger;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(
    `No BenefitsGranted "${packageType}" ledger for ${userId} within ${timeoutMs / 1000}s (webhook not processed?)`
  );
}

/** The draw bucket the campaign redemption grants under (MajorDraw's own source key). */
const CAMPAIGN_SOURCE_KEY = "bonus-entry-promo";

/**
 * Which part of the campaign receipt has not landed yet, or `null` once all of it has.
 *
 * The receipt is THREE separate awaits, in this order (payment-processing.ts, inside the
 * `checkAndRedeemCampaign` block):
 *   1. `incLedgerGrants({ campaignEntries })`
 *   2. `setLedgerCampaign({ code, redemptionKind, monthlyIssuanceId })`
 *   3. `pushDrawGrant({ sourceKey: "bonus-entry-promo" })`
 * They are not atomic, so a poll that returns on any one of them hands the caller a doc
 * whose later fields are still being written.
 */
function campaignReceiptMissing(ledger: GrantLedger, expected: number): string | null {
  if (ledger.campaignEntries !== expected) {
    return `write 1/3 incLedgerGrants — campaignEntries is ${ledger.campaignEntries}, expected ${expected}`;
  }
  if (!ledger.campaign?.code) return "write 2/3 setLedgerCampaign — grants.campaign absent";
  const drawGrants = Array.isArray(ledger.drawGrants) ? ledger.drawGrants : [];
  if (!drawGrants.some((row) => row.sourceKey === CAMPAIGN_SOURCE_KEY)) {
    return `write 3/3 pushDrawGrant — no "${CAMPAIGN_SOURCE_KEY}" drawGrants row`;
  }
  return null;
}

/**
 * Polls until the campaign receipt is COMPLETE — all three writes, not the first.
 *
 * THIS, not `waitForOneTimeEntries`/`waitForActiveMembership`, is the right signal for a
 * campaign grant. Those two return the instant `entries > 0`, and the package's OWN
 * entries land in the draw strictly BEFORE the campaign redemption runs — so reading the
 * combined total on their signal is a guaranteed race.
 *
 * But `campaignEntries` alone is NOT that signal either, and the previous docblock here
 * asserted the opposite ("written LAST, after the issuance flip, the user counter and the
 * draw entries"). It is written FIRST of the three ledger writes; every caller that then
 * read `ledger.campaign?.code` was racing `setLedgerCampaign`, which is what made this
 * spec go red at random with nothing wrong in the product. See `campaignReceiptMissing`
 * for the real order.
 *
 * The issuance flip, the user counter and the draw entries all happen inside
 * `checkAndRedeemCampaign`, i.e. BEFORE write 1 — so once write 3 lands, every surface
 * this spec asserts on has settled.
 *
 * Write 3 is skipped when no MajorDraw is `{ status: "active", isActive: true }`. That is
 * deliberately still a timeout rather than a pass: a run with no active draw cannot
 * satisfy the caller's per-source bucket assertions either, and a named timeout is a far
 * better failure than a bucket count of `undefined`.
 */
export async function waitForCampaignGrant(
  userId: string,
  packageType: "membership" | "one-time",
  expected: number,
  timeoutMs = 180_000
): Promise<GrantLedger> {
  const deadline = Date.now() + timeoutMs;
  let last: GrantLedger | null = null;
  let missing = "no BenefitsGranted ledger at all";
  while (Date.now() < deadline) {
    last = await grantLedgerFor(userId, packageType);
    if (last) {
      const gap = campaignReceiptMissing(last, expected);
      if (gap === null) return last;
      missing = gap;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(
    `Campaign grant of ${expected} entries never fully reached the payment ledger for ${userId} ` +
      `within ${timeoutMs / 1000}s — still missing: ${missing} (last seen: ${JSON.stringify(last)})`
  );
}
