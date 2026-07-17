/**
 * Tests for the iGoDirect member-status API helpers (member-status.ts) and the
 * reconcile-then-read decision they wrap (sso-access.ts), per
 * docs/partner/igodirect-member-status-api-plan.md §7.
 *
 * Pure: hand-constructed IUser fixtures using real static package ids; no DB/network.
 * Route-level status semantics (401 without bearer, 200 with, 404 unknown) are
 * verified end-to-end on staging with curl — here we pin the pure helpers that
 * decide them.
 *
 * Run: npm run test:member-status
 */
import assert from "node:assert/strict";
import type { IUser } from "@/models/User";
import {
  buildMemberStatusResponse,
  validateMemberId,
  verifyMemberStatusBearer,
} from "../member-status";
import { buildSsoAccessDecision, reconcilePartnerDiscountAccess } from "../sso-access";

const asUser = (o: object): IUser => o as unknown as IUser;
const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);
const daysFromNow = (d: number) => hoursFromNow(d * 24);
const past = () => daysFromNow(-1);
const farFuture = () => daysFromNow(300);

const TEST_KEY = "member-status-test-secret-0123456789abcdef";

function withKey<T>(value: string | undefined, fn: () => T): T {
  const original = process.env.IGODIRECT_MEMBER_STATUS_KEY;
  if (value === undefined) delete process.env.IGODIRECT_MEMBER_STATUS_KEY;
  else process.env.IGODIRECT_MEMBER_STATUS_KEY = value;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.IGODIRECT_MEMBER_STATUS_KEY;
    else process.env.IGODIRECT_MEMBER_STATUS_KEY = original;
  }
}

// ---------------------------------------------------------------------------
// Bearer auth (constant-time helper)
// ---------------------------------------------------------------------------

function testBearer() {
  withKey(TEST_KEY, () => {
    assert.deepEqual(verifyMemberStatusBearer(`Bearer ${TEST_KEY}`), { ok: true }, "correct bearer → ok");
    assert.deepEqual(verifyMemberStatusBearer(`bearer ${TEST_KEY}`), { ok: true }, "scheme is case-insensitive");

    assert.deepEqual(
      verifyMemberStatusBearer(null),
      { ok: false, status: 401, reason: "unauthorized" },
      "missing Authorization header → 401"
    );
    assert.deepEqual(
      verifyMemberStatusBearer("Bearer wrong-secret"),
      { ok: false, status: 401, reason: "unauthorized" },
      "wrong bearer → 401"
    );
    assert.deepEqual(
      verifyMemberStatusBearer(`Bearer ${TEST_KEY}x`),
      { ok: false, status: 401, reason: "unauthorized" },
      "length mismatch → 401 (length gate before timingSafeEqual)"
    );
    assert.deepEqual(
      verifyMemberStatusBearer(TEST_KEY),
      { ok: false, status: 401, reason: "unauthorized" },
      "raw secret without Bearer scheme → 401"
    );
  });

  // Fail LOUD, never open: unset/empty secret refuses even a "correct" token.
  withKey(undefined, () => {
    assert.deepEqual(
      verifyMemberStatusBearer(`Bearer ${TEST_KEY}`),
      { ok: false, status: 500, reason: "misconfigured" },
      "unset IGODIRECT_MEMBER_STATUS_KEY → misconfigured 500"
    );
  });
  withKey("", () => {
    assert.deepEqual(
      verifyMemberStatusBearer("Bearer "),
      { ok: false, status: 500, reason: "misconfigured" },
      "empty IGODIRECT_MEMBER_STATUS_KEY → misconfigured 500"
    );
  });
}

// ---------------------------------------------------------------------------
// member_id validation (400 vs 404 semantics)
// ---------------------------------------------------------------------------

function testValidateMemberId() {
  assert.equal(validateMemberId(null), null, "missing member_id → invalid (400)");
  assert.equal(validateMemberId(""), null, "empty member_id → invalid (400)");
  assert.equal(validateMemberId("not-an-object-id"), null, "malformed member_id → invalid (400)");
  assert.equal(validateMemberId("123"), null, "short numeric junk → invalid (400)");

  const wellFormed = "665f00000000000000000001";
  assert.equal(validateMemberId(wellFormed), wellFormed, "well-formed ObjectId passes (404 is for unknown)");
  assert.equal(validateMemberId(`  ${wellFormed}  `), wellFormed, "surrounding whitespace is trimmed");
}

// ---------------------------------------------------------------------------
// Decision → wire-shape mapping
// ---------------------------------------------------------------------------

