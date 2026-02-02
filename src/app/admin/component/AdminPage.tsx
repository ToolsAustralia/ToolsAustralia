"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import AdminSidebar from "./AdminSidebar";
import DateRangeToggle, { DateRange } from "@/components/admin/DateRangeToggle";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import AdminMiniDrawModal from "@/components/modals/AdminMiniDrawModal";
import AdminProductModal from "@/components/modals/AdminProductModal";
import AdminMajorDrawModal from "@/components/modals/AdminMajorDrawModal";
import MajorDrawManagement from "./MajorDrawManagement";
import MiniDrawManagement from "./MiniDrawManagement";
import DrawResults from "./DrawResults";
import UpcomingDraws from "./UpcomingDraws";
import SubmissionsManagement from "./SubmissionsManagement";
import PromoManagement from "./PromoManagement";
import { AdminDashboardProps } from "@/types/admin";
import {
  useAdminDashboardStats,
  useRecentActivities,
  useRevenueBreakdown,
  useProjectedIncome,
  useMajorDrawsForDateRange,
  useCurrentAndLastDrawDates,
} from "@/hooks/queries/useAdminQueries";
import RevenueOverview from "@/components/admin/RevenueOverview";
import UsersManagement from "@/components/admin/UsersManagement";
import AffiliatesManagement from "@/components/admin/AffiliatesManagement";
import FacebookAdsManagement from "@/components/admin/FacebookAdsManagement";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import ABTestingManagement from "@/components/admin/ab-testing/ABTestingManagement";
import ErrorReportsManagement from "@/components/admin/ErrorReportsManagement";
import RevenueDetailModal from "@/components/modals/RevenueDetailModal";
import UserDetailModal from "@/components/admin/UserDetailModal";
import type { RevenueCategory, RevenueBreakdownItem } from "@/hooks/queries/useAdminQueries";
import type { TrendData } from "@/types/admin/trend-types";
import {
  Users,
  DollarSign,
  Trophy,
  Target,
  Activity,
  RefreshCw,
  Plus,
  Package,
  Send,
  Download,
  UserCheck,
  AlertTriangle,
  Crown,
  BarChart3,
  Shield,
  Menu,
  TrendingUp,
  ShoppingCart,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  UserX,
} from "lucide-react";

