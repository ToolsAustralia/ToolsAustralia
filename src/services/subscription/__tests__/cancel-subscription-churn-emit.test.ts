/**
 * `cancelSubscription` — the win-back trigger emit, through the REAL service.
 *
 * Everything this task owns lives in `CancelSubscriptionService.ts`, not in the
 * event builder: which callers count as churn, where in the sequence the emit
 * sits, the catalogue lookup, the tier derivation, and the two fallbacks. Before
 * this file, `canonical-events-shape.test.ts` covered only the pure builder with
 * `packageData` handed in ready-made — so someone could set `tier: pkg._id` in the
 * service (the exact legacy defect the event exists to avoid), or move the emit
 * above `await user.save()`, or delete the `if (isMemberChurn)` gate, and
 * type-check, lint and every suite would stay green while the win-back email
 * printed `"tradie-subscription"`, shipped a pre-write `cancelled_at`, or went to
 * customers an ADMIN cancelled on their behalf.
 *
 * What is pinned here:
 *   1. THE GATE. The default (admin route, `switchTierPastDue`) emits NOTHING.
 *      Only an explicit `isMemberChurn: true` emits, and exactly once.
 *   2. THE LOOKUP + TIER DERIVATION. `"tradie-subscription"` resolves through the
 *      real catalogue to `package_name "Tradie"` / `tier "tradie"` / a NUMBER
 *      `price` — never the raw id, never the `"Subscription"` sentinel the legacy
 *      `Subscription Cancelled` event ships.
 *   3. THE ORDERING. The emit runs AFTER `await user.save()`, proven by counting
 *      emits at save time (must be 0) and by matching `cancelled_at` to the value
 *      the save actually persisted.
 *   4. THE FALLBACKS. An unresolvable stored `packageId` still fires the event,
 *      minus the package block (dropping it would silently exclude that member
 *      from the only win-back trigger there is). A cancellation with no persisted
 *      `cancelledAt` fires nothing rather than anchoring the flow on a guess.
 *
 * NOTHING LEAVES THIS PROCESS. `@/lib/stripe`, `@/lib/klaviyo`, the reference
 * resolver, the partner-discount queue, the profile sync and the analytics writer
 * are all replaced in `require.cache` before the service is loaded, and the two
 * that can reach the network are VERIFIED by object identity before a single case
 * runs. There is no database connection and no `.env.local` read.
 *
 * Run via: `npm run test:cancel-churn-emit`
 */
import assert from "node:assert/strict";
import path from "node:path";
import type Stripe from "stripe";
import type { IUser } from "@/models/User";
import type { KlaviyoEvent } from "@/types/klaviyo";

// ---------------------------------------------------------------------------
// Recorders
// ---------------------------------------------------------------------------

const emits: KlaviyoEvent[] = [];
const stripeCalls: string[] = [];

interface SaveSnapshot {
  /** How many emits had already happened when this save ran. MUST be 0. */
  emitsAtSave: number;
  cancelledAt: string | null;
  endDate: string | null;
  isActive: boolean | undefined;
}
const saves: SaveSnapshot[] = [];

function resetRecorders() {
  emits.length = 0;
  stripeCalls.length = 0;
  saves.length = 0;
}

// ---------------------------------------------------------------------------
// Stubs — installed in require.cache BEFORE the service is loaded
// ---------------------------------------------------------------------------

const stubKlaviyo = {
  trackEventBackground(event: KlaviyoEvent): void {
    emits.push(event);
  },
  async trackEvent(): Promise<never> {
    throw new Error("cancelSubscription must use trackEventBackground, never a blocking trackEvent");
  },
};

/** The Stripe subscription every stubbed call answers with. Rebuilt per case. */
let currentStripeSub: Stripe.Subscription;

const stubStripe = {
  subscriptions: {
    async cancel(id: string) {
      stripeCalls.push(`cancel:${id}`);
      return { ...currentStripeSub, status: "canceled" } as unknown as Stripe.Subscription;
    },
    async update(id: string) {
      stripeCalls.push(`update:${id}`);
      return { ...currentStripeSub, cancel_at_period_end: true } as unknown as Stripe.Subscription;
    },
    async retrieve(id: string) {
      stripeCalls.push(`retrieve:${id}`);
      return currentStripeSub;
    },
  },
};

