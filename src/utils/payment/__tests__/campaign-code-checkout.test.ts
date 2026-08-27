/**
 * `attachCampaignCodeToCheckout` — the pre-confirm write that puts the
 * customer's applied bonus code onto the Stripe object about to be charged.
 *
 * WHY EACH CASE EARNS ITS PLACE.
 *
 * 1. METADATA PRESERVATION is the CATASTROPHIC-failure guard, and it is first
 *    for that reason. `subscriptions.update` / `paymentIntents.update` take a
 *    metadata MAP, so a payload that forgets to spread the existing keys does
 *    not "lose a field" — it destroys the `packageId` the webhook looks the
 *    package up by, the CAPI match keys, the A/B assignment and the whole
 *    attribution chain, ON AN OBJECT THE CUSTOMER IS ABOUT TO BE CHARGED ON.
 *    That is a strictly worse outcome than the bug being fixed, and `tsc`
 *    cannot see it.
 *
 * 2/3. CLEARING. The write is DESIRED-STATE, not append-only, because
 *    "apply A -> card declines -> remove A -> retry" must be able to take A back
 *    off a still-unpaid object. Clearing is expressed as `campaignCode: ""` —
 *    every downstream read is a truthiness check, so "" and "key absent" are
 *    equally correct, and "" is the only one an update CAN express.
 *
 * 4. THE STATE GUARD is load-bearing and time-sensitive. It must accept the two
 *    unpaid shapes and refuse everything else WITHOUT calling update:
 *      - `incomplete`            — the plain default_incomplete subscription.
 *      - `trialing` + OPEN invoice — the anchor-day (AEST 25/26/27) shape, where
 *        `trial_end` means Stripe will not hold the subscription at `incomplete`
 *        and the up-front charge rides an `add_invoice_items` line instead.
 *        Refusing this would make the whole fix a silent no-op on three days of
 *        every month — including the day it shipped.
 *      - `trialing` + PAID invoice — an ALREADY-CHARGED anchored member. Refused.
 *        This pair is what proves the widening did not weaken the invariant.
 *
 * 5. AUTHORIZATION. The route is unauthenticated by design (guest checkout), so
 *    possession of a SERVER-WRITTEN token is the entire access control. The
 *    dangerous direction is not writing a code onto a stranger's checkout — it
 *    is CLEARING one, so they pay and receive nothing. Identity must also come
 *    from the object's own metadata, never from the caller, or the re-validation
 *    is theatre.
 *
 * 5b. IDENTITY RESOLUTION is the path that actually shipped broken. A guest pack
 *    PaymentIntent created without a `userEmail` carries the literal placeholders
 *    `userId: "guest"`, `userEmail: "guest"`; the resolver then finds no account,
 *    refuses, and the attach CLEARS the customer's code. The placeholder branch
 *    and the `userEmail -> User.findOne` fallback had no coverage at all, which
 *    is why that shipped — so they are pinned here.
 *
 * 6. A Stripe failure must be a typed result, never a throw: the caller charges
 *    the customer either way, and an exception escaping here would take the sale
 *    down with it.
 *
 * NOTHING LEAVES THIS PROCESS. `@/lib/stripe` is replaced in `require.cache` and
 * verified by object identity before a single case runs, so no Stripe object can
 * be created or mutated. The campaign-code service and the `User` model are
 * stubbed too, so there is no database traffic and no fixture to clean up.
 *
 * Run via: `npm run test:campaign-code-checkout`
 */
import path from "node:path";
import type Stripe from "stripe";
import type { AttachCampaignCodeResult, CheckoutCampaignTarget } from "../campaign-code-checkout";

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

// ---------------------------------------------------------------------------
// Recorders + controllable stubs
// ---------------------------------------------------------------------------

interface UpdateCall {
  kind: "subscription" | "payment_intent";
  id: string;
  metadata: Record<string, unknown>;
}