function testActiveOneTimePack() {
  const packEnd = daysFromNow(5);
  const u = asUser({
    oneTimePackages: [{ packageId: "boss-pack", isActive: true, purchaseDate: past() }],
    partnerDiscountQueue: [
      {
        packageId: "boss-pack",
        packageType: "one-time",
        packageName: "Boss Pack",
        status: "active",
        startDate: past(),
        endDate: packEnd,
        purchaseDate: past(),
        expiryDate: farFuture(),
        queuePosition: 0,
        discountHours: 240,
      },
    ],
  });
  const body = buildMemberStatusResponse(buildSsoAccessDecision(u));
  assert.equal(body.active, true, "active one-time pack → active:true");
  assert.equal(body.member_level, 70, "Boss Pack → member_level 70");
  assert.equal(body.expires_at, packEnd.toISOString(), "expires_at is the pack window end (ISO UTC)");
}

function testSubscriberOnly() {
  const renewal = daysFromNow(30);
  const u = asUser({
    subscription: {
      packageId: "tradie-subscription",
      isActive: true,
      startDate: daysFromNow(-10),
      endDate: renewal,
    },
  });
  const body = buildMemberStatusResponse(buildSsoAccessDecision(u));
  assert.equal(body.active, true, "active subscriber → active:true");
  assert.equal(body.member_level, 50, "Tradie subscription → member_level 50");
  assert.equal(body.expires_at, renewal.toISOString(), "subscriber expires_at = next renewal date");
}

async function testPackAboveSubscriptionThenFallback() {
  // The meeting's headline example: Tradie sub (50) + active Boss pack (70) → 70,
  // then when the pack lapses the member falls back to the subscription's 50.
  const renewal = daysFromNow(30);
  const packEnd = daysFromNow(5);
  const stacked = asUser({
    subscription: {
      packageId: "tradie-subscription",
      isActive: true,
      startDate: daysFromNow(-10),
      endDate: renewal,
    },
    oneTimePackages: [{ packageId: "boss-pack", isActive: true, purchaseDate: past() }],
    partnerDiscountQueue: [
      {
        packageId: "boss-pack",
        packageType: "one-time",
        packageName: "Boss Pack",
        status: "active",
        startDate: past(),
        endDate: packEnd,
        purchaseDate: past(),
        expiryDate: farFuture(),
        queuePosition: 0,
        discountHours: 240,
      },
    ],
  });
  const stackedBody = buildMemberStatusResponse(buildSsoAccessDecision(stacked));
  assert.equal(stackedBody.active, true, "stacked member is active");
  assert.equal(stackedBody.member_level, 70, "active pack above subscription leads → 70");
  assert.equal(stackedBody.expires_at, packEnd.toISOString(), "expires_at follows the leading pack window");

  // Same member after the pack window elapses: reconcile sweeps the row to expired
  // and the answer falls back to the subscription tier + rolling renewal date.
  const lapsed = asUser({
    subscription: {
      packageId: "tradie-subscription",
      isActive: true,
      startDate: daysFromNow(-10),
      endDate: renewal,
    },
    oneTimePackages: [{ packageId: "boss-pack", isActive: true, purchaseDate: daysFromNow(-12) }],
    partnerDiscountQueue: [
      {
        packageId: "boss-pack",
        packageType: "one-time",
        packageName: "Boss Pack",
        status: "active",
        startDate: daysFromNow(-12),
        endDate: hoursFromNow(-2),
        purchaseDate: daysFromNow(-12),
        expiryDate: farFuture(),
        queuePosition: 0,
        discountHours: 240,
      },
    ],
    save: async () => {},
  });
  const fallbackBody = buildMemberStatusResponse(await reconcilePartnerDiscountAccess(lapsed));
  assert.equal(fallbackBody.active, true, "subscriber stays active after the pack lapses");
  assert.equal(fallbackBody.member_level, 50, "post-expiry fallback to the subscription tier (50)");
  assert.equal(fallbackBody.expires_at, renewal.toISOString(), "expires_at falls back to the renewal date");
}

