import assert from "node:assert/strict";
import type { IUser } from "@/models/User";
import { getRenewalEntriesPreviewForProfile, isSubscriptionRecoveryStatus } from "../klaviyo-renewal-entries-preview";

function testRecoveryStatus() {
  assert.equal(isSubscriptionRecoveryStatus("past_due"), true);
  assert.equal(isSubscriptionRecoveryStatus("unpaid"), true);
  assert.equal(isSubscriptionRecoveryStatus("active"), false);
  assert.equal(isSubscriptionRecoveryStatus(undefined), false);
}

function testPreviewPastDueWithPackage() {
  const user = {
    subscription: {
      status: "past_due",
      packageId: "tradie-subscription",
      lastMonthAccumulatedEntries: 1000,
    },
  } as unknown as IUser;

  assert.equal(getRenewalEntriesPreviewForProfile(user), 1015);
}

function testPreviewNullWhenNotRecovery() {
  const user = {
    subscription: {
      status: "active",
      packageId: "tradie-subscription",
      lastMonthAccumulatedEntries: 1000,
    },
  } as unknown as IUser;

  assert.equal(getRenewalEntriesPreviewForProfile(user), null);
}

function testPreviewNullMissingPackage() {
  const user = {
    subscription: {
      status: "past_due",
      packageId: "",
    },
  } as unknown as IUser;

  assert.equal(getRenewalEntriesPreviewForProfile(user), null);
}

function run() {
  testRecoveryStatus();
  testPreviewPastDueWithPackage();
  testPreviewNullWhenNotRecovery();
  testPreviewNullMissingPackage();
  console.log("klaviyo-renewal-entries-preview tests passed");
}

run();