const updateCalls: UpdateCall[] = [];
const resolverCalls: Array<{ code?: string | null; userId?: string | null; context?: string }> = [];
/** What `recordCheckoutIntent` was asked to write, in call order. */
const intentCalls: Array<{ userId?: string | null; campaignCode?: string | null; targetId: string }> = [];
/**
 * A single ordered log of "intent recorded" vs "Stripe updated".
 *
 * ORDER IS THE WHOLE POINT of the intent record. It exists because the browser
 * gives up on this request mid-flight, and the Stripe update is the slow half it
 * gives up during. A record written AFTER the Stripe write would be missing in
 * exactly the case it was added for, and nothing about the returned result would
 * reveal that — hence an explicit ordering assertion rather than a call count.
 */
const orderLog: Array<"intent" | "stripe"> = [];

/** What the stubbed Stripe retrieve answers next. */
let nextSubscription: Partial<Stripe.Subscription> | null = null;
let nextPaymentIntent: Partial<Stripe.PaymentIntent> | null = null;
/** When set, both retrieves throw it. */
let retrieveError: Error | null = null;
/** When set, both updates throw it. */
let updateError: Error | null = null;
/** What the stubbed resolver answers next. `undefined` = refused. */
let resolverAnswer: string | undefined;
/** What the stubbed `User.findOne(...).lean()` answers next. */
let userLookupAnswer: { _id: string } | null = null;

const stubStripe = {
  subscriptions: {
    async retrieve() {
      if (retrieveError) throw retrieveError;
      return nextSubscription as Stripe.Subscription;
    },
    async update(id: string, params: { metadata?: Record<string, unknown> }) {
      if (updateError) throw updateError;
      orderLog.push("stripe");
      updateCalls.push({ kind: "subscription", id, metadata: params.metadata ?? {} });
      return nextSubscription as Stripe.Subscription;
    },
  },
  paymentIntents: {
    async retrieve() {
      if (retrieveError) throw retrieveError;
      return nextPaymentIntent as Stripe.PaymentIntent;
    },
    async update(id: string, params: { metadata?: Record<string, unknown> }) {
      if (updateError) throw updateError;
      orderLog.push("stripe");
      updateCalls.push({ kind: "payment_intent", id, metadata: params.metadata ?? {} });
      return nextPaymentIntent as Stripe.PaymentIntent;
    },
  },
};

const stubCampaignCodeService = {
  CampaignCodeValidationService: {
    async resolveCodeForCheckout(args: { code?: string | null; userId?: string | null; context: string }) {
      resolverCalls.push({ code: args.code, userId: args.userId, context: args.context });
      // Mirrors the REAL service's own first two guards
      // (`CampaignCodeValidationService.resolveCodeForCheckout`): an absent code,
      // and an unresolved account, are each a refusal before any lookup. A stub
      // more permissive than the thing it stands in for would let a broken clear
      // path — or the "guest" identity hole (section 7) — pass.
      if (!args.code?.trim()) return undefined;
      if (!args.userId) return undefined;
      return resolverAnswer;
    },
    /**
     * The server's own record that this customer applied this code to THIS
     * checkout — the half that survives the browser hanging up on the request.
     *
     * Stubbed as a recorder because the real one is a Mongo write and this suite
     * is deliberately database-free. Its own behaviour (clear-on-removal, window
     * expiry, spent grants) is pinned by `npm run test:checkout-intent-recovery`;
     * what THIS suite owns is that the attach calls it, with the resolver's
     * canonical answer, before it touches Stripe.
     */
    async recordCheckoutIntent(args: { userId?: string | null; campaignCode?: string | null; targetId: string }) {
      orderLog.push("intent");
      intentCalls.push({ userId: args.userId, campaignCode: args.campaignCode, targetId: args.targetId });
    },
  },
};

