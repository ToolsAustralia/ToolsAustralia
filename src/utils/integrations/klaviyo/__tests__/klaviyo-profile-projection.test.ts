import assert from "node:assert/strict";
import type { IUser } from "@/models/User";
import {
  calculateEntryBreakdown,
  calculateLifetimeValue,
  deriveMembershipLabel,
  deriveNextRenewalLabel,
} from "../klaviyo-helpers";
import { emptyGrantLedger } from "@/utils/payment/payment-event-net-queries";

// A Tradie member who received 150 entries under a 10x promo. The catalogue says 15/month.
// Before this fix the projection returned 15 — verified wrong for 4,904 of 4,904 active
// members in production on 2026-08-26. It must now return what was actually granted.
function testMemberEntriesComeFromLedgerNotCatalogue() {
  const user = {
    subscription: {
      isActive: true,
      packageId: "tradie-subscription",
      startDate: new Date("2026-08-25T22:58:01.902Z"),
      endDate: new Date("2026-09-23T14:00:00.000Z"),
    },
  } as unknown as IUser;

  const ledger = { ...emptyGrantLedger(), memberEntries: 150, netSpend: 20 };
  assert.equal(calculateEntryBreakdown(user, ledger).memberEntries, 150);
  assert.notEqual(calculateEntryBreakdown(user, ledger).memberEntries, 15);
}

function testOtherBucketsPassThroughFromLedger() {
  const user = {} as unknown as IUser;
  const ledger = {
    memberEntries: 1000,
    oneTimeEntries: 30,
    upsellEntries: 60,
    miniDrawEntries: 5,
    netSpend: 126,
  };
  assert.deepEqual(calculateEntryBreakdown(user, ledger), {
    memberEntries: 1000,
    oneTimeEntries: 30,
    upsellEntries: 60,
    miniDrawEntries: 5,
  });
}

// lifetime_value used to gate the subscription portion on `subscription.isActive`, so a
// figure NAMED lifetime collapsed the moment a membership lapsed.
function testLifetimeValueSurvivesALapsedMembership() {
  const lapsed = {
    subscription: { isActive: false, status: "canceled", packageId: "boss-subscription" },
  } as unknown as IUser;

  const ledger = { ...emptyGrantLedger(), memberEntries: 1000, netSpend: 240 };
  assert.equal(calculateLifetimeValue(lapsed, ledger), 240);
}

function testLifetimeValueIsZeroWithNoGrants() {
  const user = { subscription: { isActive: false } } as unknown as IUser;
  assert.equal(calculateLifetimeValue(user, emptyGrantLedger()), 0);
}

// A member with no ledger rows at all (nothing paid yet) must project zeros, not throw.
function testNoGrantsProjectsZeros() {
  const user = {
    subscription: { isActive: true, packageId: "boss-subscription", startDate: new Date() },
  } as unknown as IUser;
  assert.deepEqual(calculateEntryBreakdown(user, emptyGrantLedger()), {
    memberEntries: 0,
    oneTimeEntries: 0,
    upsellEntries: 0,
    miniDrawEntries: 0,
  });
}

// ---------------------------------------------------------------------------
// Display-ready labels. These exist because a Klaviyo merge tag prints a value
// verbatim and the drag-and-drop editor cannot map, format, or hide it — so every
// branch below is what a real member reads in an email.
// ---------------------------------------------------------------------------

function member(overrides: Record<string, unknown>): IUser {
  return { subscription: { ...overrides } } as unknown as IUser;
}

// THE REASON THIS LABEL EXISTS. Renewals anchor to day 24 and store as 14:00Z, which is
// the NEXT day in Sydney. Formatting in UTC would name the 23rd while the charge lands on
// the 24th. If date-fns-tz or AEST_TIMEZONE ever changes, this is the assertion that fails.
function testRenewalLabelUsesAESTNotUTC() {
  const user = member({
    isActive: true,
    autoRenew: true,
    status: "active",
    endDate: new Date("2026-09-23T14:00:00.000Z"),
  });
  assert.equal(deriveNextRenewalLabel(user, "active"), "24 September 2026");
  assert.notEqual(deriveNextRenewalLabel(user, "active"), "23 September 2026");
}

