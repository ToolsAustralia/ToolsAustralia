import assert from "node:assert/strict";
import type { IUser } from "@/models/User";
import { calculateEntryBreakdown, calculateLifetimeValue } from "../klaviyo-helpers";
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

function run() {
  testMemberEntriesComeFromLedgerNotCatalogue();
  testOtherBucketsPassThroughFromLedger();
  testLifetimeValueSurvivesALapsedMembership();
  testLifetimeValueIsZeroWithNoGrants();
  testNoGrantsProjectsZeros();
  console.log("klaviyo-profile-projection tests passed");
}

run();
