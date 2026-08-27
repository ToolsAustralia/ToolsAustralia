/**
 * POST /api/bonus-codes/v1/issue
 *
 * The inbound webhook a Klaviyo flow calls from a step placed immediately
 * before its discount email. The call mints the customer's per-customer bonus
 * code and starts its 72-hour clock at that instant, so the code is always
 * fresh when the email lands. (Under the previous design the clock started days
 * earlier, when the customer qualified, and two of the three flows would have
 * emailed a guaranteed-expired code.)
 *
 * Nothing comes back into the email — Klaviyo webhooks are one-way. The email
 * carries the code string hardcoded; this call is what makes that string work.
 *
 * THIS ROUTE OWNS 100% OF ITS OWN AUTHORIZATION. `src/middleware.ts`'s matcher
 * excludes `/api` outright, so there is no outer gate to fall back on and no
 * session to lean on. A caller who gets past the secret check mints real
 * prize-draw entries.
 *
 * ORDER OF OPERATIONS, and why:
 *   connectDB → read the raw body once → production assertion → shared secret →
 *   daily mint budget → Zod → resolve the customer → delegate to
 *   `mintBonusCodeForTrigger` → map the outcome to a status → audit.
 * The three cheap refusals (environment, secret, budget) run before anything
 * touches customer data, and the budget runs before the mint because it is the
 * only control that still bounds the damage once the shared secret leaks.
 *
 * THE RESPONSE BODY IS DELIBERATELY OPAQUE: `{ "ok": true }` or
 * `{ "ok": false }`, and `ok` mirrors the HTTP STATUS, never the outcome. A
 * richer body — `{ outcome: "spent", expiresAt: … }` — would turn this into a
 * customer-state oracle for anyone holding the secret: iterate ObjectIds or
 * email addresses and read back whether an account exists, whether it is
 * active, whether the grant is already spent, and the exact instant of the
 * window. With the email fallback it also becomes an "is this address a Tools
 * Australia customer" oracle for people who never interacted with us. This repo
 * already carries a written incident of exactly that disclosure class at
 * `src/app/api/codes/validate/route.ts`. Do NOT make `ok` mean "did we mint".
 * The one deliberate exception is 400, which echoes the offending `trigger`
 * value so a flow misconfiguration is visible in Klaviyo's delivery log — that
 * value came from the caller and leaks nothing about a customer.
 *
 * THE STATUS LINE IS PART OF THE BODY, for this purpose. An opaque body bought
 * nothing while one customer-state outcome answered a status of its own: a
 * distinct status is a distinct answer, readable by exactly the same sweep. So
 * EVERY customer-state outcome — minted, spent, no such account, and the
 * identity conflict — answers 200 with a byte-identical body. Only conditions
 * that are properties of the CALLER, not of a customer, get their own status:
 * 400 (their body), 401 (their secret), 403 (the environment), 429 (our cap),
 * 500 (our fault). Before giving a customer-state outcome its own status, ask
 * what an attacker holding the secret learns by watching for it.
 *
 * All diagnostics go to `console.error` with the `[bonus-code]` prefix.
 * Production builds strip log/info/debug/warn; `error` is the only level that
 * survives.
 *
 * @see docs/rewards-redeemables/api.md for the full contract and status map
 */
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import {
  BONUS_CODE_SECRET_HEADER,
  verifyBonusCodeWebhookSecret,
} from "@/lib/bonus-code-webhook/auth";
import { assertBonusCodeMintBudget } from "@/lib/bonus-code-webhook/budget";
import { writeBonusCodeWebhookCall } from "@/lib/bonus-code-webhook/audit";
import { resolveBonusCodeCustomer } from "@/lib/bonus-code-webhook/resolveCustomer";
import { mintBonusCodeForTrigger } from "@/services/redeemables/mintBonusCodeForTrigger";
import type { StampedIssuanceResult } from "@/services/redeemables/CampaignService";
import {
  BONUS_CODE_CALL_TRIGGERS,
  type BonusCodeCallOutcome,
} from "@/models/BonusCodeWebhookCall";
import type { BonusCodeTrigger } from "@/utils/redeemables/bonus-code-policy";