/** Mirrors `User.findOne(...).select("_id").lean()` — the only DB call in the module. */
const stubUserModel = {
  __esModule: true,
  default: {
    findOne() {
      return {
        select() {
          return {
            async lean() {
              return userLookupAnswer;
            },
          };
        },
      };
    },
  },
};

function stub(relativeTsPath: string, exports: Record<string, unknown>) {
  const resolved = require.resolve(path.resolve(process.cwd(), relativeTsPath));
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    children: [],
    paths: [],
    parent: undefined,
    exports,
  } as unknown as NodeModule;
}

stub("src/lib/stripe.ts", { stripe: stubStripe });
stub("src/services/redeemables/CampaignCodeValidationService.ts", stubCampaignCodeService);
stub("src/models/User.ts", stubUserModel);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUBSCRIPTION_ID = "sub_campaign_attach_fixture";
const PAYMENT_INTENT_ID = "pi_campaign_attach_fixture";
const REQUEST_ID = "5f6ad1de-0000-4000-8000-000000000001";
const CLIENT_SECRET = `${PAYMENT_INTENT_ID}_secret_abc123`;
const OWNER_USER_ID = "6543210987654321098765cd";
/** A DIFFERENT id, supplied the way a caller's session would be. Must never win. */
const SESSION_USER_ID = "1111111111111111111111aa";
/**
 * The caller's raw string and the resolver's canonical answer are DELIBERATELY
 * DIFFERENT. When both were "LOCKIN100", every "wrote the RESOLVER's code"
 * assertion passed just as happily against an implementation that echoed the
 * caller's input — the one thing those assertions exist to rule out.
 */
const APPLIED_CODE = "  lockin100 ";
const SERVER_VERIFIED_CODE = "LOCKIN100";

/**
 * Every non-campaignCode key a real checkout object carries. If any one of these
 * goes missing from an update payload, a paying customer loses their package
 * lookup, their ad attribution or their experiment assignment.
 */
const SIBLING_METADATA: Record<string, string> = {
  packageId: "tradie-subscription",
  packageName: "Tradie",
  userId: OWNER_USER_ID,
  userEmail: "attach-fixture@example.test",
  subscriptionRequestId: REQUEST_ID,
  entriesCount: "15",
  capi_client_ip: "203.0.113.7",
  capi_user_agent: "Mozilla/5.0 (fixture)",
  experimentId: "exp_fixture",
  variantId: "var_fixture",
  promoLinkCode: "PROMOFIXTURE",
  affiliateCode: "AFFFIXTURE",
};

function subscriptionFixture(overrides: {
  status: Stripe.Subscription.Status;
  invoiceStatus?: Stripe.Invoice.Status | null;
  metadata?: Record<string, string>;
}): Partial<Stripe.Subscription> {
  return {
    id: SUBSCRIPTION_ID,
    status: overrides.status,
    metadata: (overrides.metadata ?? SIBLING_METADATA) as Stripe.Metadata,
    latest_invoice:
      overrides.invoiceStatus === null
        ? null
        : ({ id: "in_fixture", status: overrides.invoiceStatus ?? "open" } as Stripe.Invoice),
  };
}

function paymentIntentFixture(overrides: {
  status: Stripe.PaymentIntent.Status;
  clientSecret?: string;
  metadata?: Record<string, string>;
}): Partial<Stripe.PaymentIntent> {
  const { subscriptionRequestId: _unused, ...piMetadata } = SIBLING_METADATA;
  return {
    id: PAYMENT_INTENT_ID,
    status: overrides.status,
    client_secret: overrides.clientSecret ?? CLIENT_SECRET,
    metadata: (overrides.metadata ?? piMetadata) as Stripe.Metadata,
  };
}

const SUBSCRIPTION_TARGET: CheckoutCampaignTarget = {
  kind: "subscription",
  subscriptionId: SUBSCRIPTION_ID,
  subscriptionRequestId: REQUEST_ID,
};
const PAYMENT_INTENT_TARGET: CheckoutCampaignTarget = {
  kind: "payment_intent",
  paymentIntentId: PAYMENT_INTENT_ID,
  clientSecret: CLIENT_SECRET,
};