async function testEverythingLapsed() {
  const u = asUser({
    subscription: { packageId: "tradie-subscription", isActive: false },
    oneTimePackages: [{ packageId: "tradie-pack", isActive: false, purchaseDate: daysFromNow(-20) }],
    partnerDiscountQueue: [
      {
        packageId: "tradie-pack",
        packageType: "one-time",
        packageName: "Tradie Pack",
        status: "active",
        startDate: daysFromNow(-20),
        endDate: daysFromNow(-18),
        purchaseDate: daysFromNow(-20),
        expiryDate: farFuture(),
        queuePosition: 0,
        discountHours: 48,
      },
    ],
    save: async () => {},
  });
  const body = buildMemberStatusResponse(await reconcilePartnerDiscountAccess(u));
  assert.deepEqual(
    body,
    { active: false, member_level: null, expires_at: null },
    "everything lapsed → 200 { active:false, member_level:null, expires_at:null } (not 403)"
  );
}

async function testStuckQueuedItemPromoted() {
  // The ~190-user trap (playbook §8): paid access sitting `queued` because nothing
  // swept it. A bare read would deny; reconcile-then-read must promote and answer true.
  let saveCalls = 0;
  const u = asUser({
    oneTimePackages: [{ packageId: "tradie-pack", isActive: true, purchaseDate: past() }],
    partnerDiscountQueue: [
      {
        packageId: "tradie-pack",
        packageType: "one-time",
        packageName: "Tradie Pack",
        status: "queued",
        purchaseDate: past(),
        expiryDate: farFuture(),
        queuePosition: 0,
        discountHours: 48,
      },
    ],
    save: async () => {
      saveCalls += 1;
    },
  });
  const body = buildMemberStatusResponse(await reconcilePartnerDiscountAccess(u));
  assert.equal(body.active, true, "stuck queued pack → reconcile promotes → active:true");
  assert.equal(body.member_level, 40, "promoted Tradie Pack → member_level 40");
  assert.ok(body.expires_at, "promoted pack gets a live expires_at");
  assert.equal(saveCalls, 1, "reconcile persists the promotion (best-effort save)");
}

async function testSaveFailureDoesNotBlockAnswer() {
  // N9: the save inside reconcile is best-effort — a write failure must not fail
  // the read; the in-memory-correct answer still goes out.
  const u = asUser({
    oneTimePackages: [{ packageId: "tradie-pack", isActive: true, purchaseDate: past() }],
    partnerDiscountQueue: [
      {
        packageId: "tradie-pack",
        packageType: "one-time",
        packageName: "Tradie Pack",
        status: "queued",
        purchaseDate: past(),
        expiryDate: farFuture(),
        queuePosition: 0,
        discountHours: 48,
      },
    ],
    save: async () => {
      throw new Error("VersionError: simulated __v conflict");
    },
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const body = buildMemberStatusResponse(await reconcilePartnerDiscountAccess(u));
    assert.equal(body.active, true, "save failure still returns the in-memory-correct answer");
    assert.equal(body.member_level, 40, "tier survives the failed save");
  } finally {
    console.error = originalError;
  }
}

function testUnresolvedPlanFailClosed() {
  // Access is live but the plan id resolves to nothing (e.g. a retired pack id with
  // no static package data): fail closed on tier — member_level null, NEVER the
  // "unknown → 100%" fallback — while active stays true.
  const rowEnd = daysFromNow(2);
  const u = asUser({
    oneTimePackages: [],
    partnerDiscountQueue: [
      {
        packageId: "retired-mystery-pack",
        packageType: "one-time",
        packageName: "Retired Pack",
        status: "active",
        startDate: past(),
        endDate: rowEnd,
        purchaseDate: past(),
        expiryDate: farFuture(),
        queuePosition: 0,
        discountHours: 48,
      },
    ],
  });
  const body = buildMemberStatusResponse(buildSsoAccessDecision(u));
  assert.equal(body.active, true, "unresolved plan keeps active:true (access is real)");
  assert.equal(body.member_level, null, "unresolved plan → member_level null (fail-closed, not 100)");
  assert.equal(body.expires_at, rowEnd.toISOString(), "expires_at still reported");
}

function testInactiveMapping() {
  const inactive = buildMemberStatusResponse(
    buildSsoAccessDecision(asUser({ oneTimePackages: [], partnerDiscountQueue: [] }))
  );
  assert.deepEqual(
    inactive,
    { active: false, member_level: null, expires_at: null },
    "no access → all-null inactive shape"
  );
}

async function run() {
  testBearer();
  testValidateMemberId();
  testActiveOneTimePack();
  testSubscriberOnly();
  await testPackAboveSubscriptionThenFallback();
  await testEverythingLapsed();
  await testStuckQueuedItemPromoted();
  await testSaveFailureDoesNotBlockAnswer();
  testUnresolvedPlanFailClosed();
  testInactiveMapping();
  console.log("member-status (iGoDirect member-status API) tests passed");
}

run();
