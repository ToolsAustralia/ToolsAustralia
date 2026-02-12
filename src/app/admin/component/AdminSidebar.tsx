"use client";

import React, { useState, useEffect } from "react";
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

const adminTabs = [
  {
    id: "overview",
    label: "Overview",
    icon: BarChart3,
  },
  {
    id: "ab-testing",
    label: "A/B Testing",
    icon: FlaskConical,
  },
  {
    id: "facebook-ads",
    label: "Facebook Ads",
    icon: TrendingUp,
  },
  // Temporarily hidden - no content yet
  // {
  //   id: "analytics",
  //   label: "Analytics",
  //   icon: TrendingUp,
  // },
  {
    id: "users",
    label: "Users",
    icon: Users,
  },
  {
    id: "mini-draws",
    label: "Mini Draws",
    icon: Trophy,
  },
  {
    id: "major-draw",
    label: "Current Draw",
    icon: Gift,
  },
  {
    id: "draw-results",
    label: "Draw Results",
    icon: Trophy,
  },
  {
    id: "upcoming-draws",
    label: "Upcoming Draws",
    icon: Activity,
  },
  // Temporarily hidden - no content yet
  // {
  //   id: "products",
  //   label: "Products",
  //   icon: Package,
  // },
  // {
  //   id: "orders",
  //   label: "Orders",
  //   icon: ShoppingCart,
  // },
  // {
  //   id: "content",
  //   label: "Content",
  //   icon: FileText,
  // },
  // {
  //   id: "communications",
  //   label: "Communications",
  //   icon: MessageSquare,
  // },
  {
    id: "submissions",
    label: "Submissions",
    icon: FileTextIcon,
  },
  {
    id: "promos",
    label: "Promos",
    icon: Zap,
  },
  {
    id: "affiliates",
    label: "Affiliates",
    icon: UserCheck,
  },
  {
    id: "error-reports",
    label: "Error Reports",
    icon: Bug,
  },
  // Temporarily hidden - no content yet
  // {
  //   id: "system",
  //   label: "System",
  //   icon: Cpu,
  // },
  // {
  //   id: "database",
  //   label: "Database",
  //   icon: Database,
  // },
  // {
  //   id: "notifications",
  //   label: "Notifications",
  //   icon: Bell,
  // },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
  },
];

export default function AdminSidebar({
  selectedTab,
  onNavigateToSite,
  user,
  isMobile = false,
  onClose,
}: AdminSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [unviewedCount, setUnviewedCount] = useState(0);

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
    fetchUnviewed();
    const interval = setInterval(fetchUnviewed, 60000); // Refresh every minute
    const onSubmissionsUpdated = () => fetchUnviewed();
    window.addEventListener("admin-submissions-updated", onSubmissionsUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener("admin-submissions-updated", onSubmissionsUpdated);
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
      <div className="flex-1 overflow-y-auto">
        <nav className="p-4 space-y-1">
          {adminTabs.map((tab) => {
            const Icon = tab.icon;
            // Check if this tab is active based on current pathname
            const isActive =
              (tab.id === "overview" && (pathname === "/admin" || pathname === "/admin/")) ||
              (tab.id !== "overview" && pathname === `/admin/${tab.id}`);

            return (
              <button
                key={tab.id}
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
              </button>
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
