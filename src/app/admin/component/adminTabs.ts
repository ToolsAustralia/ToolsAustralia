/**
 * Single source of truth for the admin sidebar's tab list.
 *
 * - AdminSidebar renders it (filtering by `usePermissions().has(t.requires)`).
 * - /admin/page.tsx uses it to redirect a freshly-logged-in user to their
 *   first accessible tab when they don't have `overview.view`.
 *
 * Adding a tab here adds it to the sidebar AND makes it eligible as the
 * landing tab for users whose role grants it. Keep `requires` in lockstep
 * with the route handler's `requirePermission(...)` call.
 */
import type { ComponentType } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Bot,
  Bug,
  ClipboardList,
  FileText as FileTextIcon,
  Gauge,
  FlaskConical,
  Gift,
  Layers,
  LayoutDashboard,
  LineChart,
  Mail,
  Package,
  Megaphone,
  MessageSquare,
  Repeat,
  ScrollText,
  Shield,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export interface AdminTab {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Permission string from src/lib/permissions.ts that grants access to this tab. */
  requires: Permission;
}

export interface AdminTabGroup {
  id: string;
  label: string;
  groupIcon: ComponentType<{ className?: string }>;
  tabs: AdminTab[];
}

export const ADMIN_TAB_GROUPS: AdminTabGroup[] = [
  {
    id: "core",
    label: "Core",
    groupIcon: LayoutDashboard,
    tabs: [
      { id: "overview", label: "Overview", icon: BarChart3, requires: "overview.view" },
      { id: "users", label: "Users", icon: Users, requires: "users.view" },
      { id: "affiliates", label: "Affiliates", icon: UserCheck, requires: "affiliates.view" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    groupIcon: LineChart,
    tabs: [
      { id: "all-platforms", label: "All Platforms", icon: Layers, requires: "facebookAds.view" },
      { id: "facebook-ads", label: "Facebook Ads", icon: TrendingUp, requires: "facebookAds.view" },
      { id: "tiktok-ads", label: "TikTok Ads", icon: TrendingUp, requires: "facebookAds.view" },
      { id: "snapchat-ads", label: "Snapchat Ads", icon: TrendingUp, requires: "facebookAds.view" },
      { id: "klaviyo", label: "Klaviyo", icon: Mail, requires: "facebookAds.view" },
      { id: "promo-analytics", label: "Page Analytics", icon: BarChart3, requires: "pageAnalytics.view" },
      { id: "cancellation-flow", label: "Cancellation Flow", icon: BarChart3, requires: "pageAnalytics.view" },
      { id: "repeat-purchases", label: "Repeat Purchases", icon: Repeat, requires: "pageAnalytics.view" },
      { id: "ab-testing", label: "A/B Testing", icon: FlaskConical, requires: "abTesting.view" },
    ],
  },
  {
    id: "promos",
    label: "Promos",
    groupIcon: Megaphone,
    tabs: [{ id: "promos", label: "Promos", icon: Zap, requires: "promos.view" }],
  },
  {
    id: "draws",
    label: "Draws",
    groupIcon: Trophy,
    tabs: [
      { id: "major-draw", label: "Major Draw", icon: Gift, requires: "majorDraw.view" },
      { id: "mini-draws", label: "Mini Draws", icon: Trophy, requires: "miniDraws.view" },
      { id: "draw-results", label: "Draw Results", icon: Trophy, requires: "drawResults.view" },
      { id: "upcoming-draws", label: "Upcoming Draws", icon: Activity, requires: "upcomingDraws.view" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    groupIcon: ClipboardList,
    tabs: [
      { id: "submissions", label: "Submissions", icon: FileTextIcon, requires: "submissions.view" },
      { id: "error-reports", label: "Error Reports", icon: Bug, requires: "errorReports.view" },
      { id: "activity-log", label: "Activity Log", icon: ScrollText, requires: "settings.view" },
    ],
  },
  // Shop is its own group rather than one crowded Operations tab. The single
  // Products page had grown to five panels — printer sync, catalogue, the entry
  // multiplier, the fulfilment queue and the full order history — which is a lot
  // of unrelated work stacked in one scroll. Splitting by JOB (stock it / ship
  // it / tune what it grants) also lets each page grow without crowding the
  // others.
  //
  // `products` keeps its id: it is an existing URL and permission pairing, and
  // renaming it would break bookmarks for no benefit.
  {
    id: "shop",
    label: "Shop",
    groupIcon: ShoppingBag,
    tabs: [
      { id: "products", label: "Products", icon: Package, requires: "shop.view" },
      { id: "shop-orders", label: "Orders", icon: ShoppingCart, requires: "shop.view" },
      { id: "shop-multipliers", label: "Entry Multipliers", icon: Gauge, requires: "shop.view" },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    groupIcon: AlertCircle,
    tabs: [
      { id: "blocked-transactions", label: "Blocked Transactions", icon: AlertCircle, requires: "settings.view" },
      { id: "past-due-history", label: "Past-Due Charges", icon: ScrollText, requires: "settings.view" },
      { id: "stripe-webhook-queue", label: "Webhook Queue", icon: Activity, requires: "settings.view" },
    ],
  },
  // Team lives in its own group at the bottom of the sidebar so the owner can
  // grow it (API keys, integrations, audit) without crowding day-to-day tabs.
  // The Team page hosts three sub-tabs: Staff, Roles, Logs (audit trail).
  // `requires: "settings.view"` covers Staff/Roles; the in-page Logs sub-tab
  // additionally requires `audit.view` and is hidden when absent.
  // Chatbot (Cobber) sits here too — it's an internal AI surface like Norm
  // (availability toggle + cost/usage). Its own `overview.view` gate is kept, so
  // it may show to a viewer who can't see Staff/Roles.
  {
    id: "team",
    label: "Team",
    groupIcon: Shield,
    tabs: [
      { id: "team", label: "Team", icon: Shield, requires: "settings.view" },
      { id: "norm", label: "Norm", icon: Bot, requires: "settings.view" },
      { id: "chatbot", label: "Chatbot", icon: MessageSquare, requires: "overview.view" },
    ],
  },
];

/**
 * Returns the id of the first tab the caller has permission to view, scanning
 * groups + tabs in declaration order. Returns null if the caller has access to
 * no tabs at all (an inconsistent role — every internal user should at least
 * see Settings if `settings.view` is granted, or some other view permission).
 */
export function firstAccessibleTabId(
  hasPermission: (perm: string) => boolean
): string | null {
  for (const group of ADMIN_TAB_GROUPS) {
    for (const tab of group.tabs) {
      if (hasPermission(tab.requires)) return tab.id;
    }
  }
  return null;
}

/**
 * The display label for a tab id — the SAME string the sidebar renders.
 *
 * The page header used to re-derive its title from the slug
 * (`selectedTab.replace("-", " ")` + CSS `capitalize`), which mangles any label whose
 * casing isn't title-case-per-word: `tiktok-ads` became "Tiktok Ads" while the sidebar
 * two inches away said "TikTok Ads" (panel F-018). Brand names are not derivable from
 * slugs — read the label instead of recomputing it.
 *
 * Falls back to the old slug transform for ids that have no tab entry (e.g. views
 * reachable only by deep link).
 */
export function adminTabLabel(tabId: string): string {
  for (const group of ADMIN_TAB_GROUPS) {
    const tab = group.tabs.find((t) => t.id === tabId);
    if (tab) return tab.label;
  }
  return tabId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
