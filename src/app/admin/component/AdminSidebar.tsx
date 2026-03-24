"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
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
  LayoutDashboard,
  LineChart,
  Megaphone,
  ClipboardList,
  AlertCircle,
} from "lucide-react";

const ADMIN_CIRCULAR_LOGO = "/images/Tools Australia Logo/Social Media Profile_Black Background.png";

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

const adminTabGroups: Array<{
  id: string;
  label: string;
  groupIcon: React.ComponentType<{ className?: string }>;
  tabs: AdminTab[];
}> = [
  {
    id: "core",
    label: "Core",
    groupIcon: LayoutDashboard,
    tabs: [
      { id: "overview", label: "Overview", icon: BarChart3 },
      { id: "users", label: "Users", icon: Users },
      { id: "affiliates", label: "Affiliates", icon: UserCheck },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    groupIcon: LineChart,
    tabs: [
      { id: "facebook-ads", label: "Facebook Ads", icon: TrendingUp },
      { id: "promo-analytics", label: "Page Analytics", icon: BarChart3 },
      { id: "ab-testing", label: "A/B Testing", icon: FlaskConical },
    ],
  },
  {
    id: "promos",
    label: "Promos",
    groupIcon: Megaphone,
    tabs: [{ id: "promos", label: "Promos", icon: Zap }],
  },
  {
    id: "draws",
    label: "Draws",
    groupIcon: Trophy,
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
    groupIcon: ClipboardList,
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

        <button
          type="button"
          onClick={onNavigateToSite}
          className="group w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-gray-800 rounded-lg border border-gray-200 bg-gray-50/80 hover:border-red-300 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white transition-all duration-200"
        >
          <Home className="w-3.5 h-3.5 shrink-0 text-red-600 group-hover:text-white transition-colors" />
          <span className="group-hover:text-white">View Site</span>
        </button>
      </div>

      {/* Navigation */}
      <div ref={navScrollRef} className="flex-1 overflow-y-auto admin-scrollbar">
        <nav className="px-2 py-3 sm:px-3 space-y-4">
          {adminTabGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            const GroupIcon = group.groupIcon;
            const operationsNeedsAttention = group.id === "operations" && unviewedCount > 0;
            const drawsNeedsAttention = group.id === "draws" && fullCapacityCount > 0;
            return (
              <div key={group.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isExpanded}
                  title={
                    operationsNeedsAttention
                      ? `${unviewedCount} unviewed submission${unviewedCount === 1 ? "" : "s"}`
                      : drawsNeedsAttention
                        ? `${fullCapacityCount} mini draw${fullCapacityCount === 1 ? "" : "s"} at capacity — select winner`
                        : undefined
                  }
                  aria-label={
                    operationsNeedsAttention
                      ? `Operations, ${unviewedCount} unviewed submission${unviewedCount === 1 ? "" : "s"}`
                      : drawsNeedsAttention
                        ? `Draws, ${fullCapacityCount} mini draw${fullCapacityCount === 1 ? "" : "s"} ready to complete`
                        : `${group.label} section`
                  }
                  className="group w-full flex items-center justify-between gap-2 py-2 pl-1 pr-1 text-left rounded-md text-gray-600 hover:text-gray-900 hover:bg-red-50/70 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <GroupIcon className="w-4 h-4 shrink-0 text-red-600" aria-hidden />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 group-hover:text-gray-800 truncate">
                      {group.label}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {operationsNeedsAttention && (
                      <AlertCircle
                        className="w-4 h-4 text-red-600"
                        aria-hidden
                        strokeWidth={2.5}
                      />
                    )}
                    {drawsNeedsAttention && (
                      <AlertCircle
                        className="w-4 h-4 text-amber-500"
                        aria-hidden
                        strokeWidth={2.5}
                      />
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </span>
                </button>
                {isExpanded && (
                  <div className="ml-1.5 pl-2.5 border-l border-red-100 space-y-0.5">
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
                      className={`group w-full flex items-center gap-2 px-2 py-2 text-left text-sm rounded-lg transition-all duration-200 ${
                        isActive
                          ? "bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white shadow-md"
                          : "text-gray-700 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 flex-shrink-0 ${
                          isActive ? "text-white" : "text-gray-500 group-hover:text-white"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className={`font-medium leading-snug ${
                            isActive ? "text-white" : "text-gray-900 group-hover:text-white"
                          }`}
                        >
                          {tab.label}
                        </div>
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
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-red-100 shadow-sm">
            <Image
              src={ADMIN_CIRCULAR_LOGO}
              alt="Tools Australia"
              width={40}
              height={40}
              className="h-full w-full object-cover"
            />
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
