/**
 * The one-time pack purchase must move money EXACTLY ONCE.
 *
 * WHY THIS EXISTS. A one-time checkout has two places that can charge: the browser
 * confirming the upfront PaymentIntent (a real charge, minted so wallets can display the
 * amount), and the purchase route creating its own with `confirm: true`. When the route ran
 * without being told about the browser's charge, the member paid twice and the webhook —
 * which grants per PaymentIntent — granted the pack's entries twice with it. 57 checkouts,
 * 54 members, Jan–Sep 2026, confirmed against live Stripe metadata on 14/14 sampled pairs.
 *
 * The assertion that matters is therefore NEGATIVE and at the money layer:
 * `paymentIntents.create` must NOT be called when a confirmed charge already exists. A test
 * that only checked the happy return value would have passed throughout the entire bug.
 *
 * NOTHING LEAVES THIS PROCESS. `@/lib/stripe` is replaced in `require.cache` before the
 * resolver is loaded, and identity-checked below, so no Stripe object is ever constructed
 * and no network call is made. Every Stripe call is recorded in `calls` for assertion.
 *
 * Run via: `npm run test:one-time-charge`
 */
import assert from "node:assert/strict";
import path from "node:path";
import type Stripe from "stripe";

// ── Recorder ────────────────────────────────────────────────────────────────────────────
type Call = { method: string; args: unknown[] };
let calls: Call[] = [];
let listResult: Stripe.PaymentIntent[] = [];
let retrieveResult: Stripe.PaymentIntent | null = null;
let updateThrows = false;
let listThrows = false;

const record = (method: string, ...args: unknown[]) => calls.push({ method, args });
const countOf = (method: string) => calls.filter((c) => c.method === method).length;

