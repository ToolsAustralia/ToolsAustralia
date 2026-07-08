"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { totalSignOut } from "@/utils/auth/total-sign-out";
import { usePermissions } from "@/hooks/usePermissions";
import {
  AlertCircle,
  ChevronDown,
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
}

const adminTabGroups = ADMIN_TAB_GROUPS;

export default function AdminSidebar({
  selectedTab: _selectedTab,
  onNavigateToSite,
  user,
  isMobile = false,
  onClose,
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

  return (
    <div className="w-full h-full bg-white dark:bg-neutral-900 border-r-2 border-red-100 dark:border-red-900/40 flex flex-col shadow-lg">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-red-600 to-red-400 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
              <p className="text-sm text-gray-600 dark:text-neutral-400">Tools Australia</p>
            </div>
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
          className="group w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-gray-800 dark:text-neutral-200 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/80 dark:bg-neutral-800/80 hover:border-red-300 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white transition-all duration-200"
        >
          <Home className="w-3.5 h-3.5 shrink-0 text-red-600 group-hover:text-white transition-colors" />
          <span className="group-hover:text-white">View Site</span>
        </button>
      </div>

      {/* Navigation */}
      <div ref={navScrollRef} className="flex-1 overflow-y-auto admin-scrollbar">
        <nav className="px-2 py-3 sm:px-3 space-y-4">
          {adminTabGroups.map((group) => {
            const visibleTabs = group.tabs.filter((t) => has(t.requires));
            if (visibleTabs.length === 0) return null;
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
                    {visibleTabs.map((tab) => {
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
                })}
              </div>
            )}
            </div>
          );
          })}
        </nav>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-200 dark:border-neutral-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-red-100 dark:ring-red-900/50 shadow-sm">
            <Image
              src={ADMIN_CIRCULAR_LOGO}
              alt="Tools Australia"
              width={40}
              height={40}
              className="h-full w-full object-cover"
              sizes="40px"
            />
          </div>
          <div className="flex-1 min-w-0 text-gray-900 dark:text-neutral-100">
            <div className="font-medium truncate">{user.name}</div>

            <div className="flex items-center gap-1 mt-1">
              <Crown className="w-3 h-3 text-yellow-500 shrink-0" />
              <span className="text-xs font-medium text-gray-600 dark:text-neutral-400 capitalize">{user.role}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white rounded-lg transition-all duration-200"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
