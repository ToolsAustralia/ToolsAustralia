/**
 * Tests for the partner SSO access gate (buildSsoAccessDecision).
 *
 * Pure: hand-constructed IUser fixtures; no DB/network. Run: npm run test:sso-access
 * (The reconcile-then-read save path needs a live Mongoose doc and is covered by
 * staging E2E, not here.)
 */
import assert from "node:assert/strict";
import type { IUser } from "@/models/User";
import { buildSsoAccessDecision, PARTNER_SSO_ERRORS } from "../sso-access";

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

/**
 * The SSO failure strings are rendered VERBATIM to members (panel F-044). Nothing else
 * pins them: the route is a Next handler, the hook fallback is inline in a fetch wrapper,
 * and both render sites sit behind conditionals. Without this, a refactor reverting one
 * to "Forbidden" — the exact regression F-014 fixed — would pass every gate.
 */
function testErrorCopyIsCustomerFacing(): void {
  const BANNED: Array<[RegExp, string]> = [
    [/forbidden/i, "HTTP status name"],
    [/unauthori[sz]ed/i, "HTTP status name"],
    [/\b[45]\d\d\b/, "raw status code"],
    [/internal server/i, "server-speak"],
    [/\bnull\b|undefined/i, "leaked value"],
    // CLAUDE.md rule 11 — these strings are customer-facing copy like any other.
    [/\bodds\b|lotter|raffle|sweepstake|gambl|\bwager\b/i, "rule-11 banned vocabulary"],
  ];
  const entries = Object.entries(PARTNER_SSO_ERRORS);
  // 7 since 2026-07-31: `consentRequired` (409) joined when the consent gate landed.
  assert.equal(entries.length, 7, "all seven failure paths must have copy");
  for (const [key, msg] of entries) {
    for (const [rx, why] of BANNED) {
      assert.ok(!rx.test(msg), `PARTNER_SSO_ERRORS.${key} leaks ${why}: "${msg}"`);
    }
    assert.ok(/[.!]$/.test(msg), `PARTNER_SSO_ERRORS.${key} must be a full sentence: "${msg}"`);
    assert.ok(msg.length >= 25, `PARTNER_SSO_ERRORS.${key} is too terse to help: "${msg}"`);
    assert.ok(
      /partner (portal|access)/i.test(msg) || key === "rateLimited",
      `PARTNER_SSO_ERRORS.${key} should name the partner portal/access so the member knows what failed`
    );
  }
  // The 403 must stay surface-neutral: it also renders ON the Rewards page, so telling
  // members to go there would loop them back to where they already are (F-048).
  assert.ok(
    !/my account\s*→\s*rewards/i.test(PARTNER_SSO_ERRORS.noAccess),
    "the no-access string must not point at a page it can itself be rendered on"
  );
}

function run() {
  testActiveSubscriptionPasses();
  testActiveOneTimePasses();
  testNoAccessFailsClosed();
  testErrorCopyIsCustomerFacing();
  console.log("sso-access (partner SSO gate) tests passed");
}

run();
