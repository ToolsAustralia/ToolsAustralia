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
 *   4. CUSTOMER RESOLUTION, including the `identity_conflict` refusal when
 *      `userId` and `email` name two different accounts — which answers 200
 *      with a body byte-identical to a mint, so the AUDIT ROW is asserted too:
 *      with the status no longer distinguishing it, that row is the only
 *      remaining way to detect the condition. And the quieter cousin of it: a
 *      usable `userId` that resolves to nothing must NOT fall back to the
 *      email, or a stale profile mints a bystander's one-per-lifetime grant
 *      invisibly.
 *   5. THE STATUS MAP — and specifically that a service `error` answers 500
 *      while `not_applicable` answers 200. Those two were one value until this
 *      rework; the endpoint's whole retry story rests on telling them apart.
 *   6. THE WINDOW: exactly 72 hours, a second call inside it does NOT extend
 *      it, and a spent grant stays spent.
 *   7. THE BUDGET: kill switch and daily cap both refuse with 429 and mint
 *      nothing — and a budget gate that cannot be EVALUATED refuses with 500,
 *      because a cap that uncaps itself during an outage is not a cap. Section
 *      10b then pins WHICH OUTCOMES CONSUME IT, by delta across real calls:
 *      emptying `BUDGET_CONSUMING_OUTCOMES` uncaps the endpoint entirely, and
 *      adding a non-minting outcome to it lets a few hundred inert calls starve
 *      every legitimate flow send for the rest of the UTC day. Neither is a
 *      compile error and neither was reachable by any assertion before this.
 *   8. RESPONSE OPACITY: `{ ok: <status is 200> }` byte-for-byte, so "minted"
 *      and "no such customer" are indistinguishable to the caller.
 *   9. THE AUDIT ROW on every path. It is not bookkeeping — the daily mint
 *      budget COUNTS these rows, so an unwritten row is an uncounted mint.
 *  10. THE RE-ARM COOLDOWN, end to end (section 11). `rearmed` and
 *      `expired_no_rearm` are the only two of the eleven status-map rows that no
 *      test drove through the endpoint, and they are exactly the two the
 *      cooldown decides between. The anchor is passed as an OPTIONAL argument at
 *      `CampaignService.ts`, so replacing it with `undefined` type-checks — and
 *      turns "one grant per person for life" into "one per flow re-entry",
 *      unbounded, on money-equivalent prize-draw entries. The pure suite passes
 *      the anchor in as an argument and cannot see the caller; the DB-backed
 *      mint suite deliberately ages past the cooldown. This is where the caller
 *      is pinned.
 *  11. THE KLAVIYO PROFILE the event is addressed to (section 7). Not the
 *      properties — the `customer_properties` block, which is the only witness
 *      that `WEBHOOK_USER_PROJECTION` still selects the fields the emit reads.
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
import { BONUS_CODE_SECRET_HEADER, MIN_SECRET_LENGTH } from "@/lib/bonus-code-webhook/auth";
import { BUDGET_CONSUMING_OUTCOMES, utcDayKey } from "@/lib/bonus-code-webhook/budget";
import { REARM_COOLDOWN_DAYS } from "@/utils/redeemables/bonus-code-policy";
import type { BonusCodeCallOutcome } from "@/models/BonusCodeWebhookCall";
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
  /**
   * RECORDED, not discarded. This block is built from the user document
   * `resolveBonusCodeCustomer` projected, so it is the only place a field
   * silently missing from `WEBHOOK_USER_PROJECTION` becomes visible: that
   * projection is a plain string literal, so dropping `email` from it is not a
   * compile error — the event simply goes out addressed to `""`, Klaviyo has no
   * profile to attach it to, and the one record that answers "why didn't this
   * customer get their code?" quietly stops landing. Asserted in section 7.
   */
  customer_properties: KlaviyoEvent["customer_properties"];
  properties: Record<string, unknown>;
}
const emits: RecordedEmit[] = [];