export default function AdminPage({ user, navigateTo, selectedTab = "overview" }: AdminDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isClosingMobileSidebar, setIsClosingMobileSidebar] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isAdminMajorDrawModalOpen, setIsAdminMajorDrawModalOpen] = useState(false);
  const [isAdminMiniDrawModalOpen, setIsAdminMiniDrawModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  const [isRevenueBreakdownExpanded, setIsRevenueBreakdownExpanded] = useState(false);
  const [isDateFilterCollapsed, setIsDateFilterCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isRevenueDetailModalOpen, setIsRevenueDetailModalOpen] = useState(false);
  const [selectedRevenueCategory, setSelectedRevenueCategory] = useState<RevenueCategory | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isUserDetailModalOpen, setIsUserDetailModalOpen] = useState(false);

  // State for date filter - synced with URL params
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Sync date filter state with URL params on mount and when URL changes
  useEffect(() => {
    const urlDateRange = (searchParams.get("dateRange") as DateRange) || "today";
    const urlStartDate = searchParams.get("startDate") || "";
    const urlEndDate = searchParams.get("endDate") || "";

    // Update state from URL params
    setDateRange(urlDateRange);
    setCustomStartDate(urlStartDate);
    setCustomEndDate(urlEndDate);
  }, [searchParams]); // Only depend on searchParams to sync from URL to state

  // Fetch current and last draw dates
  const { data: drawDates } = useCurrentAndLastDrawDates();

  // Update URL params when date filter changes
  const updateDateFilter = (range: DateRange, start?: string, end?: string) => {
    // Handle draw-based date ranges
    if (range === "current-draw" && drawDates?.currentDraw) {
      setDateRange(range);
      setCustomStartDate(drawDates.currentDraw.startDate);
      setCustomEndDate(drawDates.currentDraw.endDate);
      
      const params = new URLSearchParams(searchParams.toString());
      params.set("dateRange", range);
      params.set("startDate", drawDates.currentDraw.startDate);
      params.set("endDate", drawDates.currentDraw.endDate);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      return;
    }

    if (range === "last-draw" && drawDates?.lastDraw) {
      setDateRange(range);
      setCustomStartDate(drawDates.lastDraw.startDate);
      setCustomEndDate(drawDates.lastDraw.endDate);
      
      const params = new URLSearchParams(searchParams.toString());
      params.set("dateRange", range);
      params.set("startDate", drawDates.lastDraw.startDate);
      params.set("endDate", drawDates.lastDraw.endDate);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      return;
    }

    // Update state immediately for responsive UI
    setDateRange(range);
    if (range === "custom" && start && end) {
      setCustomStartDate(start);
      setCustomEndDate(end);
    } else {
      setCustomStartDate("");
      setCustomEndDate("");
    }

    // Update URL params
    const params = new URLSearchParams(searchParams.toString());
    params.set("dateRange", range);
    if (range === "custom" && start && end) {
      params.set("startDate", start);
      params.set("endDate", end);
    } else {
      params.delete("startDate");
      params.delete("endDate");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Format abbreviated date for collapsed view
  const formatAbbreviatedDate = (startDate: string, endDate: string): string => {
    if (!startDate || !endDate) return "";
    
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Check if same date
      if (format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")) {
        return format(start, "MMM d, yyyy"); // "Dec 27, 2025"
      }
      
      // Different dates - show abbreviated range
      return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`; // "Nov 27 - Dec 27, 2025"
    } catch {
      return "";
    }
  };

  // Determine if filter should be collapsible (disabled on mobile since title is hidden)
  const shouldCollapse = useMemo(() => {
    return false; // Don't collapse on mobile anymore since title is hidden
  }, []);

  // Get display date for collapsed view
  const displayDate = useMemo(() => {
    if (dateRange === "custom" && customStartDate && customEndDate) {
      return formatAbbreviatedDate(customStartDate, customEndDate);
    }
    if (dateRange === "all-time") {
      return "All Time";
    }
    if (dateRange === "current-draw" && drawDates?.currentDraw) {
      return `Current Draw`;
    }
    if (dateRange === "last-draw" && drawDates?.lastDraw) {
      return `Last Draw`;
    }
    return null;
  }, [dateRange, customStartDate, customEndDate, drawDates]);

  // Fetch major draws for date range selection
  const { data: majorDraws = [] } = useMajorDrawsForDateRange();

  // Fetch real admin dashboard stats with date range filtering
  const {
    data: dashboardStats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useAdminDashboardStats(dateRange, customStartDate ? customStartDate : undefined, customEndDate ? customEndDate : undefined);

  // Helper function to extract revenue value, counts, and trend (handles both number and object formats)
  const getRevenueData = (breakdownValue: RevenueBreakdownItem | undefined) => {
    if (!breakdownValue) return { revenue: 0, purchaseCount: 0, userCount: 0, trend: undefined };
    if (typeof breakdownValue === "number") {
      return { revenue: breakdownValue, purchaseCount: 0, userCount: 0, trend: undefined };
    }
    return {
      revenue: breakdownValue.revenue,
      purchaseCount: breakdownValue.purchaseCount,
      userCount: breakdownValue.userCount,
      trend: breakdownValue.trend,
    };
  };

  // For cancellations: up is bad, down is good - flip direction for display
  const getTrendForDisplay = (
    trend: TrendData | undefined,
    invertedPositive = false
  ): { value: number; direction: "up" | "down" | "neutral" } | undefined => {
    if (!trend) return undefined;
    if (invertedPositive && trend.direction !== "neutral") {
      return {
        ...trend,
        direction: trend.direction === "up" ? "down" : "up",
      };
    }
    return { value: trend.value, direction: trend.direction };
  };

  // Handler to open revenue detail modal
  const handleRevenueCardClick = (category: RevenueCategory) => {
    setSelectedRevenueCategory(category);
    setIsRevenueDetailModalOpen(true);
  };

  // Handler to close revenue detail modal
  const handleCloseRevenueModal = () => {
    setIsRevenueDetailModalOpen(false);
    setSelectedRevenueCategory(null);
  };

  // Fetch real recent activities
  const {
    data: recentActivities = [],
    isLoading: activitiesLoading,
    error: activitiesError,
    refetch: refetchActivities,
  } = useRecentActivities();

  // RevenueOverview now manages its own data fetching
  // We still need refetchRevenue for the refresh button
  const { refetch: refetchRevenue } = useRevenueBreakdown();

  // Fetch projected income for next month
  const { data: projectedIncome, isLoading: projectedIncomeLoading } = useProjectedIncome();

  // Handle mobile sidebar close with animation
  const handleCloseMobileSidebar = () => {
    setIsClosingMobileSidebar(true);
    setTimeout(() => {
      setIsMobileSidebarOpen(false);
      setIsClosingMobileSidebar(false);
    }, 300); // Match animation duration
  };

  // Handle file upload to Cloudinary
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const uploadImages = async (files: File[], type: "product" | "mini-draw"): Promise<string[]> => {
    const uploadPromises = files.map(async (file) => {
      const formData = new FormData();
      formData.append("files", file);
      formData.append("folder", type);
      formData.append("type", type);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const result = await response.json();
      return result.urls[0]; // Return the first URL from the response
    });

    return Promise.all(uploadPromises);
  };

  // Mini draw creation is handled by MiniDrawManagement component
  // This function is kept for potential future use but currently unused
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCreateMiniDraw = async (data: {
    title: string;
    description: string;
    prizeValue: number;
    category: string;
    drawDate: string;
    maxEntries: number;
    entryPrice: number;
    images: File[];
    uploadedImageUrls: string[];
    status: "draft" | "active" | "completed";
    featuredPrize: boolean;
  }) => {
    try {
      console.log("Creating mini draw:", data);

      // Use the already uploaded image URLs
      const miniDrawData = {
        ...data,
        images: data.uploadedImageUrls, // Use the uploaded URLs
      };

      // Remove the uploadedImageUrls from the final data
      delete (miniDrawData as Record<string, unknown>).uploadedImageUrls;

      console.log("Mini draw data with uploaded images:", miniDrawData);

      // TODO: Implement API call to create mini draw
      // Example: await createMiniDraw(miniDrawData);
    } catch (error) {
      console.error("Error creating mini draw:", error);
      // TODO: Show error message to user
    }
  };

  // Handle product creation
  const handleCreateProduct = async (data: {
    name: string;
    brand: string;
    description: string;
    shortDescription: string;
    price: number;
    originalPrice?: number;
    category: string;
    subcategory: string;
    sku: string;
    stock: number;
    weight: number;
    dimensions: { length: number; width: number; height: number };
    images: File[];
    uploadedImageUrls: string[];
    specifications: string;
    warranty: string;
    status: "active" | "inactive" | "draft";
    featured: boolean;
    onSale: boolean;
    freeShipping: boolean;
    tags: string;
  }) => {
    try {
      console.log("Creating product:", data);

      // Use the already uploaded image URLs
      const productData = {
        ...data,
        images: data.uploadedImageUrls, // Use the uploaded URLs
      };

      // Remove the uploadedImageUrls from the final data
      delete (productData as Record<string, unknown>).uploadedImageUrls;

      console.log("Product data with uploaded images:", productData);

      // TODO: Implement API call to create product
      // Example: await createProduct(productData);
    } catch (error) {
      console.error("Error creating product:", error);
      // TODO: Show error message to user
    }
  };

  // Handle keyboard navigation (Escape key with animation)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isMobileSidebarOpen) {
          handleCloseMobileSidebar();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileSidebarOpen]);

  // Disable background scrolling when sidebar is open
  useEffect(() => {
    if (isMobileSidebarOpen) {
      // Save current scroll position
      const scrollY = window.scrollY;

      // Disable scrolling
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    } else {
      // Re-enable scrolling and restore position
      const scrollY = document.body.style.top;
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";

      // Restore scroll position
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    }

    // Cleanup function to restore scrolling if component unmounts
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
    };
  }, [isMobileSidebarOpen]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh data based on current tab
      if (selectedTab === "overview") {
        // Refresh overview tab data
        await Promise.all([refetchStats(), refetchActivities(), refetchRevenue()]);
      } else if (selectedTab === "facebook-ads") {
        // Invalidate and refetch Facebook Ads data
        await queryClient.invalidateQueries({ queryKey: ["admin", "facebook-ads", "insights"] });
        await queryClient.refetchQueries({ queryKey: ["admin", "facebook-ads", "insights"] });
      } else if (selectedTab === "users") {
        // Invalidate and refetch Users data
        await queryClient.invalidateQueries({ queryKey: ["admin", "users", "list"] });
        await queryClient.refetchQueries({ queryKey: ["admin", "users", "list"] });
      } else {
        // For other tabs, refresh stats as fallback
        await refetchStats();
      }
    } catch (error) {
      console.error("Failed to refresh data:", error);
    } finally {
      setRefreshing(false);
    }
  };

  // Handle major draw export
  const handleExportMajorDraw = async (format: "csv" | "excel") => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/admin/major-draw/export?format=${format}`);

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `major-draw-participants-${new Date().toISOString().split("T")[0]}.${
        format === "excel" ? "xlsx" : "csv"
      }`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setIsExportModalOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "user_signup":
        return <UserCheck className="w-4 h-4" />;
      case "draw_complete":
        return <Trophy className="w-4 h-4" />;
      case "high_value_order":
        return <DollarSign className="w-4 h-4" />;
      case "system_alert":
        return <AlertTriangle className="w-4 h-4" />;
      case "membership_upgrade":
        return <Crown className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "text-white bg-gradient-to-br from-green-600 to-green-700";
      case "warning":
        return "text-black bg-gradient-to-br from-yellow-500 to-yellow-600";
      case "error":
        return "text-white bg-gradient-to-br from-red-600 to-red-700";
      case "info":
        return "text-white bg-gradient-to-br from-blue-600 to-blue-700";
      default:
        return "text-white bg-gradient-to-br from-gray-600 to-gray-700";
    }
  };

  // Access denied component
  if (!user.isAdmin) {
    return (
      <div className="h-screen-dvh bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center bg-white rounded-2xl shadow-2xl border-2 border-red-100 p-12">
          <div className="w-20 h-20 bg-gradient-to-r from-[#ee0000] to-[#ff4444] rounded-full mx-auto mb-6 flex items-center justify-center">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-4 text-gray-900">Access Denied</h2>
          <p className="text-gray-600 mb-8 text-lg">You don&apos;t have permission to access the admin panel.</p>
          <button
            onClick={() => navigateTo("home")}
            className="bg-gradient-to-r from-[#ee0000] to-[#ff4444] hover:from-[#cc0000] hover:to-[#e60000] text-white font-semibold px-8 py-3 rounded-xl transition-all duration-200"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen-dvh bg-gray-50 flex">
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <>
          {/* Backdrop Overlay */}
          <div className="lg:hidden fixed inset-0 bg-black/50 z-[60] animate-fade-in" />

          {/* Mobile Sidebar */}
          <div
            className={`lg:hidden fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-white z-[70] shadow-2xl ${
              isClosingMobileSidebar ? "sidebar-slide-out" : "sidebar-slide-in"
            } flex flex-col`}
          >
            <AdminSidebar
              selectedTab={selectedTab}
              onNavigateToSite={() => {
                navigateTo("home");
                handleCloseMobileSidebar();
              }}
              user={user}
              isMobile={true}
              onClose={handleCloseMobileSidebar}
            />
          </div>
        </>
      )}

      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-64">
        <AdminSidebar
          selectedTab={selectedTab}
          onNavigateToSite={() => navigateTo("home")}
          user={user}
          isMobile={false}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="bg-white border-b-2 border-red-100 px-3 sm:px-6 py-3 shadow-sm flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden w-8 h-8 text-gray-700 hover:text-white transition-all duration-300 rounded-full hover:bg-gradient-to-br hover:from-red-600 hover:to-red-700 hover:scale-105 flex items-center justify-center"
                aria-label="Open admin menu"
              >
                <Menu className="h-4 w-4" />
              </button>

              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 capitalize">
                  {selectedTab.replace("-", " ")}
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                  {selectedTab === "overview" && "Dashboard overview and key metrics"}
                  {selectedTab === "major-draw" && "Monthly major draw management"}
                  {selectedTab === "draw-results" && "View and manage draw results"}
                  {selectedTab === "upcoming-draws" && "Manage upcoming mini draws"}
                  {selectedTab === "submissions" && "Partner applications and contact form submissions"}
                  {selectedTab === "users" && "User account management and administration"}
                  {selectedTab === "promos" && "Manage promotional campaigns and entry multipliers"}
                  {selectedTab === "AB-testing" && "Manage A/B testing experiments and analyze variant performance"}
                  {selectedTab === "error-reports" && "View and manage error reports from users"}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="flex items-center space-x-1.5 bg-gradient-to-r from-green-600 to-green-700 text-white px-2 sm:px-3 py-1 rounded-md">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-xs sm:text-sm font-medium text-white hidden sm:inline">System Online</span>
                <span className="text-xs font-medium text-white sm:hidden">Online</span>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center space-x-1.5 px-2 sm:px-3 py-1.5 border-2 border-red-600 text-red-600 hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700 hover:text-white rounded-md transition-all duration-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                <span className="text-xs sm:text-sm hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-gray-50 min-h-0">
          {/* OVERVIEW TAB */}
          {selectedTab === "overview" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Date Range Toggle */}
              <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
                <h2 className="hidden sm:block text-sm sm:text-lg lg:text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
                  Dashboard Overview
                </h2>
                <div className="flex-shrink-0 sm:flex-shrink-0 w-full sm:w-auto">
                  <DateRangeToggle
                    selectedRange={dateRange}
                    onRangeChange={(range) => {
                      if (range === "custom") {
                        setIsCustomDateModalOpen(true);
                      } else {
                        updateDateFilter(range);
                      }
                    }}
                    onCustomClick={() => setIsCustomDateModalOpen(true)}
                    collapsed={false}
                    displayDate={displayDate || undefined}
                    onExpand={() => {}}
                  />
                </div>
              </div>

              {/* Real-time Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                {statsLoading || activitiesLoading ? (
                  // Loading state - show skeleton cards
                  <>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <div
                        key={i}
                        className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-3 sm:p-4 animate-pulse"
                      >
                        <div className="h-4 bg-gray-200 rounded mb-2"></div>
                        <div className="h-8 bg-gray-200 rounded mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      </div>
                    ))}
                  </>
                ) : statsError || activitiesError ? (
                  // Error state
                  <div className="col-span-full bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <span className="text-red-700 font-medium">Failed to load dashboard data</span>
                    </div>
                    <p className="text-red-600 text-sm mt-1">
                      {statsError?.message || activitiesError?.message || "Unknown error occurred"}
                    </p>
                  </div>
                ) : dashboardStats ? (
                  // Real data - Arranged for better logical grouping
                  <>
                    {/* Revenue Metrics - Most Important */}
                    {/* Total Revenue - Prominent Display (Clickable) */}
                    <div
                      onClick={() => setIsRevenueBreakdownExpanded(!isRevenueBreakdownExpanded)}
                      className="cursor-pointer group relative"
                    >
                      <MetricCard
                        title={
                          dateRange === "today"
                            ? "Today's Revenue"
                            : dateRange === "yesterday"
                            ? "Yesterday's Revenue"
                            : dateRange === "all-time"
                            ? "Total Revenue"
                            : "Revenue"
                        }
                        value={`$${dashboardStats.revenue.total.toLocaleString()}`}
                        icon={DollarSign}
                        subtitle={
                          dateRange === "today"
                            ? "From all sources"
                            : dateRange === "yesterday"
                            ? "From all sources"
                            : dateRange === "all-time"
                            ? "All-time total"
                            : "Selected period"
                        }
                        color="emerald"
                        trend={dashboardStats.revenue.totalTrend}
                      />
                      {/* Click indicator */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isRevenueBreakdownExpanded ? (
                          <ChevronUp className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-emerald-600" />
                        )}
                      </div>
                    </div>
                    <MetricCard
                      title="Projected Income"
                      value={`$${(projectedIncome?.projectedIncome || 0).toLocaleString("en-AU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
                      icon={TrendingUp}
                      subtitle={
                        <span className="text-xs">
                          {(
                            (projectedIncome?.activeSubscriptions ??
                              dashboardStats?.users?.activeSubscriptions ??
                              0) +
                            (dashboardStats?.users?.totalScheduledCancellation ?? 0)
                          ).toLocaleString()}{" "}
                          memberships
                          {dashboardStats?.users?.totalScheduledCancellation != null && (
                            <> · {dashboardStats.users.totalScheduledCancellation.toLocaleString()} cancelled</>
                          )}
                        </span>
                      }
                      color="purple"
                      loading={projectedIncomeLoading}
                    />
                    {/* User Metrics */}
                    <MetricCard
                      title="Total Users"
                      value={dashboardStats.users.total.toLocaleString()}
                      icon={Users}
                      subtitle="Active users"
                      color="indigo"
                      trend={dashboardStats.users.totalTrend}
                    />
                    <MetricCard
                      title={
                        dateRange === "today"
                          ? "New Signups"
                          : dateRange === "yesterday"
                          ? "New Signups"
                          : dateRange === "all-time"
                          ? "Total Signups"
                          : "New Signups"
                      }
                      value={dashboardStats.users.newInRange.toLocaleString()}
                      icon={UserCheck}
                      subtitle={
                        dateRange === "today"
                          ? "Signed up today"
                          : dateRange === "yesterday"
                          ? "Signed up yesterday"
                          : dateRange === "all-time"
                          ? "All-time signups"
                          : "In selected period"
                      }
                      color="blue"
                      trend={dashboardStats.users.newInRangeTrend}
                    />
                    {/* Performance Metrics */}
                    <MetricCard
                      title="Conversion Rate"
                      value={`${dashboardStats.conversionRate}%`}
                      icon={Target}
                      subtitle="Paying customers"
                      color="indigo"
                      trend={dashboardStats.conversionRateTrend}
                    />
                    <MetricCard
                      title={
                        dateRange === "today"
                          ? "Ad Spend"
                          : dateRange === "yesterday"
                          ? "Ad Spend"
                          : dateRange === "all-time"
                          ? "Total Ad Spend"
                          : "Ad Spend"
                      }
                      value={`$${(dashboardStats.facebookAds?.spend || 0).toLocaleString("en-AU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
                      icon={BarChart3}
                      subtitle={
                        dateRange === "today"
                          ? "Facebook Ads spend"
                          : dateRange === "yesterday"
                          ? "Facebook Ads spend"
                          : dateRange === "all-time"
                          ? "All-time Facebook Ads"
                          : "Facebook Ads spend"
                      }
                      color="blue"
                      trend={dashboardStats.facebookAds?.spendTrend}
                    />
                    <MetricCard
                      title="ROAS"
                      value={`${(dashboardStats.facebookAds?.roas || 0).toFixed(2)}x`}
                      icon={Target}
                      subtitle="Return on ad spend"
                      color="green"
                      trend={dashboardStats.facebookAds?.roasTrend}
                    />
                    {/* Drop-off Rate */}
                    <MetricCard
                      title="Drop-off Rate"
                      value={`${(dashboardStats.users.dropOffRate ?? 0).toFixed(1)}%`}
                      icon={UserX}
                      subtitle={
                        dashboardStats.users.periodChurnRate != null
                          ? `${dashboardStats.users.periodChurnRate.toFixed(2)}% churned ${
                              dateRange === "today"
                                ? "today"
                                : dateRange === "yesterday"
                                ? "yesterday"
                                : "in period"
                            }`
                          : "Of members scheduled to cancel"
                      }
                      color="red"
                      trend={getTrendForDisplay(dashboardStats.users.dropOffRateTrend, true)}
                    />
                  </>
                ) : null}
              </div>

              {/* Detailed Revenue Breakdown - Expandable */}
              {dashboardStats && isRevenueBreakdownExpanded && (
                <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6 transition-all duration-300 ease-in-out">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900">Revenue Breakdown</h3>
                    <button
                      onClick={() => setIsRevenueBreakdownExpanded(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Close breakdown"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                    <MetricCard
                      title={
                        <span className="block leading-tight">
                          <span className="block">Membership</span>
                          <span className="block">New</span>
                        </span>
                      }
                      value={`$${getRevenueData(dashboardStats.revenue.breakdown.membershipPurchase).revenue.toLocaleString()}`}
                      icon={Package}
                      color="orange"
                      clickable={true}
                      onClick={() => handleRevenueCardClick("membership-purchase")}
                      count={getRevenueData(dashboardStats.revenue.breakdown.membershipPurchase).purchaseCount}
                      countLabel="subscriptions"
                      trend={getRevenueData(dashboardStats.revenue.breakdown.membershipPurchase).trend}
                    />
                    <MetricCard
                      title={
                        <span className="block leading-tight">
                          <span className="block">Membership</span>
                          <span className="block">Renewal</span>
                        </span>
                      }
                      value={`$${getRevenueData(dashboardStats.revenue.breakdown.membershipRenewal).revenue.toLocaleString()}`}
                      icon={RefreshCw}
                      color="yellow"
                      clickable={true}
                      onClick={() => handleRevenueCardClick("membership-renewal")}
                      count={getRevenueData(dashboardStats.revenue.breakdown.membershipRenewal).purchaseCount}
                      countLabel="renewals"
                      trend={getRevenueData(dashboardStats.revenue.breakdown.membershipRenewal).trend}
                    />
                    <MetricCard
                      title={
                        <span className="block leading-tight">
                          <span className="block">One-Time</span>
                          <span className="block">First</span>
                        </span>
                      }
                      value={`$${getRevenueData(dashboardStats.revenue.breakdown.oneTimePurchase).revenue.toLocaleString()}`}
                      icon={ShoppingCart}
                      color="blue"
                      clickable={true}
                      onClick={() => handleRevenueCardClick("one-time-purchase")}
                      count={getRevenueData(dashboardStats.revenue.breakdown.oneTimePurchase).purchaseCount}
                      countLabel="purchases"
                      trend={getRevenueData(dashboardStats.revenue.breakdown.oneTimePurchase).trend}
                    />
                    <MetricCard
                      title={
                        <span className="block leading-tight">
                          <span className="block">One-Time</span>
                          <span className="block">Additional</span>
                        </span>
                      }
                      value={`$${getRevenueData(dashboardStats.revenue.breakdown.additionalOneTimePurchase).revenue.toLocaleString()}`}
                      icon={ShoppingBag}
                      color="indigo"
                      clickable={true}
                      onClick={() => handleRevenueCardClick("additional-one-time")}
                      count={getRevenueData(dashboardStats.revenue.breakdown.additionalOneTimePurchase).purchaseCount}
                      countLabel="purchases"
                      trend={getRevenueData(dashboardStats.revenue.breakdown.additionalOneTimePurchase).trend}
                    />
                    <MetricCard
                      title={
                        <span className="block leading-tight">
                          <span className="block">Mini</span>
                          <span className="block">Draws</span>
                        </span>
                      }
                      value={`$${getRevenueData(dashboardStats.revenue.breakdown.miniDraw).revenue.toLocaleString()}`}
                      icon={Trophy}
                      color="purple"
                      clickable={true}
                      onClick={() => handleRevenueCardClick("mini-draw")}
                      count={getRevenueData(dashboardStats.revenue.breakdown.miniDraw).purchaseCount}
                      countLabel="purchases"
                      trend={getRevenueData(dashboardStats.revenue.breakdown.miniDraw).trend}
                    />
                    <MetricCard
                      title="Upsells"
                      value={`$${getRevenueData(dashboardStats.revenue.breakdown.upsell).revenue.toLocaleString()}`}
                      icon={TrendingUp}
                      color="pink"
                      clickable={true}
                      onClick={() => handleRevenueCardClick("upsell")}
                      count={getRevenueData(dashboardStats.revenue.breakdown.upsell).purchaseCount}
                      countLabel="purchases"
                      trend={getRevenueData(dashboardStats.revenue.breakdown.upsell).trend}
                    />
                  </div>
                </div>
              )}

              {/* Revenue Overview */}
              <RevenueOverview />

              {/* Quick Actions & Recent Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                {/* Quick Actions */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6">
                  <h3 className="text-base font-bold text-gray-900 mb-3">Quick Actions</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setIsAdminMajorDrawModalOpen(true)}
                      className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white h-auto py-3 flex flex-col items-center rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <Plus className="w-3.5 h-3.5 mb-1" />
                      <span className="text-xs font-semibold">Create Major Draw</span>
                    </button>
                    <button
                      onClick={() => setIsProductModalOpen(true)}
                      className="border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 h-auto py-3 flex flex-col items-center rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <Package className="w-4 h-4 mb-1" />
                      <span className="text-xs font-semibold">Add Product</span>
                    </button>
                    <button className="border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 h-auto py-3 flex flex-col items-center rounded-xl transition-all duration-200 shadow-sm hover:shadow-md">
                      <Send className="w-4 h-4 mb-1" />
                      <span className="text-xs font-semibold">Send Broadcast</span>
                    </button>
                    <button
                      onClick={() => setIsExportModalOpen(true)}
                      className="border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 h-auto py-3 flex flex-col items-center rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <Download className="w-4 h-4 mb-1" />
                      <span className="text-xs font-semibold">Export Participants</span>
                    </button>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-gray-900">Recent Activity</h3>
                    <button
                      onClick={() => router.push("/admin/activity-log")}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
                    >
                      View All →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {recentActivities.slice(0, 5).map((activity) => (
                      <div key={activity.id} className="flex items-start space-x-2">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center ${getStatusColor(
                            activity.status
                          )}`}
                        >
                          <div className="scale-75">{getActivityIcon(activity.type)}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 leading-tight">{activity.action}</p>
                          <div className="flex items-center space-x-1 mt-0.5">
                            <span className="text-xs text-gray-500">{activity.user}</span>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-500">{activity.time}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MINI DRAWS TAB */}
          {selectedTab === "mini-draws" && <MiniDrawManagement />}

          {/* MAJOR DRAW TAB */}
          {selectedTab === "major-draw" && <MajorDrawManagement />}

          {/* DRAW RESULTS TAB */}
          {selectedTab === "draw-results" && <DrawResults />}

          {/* UPCOMING DRAWS TAB */}
          {selectedTab === "upcoming-draws" && <UpcomingDraws />}

          {/* SUBMISSIONS TAB */}
          {selectedTab === "submissions" && <SubmissionsManagement />}

          {/* USERS TAB */}
          {selectedTab === "users" && <UsersManagement />}

          {/* PROMOS TAB */}
          {selectedTab === "promos" && <PromoManagement />}

          {/* AFFILIATES TAB */}
          {selectedTab === "affiliates" && <AffiliatesManagement />}

          {/* A/B TESTING TAB */}
          {selectedTab === "ab-testing" && <ABTestingManagement />}

          {/* ERROR REPORTS TAB */}
          {selectedTab === "error-reports" && <ErrorReportsManagement />}

          {/* FACEBOOK ADS TAB */}
          {selectedTab === "facebook-ads" && <FacebookAdsManagement />}

          {/* Placeholder for other tabs - temporarily disabled since tabs are hidden */}
          {false && (
            <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-6 sm:p-8 text-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 capitalize">
                {selectedTab.replace("-", " ")} Management
              </h3>
              <p className="text-sm text-gray-600">
                {selectedTab.charAt(0).toUpperCase() + selectedTab.slice(1)} management interface will be available in a
                future update.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Admin Product Modal */}
      <AdminProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSubmit={handleCreateProduct}
      />

      {/* Admin Major Draw Modal */}
      <AdminMajorDrawModal
        isOpen={isAdminMajorDrawModalOpen}
        onClose={() => setIsAdminMajorDrawModalOpen(false)}
        onSuccess={() => {
          // Refresh upcoming draws and show success toast
          refetchStats();
          // You can add a toast notification here
        }}
      />

      {/* Admin Mini Draw Modal */}
      <AdminMiniDrawModal
        isOpen={isAdminMiniDrawModalOpen}
        onClose={() => setIsAdminMiniDrawModalOpen(false)}
        onSuccess={() => {
          // Refresh stats and show success toast
          refetchStats();
        }}
      />

      {/* Custom Date Range Modal */}
      <CustomDateRangeModal
        isOpen={isCustomDateModalOpen}
        onClose={() => setIsCustomDateModalOpen(false)}
        onApply={(startDate, endDate) => {
          updateDateFilter("custom", startDate, endDate);
        }}
        currentStartDate={customStartDate}
        currentEndDate={customEndDate}
        majorDraws={majorDraws}
      />

      {/* Export Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Export Major Draw Participants</h3>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-600 mb-6 text-sm">
              Export all participants and their entry counts from the current major draw.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => handleExportMajorDraw("csv")}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold"
              >
                <Download className="w-5 h-5" />
                {isExporting ? "Exporting..." : "Export as CSV"}
              </button>
              <button
                onClick={() => handleExportMajorDraw("excel")}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold"
              >
                <Download className="w-5 h-5" />
                {isExporting ? "Exporting..." : "Export as Excel"}
              </button>
              <button
                onClick={() => setIsExportModalOpen(false)}
                disabled={isExporting}
                className="w-full px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revenue Detail Modal */}
      <RevenueDetailModal
        isOpen={isRevenueDetailModalOpen}
        onClose={handleCloseRevenueModal}
        category={selectedRevenueCategory}
        dateRange={dateRange}
        startDate={customStartDate || undefined}
        endDate={customEndDate || undefined}
        onUserClick={(userId) => {
          setSelectedUserId(userId);
          setIsUserDetailModalOpen(true);
        }}
      />

      {/* User Detail Modal */}
      <UserDetailModal
        userId={selectedUserId}
        isOpen={isUserDetailModalOpen}
        onCloseAction={() => {
          setIsUserDetailModalOpen(false);
          setSelectedUserId(null);
        }}
      />
    </div>
  );
}