// A past-due member is NOT someone who turned auto-renew off — Stripe is still retrying,
// and sync-klaviyo-past-due-profiles.ts pushes this cohort so a recovery flow can email
// them. "Auto-renew off" would contradict that email.
function testPastDueIsNotAutoRenewOff() {
  const user = member({ isActive: false, autoRenew: true, status: "past_due" });
  assert.equal(deriveNextRenewalLabel(user, "past_due"), "Payment retrying");
}

// /api/stripe/update-auto-renew clears endDate when a member RE-ENABLES auto-renew and
// syncs on the next line. Reporting "Auto-renew off" there tells them the opposite of what
// they just did, so an unknown date must read as pending, not off.
function testAutoRenewOnWithNoDateIsPendingNotOff() {
  const user = member({ isActive: true, autoRenew: true, status: "active", endDate: undefined });
  assert.equal(deriveNextRenewalLabel(user, "active"), "Renewal date pending");
}

// formatInTimeZone throws RangeError on an unparseable date. A throw here is classified
// retryable, which HOLDS the reconciliation cursor and freezes the sweep for every user —
// the 2026-08-27 production incident. It must degrade, never throw.
function testUnparseableDateDegradesInsteadOfThrowing() {
  const user = member({
    isActive: true,
    autoRenew: true,
    status: "active",
    endDate: new Date("not-a-date"),
  });
  assert.doesNotThrow(() => deriveNextRenewalLabel(user, "active"));
  assert.equal(deriveNextRenewalLabel(user, "active"), "Renewal date pending");
}

function testAutoRenewOffSaysSo() {
  const user = member({ isActive: true, autoRenew: false, status: "active" });
  assert.equal(deriveNextRenewalLabel(user, "active"), "Auto-renew off");
}

// The id -> name mapping the Klaviyo editor cannot do. Before this, members read
// "Tier: tradie-subscription".
function testMembershipLabelMapsIdToPhrase() {
  assert.equal(deriveMembershipLabel(member({ packageId: "tradie-subscription" }), "active"), "Tradie Member");
  assert.equal(deriveMembershipLabel(member({ packageId: "foreman-subscription" }), "active"), "Foreman Member");
  assert.equal(deriveMembershipLabel(member({ packageId: "boss-subscription" }), "active"), "Boss Member");
}

// Klaviyo MERGES on upsert — an omitted property keeps its old value, so a lapsed member
// would read "Boss Member" forever. Every branch must return a string that overwrites.
function testMembershipLabelIsAlwaysPopulated() {
  assert.equal(deriveMembershipLabel(member({ packageId: undefined }), "active"), "Not a member");
  assert.equal(deriveMembershipLabel(member({ packageId: null }), "active"), "Not a member");
  assert.equal(deriveMembershipLabel({} as unknown as IUser, "never_subscribed"), "Not a member");
}

// FOUND IN PRODUCTION, not by a unit test: a lapsed profile keeps its packageId, so gating
// on the id alone told a never_subscribed user they were a "Foreman Member".
function testLapsedMemberIsNotStillATier() {
  const lapsed = member({ isActive: false, packageId: "foreman-subscription" });
  assert.equal(deriveMembershipLabel(lapsed, "never_subscribed"), "Not a member");
  assert.equal(deriveMembershipLabel(lapsed, "canceled"), "Not a member");
  // past_due and paused ARE still members — access continues — so they keep the tier.
  assert.equal(deriveMembershipLabel(lapsed, "past_due"), "Foreman Member");
  assert.equal(deriveMembershipLabel(lapsed, "paused"), "Foreman Member");
}

function run() {
  testMemberEntriesComeFromLedgerNotCatalogue();
  testOtherBucketsPassThroughFromLedger();
  testLifetimeValueSurvivesALapsedMembership();
  testLifetimeValueIsZeroWithNoGrants();
  testNoGrantsProjectsZeros();
  testRenewalLabelUsesAESTNotUTC();
  testPastDueIsNotAutoRenewOff();
  testAutoRenewOnWithNoDateIsPendingNotOff();
  testUnparseableDateDegradesInsteadOfThrowing();
  testAutoRenewOffSaysSo();
  testMembershipLabelMapsIdToPhrase();
  testMembershipLabelIsAlwaysPopulated();
  testLapsedMemberIsNotStillATier();
  console.log("klaviyo-profile-projection tests passed");
}

run();