const stubKlaviyo = {
  async trackEvent(event: KlaviyoEvent): Promise<KlaviyoEventResponse> {
    emits.push({
      event: event.event,
      customer_properties: { ...event.customer_properties },
      properties: { ...event.properties },
    });
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

  /**
   * EACH STEP INDIVIDUALLY GUARDED, for the same reason the steps exist at all.
   * As unguarded sequential awaits, ONE throwing deleteMany skips everything
   * below it — and the campaigns this file creates are genuinely LIVE campaigns
   * in a shared database. Leaking one leaves a real `MonthlyEntryCampaign` row
   * carrying a fixture code, which also collides with the unique index on `code`
   * on the next run. `restore()` runs first and outside the loop: it puts
   * `VERCEL_ENV` and the secret back, and it cannot throw.
   * Same pattern as campaign-window.test.ts / campaign-enrolment.test.ts.
   */
  async function cleanup() {
    restore();
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["issuances", () => RedeemableIssuance.deleteMany({ userId: { $in: userIds } })],
      ["audit rows", () => BonusCodeWebhookCall.deleteMany({ ipHash: hashIp(TEST_CLIENT_IP) })],
      ["campaigns", () => MonthlyEntryCampaign.deleteMany({ _id: { $in: campaignIds } })],
      ["users", () => User.deleteMany({ _id: { $in: userIds } })],
    ];
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error) {
        console.error(`  CLEANUP FAILED (${name}) — check for leaked fixtures`, error);
      }
    }
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

    // Sections 10b and 11 each need a customer who has never held a grant: a
    // second call for an existing holder settles as already_active / spent and
    // mints nothing, which is precisely what those two sections must not measure.
    const capMinter = await makeUser("cap-minter");
    const capEdge = await makeUser("cap-edge");
    const rearmer = await makeUser("rearmer");

    const holderCampaign = await makeCampaign(`WHHOLD${RUN_ID}`, holder.id);
    const spenderCampaign = await makeCampaign(`WHSPENT${RUN_ID}`, spender.id);
    const budgetCampaign = await makeCampaign(`WHBUDGET${RUN_ID}`, budgeted.id);
    const capMinterCampaign = await makeCampaign(`WHCAPMINT${RUN_ID}`, capMinter.id);
    const capEdgeCampaign = await makeCampaign(`WHCAPEDGE${RUN_ID}`, capEdge.id);
    const rearmCampaign = await makeCampaign(`WHREARM${RUN_ID}`, rearmer.id);
    const holderCampaignId = holderCampaign._id as unknown as mongoose.Types.ObjectId;
    const spenderCampaignId = spenderCampaign._id as unknown as mongoose.Types.ObjectId;
    const budgetCampaignId = budgetCampaign._id as unknown as mongoose.Types.ObjectId;
    const capMinterCampaignId = capMinterCampaign._id as unknown as mongoose.Types.ObjectId;
    const capEdgeCampaignId = capEdgeCampaign._id as unknown as mongoose.Types.ObjectId;
    const rearmCampaignId = rearmCampaign._id as unknown as mongoose.Types.ObjectId;

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

      // A same-length wrong secret is the one case `timingSafeEqual` actually
      // compares byte by byte — and the case a `===` compare leaks timing on.
      const sameLength = await post(body, { secret: "x".repeat(SECRET_CURRENT.length) });
      check("a wrong secret of the SAME length → 401, not a thrown error", sameLength.status, 401);

      // THE LENGTH GUARD, which is load-bearing and was unreachable: every
      // rejection fixture above is exactly `SECRET_CURRENT.length` characters.
      // `timingSafeEqual` THROWS a RangeError on buffers of DIFFERENT lengths,
      // so without the byte-length pre-check in `auth.ts` every wrong-length
      // secret would answer 500 — and 500 is the one status this endpoint uses
      // to mean "retry, the grant is still recoverable", so Klaviyo would retry
      // an unauthenticated caller indefinitely instead of refusing it once.
      // Spec §7 requires 401 here, not a throw.
      const tooShort = await post(body, { secret: "x" });
      check("a wrong secret SHORTER than the configured one → 401, never a 500", tooShort.status, 401);
      check("…and it is audited as bad_secret, not error", (await latestAudit())?.outcome, "bad_secret");

      const tooLong = await post(body, { secret: `${SECRET_CURRENT}-with-extra-bytes-appended` });
      check("a wrong secret LONGER than the configured one → 401, never a 500", tooLong.status, 401);

      // Same STRING length, different BYTE length. The guard compares
      // `Buffer.length`, not `String.length`, so a multi-byte character cannot
      // slip a mismatch past it into the throw.
      const multiByte = await post(body, {
        secret: `é${"x".repeat(SECRET_CURRENT.length - 1)}`,
      });
      check("a multi-byte secret of the same STRING length → 401, never a 500", multiByte.status, 401);

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

      // THE FLOOR, which nothing pinned. `BONUS_CODE_WEBHOOK_SECRET=abc` — a
      // placeholder, a truncated paste, a stray `BONUS_CODE_WEBHOOK_SECRET= x`
      // — is brute-forceable, so `parseConfiguredSecrets` DROPS every candidate
      // under `MIN_SECRET_LENGTH`. Dropping the only candidate must leave the
      // endpoint fail-CLOSED (`misconfigured`, 500), never accept the short
      // value and never fall through to "no secret configured, let it through".
      //
      // PINNED IN BOTH HALVES, deliberately. The behavioural leg below derives
      // its fixture from the constant, so on its own it would simply MOVE with a
      // lowered floor and keep passing — which is the "content assertion naming a
      // business value has its own expiry date" trap written up in
      // docs/config-and-data/gotchas.md. So the constant is asserted directly
      // first. It is a >= assertion, not an equality: raising the floor is a
      // tightening and must stay allowed; LOWERING it is the regression.
      check("MIN_SECRET_LENGTH is at least 16 — the floor may be raised, never lowered", MIN_SECRET_LENGTH >= 16, true);

      // `Math.max(1, …)` so this stays a real one-character secret rather than
      // collapsing to "" (which `parseConfiguredSecrets` rejects for a different
      // reason) if someone drops the floor to 1.
      const belowFloor = "s".repeat(Math.max(1, MIN_SECRET_LENGTH - 1));
      process.env.BONUS_CODE_WEBHOOK_SECRET = belowFloor;
      const shortConfigured = await post(body, { secret: belowFloor });
      check("a configured secret UNDER the floor is dropped, not honoured → 500", shortConfigured.status, 500);
      check("…and it is audited as misconfigured", (await latestAudit())?.outcome, "misconfigured");
      check("…and the body is opaque", shortConfigured.body, { ok: false });

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
      //
      // IT ANSWERS 200, INDISTINGUISHABLY. This was a 409 until 2026-08-26 and
      // must not go back: the conflict check runs before the isActive gate, so
      // anyone holding the secret could pair their OWN account id with a probe
      // address and read "is this a Tools Australia customer" straight off the
      // status line — free, non-destructive, unbounded (no rate limiter by
      // design; the daily cap counts only mints). Driven against a REAL
      // campaign, so a regression that answered 409 fails on the status AND a
      // regression that silently minted fails on the row count.
      // THE OTHER DETECTOR, PINNED. `console.error` is the only log level
      // production keeps, so that one line is the whole real-time signal that a
      // marketing flow is pairing disagreeing identities — the audit collection
      // has no admin surface and nobody queries it on a schedule. Captured
      // across the call and restored in a `finally`, so `check` keeps printing
      // failures either way.
      pointTriggerAt(holderCampaign.code);
      const conflictLogs: string[] = [];
      const realConsoleError = console.error;
      let conflict: { status: number; body: WebhookBody };
      try {
        console.error = (...args: unknown[]) => {
          conflictLogs.push(
            args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ")
          );
        };
        conflict = await post({
          userId: String(holder.id),
          email: other.email,
          trigger: "cancel-click",
        });
      } finally {
        console.error = realConsoleError;
      }
      check("userId and email naming DIFFERENT accounts → 200, not a status of its own", conflict.status, 200);
      check(
        "…and the body is byte-identical to a successful mint, so the status leaks nothing",
        conflict.body,
        { ok: true }
      );
      // THE REMAINING DETECTORS. With the status no longer distinguishing this
      // condition, the audit row and the console.error above are all that is
      // left, so BOTH are pinned here — a test asserting only the status would
      // let either signal be deleted silently.
      check("…and it is STILL audited as identity_conflict", (await latestAudit())?.outcome, "identity_conflict");
      check(
        "…and the console.error detector fired — the only real-time signal left",
        conflictLogs.some((line) =>
          line.includes("[bonus-code] userId and email resolve to different customers")
        ),
        true
      );
      check("…with no user attributed to the call", (await latestAudit())?.userId, undefined);
      check(
        "…and neither account was minted to",
        await rowsFor(holderCampaignId, holder.id),
        0
      );

      // THE SILENT SUBSTITUTION. A stale or merged profile can carry a dead
      // account's user_id next to a live address belonging to someone else.
      // The email branch is the fallback for an ABSENT id, never a second
      // attempt after a usable one failed — otherwise this call would burn
      // `holder`'s one-per-lifetime grant on a signal that was never theirs,
      // and unlike `identity_conflict` there is no second document to disagree
      // with, so no audit row would ever show it happened. Driven against the
      // REAL campaign (still pointed there from the case above) so a regression
      // mints instead of no-opping.
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

      // THE PROFILE THE EVENT IS ADDRESSED TO. `customer_properties` is built by
      // `getCustomerProperties` off the user document `resolveBonusCodeCustomer`
      // PROJECTED, and that projection is a plain string literal
      // (`WEBHOOK_USER_PROJECTION`). Dropping a field from it is not a compile
      // error and not a runtime error: the emit simply goes out with
      // `email: ""`, Klaviyo has no profile to attach the event to, and the only
      // record that answers "why didn't this customer get their code?" silently
      // stops landing — with no admin surface to notice it from. Asserting the
      // properties block alone would not see any of that.
      check(
        "…addressed to the customer's own email, so Klaviyo has a profile to attach it to",
        emits[0]?.customer_properties.email,
        holder.email
      );
      check(
        "…and carrying their first name, so the email can greet them",
        emits[0]?.customer_properties.first_name,
        "Webhook"
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

    // -----------------------------------------------------------------------
    console.log("\n10b. WHICH outcomes consume the cap — the wire the cases above never touch");
    // Everything in section 10 sets the cap to "0" (trips at ANY count,
    // including a permanently-zero one) or "1000000" (allows at any count), so
    // `mintedToday` is never load-bearing in an assertion there and
    // BUDGET_CONSUMING_OUTCOMES is never read at all. That leaves the cap's
    // definition — the ONLY control that still bounds the damage once the shared
    // secret leaks, with no rate limiter behind it by design — mutable in both
    // directions with type-check, lint and every suite still green:
    //
    //   EMPTY IT, or drop "minted"/"rearmed": real mints stop being counted,
    //   `mintedToday` is permanently 0, the cap never fires, and the endpoint is
    //   uncapped from the moment the secret leaks.
    //
    //   ADD A NON-MINTING OUTCOME: `not_applicable` is this branch's normal
    //   RESTING STATE — no campaign carries the code until an admin creates one,
    //   plus every ineligible customer — so a few hundred inert calls in one UTC
    //   day answer 429 to every legitimate flow send for the rest of that day.
    //   That is the starvation the constant's own JSDoc forbids.
    //
    // Both are closed below: a membership assertion for the definition, and two
    // DELTAS through the real route for the query that reads it.
    {
      /**
       * Every audit outcome, classified. Typed as an exhaustive record so a new
       * outcome added to the model without a decision here is a COMPILE error —
       * the same forcing function `BonusCodeWebhookCall.ts` uses for the trigger
       * enum, and for the same reason: this is a security control whose failure
       * mode is silence.
       */
      const CONSUMES_BUDGET: Record<BonusCodeCallOutcome, boolean> = {
        // Walked away with a live window. These, and only these.
        minted: true,
        rearmed: true,
        // Handed out nothing, so they must not eat the cap.
        already_active: false,
        spent: false,
        expired_no_rearm: false,
        not_applicable: false,
        error: false,
        misconfigured: false,
        missing_secret: false,
        bad_secret: false,
        not_production: false,
        invalid_body: false,
        identity_conflict: false,
        user_not_found: false,
        daily_cap: false,
        kill_switch: false,
      };
      const expectedConsuming = (Object.keys(CONSUMES_BUDGET) as BonusCodeCallOutcome[])
        .filter((outcome) => CONSUMES_BUDGET[outcome])
        .sort();
      check(
        "BUDGET_CONSUMING_OUTCOMES is exactly the grant-creating outcomes",
        [...BUDGET_CONSUMING_OUTCOMES].sort(),
        expectedConsuming
      );

      /**
       * The production counting query, verbatim — same `dayKey`, same `$in`
       * against the same constant `budget.ts` reads.
       *
       * DELTA, NEVER AN ABSOLUTE. This count is collection-wide for the UTC day
       * and other suites share this database, so no absolute number is
       * assertable; what IS assertable is how much one call moves it.
       */
      const budgetCount = () =>
        BonusCodeWebhookCall.countDocuments({
          dayKey: utcDayKey(),
          outcome: { $in: [...BUDGET_CONSUMING_OUTCOMES] },
        });

      pointTriggerAt(capMinterCampaign.code);
      const beforeMint = await budgetCount();
      const counted = await post({ userId: String(capMinter.id), trigger: "cancel-click" });
      check("fixture: the call minted", counted.status, 200);
      check("fixture: audited as minted", (await latestAudit())?.outcome, "minted");
      check("fixture: exactly one issuance", await rowsFor(capMinterCampaignId, capMinter.id), 1);
      check("one real mint moves the budget count by exactly 1", (await budgetCount()) - beforeMint, 1);

      // The other direction. not_applicable is the resting state, so if it
      // counted, ordinary inert traffic would exhaust the cap on its own.
      pointTriggerAt(UNCONFIGURED_CODE);
      const beforeInert = await budgetCount();
      const inert = await post({ userId: String(holder.id), trigger: "cancel-click" });
      check("fixture: the call was inert", inert.status, 200);
      check("fixture: audited as not_applicable", (await latestAudit())?.outcome, "not_applicable");
      check("a not_applicable call does NOT move the budget count", (await budgetCount()) - beforeInert, 0);

      // AND THE COUNT IS LOAD-BEARING IN THE GATE. Section 10 proves 0 refuses
      // and 1000000 allows, which holds even if `mintedToday` were hard-wired to
      // zero. Setting the cap to the count the query actually returns makes the
      // refusal depend on that number, and count+1 makes the allow depend on it.
      pointTriggerAt(capEdgeCampaign.code);
      const live = await budgetCount();
      check("fixture: this run has already minted, so the count is non-zero", live > 0, true);

      process.env.BONUS_CODE_DAILY_MINT_CAP = String(live);
      const atCap = await post({ userId: String(capEdge.id), trigger: "cancel-click" });
      check("a cap set to the LIVE count refuses the next call → 429", atCap.status, 429);
      check("…audited as daily_cap", (await latestAudit())?.outcome, "daily_cap");
      check("…and nothing was minted", await rowsFor(capEdgeCampaignId, capEdge.id), 0);

      process.env.BONUS_CODE_DAILY_MINT_CAP = String(live + 1);
      const underCap = await post({ userId: String(capEdge.id), trigger: "cancel-click" });
      check("one above the live count, the same call mints", underCap.status, 200);
      check("…exactly one issuance", await rowsFor(capEdgeCampaignId, capEdge.id), 1);

      process.env.BONUS_CODE_DAILY_MINT_CAP = "1000000";
    }

    // -----------------------------------------------------------------------
    console.log("\n11. The re-arm cooldown — 'one per person for life', not 'one per flow re-entry'");
    // `rearmed` and `expired_no_rearm` are the only two of the endpoint's eleven
    // status-map rows that nothing drove end to end, and they are exactly the two
    // the cooldown decides between. The anchor reaches `decideRearm` as an
    // OPTIONAL fourth argument (`existing?.firstIssuedAt ?? existing?.issuedAt`),
    // so replacing it with `undefined` type-checks cleanly — and with it gone
    // rule 4 never fires: every lapsed row plus a trigger returns `rearmed`, so a
    // flow re-entry, a late retry or marketing re-running a sequence hands the
    // same customer a second full 72-hour window and a second code, unbounded, on
    // money-equivalent prize-draw entries.
    //
    // Neither existing suite can see that. The pure suite passes `firstIssuedAt`
    // in as an argument, so it tests the decision in isolation and never reaches
    // the caller; the DB-backed mint suite deliberately ages `firstIssuedAt` PAST
    // the cooldown (its own comment says so), so no DB-backed test ever builds a
    // lapsed row INSIDE the cooldown. This does both, through the route.
    {
      pointTriggerAt(rearmCampaign.code);
      emits.length = 0;

      const minted = await post({ userId: String(rearmer.id), trigger: "cancel-click" });
      check("fixture: the first call minted", minted.status, 200);
      check("fixture: audited as minted", (await latestAudit())?.outcome, "minted");
      check("fixture: one email went out", emits.length, 1);

      const original = await RedeemableIssuance.findOne({
        campaignId: rearmCampaignId,
        userId: rearmer.id,
      }).lean();
      if (!original) throw new Error("re-arm fixture: the mint wrote no row");
      const originalFirstIssuedAt = original.firstIssuedAt?.getTime();
      check("fixture: the mint stamped firstIssuedAt", typeof originalFirstIssuedAt, "number");

      // INSIDE THE COOLDOWN. Only the window is lapsed; `firstIssuedAt` stays
      // where the mint put it, moments ago. This is the shape a real flow
      // re-entry produces, and the shape no test has ever built.
      const lapsedAt = new Date(Date.now() - 60_000);
      await RedeemableIssuance.updateOne({ _id: original._id }, { $set: { expiresAt: lapsedAt } });

      emits.length = 0;
      const refused = await post({ userId: String(rearmer.id), trigger: "cancel-click" });
      check("a lapsed grant re-triggered INSIDE the cooldown → 200", refused.status, 200);
      check("…and it is audited as expired_no_rearm", (await latestAudit())?.outcome, "expired_no_rearm");
      check("…and the body is opaque, like every other customer-state outcome", refused.body, { ok: true });
      check("…still exactly one issuance", await rowsFor(rearmCampaignId, rearmer.id), 1);

      const afterRefusal = await RedeemableIssuance.findOne({
        campaignId: rearmCampaignId,
        userId: rearmer.id,
      }).lean();
      check(
        "…and the lapsed deadline was NOT moved — no second window was handed out",
        afterRefusal?.expiresAt.getTime(),
        lapsedAt.getTime()
      );
      check("…and no second email was emitted", emits.length, 0);

      // OUTSIDE THE COOLDOWN. One day past the boundary; the window stays lapsed.
      const agedFirstIssuedAt = new Date(Date.now() - (REARM_COOLDOWN_DAYS + 1) * DAY_MS);
      await RedeemableIssuance.updateOne(
        { _id: original._id },
        { $set: { issuedAt: agedFirstIssuedAt, firstIssuedAt: agedFirstIssuedAt, expiresAt: lapsedAt } }
      );

      emits.length = 0;
      const rearmed = await post({ userId: String(rearmer.id), trigger: "cancel-click" });
      check("the same call OUTSIDE the cooldown → 200", rearmed.status, 200);
      check("…and it is audited as rearmed", (await latestAudit())?.outcome, "rearmed");
      check("…still exactly one issuance — a re-arm updates, never inserts", await rowsFor(rearmCampaignId, rearmer.id), 1);

      const rearmedRow = await RedeemableIssuance.findOne({
        campaignId: rearmCampaignId,
        userId: rearmer.id,
      }).lean();
      check(
        "…with a deadline exactly 72 hours from the instant Klaviyo called",
        rearmedRow ? rearmedRow.expiresAt.getTime() - rearmedRow.issuedAt.getTime() : null,
        SEVENTY_TWO_HOURS_MS
      );
      check("…and that deadline is in the future", rearmedRow ? rearmedRow.expiresAt.getTime() > Date.now() : null, true);
      check(
        "…and firstIssuedAt was PRESERVED, so the next cooldown still anchors on the first grant",
        rearmedRow?.firstIssuedAt?.getTime(),
        agedFirstIssuedAt.getTime()
      );
      check("…and exactly one email went out for the fresh window", emits.length, 1);
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
