/**
 * Which customer routes a STAFF account may not load.
 *
 * Staff accounts are not customer accounts, so `src/middleware.ts` redirects a staff user off
 * these to /admin. Extracted from the middleware as a pure predicate so the rule is unit-testable
 * — it is access control, and a one-line edit to the array silently changes who can see what.
 *
 * ── The line this draws ───────────────────────────────────────────────────────────────────
 *
 * Block a route when visiting it would CREATE OR EXPOSE CUSTOMER STATE: an account surface, a
 * purchase flow, or a post-purchase confirmation.
 *
 * Do NOT block a route merely because it lives outside /admin. The public, read-only draw pages
 * are the case that got this wrong: `/mini-draws` and `/major-draw` were on the list until
 * 2026-08-20, which meant the people who MANAGE draws were the only ones who could not look at
 * one — while any logged-out stranger could. The admin UI links to `/mini-draws/<id>` from three
 * places (`MiniDrawCard`'s "Open the public mini-draw page", the activity log, and the Overview
 * activity card) and every one of them bounced a staff user to /admin. `/draw-results` and
 * `/winners` — the same category — were never blocked, so the list was also inconsistent with
 * itself.
 *
 * `/mini-draw-success` stays blocked: viewing a draw is read-only, buying into one is not.
 *
 * ⚠️ **This list is not a purchase guard, and must not be used as one.** `/mini-draws/<id>`
 * renders a working buy widget, and `POST /api/mini-draw/purchase` only ever checked that the
 * caller was authenticated. Blocking the page used to prevent a staff purchase as a SIDE EFFECT;
 * taking it off this list removed that accident, so the real guard now lives at the endpoint —
 * `isEmployeeAccount` in `src/utils/giveaway-eligibility.ts`, per Terms §5.5 (employees are
 * ineligible to win). Any future route that comes off this list needs the same question asked:
 * what did the block incidentally prevent?
 *
 * ⚠️ `userType: "admin"` is NOT subject to this list — only `"staff"`. That is why the original
 * bug was invisible to an owner account and only ever hit team members. The PURCHASE guard
 * covers both, because the terms exclusion covers both.
 */
export const STAFF_BLOCKED_PREFIXES = [
  "/my-account",
  "/affiliate",
  "/shop",
  "/checkout",
  "/purchase-success",
  "/mini-draw-success",
  "/upsell-success",
  "/rewards",
  "/membership",
  "/partner",
] as const;

/**
 * True when a staff user loading `pathname` should be redirected to /admin.
 *
 * Prefix match, matching the middleware's original `startsWith` semantics — so `/shop/anything`
 * is blocked along with `/shop`. Note this means a blocked prefix also catches any longer path
 * that merely starts with the same characters; every entry above is a full path segment, so that
 * is currently harmless.
 */
export function isStaffBlockedPath(pathname: string): boolean {
  return STAFF_BLOCKED_PREFIXES.some((p) => pathname.startsWith(p));
}