const stubStripe = {
  paymentIntents: {
    async retrieve(id: string) {
      record("retrieve", id);
      if (!retrieveResult) throw new Error("no fixture set");
      return retrieveResult;
    },
    async list(params: unknown) {
      record("list", params);
      if (listThrows) throw new Error("simulated Stripe outage");
      return { data: listResult };
    },
    async update(id: string, params: Record<string, unknown>) {
      record("update", id, params);
      if (updateThrows) throw new Error("simulated update failure");
      const base = [...listResult, retrieveResult].find((p) => p?.id === id);
      return { ...(base as Stripe.PaymentIntent), metadata: params.metadata } as Stripe.PaymentIntent;
    },
    async create(config: Record<string, unknown>, opts: unknown) {
      record("create", config, opts);
      return { id: "pi_created", status: "succeeded", metadata: config.metadata } as unknown as Stripe.PaymentIntent;
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

// Loaded AFTER the stub so the resolver closes over it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const resolverModule = require("../resolve-purchase-payment-intent") as typeof import("../resolve-purchase-payment-intent");
const { resolvePurchasePaymentIntent, PaymentIntentNotAdoptableError, ONE_TIME_CHARGE_CLAIMED_KEY } =
  resolverModule;

// eslint-disable-next-line @typescript-eslint/no-require-imports
assert.equal((require("@/lib/stripe") as { stripe: unknown }).stripe, stubStripe, "The stub must be the module the resolver uses — otherwise this test would hit real Stripe");

// ── Fixtures ────────────────────────────────────────────────────────────────────────────
const CUSTOMER = "cus_fixture";
const AMOUNT = 2500;
const PACKAGE = "apprentice-pack";

const pi = (over: Partial<Stripe.PaymentIntent> & { metadata?: Record<string, string> } = {}) =>
  ({
    id: "pi_upfront",
    status: "succeeded",
    amount: AMOUNT,
    customer: CUSTOMER,
    created: Math.floor(Date.now() / 1000) - 30,
    metadata: { packageId: PACKAGE },
    ...over,
  }) as unknown as Stripe.PaymentIntent;

const createConfig = {
  amount: AMOUNT,
  currency: "aud",
  confirm: true,
  description: "Apprentice Pack",
  metadata: {
    packageId: PACKAGE,
    entriesCount: "3",
    price: String(AMOUNT),
    affiliateCode: "AFF1",
    campaignCode: "CAMP1",
    referralCode: "REF1",
    experimentId: "exp1",
    variantId: "var1",
  },
} as unknown as Stripe.PaymentIntentCreateParams;

const resolve = (over: Record<string, unknown> = {}) =>
  resolvePurchasePaymentIntent({
    customerId: CUSTOMER,
    packageId: PACKAGE,
    createConfig,
    idempotencyKey: "key_1",
    context: "test",
    ...over,
  });

function reset() {
  calls = [];
  listResult = [];
  retrieveResult = null;
  updateThrows = false;
  listThrows = false;
}

// ── Tests ───────────────────────────────────────────────────────────────────────────────

/** THE BUG. A confirmed charge was handed to us; charging again is the defect. */
async function testSuppliedIntentIsAdoptedNeverRecharged() {
  reset();
  retrieveResult = pi();
  const result = await resolve({ suppliedPaymentIntentId: "pi_upfront" });

  assert.equal(countOf("create"), 0, "Must NOT create a second PaymentIntent when the client already confirmed one — this is the double charge");
  assert.equal(result.outcome, "adopted", "Outcome should be adopted");
  assert.equal(result.paymentIntent.id, "pi_upfront", "Should return the charge the client already made");
}

/** Adoption must carry the webhook's metadata, or affiliates go unpaid and codes unredeemed. */
async function testAdoptionStampsClaimMarkerAndAttribution() {
  reset();
  retrieveResult = pi();
  await resolve({ suppliedPaymentIntentId: "pi_upfront" });

  const update = calls.find((c) => c.method === "update");
  assert.ok(update, "Adoption must stamp the PaymentIntent");
  const metadata = (update!.args[1] as { metadata: Record<string, string> }).metadata;

  assert.equal(metadata[ONE_TIME_CHARGE_CLAIMED_KEY], "true", "Claim marker must be written, or recovery could adopt this charge a second time");
  for (const key of ["affiliateCode", "campaignCode", "referralCode", "experimentId", "variantId"]) {
    assert.equal(metadata[key], createConfig.metadata![key], `Adoption must carry ${key} into metadata — the webhook reads it from there`);
  }
  assert.equal(metadata.entriesCount, "3", "Adoption must carry entriesCount");
}

/** Client confirmed, the purchase call died, the buyer retried. Do not charge again. */
async function testRecoversUnclaimedCharge() {
  reset();
  listResult = [pi({ id: "pi_orphan" })];
  const result = await resolve();

  assert.equal(countOf("create"), 0, "An unclaimed confirmed charge for this purchase must be recovered, not duplicated");
  assert.equal(result.outcome, "recovered", "Outcome should be recovered");
  assert.equal(result.paymentIntent.id, "pi_orphan", "Should adopt the orphaned charge");
}

/** The other half of the invariant: a deliberate second purchase MUST still be charged. */
async function testClaimedChargeIsNotRecovered() {
  reset();
  listResult = [pi({ id: "pi_already_booked", metadata: { packageId: PACKAGE, [ONE_TIME_CHARGE_CLAIMED_KEY]: "true" } })];
  const result = await resolve();

  assert.equal(countOf("create"), 1, "A member deliberately buying the same pack twice must be charged twice — a claimed charge is not adoptable");
  assert.equal(result.outcome, "created", "Outcome should be created");
}

/** The saved-card path leaves the upfront intent unconfirmed; it must never be adopted. */
async function testUnconfirmedIntentIsNotAdoptable() {
  reset();
  listResult = [pi({ id: "pi_abandoned", status: "requires_payment_method" })];
  const result = await resolve();

  assert.equal(countOf("create"), 1, "An unconfirmed intent holds no money — the saved-card path must still charge");
  assert.equal(result.outcome, "created", "Outcome should be created");
}

/** The upfront intent carries the raw client id, which may hold the `-member` suffix. */
async function testRecoveryNormalisesPackageId() {
  reset();
  listResult = [pi({ id: "pi_member_suffix", metadata: { packageId: "apprentice-pack-member" } })];
  const result = await resolve();

  assert.equal(countOf("create"), 0, "packageId must be compared after normalizeMembershipPlanId, or the orphan is missed and the buyer pays twice");
  assert.equal(result.outcome, "recovered", "Outcome should be recovered");
}

/** A retry after a lost response is not an error — the purchase already succeeded. */
async function testClaimedSuppliedIntentIsReplayedNotRejected() {
  reset();
  retrieveResult = pi({ metadata: { packageId: PACKAGE, [ONE_TIME_CHARGE_CLAIMED_KEY]: "true" } });
  const result = await resolve({ suppliedPaymentIntentId: "pi_upfront" });

  assert.equal(result.outcome, "adopted", "A claimed-but-matching intent is a lost-response retry, not a failure");
  assert.equal(countOf("create"), 0, "Replay must not charge");
  assert.equal(countOf("update"), 0, "Replay must not re-stamp");
}

/** Never adopt a charge that is not this purchase. */
async function testMismatchesAreRejected() {
  const cases: Array<[string, Stripe.PaymentIntent]> = [
    ["wrong amount", pi({ amount: 9900 })],
    ["another customer", pi({ customer: "cus_someone_else" } as Partial<Stripe.PaymentIntent>)],
    ["different package", pi({ metadata: { packageId: "foreman-pack" } })],
    ["still authenticating", pi({ status: "requires_action" })],
  ];

  for (const [label, fixture] of cases) {
    reset();
    retrieveResult = fixture;
    await assert.rejects(
      () => resolve({ suppliedPaymentIntentId: "pi_upfront" }),
      PaymentIntentNotAdoptableError,
      `Must refuse to adopt a PaymentIntent with ${label}`
    );
    assert.equal(countOf("create"), 0, `Refusing "${label}" must not fall through to a charge`);
  }
}

/** Stamping is best-effort: the money already moved, so a failed update must not fail the sale. */
async function testStampFailureIsNonFatal() {
  reset();
  retrieveResult = pi();
  updateThrows = true;
  const result = await resolve({ suppliedPaymentIntentId: "pi_upfront" });

  assert.equal(result.outcome, "adopted", "A failed metadata stamp must not fail a payment that already succeeded");
  assert.equal(result.paymentIntent.id, "pi_upfront", "Should still return the adopted charge");
  assert.equal(countOf("create"), 0, "A failed stamp must never cause a second charge");
}

/** The safety net is best-effort too — losing it degrades to today's behaviour, never blocks a sale. */
async function testRecoveryLookupFailureFallsThroughToCreate() {
  reset();
  listThrows = true;
  const result = await resolve();

  assert.equal(result.outcome, "created", "A failed recovery lookup must not block the sale");
  assert.equal(countOf("create"), 1, "Should fall through to the normal charge");
}

/** The create path must claim its own charge, or recovery would adopt it on the next purchase. */
async function testCreateStampsClaimMarker() {
  reset();
  const result = await resolve();
  const create = calls.find((c) => c.method === "create");
  const metadata = (create!.args[0] as { metadata: Record<string, string> }).metadata;

  assert.equal(result.outcome, "created", "Outcome should be created");
  assert.equal(metadata[ONE_TIME_CHARGE_CLAIMED_KEY], "true", "A newly created charge must be claimed immediately, or the member's NEXT purchase would recover it instead of charging");
  assert.equal(metadata.packageId, PACKAGE, "Create must keep the caller's metadata");
}

/**
 * The resolver above is worthless if the id never reaches it, and every way of losing it is
 * SILENT: Zod strips keys it does not declare, and a destructured mutation parameter that is
 * not forwarded type-checks perfectly clean.
 *
 * This is a source-level check, which the campaign-code-metadata test rightly argues is
 * weaker than driving the code — it would not catch an exotic rewrite. It is here because
 * the realistic regression is DELETION (someone tidies away an "unused-looking" field), and
 * against deletion it is exact. Driving these three layers properly would mean rebuilding
 * the full route/React harness for a value that is one grep-able token in each file.
 */
function testPaymentIntentIdIsThreadedEndToEnd() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

  // Every pattern is anchored to `\n` + whitespace ONLY, never `//`, so commenting a line
  // out fails the assertion. A bare substring match would pass on the commented-out code —
  // the exact defeat the campaign-code-metadata test documents. No `s` flag: the tsconfig
  // target predates it, and `[^}]` / `[^)]` already span newlines anyway.
  const LIVE = "\\n[ \\t]*"; // start of a line that is not a comment

  const route = read("src/app/api/stripe/create-one-time-purchase-existing-user/route.ts");
  assert.match(route, new RegExp(`${LIVE}paymentIntentId: z\\.string\\(\\)\\.optional\\(\\)`), "The route's Zod schema must declare paymentIntentId — Zod strips undeclared keys silently, so dropping this line reinstates the double charge with no error anywhere");
  assert.match(route, new RegExp(`${LIVE}suppliedPaymentIntentId: validatedData\\.paymentIntentId`), "The route must hand the client's confirmed intent to the resolver");

  const hook = read("src/hooks/queries/useMembershipQueries.ts");
  assert.match(hook, new RegExp(`mutationFn: async \\(\\{[^}]*${LIVE}paymentIntentId,`), "The mutation must DESTRUCTURE paymentIntentId — adding it to the interface alone type-checks clean while silently dropping the value");
  assert.match(hook, new RegExp(`create-one-time-purchase-existing-user"[^)]*${LIVE}paymentIntentId,`), "The mutation must forward paymentIntentId in the request body");

  // Scoped to the AUTHENTICATED call specifically. An unscoped match would also hit the
  // guest branch — which always carried the id — so it would have passed throughout the
  // entire bug. Verified by mutation: this assertion is what goes red when the line is
  // removed from purchaseMembership.mutateAsync.
  const modal = read("src/components/modals/MembershipModal/index.tsx");
  assert.match(modal, new RegExp(`purchaseMembership\\.mutateAsync\\(\\{[^}]*${LIVE}paymentIntentId: confirmedPaymentIntentId,`), "The AUTHENTICATED one-time branch must pass the PaymentIntent its card form already charged to purchaseMembership.mutateAsync — omitting exactly this was the original bug");
}

async function run() {
  await testSuppliedIntentIsAdoptedNeverRecharged();
  await testAdoptionStampsClaimMarkerAndAttribution();
  await testRecoversUnclaimedCharge();
  await testClaimedChargeIsNotRecovered();
  await testUnconfirmedIntentIsNotAdoptable();
  await testRecoveryNormalisesPackageId();
  await testClaimedSuppliedIntentIsReplayedNotRejected();
  await testMismatchesAreRejected();
  await testStampFailureIsNonFatal();
  await testRecoveryLookupFailureFallsThroughToCreate();
  await testCreateStampsClaimMarker();
  testPaymentIntentIdIsThreadedEndToEnd();
  console.log("One-time charge resolver tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
