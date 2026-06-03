/** DOM id for portal — mobile date strip sits under admin title bar, outside page scroll */
export const ADMIN_MOBILE_DATE_TOOLBAR_SLOT_ID = "admin-mobile-date-toolbar-slot";

/** Tabs that mount the shared slot in AdminPage (below header, lg:hidden row) */
export const ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR = [
  "overview",
  "facebook-ads",
  "promo-analytics",
  "cancellation-flow",
  "tiktok-ads",
  "snapchat-ads",
  "all-platforms",
] as const;

export type AdminTabWithMobileLayoutDate = (typeof ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR)[number];

export function adminTabUsesMobileLayoutDateToolbar(tab: string): tab is AdminTabWithMobileLayoutDate {
  return (ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR as readonly string[]).includes(tab);
}
