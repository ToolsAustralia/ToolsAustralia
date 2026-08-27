/**
 * Every Stripe checkout route writes the SERVER-VERIFIED campaign code into
 * Stripe metadata — never the code the caller put in the request body.
 *
 * WHY THIS IS A SECURITY INVARIANT, not a tidiness one. The code that lands in
 * Stripe metadata is what the webhook later redeems: it grants prize-draw
 * entries and marks a customer's one-per-lifetime bonus-code grant as spent.
 * `/api/codes/validate` answers a GUEST from the campaign window alone — it has
 * no session to key a per-user lookup on — so a code that "looks valid" to the
 * browser is not proof the caller holds it. `resolveCodeForCheckout` is the
 * authoritative check, and it runs here because the route resolved the user id
 * server-side. A route that forwards `validatedData.campaignCode` instead ships
 * a customer-supplied, unvalidated code into metadata that is redeemed later.
 *
 * WHY IT IS DRIVEN RATHER THAN GREPPED. This replaces a guard in
 * `campaign-window.test.ts` that read each route as TEXT and asserted
 * `src.includes("resolveCodeForCheckout(") === true` and
 * `src.includes("campaignCode: validatedData.campaignCode") === false`. Nothing
 * executed, so the positive leg passed if the call sat in a dead branch or a
 * comment, and the negative leg was defeated by any rewrite of the same bug —
 * `const { campaignCode } = validatedData`, `validatedData?.campaignCode`,
 * `body.campaignCode` — each of which reintroduces it verbatim. Here the real
 * handlers run and STRIPE ITSELF is the recorder, so what is asserted is the
 * argument Stripe would actually have received. All four routes are driven,
 * because a fix applied to one of them is not a fix.
 *
 * PINNED IN BOTH DIRECTIONS, which is the half a grep cannot reach at all:
 *   1. Resolver REFUSES (returns undefined) while the body carries a code →
 *      `campaignCode` must be ABSENT from the metadata. Catches every "forward
 *      the body field" rewrite.
 *   2. Resolver ACCEPTS and returns a canonicalised value DIFFERENT from the
 *      body's → the metadata must carry the RESOLVER'S value. Catches a route
 *      that calls the resolver, ignores the answer, and forwards the body
 *      anyway — which the old negative grep would have passed.
 *
 * NOTHING LEAVES THIS PROCESS AND NOTHING IS WRITTEN. `@/lib/stripe` is replaced
 * in `require.cache` and VERIFIED by object identity before a single case runs,
 * so no Stripe object is ever created. The `User` model, the campaign-code
 * service, the A/B repositories and every error-report writer are stubbed too,
 * so the only database traffic is the one read `create-one-time-purchase-existing-user`
 * makes through a DYNAMIC import (which under tsx bypasses `require.cache` and
 * therefore cannot be stubbed). No document is created, updated or deleted by
 * this file, so there are no fixtures to clean up.
 *
 * §1 — WHAT GETS STAMPED. Both Stripe create calls RECORD AND THEN THROW a
 * sentinel. Everything after the metadata write — the subscription/PaymentIntent
 * post-processing, the user writes, the background jobs — is out of scope there
 * and would need a far larger stub surface to satisfy. The routes' own catch
 * blocks turn the sentinel into an error response, so the response is not
 * asserted in §1; the recorded metadata is. Expect loud error logging from the
 * routes: that is the sentinel.
 *
 * §2 — WHAT GETS REPORTED BACK (added 2026-08-28). Stopping at the Stripe
 * boundary means the RESPONSE never forms, and `data.appliedCodes` is built
 * after that boundary — so §1 could not see the field at all. That field is the
 * only thing licensing a "code applied" line on `SpecialPackagesModal`'s
 * receipt (it delivers the code in the create body and has no attach call to
 * veto a stale label), and a mutation that reported the request body instead of
 * the resolver's answer restored the original bug verbatim with every suite
 * still green. §2 therefore runs the ONE reporting route in RETURN-MODE — the
 * same identity-checked Stripe stub hands back a fixture PaymentIntent instead
 * of throwing — and asserts the JSON a browser would actually receive, then
 * feeds it through the real `settleAppliedCodeLabel` + `appliedCodeReceiptLine`
 * so the assertion is the customer-visible SENTENCE.
 *
 * WHAT THIS FILE STILL CANNOT PROVE: that the modal component passes that field
 * rather than an object it built itself. There is no DOM runner in this repo,
 * and a source-text grep is the exact pattern this file was written to replace.
 * The e2e legs in e2e/specs/membership/bonus-code-journey.spec.ts are the proof
 * of that half.
 *
 * Run via: `npm run test:campaign-code-metadata`
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  appliedCodeReceiptLine,
  settleAppliedCodeLabel,
  type AppliedCheckoutCodes,
} from "@/utils/payment/typed-code-at-checkout";

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
// Recorders
// ---------------------------------------------------------------------------

/** The metadata each route handed to Stripe, in call order. */
const recordedMetadata: Array<Record<string, unknown>> = [];
/** Every `resolveCodeForCheckout` call, so "did the route even ask?" is provable. */
const resolverCalls: Array<{ code?: string; userId?: string; context?: string }> = [];

