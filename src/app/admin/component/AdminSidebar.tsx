"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  Trophy,
  Settings,
  Shield,
  LogOut,
  Home,
  Activity,
  Crown,
  X,
  Gift,
  FileText as FileTextIcon,
  Users,
  Zap,
  UserCheck,
  TrendingUp,
  FlaskConical,
  Bug,
  ScrollText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface AdminSidebarProps {
  selectedTab: string;
  onNavigateToSite: () => void;
  user: {
    name: string;
    email: string;
    role: string;
    avatar?: string;
  };
  isMobile?: boolean;
  onClose?: () => void;
}

type AdminTab = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const adminTabGroups: Array<{ id: string; label: string; tabs: AdminTab[] }> = [
  {
    id: "core",
    label: "Core",
    tabs: [
      { id: "overview", label: "Overview", icon: BarChart3 },
      { id: "users", label: "Users", icon: Users },
      { id: "affiliates", label: "Affiliates", icon: UserCheck },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    tabs: [
      { id: "facebook-ads", label: "Facebook Ads", icon: TrendingUp },
      { id: "promo-analytics", label: "Page Analytics", icon: BarChart3 },
      { id: "ab-testing", label: "A/B Testing", icon: FlaskConical },
    ],
  },
  {
    id: "promos",
    label: "Promos",
    tabs: [{ id: "promos", label: "Promos", icon: Zap }],
  },
  {
    id: "draws",
    label: "Draws",
    tabs: [
      { id: "major-draw", label: "Major Draw", icon: Gift },
      { id: "mini-draws", label: "Mini Draws", icon: Trophy },
      { id: "draw-results", label: "Draw Results", icon: Trophy },
      { id: "upcoming-draws", label: "Upcoming Draws", icon: Activity },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    tabs: [
      { id: "submissions", label: "Submissions", icon: FileTextIcon },
      { id: "error-reports", label: "Error Reports", icon: Bug },
      { id: "activity-log", label: "Activity Log", icon: ScrollText },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function AdminSidebar({
  selectedTab: _selectedTab,
  onNavigateToSite,
  user,
  isMobile = false,
  onClose,
}: AdminSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [unviewedCount, setUnviewedCount] = useState(0);
  const [fullCapacityCount, setFullCapacityCount] = useState(0);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activeTabId =
    pathname === "/admin" || pathname === "/admin/"
      ? "overview"
      : pathname.replace("/admin/", "").split("?")[0].split("/")[0];
  const activeGroupId = adminTabGroups.find((g) => g.tabs.some((t) => t.id === activeTabId))?.id ?? "core";

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set([activeGroupId]);
    try {
      const saved = sessionStorage.getItem("admin-sidebar-expanded");
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        return new Set(parsed.length > 0 ? parsed : [activeGroupId]);
      }
    } catch {
      /* ignore */
    }
    return new Set([activeGroupId]);
  });

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (!next.has(activeGroupId)) next.add(activeGroupId);
      return next;
    });
  }, [activeGroupId]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      try {
        sessionStorage.setItem("admin-sidebar-expanded", JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    const scrollContainer = navScrollRef.current;
    if (!scrollContainer) return;

    const savedScrollTop = sessionStorage.getItem("admin-sidebar-scroll-top");
    if (savedScrollTop) {
      scrollContainer.scrollTop = Number(savedScrollTop);
    }

    const handleScroll = () => {
      sessionStorage.setItem("admin-sidebar-scroll-top", String(scrollContainer.scrollTop));
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const tabId =
      pathname === "/admin" || pathname === "/admin/"
        ? "overview"
        : pathname.replace("/admin/", "").split("?")[0].split("/")[0];
    const activeTabButton = tabButtonRefs.current[tabId];
    activeTabButton?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [pathname]);

  useEffect(() => {
    const fetchUnviewed = async () => {
      try {
        const res = await fetch("/api/admin/submissions/unviewed-count");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            setUnviewedCount(data.data.total || 0);
          }
        }
      } catch {
        // Ignore errors
      }
    };
    const fetchFullCapacity = async () => {
      try {
        const res = await fetch("/api/admin/mini-draw/full-capacity-count");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            setFullCapacityCount(data.data.count ?? 0);
          }
        }
      } catch {
        // Ignore errors
      }
    };

    fetchUnviewed();
    fetchFullCapacity();
    const interval = setInterval(() => {
      fetchUnviewed();
      fetchFullCapacity();
    }, 60000); // Refresh every minute
    const onSubmissionsUpdated = () => fetchUnviewed();
    const onMiniDrawsUpdated = () => fetchFullCapacity();
    window.addEventListener("admin-submissions-updated", onSubmissionsUpdated);
    window.addEventListener("admin-mini-draws-updated", onMiniDrawsUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener("admin-submissions-updated", onSubmissionsUpdated);
      window.removeEventListener("admin-mini-draws-updated", onMiniDrawsUpdated);
    };
  }, []);

  const handleSignOut = () => {
    // Clear localStorage when signing out
    localStorage.removeItem("wasAuthenticated");
    localStorage.removeItem("topBarHidden");
    // Sign out and redirect to home page
    signOut({ callbackUrl: "/" });
  };

  const handleTabChange = (tabId: string) => {
    // Close mobile sidebar if open
    if (isMobile && onClose) {
      onClose();
    }
    // Preserve URL query parameters when navigating between tabs
    const currentSearchParams = new URLSearchParams(window.location.search);
    const queryString = currentSearchParams.toString();
    const queryParam = queryString ? `?${queryString}` : "";
    
    // Navigate to the tab route while preserving query params
    if (tabId === "overview") {
      router.push(`/admin${queryParam}`);
    } else {
      router.push(`/admin/${tabId}${queryParam}`);
    }
  };

  return (
    <div className="w-full h-full bg-white border-r-2 border-red-100 flex flex-col shadow-lg">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-[#ee0000] to-[#ff4444] rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-sm text-gray-600">Tools Australia</p>
            </div>
          </div>

          {/* Mobile Close Button */}
          {isMobile && onClose && (
            <button
              onClick={onClose}
              className="lg:hidden w-10 h-10 text-gray-500 hover:text-white hover:bg-gradient-to-br hover:from-red-600 hover:to-red-700 rounded-full transition-all duration-200 flex items-center justify-center"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Quick Actions - Side by side layout */}
        <div className="flex justify-between gap-2">
          <button
            onClick={onNavigateToSite}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white rounded-lg transition-all duration-200"
          >
            <Home className="w-4 h-4" />
            View Site
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white rounded-lg transition-all duration-200">
            <Activity className="w-4 h-4" />
            Live Activity
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div ref={navScrollRef} className="flex-1 overflow-y-auto">
        <nav className="p-4 space-y-4">
          {adminTabGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            return (
              <div key={group.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-2 text-left rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    {group.label}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                </button>
                {isExpanded && (
                  <div className="space-y-1 pl-1">
                    {group.tabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive =
                        (tab.id === "overview" && (pathname === "/admin" || pathname === "/admin/")) ||
                        (tab.id !== "overview" && (pathname === `/admin/${tab.id}` || pathname.startsWith(`/admin/${tab.id}?`)));

                      return (
                    <button
                      key={tab.id}
                      ref={(element) => {
                        tabButtonRefs.current[tab.id] = element;
                      }}
                      onClick={() => handleTabChange(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 text-left rounded-xl transition-all duration-200 ${
                        isActive
                          ? "bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white shadow-lg"
                          : "text-gray-700 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white"
                      }`}
                    >
                      <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-white" : "text-gray-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium ${isActive ? "text-white" : "text-gray-900"}`}>{tab.label}</div>
                      </div>
                      {tab.id === "submissions" && unviewedCount > 0 && (
                        <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                          {unviewedCount > 99 ? "99+" : unviewedCount}
                        </span>
                      )}
                      {tab.id === "mini-draws" && fullCapacityCount > 0 && (
                        <span
                          className="flex-shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold"
                          title={`${fullCapacityCount} mini draw(s) at 100% - select winner`}
                        >
                          {fullCapacityCount > 99 ? "99+" : fullCapacityCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            </div>
          );
          })}
        </nav>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-gradient-to-r from-[#ee0000] to-[#ff4444] rounded-full flex items-center justify-center text-white font-bold">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 truncate">{user.name}</div>

            <div className="flex items-center gap-1 mt-1">
              <Crown className="w-3 h-3 text-yellow-500" />
              <span className="text-xs font-medium text-gray-600 capitalize">{user.role}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white rounded-lg transition-all duration-200"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
