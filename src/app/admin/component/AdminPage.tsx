"use client";

import React, { useState, useEffect } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminStatsCard from "./AdminStatsCard";
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
  ChartData,
} from "@/hooks/queries/useAdminQueries";
import RevenueOverview from "@/components/admin/RevenueOverview";
import UsersManagement from "@/components/admin/UsersManagement";
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
} from "lucide-react";

export default function AdminPage({ user, navigateTo }: AdminDashboardProps) {
  const [selectedTab, setSelectedTab] = useState("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isClosingMobileSidebar, setIsClosingMobileSidebar] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isAdminMajorDrawModalOpen, setIsAdminMajorDrawModalOpen] = useState(false);
  const [isAdminMiniDrawModalOpen, setIsAdminMiniDrawModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch real admin dashboard stats
  const {
    data: dashboardStats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useAdminDashboardStats();

  // Fetch real recent activities
  const { data: recentActivities = [], isLoading: activitiesLoading, error: activitiesError } = useRecentActivities();

  // Fetch real revenue breakdown
  const { data: revenueBreakdown, isLoading: revenueLoading, error: revenueError } = useRevenueBreakdown();

  // Use real revenue data or fallback to empty array
  const revenueData: ChartData[] = revenueBreakdown?.chartData || [];

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
      await Promise.all([
        refetchStats(),
        // Note: The other queries will auto-refresh based on their refetchInterval
      ]);
    } catch (error) {
      console.error("Failed to refresh stats:", error);
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
              onTabChange={(tab) => {
                setSelectedTab(tab);
                handleCloseMobileSidebar();
              }}
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
          onTabChange={setSelectedTab}
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
              {/* Real-time Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {statsLoading || activitiesLoading || revenueLoading ? (
                  // Loading state - show skeleton cards
                  <>
                    {[1, 2, 3, 4].map((i) => (
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
                ) : statsError || activitiesError || revenueError ? (
                  // Error state
                  <div className="col-span-full bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <span className="text-red-700 font-medium">Failed to load dashboard data</span>
                    </div>
                    <p className="text-red-600 text-sm mt-1">
                      {statsError?.message ||
                        activitiesError?.message ||
                        revenueError?.message ||
                        "Unknown error occurred"}
                    </p>
                  </div>
                ) : dashboardStats ? (
                  // Real data
                  <>
                    <AdminStatsCard
                      title="Total Users"
                      value={dashboardStats.users.total.toLocaleString()}
                      icon={Users}
                      subtitle="Active users"
                      color="indigo"
                    />
                    <AdminStatsCard
                      title="Today's Revenue"
                      value={`$${dashboardStats.revenue.today.toLocaleString()}`}
                      icon={DollarSign}
                      subtitle="From all sources"
                      color="emerald"
                    />
                    <AdminStatsCard
                      title="Total Entries"
                      value={dashboardStats.majorDraw.totalEntries.toLocaleString()}
                      icon={Trophy}
                      subtitle="All-time entries"
                      color="yellow"
                    />
                    <AdminStatsCard
                      title="Conversion Rate"
                      value={`${dashboardStats.conversionRate}%`}
                      icon={Target}
                      subtitle="Paying customers"
                      color="purple"
                    />
                  </>
                ) : null}
              </div>

              {/* Revenue Overview */}
              <RevenueOverview data={revenueData} isLoading={revenueLoading} error={revenueError} />

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
                  <h3 className="text-base font-bold text-gray-900 mb-3">Recent Activity</h3>
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

      {/* Floating Quick Actions - Mobile Only - Hide when sidebar is open */}
      {!isMobileSidebarOpen && (
        <div className="lg:hidden fixed right-3 bottom-4 z-50 flex flex-col gap-2">
          <div className="group relative">
            <button
              onClick={() => setIsAdminMajorDrawModalOpen(true)}
              className="bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center"
            >
              <Plus className="w-5 h-5" />
            </button>
            <div className="absolute right-full mr-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="bg-gradient-to-r from-black to-gray-800 text-white px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap shadow-lg">
                Create Major Draw
              </div>
            </div>
          </div>
          <div className="group relative">
            <button
              onClick={() => setSelectedTab("products")}
              className="bg-gradient-to-r from-amber-500 to-yellow-600 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center"
            >
              <Package className="w-5 h-5" />
            </button>
            <div className="absolute right-full mr-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="bg-gradient-to-r from-black to-gray-800 text-white px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap shadow-lg">
                Add Product
              </div>
            </div>
          </div>
          <div className="group relative">
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="bg-blue-600 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center"
            >
              <Download className="w-5 h-5" />
            </button>
            <div className="absolute right-full mr-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="bg-gradient-to-r from-black to-gray-800 text-white px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap shadow-lg">
                Export Participants
              </div>
            </div>
          </div>
          <div className="group relative">
            <button
              onClick={() => setSelectedTab("users")}
              className="bg-green-600 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center"
            >
              <Users className="w-5 h-5" />
            </button>
            <div className="absolute right-full mr-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="bg-gradient-to-r from-black to-gray-800 text-white px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap shadow-lg">
                Manage Users
              </div>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