function reset() {
  updateCalls.length = 0;
  resolverCalls.length = 0;
  intentCalls.length = 0;
  orderLog.length = 0;
  retrieveError = null;
  updateError = null;
  resolverAnswer = SERVER_VERIFIED_CODE;
  userLookupAnswer = null;
  nextSubscription = subscriptionFixture({ status: "incomplete" });
  nextPaymentIntent = paymentIntentFixture({ status: "requires_payment_method" });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

type AttachFn = (params: {
  target: CheckoutCampaignTarget;
  code: string | null;
  sessionUserId?: string;
}) => Promise<AttachCampaignCodeResult>;

/** Refusals log loudly by design; silenced per call so a FAIL is never buried. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const realConsoleError = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = realConsoleError;
  }
}

async function run() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const loadedStripe = require("@/lib/stripe") as typeof import("@/lib/stripe");
  /* eslint-enable @typescript-eslint/no-require-imports */

  // HARD SAFETY GATE — prove by object identity that no real Stripe client is
  // reachable before any case runs.
  if ((loadedStripe.stripe as unknown) !== stubStripe) {
    throw new Error("REFUSING TO RUN: the @/lib/stripe stub did not take — a real Stripe call is possible.");
  }
  console.log("Stripe is stubbed (verified by identity) — no outbound call is possible.\n");

  /* eslint-disable @typescript-eslint/no-require-imports */
  const attach = (require("../campaign-code-checkout") as { attachCampaignCodeToCheckout: AttachFn })
    .attachCampaignCodeToCheckout;
  /* eslint-enable @typescript-eslint/no-require-imports */

  // ---- 1. METADATA PRESERVATION ------------------------------------------
  console.log("\n1. metadata preservation (the catastrophic-failure guard)");
  reset();
  let result = await attach({ target: SUBSCRIPTION_TARGET, code: APPLIED_CODE });
  check("  subscription: attach succeeded", result, { ok: true, campaignCode: SERVER_VERIFIED_CODE });
  check("  subscription: exactly one update call", updateCalls.length, 1);
  for (const [key, value] of Object.entries(SIBLING_METADATA)) {
    check(`  subscription: preserved metadata.${key}`, updateCalls[0]?.metadata[key], value);
  }
  check("  subscription: wrote the RESOLVER's code", updateCalls[0]?.metadata.campaignCode, SERVER_VERIFIED_CODE);
  check(
    "  subscription: …and NOT the caller's raw string",
    JSON.stringify(updateCalls[0]?.metadata).includes(APPLIED_CODE),
    false
  );

  reset();
  result = await attach({ target: PAYMENT_INTENT_TARGET, code: APPLIED_CODE });
  check("  payment_intent: attach succeeded", result, { ok: true, campaignCode: SERVER_VERIFIED_CODE });
  check("  payment_intent: exactly one update call", updateCalls.length, 1);
  check("  payment_intent: preserved metadata.packageId", updateCalls[0]?.metadata.packageId, SIBLING_METADATA.packageId);
  check("  payment_intent: preserved metadata.capi_client_ip", updateCalls[0]?.metadata.capi_client_ip, SIBLING_METADATA.capi_client_ip);
  check("  payment_intent: preserved metadata.experimentId", updateCalls[0]?.metadata.experimentId, SIBLING_METADATA.experimentId);
  check("  payment_intent: wrote the RESOLVER's code", updateCalls[0]?.metadata.campaignCode, SERVER_VERIFIED_CODE);
  check(
    "  payment_intent: …and NOT the caller's raw string",
    JSON.stringify(updateCalls[0]?.metadata).includes(APPLIED_CODE),
    false
  );

  // ---- 2. CLEAR -----------------------------------------------------------
  console.log("\n2. code: null CLEARS the stamp without touching siblings");
  reset();
  result = await attach({ target: SUBSCRIPTION_TARGET, code: null });
  check("  result reports no code", result, { ok: true, campaignCode: null });
  check("  campaignCode written as empty string", updateCalls[0]?.metadata.campaignCode, "");
  check("  sibling metadata.packageId survives the clear", updateCalls[0]?.metadata.packageId, SIBLING_METADATA.packageId);
  check("  sibling metadata.promoLinkCode survives the clear", updateCalls[0]?.metadata.promoLinkCode, SIBLING_METADATA.promoLinkCode);

  // ---- 3. REFUSAL CLEARS, DOES NOT THROW ----------------------------------
  console.log("\n3. resolver refuses a code the customer does not hold");
  reset();
  resolverAnswer = undefined;
  result = await quietly(() => attach({ target: SUBSCRIPTION_TARGET, code: "NOTMINE100" }));
  check("  still ok (the purchase is never blocked)", result, { ok: true, campaignCode: null });
  check("  refused code is NOT in the metadata", updateCalls[0]?.metadata.campaignCode, "");
  check("  the caller's raw value appears nowhere", JSON.stringify(updateCalls[0]?.metadata).includes("NOTMINE100"), false);
  check("  the resolver was asked with the caller's raw value", resolverCalls[0]?.code, "NOTMINE100");

  // ---- 4. STATE GUARD -----------------------------------------------------
  console.log("\n4. state guard — only an UNPAID checkout may be stamped");
  reset();
  nextSubscription = subscriptionFixture({ status: "active", invoiceStatus: "paid" });
  result = await quietly(() => attach({ target: SUBSCRIPTION_TARGET, code: APPLIED_CODE }));
  check("  active subscription refused", result, { ok: false, reason: "wrong_state" });
  check("  …and update was never called", updateCalls.length, 0);

  reset();
  nextPaymentIntent = paymentIntentFixture({ status: "succeeded" });
  result = await quietly(() => attach({ target: PAYMENT_INTENT_TARGET, code: APPLIED_CODE }));
  check("  succeeded PaymentIntent refused", result, { ok: false, reason: "wrong_state" });
  check("  …and update was never called", updateCalls.length, 0);

  // The anchor-day shape (AEST 25/26/27). Refusing this would make the fix a
  // silent no-op on three days of every month.
  reset();
  nextSubscription = subscriptionFixture({ status: "trialing", invoiceStatus: "open" });
  result = await attach({ target: SUBSCRIPTION_TARGET, code: APPLIED_CODE });
  check("  anchor-day trialing + OPEN invoice is ACCEPTED", result, { ok: true, campaignCode: SERVER_VERIFIED_CODE });
  check("  …and it wrote the code", updateCalls[0]?.metadata.campaignCode, SERVER_VERIFIED_CODE);

  // The half that proves accepting `trialing` did not weaken the invariant.
  reset();
  nextSubscription = subscriptionFixture({ status: "trialing", invoiceStatus: "paid" });
  result = await quietly(() => attach({ target: SUBSCRIPTION_TARGET, code: APPLIED_CODE }));
  check("  ALREADY-PAID trialing subscription refused", result, { ok: false, reason: "wrong_state" });
  check("  …and update was never called", updateCalls.length, 0);

  reset();
  nextSubscription = subscriptionFixture({ status: "trialing", invoiceStatus: null });
  result = await quietly(() => attach({ target: SUBSCRIPTION_TARGET, code: APPLIED_CODE }));
  check("  trialing with NO invoice refused (nothing to be charged for)", result, { ok: false, reason: "wrong_state" });

  // ---- 5. AUTHORIZATION ---------------------------------------------------
  console.log("\n5. authorization — possession proof, and identity from metadata only");
  reset();
  result = await quietly(() =>
    attach({
      target: { kind: "subscription", subscriptionId: SUBSCRIPTION_ID, subscriptionRequestId: "not-the-right-request-id" },
      code: APPLIED_CODE,
    })
  );
  check("  wrong subscriptionRequestId refused", result, { ok: false, reason: "not_authorized" });
  check("  …and update was never called", updateCalls.length, 0);

  reset();
  result = await quietly(() =>
    attach({
      target: { kind: "payment_intent", paymentIntentId: PAYMENT_INTENT_ID, clientSecret: `${PAYMENT_INTENT_ID}_secret_wrong` },
      code: APPLIED_CODE,
    })
  );
  check("  wrong clientSecret refused", result, { ok: false, reason: "not_authorized" });
  check("  …and update was never called", updateCalls.length, 0);

  // A subscription the server never stamped with a request id cannot be claimed
  // by sending an empty one.
  reset();
  const { subscriptionRequestId: _dropped, ...noRequestId } = SIBLING_METADATA;
  nextSubscription = subscriptionFixture({ status: "incomplete", metadata: noRequestId });
  result = await quietly(() => attach({ target: SUBSCRIPTION_TARGET, code: APPLIED_CODE }));
  check("  object with NO subscriptionRequestId cannot be claimed", result, { ok: false, reason: "not_authorized" });

  // Identity is the object's, not the caller's.
  reset();
  await attach({ target: SUBSCRIPTION_TARGET, code: APPLIED_CODE, sessionUserId: SESSION_USER_ID });
  check("  resolver got the OBJECT's userId", resolverCalls[0]?.userId, OWNER_USER_ID);
  check("  …not the caller-supplied session id", resolverCalls[0]?.userId === SESSION_USER_ID, false);

  // ---- 5b. IDENTITY RESOLUTION -------------------------------------------
  // The path that actually shipped broken, and had NO coverage: a guest pack
  // checkout whose PaymentIntent was created without a `userEmail`, so the route
  // stamped the literal placeholders `userId: "guest"`, `userEmail: "guest"`.
  // `resolveOwnerUserId` then answers `undefined`, the resolver refuses, and the
  // attach CLEARS the customer's code. `guest`/`new` and the email fallback are
  // the whole of that logic; if they are not tested, F-1 can ship again.
  console.log("\n5b. identity comes from the object's metadata — placeholders and the email fallback");

  reset();
  nextPaymentIntent = paymentIntentFixture({
    status: "requires_payment_method",
    metadata: { packageId: "apprentice-pack", userId: "new", userEmail: "registered-guest@example.test" },
  });
  userLookupAnswer = { _id: OWNER_USER_ID };
  result = await attach({ target: PAYMENT_INTENT_TARGET, code: APPLIED_CODE });
  check("  userId 'new' falls through to the email lookup", resolverCalls[0]?.userId, OWNER_USER_ID);
  check("  …and the code is written", result, { ok: true, campaignCode: SERVER_VERIFIED_CODE });
  check("  …with the RESOLVER's value", updateCalls[0]?.metadata.campaignCode, SERVER_VERIFIED_CODE);

  // The exact production shape: `pi_...` with BOTH fields placeholdered.
  reset();
  nextPaymentIntent = paymentIntentFixture({
    status: "requires_payment_method",
    metadata: { packageId: "apprentice-pack", userId: "guest", userEmail: "guest" },
  });
  userLookupAnswer = { _id: OWNER_USER_ID }; // must NOT be consulted for "guest"
  result = await quietly(() => attach({ target: PAYMENT_INTENT_TARGET, code: APPLIED_CODE }));
  check("  placeholder identity resolves to NO user", resolverCalls[0]?.userId, undefined);
  check("  …the attach still succeeds (never blocks the sale)", result, { ok: true, campaignCode: null });
  check("  …and it CLEARS rather than writing an unredeemable code", updateCalls[0]?.metadata.campaignCode, "");

  // A session is the last resort, and only when metadata resolves nothing.
  reset();
  nextPaymentIntent = paymentIntentFixture({
    status: "requires_payment_method",
    metadata: { packageId: "apprentice-pack", userId: "guest", userEmail: "guest" },
  });
  await attach({ target: PAYMENT_INTENT_TARGET, code: APPLIED_CODE, sessionUserId: SESSION_USER_ID });
  check("  session id is used only when metadata yields nothing", resolverCalls[0]?.userId, SESSION_USER_ID);

  // ---- 6. STRIPE ERROR ----------------------------------------------------
  console.log("\n6. Stripe failures are typed results, never throws");
  reset();
  updateError = new Error("stripe is down");
  result = await quietly(() => attach({ target: SUBSCRIPTION_TARGET, code: APPLIED_CODE }));
  check("  update failure returns stripe_error", result, { ok: false, reason: "stripe_error" });

  reset();
  retrieveError = Object.assign(new Error("No such subscription"), { code: "resource_missing" });
  result = await quietly(() => attach({ target: SUBSCRIPTION_TARGET, code: APPLIED_CODE }));
  check("  a missing object returns not_found", result, { ok: false, reason: "not_found" });

  // ---- 7. CHECKOUT INTENT -------------------------------------------------
  // The recovery half of B2. The browser caps this request at 15s and charges
  // regardless of how it ends — observed live at `200 in 14903ms`, i.e. the
  // server answered, the browser had already stopped listening, the card was
  // charged and the webhook saw no code. The Stripe stamp cannot be the only
  // record when the write it lives in is the thing that gets abandoned, so the
  // server writes its own, BEFORE the slow half.
  console.log("\n7. the checkout intent is recorded server-side, before Stripe is touched");
  reset();
  result = await attach({ target: SUBSCRIPTION_TARGET, code: APPLIED_CODE });
  check("  subscription: attach still succeeded", result, { ok: true, campaignCode: SERVER_VERIFIED_CODE });
  check("  exactly one intent recorded", intentCalls.length, 1);
  check("  recorded the RESOLVER's canonical code, not the caller's raw string", intentCalls[0]?.campaignCode, SERVER_VERIFIED_CODE);
  check("  …against the identity resolved from the object's own metadata", intentCalls[0]?.userId, OWNER_USER_ID);
  check("  …naming the Stripe object being charged", intentCalls[0]?.targetId, SUBSCRIPTION_ID);
  check("  INTENT IS WRITTEN BEFORE THE STRIPE UPDATE", orderLog, ["intent", "stripe"]);

  reset();
  result = await attach({ target: PAYMENT_INTENT_TARGET, code: APPLIED_CODE });
  check("  payment_intent: same ordering", orderLog, ["intent", "stripe"]);
  check("  payment_intent: names the PaymentIntent", intentCalls[0]?.targetId, PAYMENT_INTENT_ID);

  // A REMOVAL must clear the record too, or "apply → remove → pay" would recover
  // into a code the customer deliberately took off.
  reset();
  result = await attach({ target: SUBSCRIPTION_TARGET, code: null });
  check("  clearing the code clears the intent", intentCalls[0]?.campaignCode, null);
  check("  …before Stripe, same as the write", orderLog, ["intent", "stripe"]);

  // A code the server REFUSES must not leave a recoverable intent behind — the
  // recovery would otherwise resurrect exactly what validation just rejected.
  reset();
  resolverAnswer = undefined;
  result = await quietly(() => attach({ target: SUBSCRIPTION_TARGET, code: APPLIED_CODE }));
  check("  a refused code records a CLEAR, never the code", intentCalls[0]?.campaignCode, null);
  check("  …and the stamp is cleared too", updateCalls[0]?.metadata.campaignCode, "");

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed");
}

run().catch((error) => {
  console.error("campaign-code-checkout.test.ts crashed:", error);
  process.exit(1);
});