/**
 * The wire enum, reused rather than re-typed.
 *
 * `BONUS_CODE_CALL_TRIGGERS` is the same array the audit model uses as its
 * schema `enum`, so the route cannot start accepting a trigger its own audit row
 * would reject — a mismatch there makes `create()` throw, the audit writer
 * swallows it, and every `minted` row for that trigger silently vanishes, which
 * makes the daily budget count read low and the cap quietly stop capping.
 *
 * THE EXHAUSTIVENESS GUARANTEE LIVES IN THE MODEL, NOT HERE. `satisfies` alone
 * would only prove these values are a SUBSET of `BonusCodeTrigger` — a fourth
 * trigger added to the domain type and forgotten here would still compile.
 * `src/models/BonusCodeWebhookCall.ts` derives the array from an exhaustive
 * `Record<BonusCodeTrigger, true>`, so a missing key is a compile error there.
 * Do not rely on this line for that; keep the record exhaustive.
 */
const TRIGGERS = BONUS_CODE_CALL_TRIGGERS satisfies readonly BonusCodeTrigger[];

/**
 * A Klaviyo merge tag that has nothing to render produces an EMPTY STRING, not
 * an absent key — `{{ person.user_id }}` on a newsletter-form profile is the
 * common case, not an edge case. So "" and null are normalised to "absent"
 * before validation; treating them as present would fail every guest
 * checkout-start call with a 400 that no amount of flow configuration could fix.
 */
const emptyToUndefined = (value: unknown): unknown =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

/**
 * NEITHER IDENTITY FIELD'S SHAPE MAY VETO THE CALL. A malformed `userId` is
 * tolerated (`resolveBonusCodeCustomer` treats a non-ObjectId as absent, because
 * that is what a half-rendered merge tag looks like), so a malformed `email`
 * must be tolerated identically — `.email()` here would 400 a call that
 * `userId` could have served perfectly well, and merge tags render partially in
 * the wild. A garbage address is safe to carry into the lookup: `z.string()`
 * guarantees a string, so there is no operator injection, and `User.email` is
 * unique + lowercase + trim at the schema level, so a non-address matches
 * nothing and falls out as `user_not_found` (logged) rather than as a 400.
 * The 400 is reserved for a body with NO identity field at all.
 */
const issueRequestSchema = z
  .object({
    userId: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    email: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    trigger: z.enum(TRIGGERS),
  })
  .refine((body) => Boolean(body.userId) || Boolean(body.email), {
    message: "one of userId or email is required",
    path: ["userId"],
  });

/**
 * The status map. The governing principle: **a non-2xx exists to make Klaviyo
 * retry.** Return 5xx only where a retry can actually recover the customer's
 * grant; return 2xx wherever a retry would change nothing, so a permanent
 * condition does not manufacture a retry storm.
 *
 *  - `minted` / `rearmed` — done.
 *  - `already_active` — the customer already holds a working code; a retry
 *    cannot improve it. (Mirrors the Stripe receiver answering 200 to a
 *    duplicate delivery.)
 *  - `spent` — permanent and correct: one grant per person for life.
 *  - `expired_no_rearm` — the re-arm cooldown refused a second window. A retry
 *    inside the cooldown refuses identically.
 *  - `not_applicable` — no active campaign carries the code, or the customer is
 *    not eligible for it. Not retryable (`CampaignService` logs the missing
 *    campaign, because under this model that is a launch-configuration error).
 *  - `error` — a genuine internal failure, a transient Mongo fault chief among
 *    them. This is the ONLY status whose retry recovers a grant that would
 *    otherwise be lost forever while the discount email is already in flight.
 *    Do not collapse it back into `not_applicable`.
 */
const STATUS_BY_OUTCOME: Record<StampedIssuanceResult["outcome"], number> = {
  minted: 200,
  rearmed: 200,
  already_active: 200,
  spent: 200,
  expired_no_rearm: 200,
  not_applicable: 200,
  error: 500,
};

/** Auth verdict reason → audit vocabulary. */
const OUTCOME_BY_AUTH_REASON = {
  misconfigured: "misconfigured",
  "missing-secret": "missing_secret",
  "bad-secret": "bad_secret",
} as const satisfies Record<string, BonusCodeCallOutcome>;

interface WebhookResponseBody {
  ok: boolean;
  /** 400 only. */
  error?: "invalid_body";
  /** 400 only — the caller's own value, echoed back for their delivery log. */
  trigger?: string | null;
}