/** What the stubbed resolver answers next. `undefined` = refused. */
let resolverAnswer: string | undefined;

/** Thrown after recording, to stop each route at the Stripe boundary. */
const STRIPE_SENTINEL = "campaign-code-metadata-test: recorded, stopping here";

/**
 * THROW-MODE vs RETURN-MODE, and why the second one had to exist.
 *
 * Every case in §1 stops at the Stripe boundary, so the response never forms —
 * which was fine while metadata was the only thing being asserted. It is not
 * fine for `data.appliedCodes`: that field is built AFTER the Stripe call, so a
 * suite that always throws can never see it, and a route that stopped reporting
 * it (or reported the request body instead of the resolver's answer) would leave
 * every assertion in this file green. That is the whole complaint §2 answers.
 *
 * RETURN-MODE lets ONE route run to completion — the only one that reports —
 * with a fixture PaymentIntent standing in for Stripe. Still no outbound call:
 * the same identity-checked stub serves both modes.
 */
let stripeMode: "throw" | "return" = "throw";

/** A succeeded PaymentIntent, so the route takes its normal success path. */
const fixturePaymentIntent = {
  id: "pi_campaign_code_fixture",
  status: "succeeded",
  client_secret: "pi_campaign_code_fixture_secret_stub",
  last_payment_error: null,
} as unknown as Stripe.PaymentIntent;

function recordAndStop(metadata: unknown): never {
  recordedMetadata.push((metadata ?? {}) as Record<string, unknown>);
  throw new Error(STRIPE_SENTINEL);
}

// ---------------------------------------------------------------------------
// Stubs — installed in require.cache BEFORE any route is loaded
// ---------------------------------------------------------------------------

const FIXTURE_CUSTOMER_ID = "cus_campaign_code_fixture";
const FIXTURE_PAYMENT_METHOD_ID = "pm_campaign_code_fixture";

const fixtureCustomer = {
  id: FIXTURE_CUSTOMER_ID,
  deleted: false,
  email: "campaign-code-fixture@example.test",
  metadata: {},
} as unknown as Stripe.Customer;

const stubStripe = {
  customers: {
    async create() {
      return fixtureCustomer;
    },
    async retrieve() {
      return fixtureCustomer;
    },
    async update() {
      return fixtureCustomer;
    },
  },
  paymentMethods: {
    async retrieve() {
      return { id: FIXTURE_PAYMENT_METHOD_ID, customer: FIXTURE_CUSTOMER_ID };
    },
    async attach() {
      return { id: FIXTURE_PAYMENT_METHOD_ID, customer: FIXTURE_CUSTOMER_ID };
    },
  },
  subscriptions: {
    async create(payload: { metadata?: unknown }): Promise<never> {
      return recordAndStop(payload?.metadata);
    },
  },
  paymentIntents: {
    async create(config: { metadata?: unknown }): Promise<Stripe.PaymentIntent> {
      if (stripeMode === "throw") return recordAndStop(config?.metadata);
      recordedMetadata.push((config?.metadata ?? {}) as Record<string, unknown>);
      return fixturePaymentIntent;
    },
  },
};

/**
 * The service under scrutiny — stubbed so the test controls its ANSWER, which
 * is the whole point: the routes must carry the answer, not the request body.
 */
