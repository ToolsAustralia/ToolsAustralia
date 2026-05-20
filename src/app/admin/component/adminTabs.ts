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
  Bug,
  ClipboardList,
  FileText as FileTextIcon,
  FlaskConical,
  Gift,
  LayoutDashboard,
  LineChart,
  Megaphone,
  ScrollText,
  Settings,
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
      { id: "facebook-ads", label: "Facebook Ads", icon: TrendingUp, requires: "facebookAds.view" },
      { id: "tiktok-ads", label: "TikTok Ads", icon: TrendingUp, requires: "facebookAds.view" },
      { id: "snapchat-ads", label: "Snapchat Ads", icon: TrendingUp, requires: "facebookAds.view" },
      { id: "promo-analytics", label: "Page Analytics", icon: BarChart3, requires: "pageAnalytics.view" },
      { id: "cancellation-flow", label: "Cancellation Flow", icon: BarChart3, requires: "pageAnalytics.view" },
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
      { id: "settings", label: "Settings", icon: Settings, requires: "settings.view" },
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
