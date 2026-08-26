/**
 * The Klaviyo bonus-code webhook — POST /api/bonus-codes/v1/issue — against a
 * live database and through the REAL route handler.
 *
 * This endpoint is the only thing that mints a per-customer bonus code under
 * the new model, and the codes grant real prize-draw entries in a legally
 * constrained Australian trade promotion. Everything about it that can be wrong
 * is wrong silently: a 200 that should have been a 500 permanently loses a
 * customer's grant while the discount email is already in flight; a `{ ok }`
 * that mirrored the OUTCOME instead of the status turns the endpoint into a
 * customer-state oracle; a fail-open secret check gives the product away.
 *
 * What this file pins, none of which a pure test can reach:
 *
 *   1. AUTHORIZATION. Missing / wrong / rotated-out secret → 401; an unset
 *      server secret → 500 (fail CLOSED, never open). Middleware never runs for
 *      `/api`, so this handler owns 100% of it.
 *   2. THE PRODUCTION ASSERTION. Outside production → 403, no mint.
 *   3. THE BODY CONTRACT, including the one that matters most in practice: an
 *      EMPTY `userId` (what `{{ person.user_id }}` renders on a newsletter-form
 *      profile) must fall through to the email, not 400.
 *   4. CUSTOMER RESOLUTION, including the 409 refusal when `userId` and `email`
 *      name two different accounts, and the quieter cousin of it: a usable
 *      `userId` that resolves to nothing must NOT fall back to the email, or a
 *      stale profile mints a bystander's one-per-lifetime grant invisibly.
 *   5. THE STATUS MAP — and specifically that a service `error` answers 500
 *      while `not_applicable` answers 200. Those two were one value until this
 *      rework; the endpoint's whole retry story rests on telling them apart.
 *   6. THE WINDOW: exactly 72 hours, a second call inside it does NOT extend
 *      it, and a spent grant stays spent.
 *   7. THE BUDGET: kill switch and daily cap both refuse with 429 and mint
 *      nothing — and a budget gate that cannot be EVALUATED refuses with 500,
 *      because a cap that uncaps itself during an outage is not a cap.
 *   8. RESPONSE OPACITY: `{ ok: <status is 200> }` byte-for-byte, so "minted"
 *      and "no such customer" are indistinguishable to the caller.
 *   9. THE AUDIT ROW on every path. It is not bookkeeping — the daily mint
 *      budget COUNTS these rows, so an unwritten row is an uncounted mint.
 *
 * KLAVIYO IS NEVER CALLED. `@/lib/klaviyo` is replaced in `require.cache`
 * before anything can load the real client, and the swap is VERIFIED by object
 * identity before `VERCEL_ENV` is ever set to "production" — if the stub had
 * not taken, this file aborts rather than reaching a real emit.
 *
 * NO REAL TRIGGER CODE IS EVER CREATED. `BONUS_CODE_BY_TRIGGER` is repointed at
 * per-run fixture codes for the duration of the run (and restored in `finally`),
 * so this file never creates a campaign carrying BACKIN200 / LOCKIN100 /
 * EXTRA100 in a shared database — which would both collide with the unique
 * index on `code` once the real campaigns exist and, worse, be a live campaign
 * for the seconds it existed. Repointing also means this suite stays runnable
 * after launch, unlike a refuse-to-run guard.
 *
 * FIXTURE SAFETY. Every user and campaign is created here under a per-run
 * identifier and removed in `finally`, including on failure. Issuances are
 * deleted by `userId` (all users are brand new this run). Audit rows are deleted
 * by the sha256 of a per-run client IP that only this file sends, so no row this
 * run did not create is ever touched. Each fixture campaign is `manual-users`
 * pinned to its own throwaway user, so no real account can be enrolled while it
 * briefly exists.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import { NextRequest } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import BonusCodeWebhookCall from "@/models/BonusCodeWebhookCall";
import { CampaignService } from "../CampaignService";
import { BONUS_CODE_BY_TRIGGER } from "@/config/bonusCodes";
import { hashIp } from "@/lib/bonus-code-webhook/audit";
import { BONUS_CODE_SECRET_HEADER } from "@/lib/bonus-code-webhook/auth";
import type { KlaviyoEvent, KlaviyoEventResponse } from "@/types/klaviyo";

const RUN_ID = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

/** Exactly 72 hours in milliseconds. Written out, not computed from the code under test. */
const SEVENTY_TWO_HOURS_MS = 259_200_000;

