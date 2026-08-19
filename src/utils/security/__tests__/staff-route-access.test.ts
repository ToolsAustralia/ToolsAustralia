import assert from "node:assert/strict";
import { isStaffBlockedPath, STAFF_BLOCKED_PREFIXES } from "../staffRouteAccess";

/**
 * Access control, so it gets a test rather than a read-through: this list decides what a team
 * member can open, and a one-line edit silently changes it.
 */

function testPublicDrawPagesAreReachable() {
  // The 2026-08-20 bug. These are PUBLIC pages — a logged-out stranger can read them — yet
  // staff, the people who manage draws, were redirected to /admin. The admin UI links to
  // /mini-draws/<id> from three places, and each one bounced.
  for (const p of [
    "/mini-draws",
    "/mini-draws/69270a7675b42620f342340e",
    "/major-draw",
    "/draw-results",
    "/winners",
  ]) {
    assert.equal(isStaffBlockedPath(p), false, `${p} must be reachable by staff`);
  }
}

function testCustomerStateRoutesStayBlocked() {
  // The rule the list actually encodes: block anything that creates or exposes CUSTOMER state.
  for (const p of [
    "/my-account",
    "/my-account/rewards",
    "/affiliate",
    "/shop",
    "/shop/some-product",
    "/checkout",
    "/purchase-success",
    "/upsell-success",
    "/rewards",
    "/membership",
    "/partner",
  ]) {
    assert.equal(isStaffBlockedPath(p), true, `${p} must stay blocked for staff`);
  }
}

function testBuyingIntoADrawIsStillBlocked() {
  // Viewing a draw is read-only; completing a purchase for one is customer state. The
  // success page must NOT have been unblocked along with the draw pages it sits next to.
  assert.equal(isStaffBlockedPath("/mini-draw-success"), true);
  assert.equal(
    isStaffBlockedPath("/mini-draw-success?session=abc"),
    true,
    "query strings must not slip past the prefix match",
  );
}

function testUnrelatedRoutesAreUntouched() {
  for (const p of ["/", "/admin", "/admin/mini-draws", "/faq", "/contact", "/promotions/ryobi"]) {
    assert.equal(isStaffBlockedPath(p), false, `${p} must not be blocked`);
  }
}

function testListShapeIsSane() {
  // Every entry is an absolute path segment. A bare word (e.g. "mini-draws") would silently
  // never match, and a trailing slash would miss the bare route.
  for (const p of STAFF_BLOCKED_PREFIXES) {
    assert.ok(p.startsWith("/"), `${p} must start with a slash`);
    assert.ok(!p.endsWith("/"), `${p} must not have a trailing slash`);
  }
  assert.equal(
    new Set(STAFF_BLOCKED_PREFIXES).size,
    STAFF_BLOCKED_PREFIXES.length,
    "no duplicate prefixes",
  );
}

function run() {
  testPublicDrawPagesAreReachable();
  testCustomerStateRoutesStayBlocked();
  testBuyingIntoADrawIsStillBlocked();
  testUnrelatedRoutesAreUntouched();
  testListShapeIsSane();
  console.log("staff-route-access tests passed");
}

run();