const stubReferenceService = {
  async resolveCancellableStripeSubscription() {
    return { subscription: currentStripeSub, repairedCanonicalId: false };
  },
  isSubscriptionReferenceError: () => false,
  SUBSCRIPTION_REFERENCE_ERROR_CODES: {
    NO_ACTIVE_SUBSCRIPTION: "NO_ACTIVE_SUBSCRIPTION",
    STRIPE_RETRYABLE: "STRIPE_RETRYABLE",
  },
};

const stubPartnerQueue = {
  async handleSubscriptionQueueUpdate() {
    /* no-op: the partner queue is a different feature with its own suite */
  },
};

const stubProfileSync = {
  ensureUserProfileSynced() {
    /* no-op: profile sync is not what this file is about */
  },
};

const stubAnalytics = {
  async recordCancellationAnalytics() {
    /* no-op: membership analytics history has its own suite */
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

stub("src/lib/klaviyo.ts", { klaviyo: stubKlaviyo });
stub("src/lib/stripe.ts", { stripe: stubStripe });
stub("src/services/subscription/SubscriptionReferenceService.ts", stubReferenceService);
stub("src/utils/partner-discounts/partner-discount-queue.ts", stubPartnerQueue);
stub("src/utils/integrations/klaviyo/klaviyo-profile-sync.ts", stubProfileSync);
stub("src/services/admin/membershipAnalyticsPersistence.ts", stubAnalytics);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Period end Stripe reports for the cancel-at-period-end cases. */
const PERIOD_END_UNIX = Math.floor(new Date("2026-09-24T13:59:59.000Z").getTime() / 1000);

function makeStripeSub(status: string): Stripe.Subscription {
  return {
    id: "sub_fixture_1",
    status,
    cancel_at_period_end: false,
    cancel_at: null,
    current_period_end: PERIOD_END_UNIX,
    items: { data: [] },
  } as unknown as Stripe.Subscription;
}

interface FakeUserOptions {
  packageId?: string | null;
  /** `false` builds the "no subscription subdoc at all" case. */
  withSubscription?: boolean;
  status?: string;
}

function makeUser(opts: FakeUserOptions = {}): IUser {
  const { packageId = "tradie-subscription", withSubscription = true, status = "active" } = opts;

  const user = {
    _id: { toString: () => "user_cancel_fixture" },
    email: "cancel-fixture@example.test",
    firstName: "Cancel",
    lastName: "Fixture",
    mobile: undefined,
    stripeCustomerId: "cus_fixture_1",
    stripeSubscriptionId: "sub_fixture_1",
    subscription: withSubscription
      ? {
          packageId: packageId ?? undefined,
          isActive: true,
          autoRenew: true,
          status,
          startDate: new Date("2026-01-24T00:00:00.000Z"),
          endDate: undefined as Date | undefined,
          cancelledAt: undefined as Date | undefined,
        }
      : undefined,
    markModified() {
      /* mongoose no-op */
    },
    isModified: () => false,
    async save() {
      saves.push({
        emitsAtSave: emits.length,
        cancelledAt: user.subscription?.cancelledAt?.toISOString() ?? null,
        endDate: user.subscription?.endDate?.toISOString() ?? null,
        isActive: user.subscription?.isActive,
      });
      return user;
    },
  };

  return user as unknown as IUser;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

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

type CancelModule = typeof import("../CancelSubscriptionService");

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

/**
 * The gate. Two of the three callers pass no flag: the admin route
 * (`src/app/api/admin/users/[id]/cancel-subscription/route.ts`) and the past-due
 * tier switch (`switchTierPastDue.ts`), where the member is
 * cancel-then-resubscribing and is actually STAYING. Neither may reach the
 * win-back sequence.
 */
async function testDefaultPathEmitsNothing(mod: CancelModule) {
  resetRecorders();
  currentStripeSub = makeStripeSub("active");
  const user = makeUser();

  await mod.cancelSubscription(user);

  check("default (admin / tier-switch) path emits NOTHING", emits.length, 0);
  check("...but the cancellation itself still ran", stripeCalls.includes("update:sub_fixture_1"), true);
  check("...and the document was still saved", saves.length, 1);
}

/** An explicit `isMemberChurn: false` behaves the same as omitting it. */
async function testExplicitFalseEmitsNothing(mod: CancelModule) {
  resetRecorders();
  currentStripeSub = makeStripeSub("active");

  await mod.cancelSubscription(makeUser(), { isMemberChurn: false });

  check("explicit isMemberChurn:false emits NOTHING", emits.length, 0);
}

/**
 * The churn path. `"tradie-subscription"` must resolve through the real catalogue
 * to a REAL name and a REAL tier — the whole reason this event exists rather than
 * reusing `Subscription Cancelled`, which hardcodes `package_name "Subscription"`
 * and puts the raw package id in `tier`.
 */
async function testChurnPathEmitsOnceWithRealPackage(mod: CancelModule) {
  resetRecorders();
  currentStripeSub = makeStripeSub("active");

  await mod.cancelSubscription(makeUser(), { isMemberChurn: true });

  check("churn path emits exactly once", emits.length, 1);
  const e = emits[0];
  check("event name", e?.event, "Subscription Cancellation Requested");
  check("event is NOT the webhook-only Subscription Cancelled", e?.event === "Subscription Cancelled", false);
  check("user_id", e?.properties.user_id, "user_cancel_fixture");
  check("package_id is the stored id", e?.properties.package_id, "tradie-subscription");
  check("package_name is the catalogue name, not 'Subscription'", e?.properties.package_name, "Tradie");
  check("tier is the lowercased NAME, not the raw package id", e?.properties.tier, "tradie");
  check("tier is NOT the package id", e?.properties.tier === "tradie-subscription", false);
  check("package_type", e?.properties.package_type, "membership");
  check("price is the catalogue price", e?.properties.price, 20);
  check("price is a NUMBER, not the legacy '20.00' string", typeof e?.properties.price, "number");
}

/**
 * The ordering. `emitsAtSave` is the assertion that bites if the emit is moved
 * above `await user.save()`: the event carries the PERSISTED cancellation
 * instant, so it cannot run before the write lands.
 */
async function testEmitCarriesThePersistedCancelledAt(mod: CancelModule) {
  resetRecorders();
  currentStripeSub = makeStripeSub("active");
  const user = makeUser();

  await mod.cancelSubscription(user, { isMemberChurn: true });

  const saved = saves[saves.length - 1];
  check("exactly one save", saves.length, 1);
  check("NO emit had happened when the save ran (the emit sits after it)", saved?.emitsAtSave, 0);
  check("the save persisted a cancelledAt", typeof saved?.cancelledAt, "string");
  check("emitted cancelled_at === the value the save persisted", emits[0]?.properties.cancelled_at, saved?.cancelledAt);
  check(
    "emitted cancelled_at === what is on the document afterwards",
    emits[0]?.properties.cancelled_at,
    (user.subscription?.cancelledAt as Date | undefined)?.toISOString()
  );
  check(
    "cancelled_at is ISO, not a locale string",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(String(emits[0]?.properties.cancelled_at)),
    true
  );
}

/**
 * `access_ends_at` is the persisted `subscription.endDate` — "now" for an
 * immediate cancellation, Stripe's period end for a period-end one. Both come off
 * the SAVED document, not off the Stripe response.
 */
async function testAccessEndsAtTracksThePersistedEndDate(mod: CancelModule) {
  resetRecorders();
  currentStripeSub = makeStripeSub("active");

  await mod.cancelSubscription(makeUser(), { isMemberChurn: true, cancelAtPeriodEnd: true });

  check(
    "access_ends_at === the persisted endDate",
    emits[0]?.properties.access_ends_at,
    saves[saves.length - 1]?.endDate
  );
  check(
    "period-end cancel persisted Stripe's period end",
    saves[saves.length - 1]?.endDate,
    "2026-09-24T13:59:59.000Z"
  );

  // Immediate cancel: endDate is "now", isActive false, and the event still fires.
  resetRecorders();
  currentStripeSub = makeStripeSub("active");
  await mod.cancelSubscription(makeUser(), { isMemberChurn: true, cancelAtPeriodEnd: false });

  check("immediate cancel still emits once", emits.length, 1);
  check("immediate cancel deactivated the membership", saves[saves.length - 1]?.isActive, false);
  check(
    "access_ends_at still === the persisted endDate",
    emits[0]?.properties.access_ends_at,
    saves[saves.length - 1]?.endDate
  );
}

/**
 * A stored `packageId` that no longer resolves must NOT suppress the event — it is
 * the only trigger the win-back flow has. The package block is omitted rather than
 * sent as a sentinel.
 */
async function testUnresolvablePackageStillEmits(mod: CancelModule) {
  resetRecorders();
  currentStripeSub = makeStripeSub("active");

  await mod.cancelSubscription(makeUser({ packageId: "retired-plan-that-no-longer-exists" }), {
    isMemberChurn: true,
  });

  check("unresolvable package still emits", emits.length, 1);
  const props = emits[0]?.properties ?? {};
  check("package_id OMITTED", "package_id" in props, false);
  check("package_name OMITTED (never a 'Subscription' sentinel)", "package_name" in props, false);
  check("tier OMITTED (never the raw id)", "tier" in props, false);
  check("price OMITTED", "price" in props, false);
  check("cancelled_at still present", typeof props.cancelled_at, "string");
}

/**
 * No persisted `cancelledAt` means there is nothing truthful to anchor the flow
 * on. The service logs it (via `console.error`, which survives the production
 * build's console stripping) and emits nothing.
 */
async function testNoPersistedCancelledAtEmitsNothing(mod: CancelModule) {
  resetRecorders();
  currentStripeSub = makeStripeSub("active");

  await mod.cancelSubscription(makeUser({ withSubscription: false }), { isMemberChurn: true });

  check("no persisted cancelledAt emits NOTHING", emits.length, 0);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  /*
   * `require`, not `await import` — under tsx a dynamic import goes through the
   * ESM loader and bypasses `require.cache`, so the service would resolve the
   * REAL Stripe and Klaviyo clients. A static import would be hoisted above the
   * stub installation, with the same result.
   */
  /* eslint-disable @typescript-eslint/no-require-imports */
  const loadedKlaviyo = require("@/lib/klaviyo") as typeof import("@/lib/klaviyo");
  const loadedStripe = require("@/lib/stripe") as typeof import("@/lib/stripe");
  const mod = require("../CancelSubscriptionService") as CancelModule;
  /* eslint-enable @typescript-eslint/no-require-imports */

  // HARD SAFETY GATE — prove by object identity that the service reaches the
  // stubs, not the real clients, before a single case runs.
  if ((loadedKlaviyo.klaviyo as unknown) !== stubKlaviyo) {
    throw new Error("REFUSING TO RUN: the @/lib/klaviyo stub did not take — a real Klaviyo emit is possible.");
  }
  if ((loadedStripe.stripe as unknown) !== stubStripe) {
    throw new Error("REFUSING TO RUN: the @/lib/stripe stub did not take — a real Stripe call is possible.");
  }
  console.log("Stripe + Klaviyo are stubbed (verified by identity) - no outbound call is possible.\n");

  console.log("1. The isMemberChurn gate");
  await testDefaultPathEmitsNothing(mod);
  await testExplicitFalseEmitsNothing(mod);

  console.log("\n2. The churn emit - real catalogue lookup and tier derivation");
  await testChurnPathEmitsOnceWithRealPackage(mod);

  console.log("\n3. Ordering - the emit reads the PERSISTED cancellation");
  await testEmitCarriesThePersistedCancelledAt(mod);
  await testAccessEndsAtTracksThePersistedEndDate(mod);

  console.log("\n4. Fallbacks");
  await testUnresolvablePackageStillEmits(mod);
  await testNoPersistedCancelledAtEmitsNothing(mod);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed");
  assert.equal(failures, 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
