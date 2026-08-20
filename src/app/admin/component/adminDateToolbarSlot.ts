/**
 * DOM id for the date-filter portal target in the admin header.
 *
 * Renamed from `ADMIN_MOBILE_DATE_TOOLBAR_SLOT_ID` on 2026-08-20: it is no longer mobile-only.
 * Desktop used to render a STICKY bar inside the scroll container instead, which had to paint a
 * backdrop to stop content showing through — and that backdrop covered the rows scrolling behind
 * it. Both breakpoints now portal here, so the filter sits ABOVE the scroll container and is
 * permanently reachable without pinning, without a backdrop, and without taking a band of
 * vertical space off every analytics page.
 */
export const ADMIN_DATE_TOOLBAR_SLOT_ID = "admin-date-toolbar-slot";

/** Tabs that mount the date-filter slot in AdminPage's header. */
export const ADMIN_TABS_WITH_DATE_TOOLBAR = [
  "overview",
  "facebook-ads",
  "promo-analytics",
  "cancellation-flow",
  "repeat-purchases",
  "tiktok-ads",
  "snapchat-ads",
  "all-platforms",
] as const;

export type AdminTabWithDateToolbar = (typeof ADMIN_TABS_WITH_DATE_TOOLBAR)[number];

export function adminTabUsesDateToolbar(tab: string): tab is AdminTabWithDateToolbar {
  return (ADMIN_TABS_WITH_DATE_TOOLBAR as readonly string[]).includes(tab);
}
