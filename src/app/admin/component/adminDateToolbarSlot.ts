/**
 * DOM id for the portal target that holds a tab's date-range control.
 *
 * The slot lives in the admin header (`AdminPage.tsx`), which sits ABOVE the scroll container —
 * so anything portalled into it stays visible at every scroll position for free, at every
 * breakpoint. Desktop used to keep the control inside the scrolling area instead (either
 * `position: sticky`, which floated it over the cards, or parked beside a section heading, which
 * scrolled it away entirely); both are gone.
 *
 * The id string still says "mobile" from when the slot was mobile-only. It is an internal DOM id
 * with no external consumers, and renaming it buys nothing but a chance to miss a reference.
 */
export const ADMIN_DATE_TOOLBAR_SLOT_ID = "admin-mobile-date-toolbar-slot";

/** Tabs that mount the shared header slot in AdminPage. A tab NOT listed here renders its date
 *  control inline instead — `slotEl` resolves to null and every consumer falls back. */
export const ADMIN_TABS_WITH_LAYOUT_DATE_TOOLBAR = [
  "overview",
  "facebook-ads",
  "promo-analytics",
  "cancellation-flow",
  "repeat-purchases",
  "tiktok-ads",
  "snapchat-ads",
  "all-platforms",
  // Billing tabs — these render their own date control and were previously inline-only.
  "receipts",
  "blocked-transactions",
  "past-due-history",
] as const;

export type AdminTabWithLayoutDate = (typeof ADMIN_TABS_WITH_LAYOUT_DATE_TOOLBAR)[number];

export function adminTabUsesLayoutDateToolbar(tab: string): tab is AdminTabWithLayoutDate {
  return (ADMIN_TABS_WITH_LAYOUT_DATE_TOOLBAR as readonly string[]).includes(tab);
}
