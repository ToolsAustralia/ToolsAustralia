"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { totalSignOut } from "@/utils/auth/total-sign-out";
import { usePermissions } from "@/hooks/usePermissions";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Home,
  LogOut,
  Shield,
  X,
} from "lucide-react";
import { ADMIN_TAB_GROUPS } from "./adminTabs";

const ADMIN_CIRCULAR_LOGO = "/images/Tools Australia Logo/Social Media Profile_Black Background.webp";

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
  /** Desktop icon-rail mode. Owned by AdminPage, which also sets the wrapper width.
   *  Never passed by the mobile drawer — a hover flyout is a dead control on touch. */
  collapsed?: boolean;
  /** Renders the collapse toggle when provided. Absent → no toggle (mobile drawer). */
  onToggleCollapsed?: () => void;
}

const adminTabGroups = ADMIN_TAB_GROUPS;

export default function AdminSidebar({
  selectedTab: _selectedTab,
  onNavigateToSite,
  user,
  isMobile = false,
  onClose,
  collapsed = false,
  onToggleCollapsed,
}: AdminSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { has } = usePermissions();
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
    // Total sign-out: clears user-scoped client storage (incl. chat history), then ends the session.
    void totalSignOut({ callbackUrl: "/" });
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

  const isTabActive = (tabId: string) =>
    (tabId === "overview" && (pathname === "/admin" || pathname === "/admin/")) ||
    (tabId !== "overview" && (pathname === `/admin/${tabId}` || pathname.startsWith(`/admin/${tabId}?`)));

  /**
   * One tab row. Shared by the expanded nav and the collapsed rail's flyout so the two can
   * never drift in styling or badge behaviour.
   *
   * `attachRef` is false inside a flyout: `tabButtonRefs` drives the scrollIntoView that keeps
   * the active tab visible in the expanded nav, and a hidden flyout would otherwise overwrite
   * that ref with an element that is never scrollable.
   */
  const renderTabButton = (tab: (typeof adminTabGroups)[number]["tabs"][number], attachRef: boolean) => {
    const Icon = tab.icon;
    const isActive = isTabActive(tab.id);
    return (
      <button
        key={tab.id}
        ref={
          attachRef
            ? (element) => {
                tabButtonRefs.current[tab.id] = element;
              }
            : undefined
        }
        onClick={() => handleTabChange(tab.id)}
        className={`group w-full flex items-center gap-2 px-2 py-2 text-left text-sm rounded-lg transition-all duration-200 ${
          isActive
            ? "bg-gradient-to-r from-red-600 to-red-400 text-white shadow-md"
            : "text-gray-700 dark:text-neutral-300 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
        }`}
      >
        <Icon
          className={`w-4 h-4 flex-shrink-0 ${
            isActive ? "text-white" : "text-gray-500 dark:text-neutral-400 group-hover:text-white"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div
            className={`font-medium leading-snug ${
              isActive ? "text-white" : "text-gray-900 dark:text-white group-hover:text-white"
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
  };

  return (
    <div className="relative w-full h-full bg-white dark:bg-neutral-900 border-r-2 border-red-100 dark:border-red-900/40 flex flex-col shadow-lg">
      {/* Collapse toggle — desktop only (AdminPage passes the handler; the mobile drawer does not) */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute top-[4.2rem] -right-[11px] z-40 w-[22px] h-[22px] rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-500 dark:text-neutral-400 hover:text-red-600 hover:border-red-300 shadow-md flex items-center justify-center transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" strokeWidth={3} />
          ) : (
            <ChevronLeft className="w-3 h-3" strokeWidth={3} />
          )}
        </button>
      )}
      {/* Header */}
      <div className={`border-b border-gray-200 dark:border-neutral-800 ${collapsed ? "px-2 py-4" : "p-4 sm:p-6"}`}>
        <div className={`flex items-center justify-between ${collapsed ? "mb-3" : "mb-4"}`}>
          <div className={`flex items-center gap-3 ${collapsed ? "w-full justify-center" : ""}`}>
            <div className="w-10 h-10 shrink-0 bg-gradient-to-r from-red-600 to-red-400 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            {!collapsed && (
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
                <p className="text-sm text-gray-600 dark:text-neutral-400">Tools Australia</p>
              </div>
            )}
          </div>

          {/* Mobile Close Button */}
          {isMobile && onClose && (
            <button
              onClick={onClose}
              className="lg:hidden w-10 h-10 text-gray-500 dark:text-neutral-400 hover:text-white hover:bg-gradient-to-br hover:from-red-600 hover:to-red-700 rounded-full transition-all duration-200 flex items-center justify-center"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onNavigateToSite}
          title={collapsed ? "View Site" : undefined}
          aria-label={collapsed ? "View Site" : undefined}
          className={`group w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-gray-800 dark:text-neutral-200 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/80 dark:bg-neutral-800/80 hover:border-red-300 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white transition-all duration-200 ${
            collapsed ? "px-0" : "px-3"
          }`}
        >
          <Home className="w-3.5 h-3.5 shrink-0 text-red-600 group-hover:text-white transition-colors" />
          {!collapsed && <span className="group-hover:text-white">View Site</span>}
        </button>
      </div>

      {/* Navigation.
          Collapsed drops `overflow-y-auto`: a scroll container CLIPS the absolutely-positioned
          flyouts, which then render but are invisible — no error, nothing in the console. Eight
          group icons fit any lg viewport, so there is nothing to scroll anyway. */}
      <div
        ref={navScrollRef}
        className={`flex-1 ${collapsed ? "overflow-visible" : "overflow-y-auto admin-scrollbar"}`}
      >
        <nav className={`py-3 space-y-4 ${collapsed ? "px-1.5" : "px-2 sm:px-3"}`}>
          {adminTabGroups.map((group) => {
            const visibleTabs = group.tabs.filter((t) => has(t.requires));
            if (visibleTabs.length === 0) return null;
            const isExpanded = expandedGroups.has(group.id);
            const GroupIcon = group.groupIcon;
            const operationsNeedsAttention = group.id === "operations" && unviewedCount > 0;
            const drawsNeedsAttention = group.id === "draws" && fullCapacityCount > 0;

            if (collapsed) {
              const needsAttention = operationsNeedsAttention || drawsNeedsAttention;
              const groupHasActiveTab = visibleTabs.some((t) => isTabActive(t.id));
              return (
                <div key={group.id} className="relative group/rail">
                  <button
                    type="button"
                    title={group.label}
                    aria-label={`${group.label} section`}
                    className={`relative w-full flex items-center justify-center py-2.5 rounded-lg transition-colors ${
                      groupHasActiveTab
                        ? "bg-red-50 dark:bg-neutral-800 text-red-600"
                        : "text-gray-600 dark:text-neutral-400 hover:bg-red-50/70 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <GroupIcon className="w-[18px] h-[18px] text-red-600" aria-hidden />
                    {/* The attention dot MUST survive collapsing — the whole point of the badge is
                        that it is seen, and hiding it behind a hover would defeat it. */}
                    {needsAttention && (
                      <span
                        className={`absolute top-1.5 right-2 w-2 h-2 rounded-full ring-2 ring-white dark:ring-neutral-900 ${
                          operationsNeedsAttention ? "bg-red-600" : "bg-amber-500"
                        }`}
                        aria-hidden
                      />
                    )}
                  </button>

                  <div
                    className="absolute left-full top-0 ml-2 min-w-[190px] z-[80] rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-1.5 opacity-0 invisible translate-x-[-4px] transition-[opacity,transform] duration-150 group-hover/rail:opacity-100 group-hover/rail:visible group-hover/rail:translate-x-0 group-focus-within/rail:opacity-100 group-focus-within/rail:visible group-focus-within/rail:translate-x-0"
                    role="menu"
                    aria-label={group.label}
                  >
                    {/* Invisible bridge across the ml-2 gap — without it the flyout closes as the
                        pointer travels from the icon to the panel. */}
                    <span className="absolute -left-2 top-0 w-2 h-full" aria-hidden />
                    <p className="px-2 pt-1 pb-2 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-500">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {visibleTabs.map((tab) => renderTabButton(tab, false))}
                    </div>
                  </div>
                </div>
              );
            }

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
                  className="group w-full flex items-center justify-between gap-2 py-2 pl-1 pr-1 text-left rounded-md text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white hover:bg-red-50/70 dark:hover:bg-neutral-800 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <GroupIcon className="w-4 h-4 shrink-0 text-red-600" aria-hidden />
                    <span className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-500 group-hover:text-gray-800 dark:text-neutral-100 dark:hover:text-neutral-100 dark:group-hover:text-white truncate">
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
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500" />
                    )}
                  </span>
                </button>
                {isExpanded && (
                  <div className="ml-1.5 pl-2.5 border-l border-red-100 dark:border-red-900/50 space-y-0.5">
                    {visibleTabs.map((tab) => renderTabButton(tab, true))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* User Profile */}
      <div className={`border-t border-gray-200 dark:border-neutral-800 ${collapsed ? "px-2 py-3" : "p-4"}`}>
        <div className={`flex items-center gap-3 mb-3 ${collapsed ? "justify-center" : ""}`}>
          <div
            className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-red-100 dark:ring-red-900/50 shadow-sm"
            title={collapsed ? `${user.name} · ${user.role}` : undefined}
          >
            <Image
              src={ADMIN_CIRCULAR_LOGO}
              alt="Tools Australia"
              width={40}
              height={40}
              className="h-full w-full object-cover"
              sizes="40px"
            />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 text-gray-900 dark:text-neutral-100">
              <div className="font-medium truncate">{user.name}</div>

              <div className="flex items-center gap-1 mt-1">
                <Crown className="w-3 h-3 text-yellow-500 shrink-0" />
                <span className="text-xs font-medium text-gray-600 dark:text-neutral-400 capitalize">{user.role}</span>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleSignOut}
          title={collapsed ? "Sign Out" : undefined}
          aria-label={collapsed ? "Sign Out" : undefined}
          className={`w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white rounded-lg transition-all duration-200 ${
            collapsed ? "px-0" : "px-3"
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && "Sign Out"}
        </button>
      </div>
    </div>
  );
}