/**
 * The client IP this run sends on every request. Unique per run, so the audit
 * rows it produces are identifiable by `hashIp(TEST_CLIENT_IP)` alone and the
 * cleanup cannot touch a row this file did not write.
 */
const TEST_CLIENT_IP = `203.0.113.9-bonus-code-webhook-test-${RUN_ID}`;

/** Two fixture secrets, both over the 16-character floor the verifier requires. */
const SECRET_CURRENT = `webhook-secret-current-${RUN_ID}`;
const SECRET_RETIRED = `webhook-secret-retired-${RUN_ID}`;

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}\n        expected: ${e}\n        actual:   ${a}`);
  }
}

// --- the Klaviyo stub -----------------------------------------------------
interface RecordedEmit {
  event: string;
  properties: Record<string, unknown>;
}
const emits: RecordedEmit[] = [];

const stubKlaviyo = {
  async trackEvent(event: KlaviyoEvent): Promise<KlaviyoEventResponse> {
    emits.push({ event: event.event, properties: { ...event.properties } });
    return { success: true };
  },
};

const klaviyoModulePath = require.resolve(path.resolve(process.cwd(), "src/lib/klaviyo.ts"));
require.cache[klaviyoModulePath] = {
  id: klaviyoModulePath,
  filename: klaviyoModulePath,
  loaded: true,
  children: [],
  paths: [],
  parent: undefined,
  exports: { klaviyo: stubKlaviyo },
} as unknown as NodeModule;

const userIds: mongoose.Types.ObjectId[] = [];
const campaignIds: mongoose.Types.ObjectId[] = [];

async function makeUser(suffix: string, extra: Record<string, unknown> = {}) {
  const user = await User.create({
    firstName: "Webhook",
    lastName: "Fixture",
    email: `bonus-code-webhook-${RUN_ID}-${suffix}@example.test`,
    isActive: true,
    isEmailVerified: true,
    ...extra,
  });
  const id = user._id as unknown as mongoose.Types.ObjectId;
  userIds.push(id);
  return { id, email: user.email };
}

/**
 * Every fixture campaign is `manual-users` pinned to exactly one throwaway
 * user, which is what makes it safe to create a live campaign in a shared
 * database: `isUserEligibleForCampaign` treats pins as authoritative, so no
 * other account can be enrolled while the campaign exists.
 */
async function makeCampaign(code: string, pinnedUserId: mongoose.Types.ObjectId) {
  const campaign = await MonthlyEntryCampaign.create({
    monthKey: "2026-08",
    name: `Bonus-code webhook ${code}`,
    entriesAmount: 3,
    campaignMode: "unique",
    targetingMode: "manual-users",
    segmentConfig: { includeUserIds: [String(pinnedUserId)] },
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 30 * DAY_MS),
    neverExpires: false,
    validForHours: 72,
    isActive: true,
    code,
    requiresPurchase: false,
    purchaseRequirement: "none",
  });
  campaignIds.push(campaign._id as unknown as mongoose.Types.ObjectId);
  return campaign;
}

interface WebhookBody {
  ok?: boolean;
  error?: string;
  trigger?: string | null;
}

async function run() {
  await connectDB();

  /*
   * `require`, not `await import` — under tsx a dynamic import goes through the
   * ESM loader and bypasses `require.cache`, so the handler would resolve the
   * REAL Klaviyo client. A static import would be hoisted above the seeding,
   * with the same result. This load must happen here, after the seeding.
   */
  /* eslint-disable @typescript-eslint/no-require-imports */
  const loadedKlaviyo = require("@/lib/klaviyo") as typeof import("@/lib/klaviyo");
  const { POST } = require("@/app/api/bonus-codes/v1/issue/route") as typeof import("@/app/api/bonus-codes/v1/issue/route");
  /* eslint-enable @typescript-eslint/no-require-imports */

  // HARD SAFETY GATE. Everything below runs with VERCEL_ENV forced to
  // "production", which opens the path to a real Klaviyo emit. Prove, by object
  // identity, that the stub is what the handler will actually reach.
  if (loadedKlaviyo.klaviyo !== stubKlaviyo) {
    throw new Error(
      "REFUSING TO RUN: the @/lib/klaviyo stub did not take, so a production-mode call could hit the real Klaviyo API."
    );
  }
  console.log("Klaviyo client is stubbed (verified by identity) — no outbound emit is possible.\n");

  const originalEnv = {
    vercelEnv: process.env.VERCEL_ENV,
    secret: process.env.BONUS_CODE_WEBHOOK_SECRET,
    cap: process.env.BONUS_CODE_DAILY_MINT_CAP,
    killSwitch: process.env.BONUS_CODE_KILL_SWITCH,
  };
  const originalTriggerCode = BONUS_CODE_BY_TRIGGER["cancel-click"];

  const restore = () => {
    BONUS_CODE_BY_TRIGGER["cancel-click"] = originalTriggerCode;
    for (const [key, value] of [
      ["VERCEL_ENV", originalEnv.vercelEnv],
      ["BONUS_CODE_WEBHOOK_SECRET", originalEnv.secret],
      ["BONUS_CODE_DAILY_MINT_CAP", originalEnv.cap],
      ["BONUS_CODE_KILL_SWITCH", originalEnv.killSwitch],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  async function cleanup() {
    restore();
    await RedeemableIssuance.deleteMany({ userId: { $in: userIds } });
    await BonusCodeWebhookCall.deleteMany({ ipHash: hashIp(TEST_CLIENT_IP) });
    await MonthlyEntryCampaign.deleteMany({ _id: { $in: campaignIds } });
    await User.deleteMany({ _id: { $in: userIds } });
  }

  // An interrupt between a create and the finally below would otherwise leak a
  // live fixture campaign and a forced VERCEL_ENV.
  const onSignal = (signal: NodeJS.Signals) => {
    console.error(`\nReceived ${signal} — cleaning up fixtures before exiting.`);
    void cleanup()
      .catch((error) => console.error("cleanup failed:", error))
      .finally(() => process.exit(130));
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  /** Point the cancel-click trigger at a fixture code for the next call. */
  const pointTriggerAt = (code: string) => {
    BONUS_CODE_BY_TRIGGER["cancel-click"] = code;
  };

  /** Fire one real request at the real handler. */
  async function post(
    body: unknown,
    options: { secret?: string | null } = {}
  ): Promise<{ status: number; body: WebhookBody }> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-forwarded-for": TEST_CLIENT_IP,
    };
    const secret = options.secret === undefined ? SECRET_CURRENT : options.secret;
    if (secret !== null) headers[BONUS_CODE_SECRET_HEADER] = secret;

    const request = new NextRequest("https://toolsaustralia.com.au/api/bonus-codes/v1/issue", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const response = await POST(request);
    return { status: response.status, body: (await response.json()) as WebhookBody };
  }

  /** The audit row this run wrote most recently. */
  async function latestAudit() {
    return BonusCodeWebhookCall.findOne({ ipHash: hashIp(TEST_CLIENT_IP) })
      .sort({ _id: -1 })
      .lean();
  }

  function rowsFor(campaignId: mongoose.Types.ObjectId, userId: mongoose.Types.ObjectId) {
    return RedeemableIssuance.countDocuments({ campaignId, userId });
  }

  try {
    process.env.BONUS_CODE_WEBHOOK_SECRET = SECRET_CURRENT;
    process.env.BONUS_CODE_DAILY_MINT_CAP = "1000000";
    delete process.env.BONUS_CODE_KILL_SWITCH;
    process.env.VERCEL_ENV = "production";

    const holder = await makeUser("holder");
    const spender = await makeUser("spender");
    const budgeted = await makeUser("budgeted");
    const other = await makeUser("other");
    const inactive = await makeUser("inactive", { isActive: false });

    const holderCampaign = await makeCampaign(`WHHOLD${RUN_ID}`, holder.id);
    const spenderCampaign = await makeCampaign(`WHSPENT${RUN_ID}`, spender.id);
    const budgetCampaign = await makeCampaign(`WHBUDGET${RUN_ID}`, budgeted.id);
    const holderCampaignId = holderCampaign._id as unknown as mongoose.Types.ObjectId;
    const spenderCampaignId = spenderCampaign._id as unknown as mongoose.Types.ObjectId;
    const budgetCampaignId = budgetCampaign._id as unknown as mongoose.Types.ObjectId;

    // A code no campaign carries. The inert state — and, under the webhook
    // model, a launch-configuration error.
    const UNCONFIGURED_CODE = `WHNONE${RUN_ID}`;

    // -----------------------------------------------------------------------
    console.log("1. The shared secret is the whole gate");
    {
      pointTriggerAt(holderCampaign.code);
      const body = { userId: String(holder.id), trigger: "cancel-click" };

      const missing = await post(body, { secret: null });
      check("no secret header at all → 401", missing.status, 401);
      check("…and the body is opaque", missing.body, { ok: false });
      check("…and it is audited as missing_secret", (await latestAudit())?.outcome, "missing_secret");

      const wrong = await post(body, { secret: "totally-wrong-but-long-enough-secret" });
      check("a wrong secret → 401", wrong.status, 401);
      check("…and it is audited as bad_secret", (await latestAudit())?.outcome, "bad_secret");

      // A same-length wrong secret is the case a naive `timingSafeEqual` throws
      // on when lengths differ — and the case a `===` compare leaks timing on.
      const sameLength = await post(body, { secret: "x".repeat(SECRET_CURRENT.length) });
      check("a wrong secret of the SAME length → 401, not a thrown error", sameLength.status, 401);

      check("no issuance was written by any refused call", await rowsFor(holderCampaignId, holder.id), 0);
    }

    // -----------------------------------------------------------------------
    console.log("\n2. Rotation: a comma-separated list accepts both, and dropping one revokes it");
    {
      pointTriggerAt(UNCONFIGURED_CODE);
      const body = { userId: String(holder.id), trigger: "cancel-click" };

      process.env.BONUS_CODE_WEBHOOK_SECRET = `${SECRET_RETIRED},${SECRET_CURRENT}`;
      const withOld = await post(body, { secret: SECRET_RETIRED });
      const withNew = await post(body, { secret: SECRET_CURRENT });
      check("the outgoing secret is accepted during the overlap", withOld.status, 200);
      check("the incoming secret is accepted during the overlap", withNew.status, 200);

      process.env.BONUS_CODE_WEBHOOK_SECRET = SECRET_CURRENT;
      const afterRotation = await post(body, { secret: SECRET_RETIRED });
      check("once removed from the list, the old secret → 401", afterRotation.status, 401);

      // FAIL CLOSED. An unset secret must never make the endpoint public.
      delete process.env.BONUS_CODE_WEBHOOK_SECRET;
      const unset = await post(body, { secret: SECRET_CURRENT });
      check("an UNSET server secret → 500, not 200", unset.status, 500);
      check("…and the body is opaque", unset.body, { ok: false });
      check("…and it is audited as misconfigured", (await latestAudit())?.outcome, "misconfigured");
      process.env.BONUS_CODE_WEBHOOK_SECRET = SECRET_CURRENT;
    }

    // -----------------------------------------------------------------------
    console.log("\n3. The production assertion refuses a preview deployment outright");
    {
      pointTriggerAt(holderCampaign.code);
      process.env.VERCEL_ENV = "preview";
      const preview = await post({ userId: String(holder.id), trigger: "cancel-click" });
      check("a valid, authorised call on a preview deploy → 403", preview.status, 403);
      check("…and the body is opaque", preview.body, { ok: false });
      check("…and it is audited as not_production", (await latestAudit())?.outcome, "not_production");
      check("…and nothing was minted", await rowsFor(holderCampaignId, holder.id), 0);
      process.env.VERCEL_ENV = "production";
    }

    // -----------------------------------------------------------------------
    console.log("\n4. The body contract");
    {
      pointTriggerAt(UNCONFIGURED_CODE);

      const notJson = await post("this is not json");
      check("a body that is not JSON → 400", notJson.status, 400);
      check("…and says so without naming a trigger", notJson.body, {
        ok: false,
        error: "invalid_body",
        trigger: null,
      });

      const unknownTrigger = await post({ userId: String(holder.id), trigger: "cancle-click" });
      check("an unknown trigger → 400", unknownTrigger.status, 400);
      check("…and the offending value is echoed for Klaviyo's delivery log", unknownTrigger.body, {
        ok: false,
        error: "invalid_body",
        trigger: "cancle-click",
      });
      check("…and it is audited as invalid_body", (await latestAudit())?.outcome, "invalid_body");
      check("…with no trigger recorded, since none was valid", (await latestAudit())?.trigger, undefined);

      const neither = await post({ userId: "", email: "", trigger: "cancel-click" });
      check("neither userId nor email → 400", neither.status, 400);
      // The trigger WAS valid here — only the identity was missing. This row is
      // what someone reads to find out which marketing flow broke, so it has to
      // name the flow.
      check(
        "…and the audit row still names the flow, because the trigger was valid",
        (await latestAudit())?.trigger,
        "cancel-click"
      );

      // THE CASE THAT MATTERS. `{{ person.user_id }}` renders EMPTY on a
      // newsletter-form profile, and guest checkout-start is the cohort most
      // exposed to that. An empty merge tag must fall through to the email.
      const emptyUserId = await post({ userId: "", email: holder.email, trigger: "cancel-click" });
      check("an EMPTY userId falls through to the email rather than 400", emptyUserId.status, 200);

      // A half-rendered merge tag is not an ObjectId. Same treatment: fall
      // through, do not 400.
      const junkUserId = await post({ userId: "not-an-objectid", email: holder.email, trigger: "cancel-click" });
      check("a non-ObjectId userId falls through to the email too", junkUserId.status, 200);

      // THE MIRROR IMAGE, and the reason `.email()` is not on the schema:
      // neither identity field's SHAPE may veto the call. A half-rendered
      // address must not 400 a call that `userId` serves perfectly well.
      const junkEmail = await post({
        userId: String(holder.id),
        email: "half-rendered-not-an-address",
        trigger: "cancel-click",
      });
      check("a malformed email does NOT 400 a call the userId can serve", junkEmail.status, 200);
      check(
        "…and the customer really was resolved (not_applicable, not user_not_found)",
        (await latestAudit())?.outcome,
        "not_applicable"
      );
    }

    // -----------------------------------------------------------------------
    console.log("\n5. Customer resolution");
    {
      pointTriggerAt(UNCONFIGURED_CODE);

      const unknownId = await post({ userId: String(new mongoose.Types.ObjectId()), trigger: "cancel-click" });
      check("a well-formed userId for no account → 200 (a retry cannot conjure one)", unknownId.status, 200);
      check("…and it is audited as user_not_found", (await latestAudit())?.outcome, "user_not_found");
      check("…and the body is byte-identical to a successful call", unknownId.body, { ok: true });

      const unknownEmail = await post({ email: `nobody-${RUN_ID}@example.test`, trigger: "cancel-click" });
      check("an email for no account → 200", unknownEmail.status, 200);
      check("…audited as user_not_found", (await latestAudit())?.outcome, "user_not_found");

      const deactivated = await post({ userId: String(inactive.id), trigger: "cancel-click" });
      check("a deactivated account → 200, treated as unresolvable", deactivated.status, 200);
      check("…audited as user_not_found", (await latestAudit())?.outcome, "user_not_found");

      // THE REFUSAL. A disagreement means a stale or merged Klaviyo profile,
      // which is exactly when minting to the wrong person is possible.
      const conflict = await post({
        userId: String(holder.id),
        email: other.email,
        trigger: "cancel-click",
      });
      check("userId and email naming DIFFERENT accounts → 409", conflict.status, 409);
      check("…and the body is opaque", conflict.body, { ok: false });
      check("…and it is audited as identity_conflict", (await latestAudit())?.outcome, "identity_conflict");
      check("…with no user attributed to the call", (await latestAudit())?.userId, undefined);

      // THE SILENT SUBSTITUTION. A stale or merged profile can carry a dead
      // account's user_id next to a live address belonging to someone else.
      // The email branch is the fallback for an ABSENT id, never a second
      // attempt after a usable one failed — otherwise this call would burn
      // `holder`'s one-per-lifetime grant on a signal that was never theirs,
      // and unlike the 409 there is no second document to disagree with, so
      // nothing would ever show it happened. Driven against the REAL campaign
      // so a regression mints instead of no-opping.
      pointTriggerAt(holderCampaign.code);
      const staleId = await post({
        userId: String(new mongoose.Types.ObjectId()),
        email: holder.email,
        trigger: "cancel-click",
      });
      check("a usable userId matching no account does NOT fall back to the email", staleId.status, 200);
      check("…and it is audited as user_not_found", (await latestAudit())?.outcome, "user_not_found");
      check(
        "…and the address's owner was NOT minted to",
        await rowsFor(holderCampaignId, holder.id),
        0
      );
    }

    // -----------------------------------------------------------------------
    console.log("\n6. No campaign carries the code — inert, and NOT retryable");
    {
      pointTriggerAt(UNCONFIGURED_CODE);
      const inert = await post({ userId: String(holder.id), trigger: "cancel-click" });
      check("→ 200, because a retry cannot create a campaign", inert.status, 200);
      check("…and it is audited as not_applicable", (await latestAudit())?.outcome, "not_applicable");
      check("…and nothing was minted", await rowsFor(holderCampaignId, holder.id), 0);
    }

    // -----------------------------------------------------------------------
    console.log("\n7. The happy path mints exactly 72 hours");
    {
      pointTriggerAt(holderCampaign.code);
      emits.length = 0;
      const minted = await post({
        userId: String(holder.id),
        email: holder.email,
        trigger: "cancel-click",
      });
      check("→ 200", minted.status, 200);
      check("…and the body is exactly { ok: true }", minted.body, { ok: true });
      check("…writing exactly one issuance", await rowsFor(holderCampaignId, holder.id), 1);

      const row = await RedeemableIssuance.findOne({ campaignId: holderCampaignId, userId: holder.id }).lean();
      check(
        "the window is exactly 72 hours from the instant the webhook was received",
        row ? row.expiresAt.getTime() - row.issuedAt.getTime() : null,
        SEVENTY_TWO_HOURS_MS
      );
      check("the row is active", row?.status, "active");

      const audit = await latestAudit();
      check("the call is audited as minted", audit?.outcome, "minted");
      check("…with status 200", audit?.status, 200);
      check("…attributed to the customer", String(audit?.userId), String(holder.id));
      check("…and tagged with the trigger", audit?.trigger, "cancel-click");

      check("the Bonus Code Issued event was emitted once", emits.length, 1);
      check("…with the right event name", emits[0]?.event, "Bonus Code Issued");
      check(
        "…carrying the deadline that was PERSISTED, not a recomputed one",
        emits[0]?.properties.expires_at,
        row?.expiresAt.toISOString()
      );

      // -------------------------------------------------------------------
      console.log("\n7b. A second call inside the window does NOT extend it");
      const firstExpiry = row?.expiresAt.getTime();
      emits.length = 0;
      const again = await post({ userId: String(holder.id), trigger: "cancel-click" });
      check("→ 200: the customer already holds a working code", again.status, 200);
      check("…and it is audited as already_active", (await latestAudit())?.outcome, "already_active");
      check("…still exactly one issuance", await rowsFor(holderCampaignId, holder.id), 1);

      const afterSecondCall = await RedeemableIssuance.findOne({
        campaignId: holderCampaignId,
        userId: holder.id,
      }).lean();
      check(
        "…and the deadline is UNCHANGED — a flow re-entry must not hand out a fresh window",
        afterSecondCall?.expiresAt.getTime(),
        firstExpiry
      );
      check("…and no second email was emitted", emits.length, 0);
    }

    // -----------------------------------------------------------------------
    console.log("\n8. A spent grant stays spent — one per person, for life");
    {
      pointTriggerAt(spenderCampaign.code);
      const first = await post({ userId: String(spender.id), trigger: "cancel-click" });
      check("fixture: the first call minted", first.status, 200);
      check("fixture: audited as minted", (await latestAudit())?.outcome, "minted");

      // Redeem it, then lapse the window, then re-trigger. `redeemedEverAt` is
      // the only thing holding the lifetime cap; a refund restores `status` to
      // "active" and $unsets `redeemedAt`, so without it a refunded row is
      // byte-identical to a never-redeemed one.
      await RedeemableIssuance.updateOne(
        { campaignId: spenderCampaignId, userId: spender.id },
        {
          $set: {
            status: "active",
            redeemedEverAt: new Date(Date.now() - DAY_MS),
            expiresAt: new Date(Date.now() - 60_000),
          },
        }
      );

      emits.length = 0;
      const spent = await post({ userId: String(spender.id), trigger: "cancel-click" });
      check("a re-trigger after a redeemed-then-refunded grant → 200", spent.status, 200);
      check("…and it is audited as spent", (await latestAudit())?.outcome, "spent");
      check("…still exactly one issuance", await rowsFor(spenderCampaignId, spender.id), 1);

      const spentRow = await RedeemableIssuance.findOne({
        campaignId: spenderCampaignId,
        userId: spender.id,
      }).lean();
      check(
        "…and the lapsed deadline was NOT re-armed",
        spentRow ? spentRow.expiresAt.getTime() < Date.now() : null,
        true
      );
      check("…and no email was emitted for it", emits.length, 0);
    }

    // -----------------------------------------------------------------------
    console.log("\n9. The status map's load-bearing split: error → 500, not_applicable → 200");
    // These two were ONE value before this rework. A transient Mongo fault
    // answered 200, Klaviyo did not retry, the discount email sent anyway, and
    // the customer's grant was lost permanently with no trace.
    {
      pointTriggerAt(holderCampaign.code);
      const realEnsure = CampaignService.ensureCampaignIssuanceForUser;
      CampaignService.ensureCampaignIssuanceForUser = async () => {
        throw new Error("simulated Mongo outage");
      };
      try {
        const errored = await post({ userId: String(holder.id), trigger: "cancel-click" });
        check("a thrown mint → 500, so Klaviyo retries and the grant is recoverable", errored.status, 500);
        check("…and the body is opaque", errored.body, { ok: false });
        check("…and it is audited as error", (await latestAudit())?.outcome, "error");
      } finally {
        CampaignService.ensureCampaignIssuanceForUser = realEnsure;
      }

      pointTriggerAt(UNCONFIGURED_CODE);
      const inert = await post({ userId: String(holder.id), trigger: "cancel-click" });
      check("…while 'nothing to do' → 200, so no retry storm is manufactured", inert.status, 200);
      check("…and it is audited as not_applicable", (await latestAudit())?.outcome, "not_applicable");
    }

    // -----------------------------------------------------------------------
    console.log("\n10. The daily mint budget is the only control that survives a leaked secret");
    {
      pointTriggerAt(budgetCampaign.code);

      process.env.BONUS_CODE_KILL_SWITCH = "true";
      const killed = await post({ userId: String(budgeted.id), trigger: "cancel-click" });
      check("the kill switch → 429", killed.status, 429);
      check("…and the body is opaque", killed.body, { ok: false });
      check("…and it is audited as kill_switch", (await latestAudit())?.outcome, "kill_switch");
      check("…and NOTHING was minted", await rowsFor(budgetCampaignId, budgeted.id), 0);
      delete process.env.BONUS_CODE_KILL_SWITCH;

      process.env.BONUS_CODE_DAILY_MINT_CAP = "0";
      const capped = await post({ userId: String(budgeted.id), trigger: "cancel-click" });
      check("an exhausted daily cap → 429 (a retry after the day rolls over succeeds)", capped.status, 429);
      check("…and it is audited as daily_cap", (await latestAudit())?.outcome, "daily_cap");
      check("…and NOTHING was minted", await rowsFor(budgetCampaignId, budgeted.id), 0);
      process.env.BONUS_CODE_DAILY_MINT_CAP = "1000000";

      // THE FAIL-CLOSED PATH, and the one that matters most: it is what makes a
      // database outage BLOCK minting instead of uncapping it, and this gate is
      // the only control that still bounds the damage once the shared secret
      // leaks. A catch that returned "allowed" would build a cap that uncaps
      // itself at exactly the moment things are going wrong.
      const realCount = BonusCodeWebhookCall.countDocuments;
      let countStubReached = false;
      BonusCodeWebhookCall.countDocuments = ((): never => {
        countStubReached = true;
        throw new Error("simulated Mongo outage in the budget count");
      }) as unknown as typeof BonusCodeWebhookCall.countDocuments;
      try {
        const gateBroken = await post({ userId: String(budgeted.id), trigger: "cancel-click" });
        // Proves the 500 came from the gate and not from something else.
        check("fixture: the budget's count query was actually reached", countStubReached, true);
        check("a budget gate that cannot be evaluated → 500, never a silent allow", gateBroken.status, 500);
        check("…and the body is opaque", gateBroken.body, { ok: false });
        check("…and it is audited as error", (await latestAudit())?.outcome, "error");
        check("…and NOTHING was minted", await rowsFor(budgetCampaignId, budgeted.id), 0);
      } finally {
        BonusCodeWebhookCall.countDocuments = realCount;
      }

      const allowed = await post({ userId: String(budgeted.id), trigger: "cancel-click" });
      check("with the budget restored, the same call mints", allowed.status, 200);
      check("…exactly one issuance", await rowsFor(budgetCampaignId, budgeted.id), 1);
    }
  } finally {
    await cleanup();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await mongoose.connection.close();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed");
}

run().catch((error) => {
  console.error("bonus-code-webhook.test.ts crashed:", error);
  process.exit(1);
});
