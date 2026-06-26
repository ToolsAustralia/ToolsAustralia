/**
 * Tests for the partner SSO access gate (buildSsoAccessDecision).
 *
 * Pure: hand-constructed IUser fixtures; no DB/network. Run: npm run test:sso-access
 * (The reconcile-then-read save path needs a live Mongoose doc and is covered by
 * staging E2E, not here.)
 */
import assert from "node:assert/strict";
import type { IUser } from "@/models/User";
import { buildSsoAccessDecision } from "../sso-access";

const asUser = (o: object): IUser => o as unknown as IUser;
const DAY = 24 * 60 * 60 * 1000;

function testActiveSubscriptionPasses() {
  const user = asUser({ subscription: { packageId: "boss-subscription", isActive: true, startDate: new Date() } });
  const d = buildSsoAccessDecision(user);
  assert.equal(d.hasAccess, true, "active Boss subscriber → hasAccess");
  assert.equal(d.memberLevel?.percent, 100, "active Boss subscriber → tier 100%");
}

function testActiveOneTimePasses() {
  const user = asUser({
    subscription: { isActive: false },
    oneTimePackages: [{ packageId: "boss-pack", isActive: true, purchaseDate: new Date(Date.now() - DAY) }],
    partnerDiscountQueue: [
      {
        packageId: "boss-pack",
        packageName: "Boss Pack",
        packageType: "one-time",
        status: "active",
        endDate: new Date(Date.now() + DAY),
        purchaseDate: new Date(Date.now() - DAY),
      },
    ],
  });
  const d = buildSsoAccessDecision(user);
  assert.equal(d.hasAccess, true, "active one-time Boss Pack → hasAccess");
  assert.equal(d.memberLevel?.percent, 70, "active one-time Boss Pack → tier 70%");
}

function testNoAccessFailsClosed() {
  const user = asUser({ subscription: { isActive: false }, partnerDiscountQueue: [] });
  const d = buildSsoAccessDecision(user);
  assert.equal(d.hasAccess, false, "no access → hasAccess false");
  assert.equal(d.memberLevel, null, "no access → memberLevel null (tier not resolved when denied)");
}

function run() {
  testActiveSubscriptionPasses();
  testActiveOneTimePasses();
  testNoAccessFailsClosed();
  console.log("sso-access (partner SSO gate) tests passed");
}

run();