/** Longest `trigger` value echoed back on a 400. Caller-controlled input. */
const MAX_ECHOED_TRIGGER_LENGTH = 64;

/** Pull the offending `trigger` out of an unvalidated body, for the 400 echo. */
function readTriggerForEcho(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>).trigger;
  if (typeof value !== "string") return null;
  return value.slice(0, MAX_ECHOED_TRIGGER_LENGTH);
}

/** The echoed value, when it is in fact one of the triggers we accept. */
function asKnownTrigger(value: string | null): BonusCodeTrigger | null {
  return value !== null && (TRIGGERS as readonly string[]).includes(value)
    ? (value as BonusCodeTrigger)
    : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = randomUUID().replace(/-/g, "");
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

  // Filled in as the call progresses so every audit row carries as much context
  // as was known at the point it was refused.
  let trigger: BonusCodeTrigger | null = null;
  let userId: string | null = null;

  /**
   * The single exit. Writes the audit row, then answers.
   *
   * AWAITED, not fire-and-forget: the daily mint budget counts audit rows, so a
   * row that never lands is a mint that never counted against the cap. The
   * writer never throws.
   */
  const finish = async (
    status: number,
    outcome: BonusCodeCallOutcome,
    body: WebhookResponseBody = { ok: status === 200 }
  ): Promise<NextResponse> => {
    await writeBonusCodeWebhookCall({
      requestId,
      outcome,
      status,
      trigger,
      userId,
      ip,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(body, { status });
  };

  try {
    await connectDB();

    // Read once — a request body cannot be consumed twice. Parsed further down,
    // after the call has earned the right to be parsed.
    const raw = await request.text();

    // 1. THE PRODUCTION ASSERTION. "Klaviyo only calls the production URL"
    //    constrains the intended caller, not the reachable surface: this route
    //    exists on every preview deployment and on every developer's localhost,
    //    and Vercel env vars are set for all environments by default — so a
    //    preview URL plus the secret would mint into the shared production
    //    database and burn a real customer's one-per-lifetime grant. Belt and
    //    braces with scoping the secret to the Production environment.
    //
    //    THE ONE DELIBERATE EXCEPTION — staging rehearsal. This path cannot be
    //    rehearsed anywhere else: the gate sits ahead of the MINT, not just the
    //    email, so without an opt-in the production smoke test is the first
    //    genuine execution the code ever gets. `BONUS_CODE_ALLOW_NON_PRODUCTION_MINT`
    //    opens it, and it is named to be alarming on purpose.
    //
    //    IT IS ONLY SAFE ON AN ENVIRONMENT WITH ITS OWN DATABASE. Set it on the
    //    staging project ONLY, never on a preview and never on production (where
    //    it is redundant anyway). Set on a deployment pointed at the production
    //    Mongo, it re-opens exactly the hole the gate exists to close: a mint
    //    burns a real customer's one-per-lifetime grant, and `redeemedEverAt`
    //    makes that permanent.
    //
    //    Fail-closed: absent, empty or anything other than "true" refuses.
    const allowNonProductionMint = process.env.BONUS_CODE_ALLOW_NON_PRODUCTION_MINT === "true";
    if (process.env.VERCEL_ENV !== "production" && !allowNonProductionMint) {
      console.error("[bonus-code] webhook refused outside production", {
        requestId,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      });
      return finish(403, "not_production");
    }
    if (allowNonProductionMint && process.env.VERCEL_ENV !== "production") {
      // Loud on every accepted non-production call. If this ever appears in a
      // production log, the flag is set where it must not be — treat it as an
      // incident, not a curiosity.
      console.error("[bonus-code] NON-PRODUCTION MINT ALLOWED by BONUS_CODE_ALLOW_NON_PRODUCTION_MINT", {
        requestId,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      });
    }

    // 2. THE SHARED SECRET. Fails closed when unset (500), never open.
    const auth = verifyBonusCodeWebhookSecret(request.headers.get(BONUS_CODE_SECRET_HEADER));
    if (!auth.ok) {
      if (auth.reason !== "misconfigured") {
        // `misconfigured` already logs its own line. Never log the presented
        // value, not even truncated.
        console.error("[bonus-code] webhook secret rejected", { requestId, reason: auth.reason });
      }
      return finish(auth.status, OUTCOME_BY_AUTH_REASON[auth.reason]);
    }

    // 3. THE DAILY MINT BUDGET. Fail-closed; a DB outage blocks minting rather
    //    than uncapping it, and answers 500 so the retry can recover the grant.
    const budget = await assertBonusCodeMintBudget();
    if (!budget.ok) {
      return finish(budget.status, budget.reason);
    }

    // 4. THE BODY.
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      console.error("[bonus-code] webhook body is not valid JSON", { requestId, bytes: raw.length });
      return finish(400, "invalid_body", { ok: false, error: "invalid_body", trigger: null });
    }

    const parsed = issueRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const offending = readTriggerForEcho(payload);
      // A body fails validation for reasons that often have nothing to do with
      // the trigger — no identity field at all is the common one. When the
      // trigger itself WAS one of ours, record it: this row is what someone
      // reads to find out which marketing flow broke, and a row with no trigger
      // cannot answer that question. An unknown value stays out of the row —
      // the model's enum would reject it and take the whole row down with it.
      trigger = asKnownTrigger(offending);
      console.error("[bonus-code] webhook body rejected", {
        requestId,
        trigger: offending,
        // Paths only — the values are customer data.
        fields: parsed.error.issues.map((issue) => issue.path.join(".")),
      });
      return finish(400, "invalid_body", { ok: false, error: "invalid_body", trigger: offending });
    }
    trigger = parsed.data.trigger;

    // 5. THE CUSTOMER.
    const resolution = await resolveBonusCodeCustomer({
      userId: parsed.data.userId,
      email: parsed.data.email,
    });
    if (!resolution.ok) {
      if (resolution.reason === "identity_conflict") {
        // A stale or merged Klaviyo profile. Both ids are opaque, so logging
        // them carries no PII and is what makes the row actionable.
        console.error("[bonus-code] userId and email resolve to different customers — refusing", {
          requestId,
          trigger,
          userIdMatch: resolution.userIdMatch,
          emailMatch: resolution.emailMatch,
        });
        // 200, NOT 409 — deliberately, and do not "restore" the 409. A distinct
        // status is a distinct answer, and a distinct answer is an oracle: post
        // your own account id alongside a probe address and 409-vs-200 reads
        // back whether that address belongs to a Tools Australia customer. The
        // conflict check runs before the `isActive` gate and settles after your
        // own first call, there is no rate limiter here by design, and the
        // daily budget counts only mints — so the sweep is free, non-destructive
        // and unbounded. That is exactly the enumeration the opaque body exists
        // to prevent, reinstated through the status line. The 409 bought nothing
        // operationally: Klaviyo does not retry it into a fix and nobody watches
        // the delivery log for it. What makes this condition NOTICED is the
        // `console.error` above and the `identity_conflict` audit row below —
        // both kept, both queryable, both rate-visible. Invisible to the caller,
        // just as loud to us.
        return finish(200, "identity_conflict");
      }
      // 200: retrying for three days cannot conjure an account. Logged anyway —
      // a RISING RATE of these is the earliest signal that a flow's merge tags
      // broke. Booleans, not the values: the email is customer data.
      console.error("[bonus-code] no customer resolved for webhook call", {
        requestId,
        trigger,
        hadUserId: Boolean(parsed.data.userId),
        hadEmail: Boolean(parsed.data.email),
      });
      return finish(200, "user_not_found");
    }
    userId = String(resolution.user._id);

    // 6. DELEGATE. All mint-and-email orchestration lives in the service.
    const result = await mintBonusCodeForTrigger(resolution.user, trigger);
    if (result.outcome === "error") {
      console.error("[bonus-code] mint failed — answering 500 so the flow retries", {
        requestId,
        trigger,
        userId,
      });
    }
    return finish(STATUS_BY_OUTCOME[result.outcome], result.outcome);
  } catch (error) {
    // Anything that escaped — `connectDB`, the body read, the customer lookup.
    // 500 so Klaviyo retries: the discount email is already in flight and this
    // is the only status whose retry can still recover the grant.
    console.error("[bonus-code] webhook handler threw", { requestId, trigger, userId, error });
    return finish(500, "error");
  }
}