const stubCampaignCodeService = {
  CampaignCodeValidationService: {
    async resolveCodeForCheckout(args: { code?: string; userId?: string; context?: string }) {
      resolverCalls.push({ code: args.code, userId: args.userId, context: args.context });
      return resolverAnswer;
    },
  },
};

/** A member with no subscription, so `checkCanCreateSubscription` allows. */
const FIXTURE_USER_ID = "6543210987654321098765cd";
const fixtureUser = {
  _id: { toString: () => FIXTURE_USER_ID },
  email: "campaign-code-fixture@example.test",
  firstName: "Campaign",
  lastName: "Fixture",
  mobile: undefined,
  stripeCustomerId: FIXTURE_CUSTOMER_ID,
  savedPaymentMethods: [],
  affiliateReferral: undefined,
  subscription: undefined,
  stripeSubscriptionId: undefined,
  markModified() {
    /* mongoose no-op */
  },
  async save() {
    return fixtureUser;
  },
};

const stubUserModel = {
  __esModule: true,
  default: {
    /** The two GUEST routes look a customer up by email; they must find none. */
    async findOne() {
      return null;
    },
    async findById() {
      return fixtureUser;
    },
    async findByIdAndUpdate() {
      return fixtureUser;
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
stub("src/lib/auth.ts", { authOptions: {} });

// The gates and side effects that are not what this file is about. Each one is
// a different feature with its own suite; leaving them real would make this
// test depend on live draw state, live experiment rows and the error-report
// collection.
stub("src/utils/draws/major-draw-gate-http.ts", {
  enforceMajorDrawOpenForNewPurchasesOr403: async () => null,
});
stub("src/services/subscription/index.ts", {
  shouldWriteCanonicalStripeSubscriptionId: () => false,
  stripeCustomerHasManageableSubscription: async () => false,
  cancelIncompleteSubscriptionAndVoidInvoice: async () => null,
});
stub("src/utils/payment/stripe/customer-utils.ts", {
  ensureCustomerExists: async () => fixtureCustomer,
  updateCustomerPaymentMethod: async () => undefined,
});
stub("src/utils/payment/stripe/payment-method-utils.ts", {
  attachPaymentMethodToCustomer: async () => undefined,
});
stub("src/utils/ab-testing/subscription-assignment.ts", {
  getExperimentAssignmentForSubscription: async () => null,
});
stub("src/services/ab-testing/AnonymousIdService.ts", {
  __esModule: true,
  default: { extractAnonymousId: () => null },
});
stub("src/services/ab-testing/VariantAssignmentService.ts", {
  __esModule: true,
  default: { mergeAnonymousToUser: async () => ({ merged: 0 }) },
});
stub("src/repositories/ab-testing/ExperimentRepository.ts", {
  __esModule: true,
  default: { findAll: async () => ({ experiments: [] }) },
});
stub("src/utils/error-reporting/reject-and-log.ts", {
  rejectAndLog: (_request: unknown, status: number, body: unknown) =>
    NextResponse.json(body as Record<string, unknown>, { status }),
});
stub("src/utils/error-reporting/auto-log-error-server.ts", {
  autoLogPaymentErrorServer: async () => undefined,
});
stub("src/services/error-reporting/ErrorLoggingService.ts", {
  ErrorLoggingService: { logError: async () => undefined, logPaymentError: async () => undefined },
});
stub("src/lib/affiliate.ts", { trackAffiliateSignup: async () => undefined });

// Reached only in RETURN-MODE (§2), where the route runs past the Stripe call.
// Both are fire-and-forget side effects on the success path and neither has
// anything to do with which code got stamped.
stub("src/utils/webhook/background-jobs.ts", {
  executeBackgroundJob: () => undefined,
});
stub("src/utils/payment/payment-method-manager.ts", {
  savePaymentMethodToUser: async () => ({ success: true }),
});

// `next-auth` is a package, not a repo file, so it is stubbed by its resolved
// entry point. Both "existing user" routes read the session through it.
const stubSession = {
  getServerSession: async () => ({ user: { id: FIXTURE_USER_ID, email: fixtureUser.email } }),
};
const nextAuthPath = require.resolve("next-auth");
require.cache[nextAuthPath] = {
  id: nextAuthPath,
  filename: nextAuthPath,
  loaded: true,
  children: [],
  paths: [],
  parent: undefined,
  exports: stubSession,
} as unknown as NodeModule;

/**
 * Price ids are read from the environment at module load by
 * `src/data/membershipPackages.ts`, and `create-subscription-existing-user`
 * REFUSES with a 500 before it ever reaches the metadata build when the price
 * id for the package is missing. Pinned to fixtures here so this suite does not
 * silently depend on whichever `.env.local` it happens to run against.
 */
const originalPriceIds = {
  tradie: process.env.STRIPE_PRICE_ID_TRADIE,
  product: process.env.STRIPE_PRODUCT_ID_TRADIE,
};
process.env.STRIPE_PRICE_ID_TRADIE = "price_campaign_code_fixture";
process.env.STRIPE_PRODUCT_ID_TRADIE = "prod_campaign_code_fixture";

// ---------------------------------------------------------------------------
// The four routes, and the body each one needs to reach its metadata build
// ---------------------------------------------------------------------------

/** The code the CALLER sends. Never valid, never canonical, never in metadata. */
const ATTACKER_SUPPLIED_CODE = "not-a-code-the-caller-holds";
/** What the resolver returns on the accepting leg — deliberately different. */
const SERVER_VERIFIED_CODE = "SERVERVERIFIED9";

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<NextResponse>;

interface RouteUnderTest {
  name: string;
  modulePath: string;
  body: Record<string, unknown>;
  /** Only the admin-style routes take a second argument. */
  context?: unknown;
}

const ROUTES: RouteUnderTest[] = [
  {
    name: "create-subscription",
    modulePath: "@/app/api/stripe/create-subscription/route",
    body: {
      userEmail: "campaign-code-fixture@example.test",
      firstName: "Campaign",
      lastName: "Fixture",
      packageId: "tradie-subscription",
      campaignCode: ATTACKER_SUPPLIED_CODE,
    },
  },
  {
    name: "create-subscription-existing-user",
    modulePath: "@/app/api/stripe/create-subscription-existing-user/route",
    body: {
      packageId: "tradie-subscription",
      campaignCode: ATTACKER_SUPPLIED_CODE,
    },
  },
  {
    name: "create-one-time-purchase",
    modulePath: "@/app/api/stripe/create-one-time-purchase/route",
    body: {
      userEmail: "campaign-code-fixture@example.test",
      firstName: "Campaign",
      lastName: "Fixture",
      packageId: "apprentice-pack",
      paymentMethodId: FIXTURE_PAYMENT_METHOD_ID,
      campaignCode: ATTACKER_SUPPLIED_CODE,
    },
  },
  {
    name: "create-one-time-purchase-existing-user",
    modulePath: "@/app/api/stripe/create-one-time-purchase-existing-user/route",
    body: {
      packageId: "apprentice-pack",
      paymentMethodId: FIXTURE_PAYMENT_METHOD_ID,
      campaignCode: ATTACKER_SUPPLIED_CODE,
    },
  },
];

async function drive(route: RouteUnderTest, handler: RouteHandler) {
  recordedMetadata.length = 0;
  resolverCalls.length = 0;

  const request = new NextRequest(`https://toolsaustralia.com.au/api/stripe/${route.name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(route.body),
  });

  // The sentinel makes each route log its full payment-failure diagnostics —
  // dozens of stack-trace lines per call, which would bury the assertions.
  // Silenced ONLY across the handler call and restored in a `finally`, so a
  // `check` FAIL is never swallowed.
  const realConsoleError = console.error;
  console.error = () => {};
  let body: { data?: { appliedCodes?: Record<string, unknown> } } | undefined;
  try {
    const response = await handler(request, route.context);
    // Only RETURN-MODE gets this far; in throw-mode the sentinel escapes or the
    // route's own catch turns it into an error body we deliberately ignore.
    if (stripeMode === "return") {
      body = (await response.json()) as typeof body;
    }
  } catch (error) {
    // The sentinel escaping a route's own catch is fine — the recording already
    // happened. Anything else is a genuine failure and must not be swallowed.
    if (!(error instanceof Error) || error.message !== STRIPE_SENTINEL) throw error;
  } finally {
    console.error = realConsoleError;
  }

  return {
    metadata: recordedMetadata[0],
    resolverCall: resolverCalls[0],
    stripeCalls: recordedMetadata.length,
    appliedCodes: body?.data?.appliedCodes,
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  /*
   * `require`, not `await import` — under tsx a dynamic import goes through the
   * ESM loader and bypasses `require.cache`, so the routes would resolve the
   * REAL Stripe client. A static import would be hoisted above the stubs, with
   * the same result.
   */
  /* eslint-disable @typescript-eslint/no-require-imports */
  const loadedStripe = require("@/lib/stripe") as typeof import("@/lib/stripe");
  /* eslint-enable @typescript-eslint/no-require-imports */

  // HARD SAFETY GATE. Every case below calls `subscriptions.create` /
  // `paymentIntents.create`. Prove by object identity that those reach the
  // recorder, not a real Stripe client, before anything runs.
  if ((loadedStripe.stripe as unknown) !== stubStripe) {
    throw new Error(
      "REFUSING TO RUN: the @/lib/stripe stub did not take — a real Stripe call is possible."
    );
  }
  console.log("Stripe is stubbed (verified by identity) — no outbound call is possible.\n");

  try {
    for (const route of ROUTES) {
      console.log(`\n${route.name}`);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const handler = (require(route.modulePath) as { POST: RouteHandler }).POST;
      /* eslint-enable @typescript-eslint/no-require-imports */

      // ---- leg 1: the resolver REFUSES ----------------------------------
      resolverAnswer = undefined;
      const refused = await drive(route, handler);

      check(`  ${route.name}: reached the Stripe call`, refused.stripeCalls, 1);
      // THE DEAD-BRANCH PIN. The old text guard asserted only that the string
      // `resolveCodeForCheckout(` appeared in the file, so it passed if the call
      // sat behind a condition that never runs — or inside a comment. These two
      // assertions require it to have EXECUTED, once, with the caller's own
      // value as its argument.
      check(
        `  ${route.name}: actually ASKED the resolver, exactly once`,
        resolverCalls.length,
        1
      );
      check(
        `  ${route.name}: …passing the caller's raw value to be checked`,
        refused.resolverCall?.code,
        ATTACKER_SUPPLIED_CODE
      );
      check(
        `  ${route.name}: refused code is ABSENT from Stripe metadata`,
        Object.prototype.hasOwnProperty.call(refused.metadata ?? {}, "campaignCode"),
        false
      );
      check(
        `  ${route.name}: …and the caller's value appears nowhere in the metadata`,
        JSON.stringify(refused.metadata ?? {}).includes(ATTACKER_SUPPLIED_CODE),
        false
      );

      // ---- leg 2: the resolver ACCEPTS, with a DIFFERENT value ----------
      // This is the leg the old text guard could not express at all: a route
      // that calls the resolver and then forwards the body anyway passed it.
      resolverAnswer = SERVER_VERIFIED_CODE;
      const accepted = await drive(route, handler);

      check(`  ${route.name}: reached the Stripe call again`, accepted.stripeCalls, 1);
      check(
        `  ${route.name}: metadata carries the RESOLVER's value`,
        accepted.metadata?.campaignCode,
        SERVER_VERIFIED_CODE
      );
      check(
        `  ${route.name}: …and not the caller's`,
        accepted.metadata?.campaignCode === ATTACKER_SUPPLIED_CODE,
        false
      );
    }

    // ---- §2: WHAT THE ROUTE REPORTS BACK ---------------------------------
    //
    // Everything above stops at the Stripe boundary, so it can prove what got
    // STAMPED and nothing about what gets SAID. `data.appliedCodes` is built
    // after that boundary and is the only thing licensing a "code applied" line
    // on `SpecialPackagesModal`'s receipt — that modal delivers the code in the
    // create body and has no attach call to veto a stale label. Until this
    // section, a route that quietly stopped reporting the field, or reported
    // `validatedData.campaignCode` instead of the resolver's answer, restored the
    // original "the receipt lied" bug verbatim with every suite still green.
    //
    // Driven, not asserted about the source text: RETURN-MODE lets the handler
    // run to completion against a fixture PaymentIntent, so what is checked is
    // the actual JSON a browser would receive.
    {
      const route = ROUTES.find((r) => r.name === "create-one-time-purchase-existing-user");
      if (!route) throw new Error("§2 fixture route missing");
      /* eslint-disable @typescript-eslint/no-require-imports */
      const handler = (require(route.modulePath) as { POST: RouteHandler }).POST;
      /* eslint-enable @typescript-eslint/no-require-imports */

      stripeMode = "return";
      console.log(`\n${route.name} — what it REPORTS back (data.appliedCodes)`);

      // ---- refusal: the resolver drops the code, the report must say so ----
      resolverAnswer = undefined;
      const reportedRefusal = await drive(route, handler);

      check(
        `  ${route.name}: the success response reports appliedCodes at all`,
        typeof reportedRefusal.appliedCodes,
        "object"
      );
      // THE ASSERTION THIS SECTION EXISTS FOR. `null`, not the body's value, not
      // absent — the receipt reads this leg and must find a definite refusal.
      check(
        `  ${route.name}: a REFUSED campaign code is reported as null`,
        reportedRefusal.appliedCodes?.campaignCode,
        null
      );
      check(
        `  ${route.name}: …and the caller's raw value is nowhere in the report`,
        JSON.stringify(reportedRefusal.appliedCodes ?? {}).includes(ATTACKER_SUPPLIED_CODE),
        false
      );
      // And the receipt the customer would read, assembled by the SAME two
      // functions the modal calls — so this pins the route → label seam end to
      // end, not just the field's value.
      check(
        `  ${route.name}: → the receipt claims NOTHING about a refused code`,
        appliedCodeReceiptLine(
          settleAppliedCodeLabel({
            typedCode: ATTACKER_SUPPLIED_CODE,
            typedCodeType: "campaign",
            applied: reportedRefusal.appliedCodes as AppliedCheckoutCodes,
          })
        ),
        null
      );

      // ---- acceptance: the report must carry the RESOLVER's own string ----
      resolverAnswer = SERVER_VERIFIED_CODE;
      const reportedAcceptance = await drive(route, handler);

      check(
        `  ${route.name}: an ACCEPTED campaign code is reported as the resolver's value`,
        reportedAcceptance.appliedCodes?.campaignCode,
        SERVER_VERIFIED_CODE
      );
      check(
        `  ${route.name}: → the receipt names the SERVER's string, not the caller's`,
        appliedCodeReceiptLine(
          settleAppliedCodeLabel({
            typedCode: ATTACKER_SUPPLIED_CODE,
            typedCodeType: "campaign",
            applied: reportedAcceptance.appliedCodes as AppliedCheckoutCodes,
          })
        ),
        `Campaign code ${SERVER_VERIFIED_CODE} applied`
      );

      // THE OTHER TWO LEGS REPORT DELIVERY, NOT ACCEPTANCE — pinned here so the
      // difference is visible in the suite rather than only in a comment. The
      // route stamps these two verbatim and validates neither, so the report
      // echoes the body back and the receipt will name them. That is today's
      // deliberate behaviour; if either leg ever gains a server-side check, this
      // is the assertion that must change.
      check(
        `  ${route.name}: the referral leg is the request body echoed back (delivery, not acceptance)`,
        reportedAcceptance.appliedCodes?.referralCode,
        null
      );
      const withCodes: RouteUnderTest = {
        ...route,
        body: { ...route.body, referralCode: "MATE-CODE", promoLinkCode: "SPRING" },
      };
      const echoed = await drive(withCodes, handler);
      check(
        `  ${route.name}: …an UNVALIDATED referral code is reported as sent`,
        echoed.appliedCodes?.referralCode,
        "MATE-CODE"
      );
      check(
        `  ${route.name}: …and so is an unvalidated promo-link code`,
        echoed.appliedCodes?.promoLinkCode,
        "SPRING"
      );

      stripeMode = "throw";
    }
  } finally {
    for (const [key, value] of [
      ["STRIPE_PRICE_ID_TRADIE", originalPriceIds.tradie],
      ["STRIPE_PRODUCT_ID_TRADIE", originalPriceIds.product],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    // One route opens a connection through a dynamic import this file cannot
    // stub. Nothing was written; this just lets the process exit.
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed");
  // EXPLICIT. Loading four real route modules pulls in their module-scope
  // timers (the rate limiters' cleanup `setInterval`s among them), which keep
  // the event loop alive for ever. Without this the suite prints a pass and
  // then hangs, which reads as a failure to whoever is watching CI.
  process.exit(0);
}

run().catch((error) => {
  console.error("campaign-code-metadata.test.ts crashed:", error);
  process.exit(1);
});
