"use client";

/**
 * Error Reports Management Component
 * 
 * Admin interface for viewing and managing error reports submitted by users.
 * Features:
 * - Table view with pagination
 * - Filtering by status, date, user
 * - Search functionality
 * - Status updates with admin notes
 * - Detailed error report view
 * - Statistics dashboard
 */

import React, { useState, useMemo, useEffect } from "react";
import { formatDisplayName } from "@/utils/display-name";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Filter,
  RefreshCw,
  Bug,
  FileText,
  Trash2,
  CheckSquare,
  Square,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { ErrorReportStatus, IErrorReport } from "@/types/error-reporting";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/queries";
import { useToast } from "@/components/ui/Toast";
import { format } from "date-fns";
import ErrorReportsAnalytics from "./ErrorReportsAnalytics";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";
import Dropdown from "@/components/modals/ui/Dropdown";
import ClickableUserDisplay from "./ClickableUserDisplay";

interface ErrorReportsResponse {
  reports: IErrorReport[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  statistics: {
    total: number;
    byStatus: Record<ErrorReportStatus, number>;
    recentCount: number;
  };
}

interface ErrorReportDetailModalProps {
  report: IErrorReport | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

/**
 * Error Report Detail Modal
 * Shows full error report details and allows status updates
 */
function ErrorReportDetailModal({
  report,
  isOpen,
  onClose,
  onUpdate,
}: ErrorReportDetailModalProps) {
  const [status, setStatus] = useState<ErrorReportStatus>("new");
  const [adminNotes, setAdminNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (report) {
      setStatus(report.status);
      setAdminNotes(report.adminNotes || "");
    }
  }, [report]);

  const updateMutation = useMutation({
    mutationFn: async (data: { status?: ErrorReportStatus; adminNotes?: string }) => {
      if (!report) throw new Error("No report selected");
      return apiPatch(`/api/admin/error-reports/${report._id}`, data);
    },
    onSuccess: () => {
      showToast({
        type: "success",
        title: "Updated",
        message: "Error report updated successfully",
      });
      onUpdate();
      onClose();
    },
    onError: (error: Error) => {
      showToast({
        type: "error",
        title: "Update Failed",
        message: error.message || "Failed to update error report",
      });
    },
  });

  const handleSubmit = async () => {
    setIsUpdating(true);
    try {
      await updateMutation.mutateAsync({
        status,
        adminNotes: adminNotes.trim() || undefined,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen || !report) return null;

  const _statusColors = {
    new: "bg-blue-100 text-blue-800",
    investigating: "bg-yellow-100 text-yellow-800",
    resolved: "bg-green-100 text-green-800",
    dismissed: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Error Report Details</h2>
            <p className="text-red-100 text-sm mt-1">
              Reported {format(new Date(report.createdAt), "PPp")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-red-100 transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status and User Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ErrorReportStatus)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="new">New</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">User</label>
              <div className="px-3 py-2 bg-gray-50 rounded-lg">
                {report.isAuthenticated ? (
                  <ClickableUserDisplay
                    displayText={
                      typeof report.userId === "object" && report.userId && report.userId !== null && "firstName" in report.userId && "lastName" in report.userId
                        ? formatDisplayName((report.userId as { firstName?: string; lastName?: string }).firstName, (report.userId as { firstName?: string; lastName?: string }).lastName) || report.userEmail || "Unknown"
                        : report.userEmail || "Unknown"
                    }
                    userId={typeof report.userId === "string" ? report.userId : null}
                    className="text-sm"
                  />
                ) : (
                  <span className="text-sm text-gray-500">
                    {report.userEmail || report.guestEmail ? (
                      <span>Guest: {report.userEmail || report.guestEmail}</span>
                    ) : (
                      <span>Anonymous</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Error Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Error Message</label>
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-900">{report.errorMessage}</p>
            </div>
          </div>

          {/* Error Stack */}
          {report.errorStack && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Stack Trace</label>
              <pre className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-xs overflow-x-auto">
                {report.errorStack}
              </pre>
            </div>
          )}

          {/* API Endpoint */}
          {report.apiEndpoint && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">API Endpoint</label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="text-sm font-mono">{report.httpMethod} {report.apiEndpoint}</span>
                {report.httpStatus && (
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${
                    report.httpStatus >= 500
                      ? "bg-red-100 text-red-800"
                      : report.httpStatus >= 400
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-green-100 text-green-800"
                  }`}>
                    {report.httpStatus}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Browser Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Browser</label>
              <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm">
                {report.browserInfo
                  ? `${report.browserInfo.name || "Unknown"} ${report.browserInfo.version || ""} on ${report.browserInfo.os || "Unknown"}`
                  : "Unknown"}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Page</label>
              <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm truncate">
                {report.route || report.currentUrl || "Unknown"}
              </div>
            </div>
          </div>

          {/* User Notes */}
          {report.userNotes && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">User Notes</label>
              <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900 whitespace-pre-wrap">{report.userNotes}</p>
              </div>
            </div>
          )}

          {/* Admin Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Admin Notes</label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Add notes about this error report..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isUpdating}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpdating ? "Updating..." : "Update Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Main Error Reports Management Component
 */
export default function ErrorReportsManagement() {
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState<ErrorReportStatus | "all">("all");
  const [search, setSearch] = useState("");
  // ✅ NEW: Advanced filter states
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [userEmailFilter, setUserEmailFilter] = useState("");
  const [autoLoggedFilter, setAutoLoggedFilter] = useState<string>("all");
  const [apiEndpointFilter, setApiEndpointFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [_showAdvancedFilters, _setShowAdvancedFilters] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [groupBy, setGroupBy] = useState<"none" | "error" | "endpoint" | "user">("none");
  const [selectedReport, setSelectedReport] = useState<IErrorReport | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set()); // ✅ NEW: Bulk selection
  const [isBulkDeleting, setIsBulkDeleting] = useState(false); // ✅ NEW: Bulk delete state
  const [isFiltersOpen, setIsFiltersOpen] = useState(false); // ✅ NEW: Mobile filter collapse state
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", limit.toString());
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (search) {
      params.set("search", search);
    }
    // ✅ NEW: Add advanced filter params
    if (categoryFilter !== "all") {
      params.set("category", categoryFilter);
    }
    if (severityFilter !== "all") {
      params.set("severity", severityFilter);
    }
    if (userEmailFilter) {
      params.set("userEmail", userEmailFilter);
    }
    if (autoLoggedFilter !== "all") {
      params.set("autoLogged", autoLoggedFilter);
    }
    if (apiEndpointFilter) {
      params.set("apiEndpoint", apiEndpointFilter);
    }
    if (startDate) {
      params.set("startDate", startDate);
    }
    if (endDate) {
      params.set("endDate", endDate);
    }
    return params.toString();
  }, [page, limit, statusFilter, search, categoryFilter, severityFilter, userEmailFilter, autoLoggedFilter, apiEndpointFilter, startDate, endDate]);

  // Fetch error reports
  const { data, isLoading, error, refetch } = useQuery<ErrorReportsResponse>({
    queryKey: ["admin-error-reports", queryParams],
    queryFn: () => apiGet(`/api/admin/error-reports?${queryParams}`),
  });

  const handleViewReport = (report: IErrorReport) => {
    setSelectedReport(report);
    setIsDetailModalOpen(true);
  };

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-error-reports"] });
    refetch();
  };

  // ✅ NEW: Handle bulk selection
  const handleToggleSelect = (reportId: string) => {
    setSelectedReports((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(reportId)) {
        newSet.delete(reportId);
      } else {
        newSet.add(reportId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (!data?.reports) return;
    if (selectedReports.size === data.reports.length) {
      setSelectedReports(new Set());
    } else {
      setSelectedReports(new Set(data.reports.map((r) => r._id)));
    }
  };

  // ✅ NEW: Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (reportIds: string[]) => {
      // Use apiRequest directly since apiDelete doesn't support body
      const response = await fetch("/api/admin/error-reports/bulk-delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reportIds }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete error reports");
      }
      return response.json() as Promise<{ success: boolean; deletedCount: number; message: string }>;
    },
    onSuccess: (data) => {
      showToast({
        type: "success",
        title: "Deleted",
        message: data.message || `Successfully deleted ${data.deletedCount || 0} error report(s)`,
      });
      setSelectedReports(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-error-reports"] });
      refetch();
    },
    onError: (error: Error) => {
      showToast({
        type: "error",
        title: "Error",
        message: error.message || "Failed to delete error reports",
      });
    },
    onSettled: () => {
      setIsBulkDeleting(false);
    },
  });

  const handleBulkDelete = async () => {
    if (selectedReports.size === 0) {
      showToast({
        type: "error",
        title: "No Selection",
        message: "Please select at least one error report to delete",
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedReports.size} error report(s)? This action cannot be undone.`)) {
      return;
    }

    setIsBulkDeleting(true);
    bulkDeleteMutation.mutate(Array.from(selectedReports));
  };

  // ✅ NEW: Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(
      search ||
      statusFilter !== "all" ||
      categoryFilter !== "all" ||
      severityFilter !== "all" ||
      userEmailFilter ||
      autoLoggedFilter !== "all" ||
      apiEndpointFilter ||
      startDate ||
      endDate
    );
  }, [search, statusFilter, categoryFilter, severityFilter, userEmailFilter, autoLoggedFilter, apiEndpointFilter, startDate, endDate]);

  // ✅ NEW: Clear all filters
  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setSeverityFilter("all");
    setUserEmailFilter("");
    setAutoLoggedFilter("all");
    setApiEndpointFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  // ✅ NEW: Group reports based on groupBy selection
  const groupedReports = useMemo(() => {
    if (!data?.reports || groupBy === "none") {
      return null;
    }

    const groups: Record<string, IErrorReport[]> = {};

    data.reports.forEach((report) => {
      let key: string;

      switch (groupBy) {
        case "error":
          key = report.errorMessage.substring(0, 100); // Truncate for grouping
          break;
        case "endpoint":
          key = report.apiEndpoint || "Unknown Endpoint";
          break;
        case "user":
          key = report.isAuthenticated
            ? report.userEmail || report.userId || "Unknown User"
            : report.guestEmail || report.userEmail || "Anonymous";
          break;
        default:
          key = "Unknown";
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(report);
    });

    return Object.entries(groups)
      .map(([key, reports]) => ({
        key,
        reports,
        count: reports.length,
      }))
      .sort((a, b) => b.count - a.count);
  }, [data?.reports, groupBy]);

  // ✅ NEW: Export functionality
  const handleExportCSV = () => {
    if (!data?.reports) return;

    const headers = [
      "ID",
      "Error Message",
      "Category",
      "Severity",
      "Status",
      "User Email",
      "Guest Email",
      "Is Authenticated",
      "API Endpoint",
      "HTTP Method",
      "HTTP Status",
      "Auto-Logged",
      "Created At",
      "User Notes",
      "Admin Notes",
    ];

    const rows = data.reports.map((report) => [
      report._id,
      report.errorMessage,
      report.category || "",
      report.severity || "",
      report.status,
      report.userEmail || "",
      report.guestEmail || "",
      report.isAuthenticated ? "Yes" : "No",
      report.apiEndpoint || "",
      report.httpMethod || "",
      report.httpStatus || "",
      report.autoLogged ? "Yes" : "No",
      format(new Date(report.createdAt), "yyyy-MM-dd HH:mm:ss"),
      report.userNotes || "",
      report.adminNotes || "",
    ]);

    const BOM = "\uFEFF";
    const csvContent =
      BOM +
      [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
      ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `error-reports-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast({
      type: "success",
      title: "Export Successful",
      message: "Error reports exported to CSV",
    });
  };

  const handleExportJSON = () => {
    if (!data?.reports) return;

    const jsonContent = JSON.stringify(data.reports, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `error-reports-${format(new Date(), "yyyy-MM-dd")}.json`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast({
      type: "success",
      title: "Export Successful",
      message: "Error reports exported to JSON",
    });
  };

  const statusColors = {
    new: "bg-blue-100 text-blue-800",
    investigating: "bg-yellow-100 text-yellow-800",
    resolved: "bg-green-100 text-green-800",
    dismissed: "bg-gray-100 text-gray-800",
  };

  const statusIcons = {
    new: AlertCircle,
    investigating: Clock,
    resolved: CheckCircle,
    dismissed: XCircle,
  };

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Failed to load error reports. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header - Matching AdminPage pattern */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm sm:text-lg lg:text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
            Error Reports
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
            View and manage error reports from users
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* ✅ NEW: Bulk delete button */}
          {selectedReports.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="px-2 sm:px-4 py-1.5 sm:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
            >
              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{isBulkDeleting ? "Deleting..." : `Delete ${selectedReports.size} Selected`}</span>
              <span className="sm:hidden">{selectedReports.size}</span>
            </button>
          )}
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors text-xs sm:text-sm ${
              showAnalytics
                ? "bg-red-600 text-white"
                : "bg-white border border-gray-300 hover:bg-gray-50"
            }`}
          >
            <span className="hidden sm:inline">{showAnalytics ? "Hide Analytics" : "Show Analytics"}</span>
            <span className="sm:hidden">Analytics</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="px-2 sm:px-4 py-1.5 sm:py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
            title="Export to CSV"
          >
            <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={handleExportJSON}
            className="px-2 sm:px-4 py-1.5 sm:py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
            title="Export to JSON"
          >
            <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Export JSON</span>
          </button>
          <button
            onClick={() => refetch()}
            className="px-2 sm:px-4 py-1.5 sm:py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
          >
            <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Analytics Dashboard */}
      {showAnalytics && data?.reports && (
        <ErrorReportsAnalytics reports={data.reports} />
      )}

      {/* Statistics */}
      {data?.statistics && !showAnalytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            title="Total Reports"
            value={data.statistics.total}
            icon={Bug}
            color="red"
            loading={isLoading}
          />
          <MetricCard
            title="New"
            value={data.statistics.byStatus.new}
            icon={AlertCircle}
            color="blue"
            loading={isLoading}
          />
          <MetricCard
            title="Investigating"
            value={data.statistics.byStatus.investigating}
            icon={Clock}
            color="yellow"
            loading={isLoading}
          />
          <MetricCard
            title="Resolved"
            value={data.statistics.byStatus.resolved}
            icon={CheckCircle}
            color="emerald"
            loading={isLoading}
          />
        </div>
      )}

      {/* Search and Filters - Elevated Design (Matching UsersManagement) */}
      <div className="bg-gradient-to-br from-white via-gray-50 to-white rounded-xl shadow-lg border-2 border-gray-200/50 p-2 sm:p-4 lg:p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 lg:gap-4">
          {/* Search Bar - Enhanced */}
          <div className="relative flex-1 group flex items-center gap-2">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-red-600 transition-colors w-4 h-4 sm:w-5 sm:h-5" />
            <input
              type="text"
              placeholder="Search error messages, emails, endpoints..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1); // Reset to first page on search
              }}
              className="w-full pl-8 sm:pl-10 lg:pl-12 pr-3 sm:pr-4 py-1.5 sm:py-2 lg:py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white text-xs sm:text-sm lg:text-base shadow-sm hover:shadow-md transition-all duration-200 placeholder:text-gray-400"
            />
            {/* Mobile Filter Toggle Button */}
            <button
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className="sm:hidden px-2.5 py-1.5 border-2 border-gray-300 rounded-lg bg-white hover:border-red-500 hover:bg-red-50 transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md"
              aria-label="Toggle filters"
            >
              <Filter className={`w-4 h-4 ${hasActiveFilters ? "text-red-600" : "text-gray-600"}`} />
              {hasActiveFilters && <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>}
              {isFiltersOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {/* ✅ NEW: Advanced Filters - Collapsible on Mobile */}
        {(isFiltersOpen || !isFiltersOpen) && (
          <div className={`pt-4 border-t border-gray-200 ${isFiltersOpen ? "block" : "hidden sm:block"}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Dropdown
                  options={[
                    { value: "all", label: "All Status" },
                    { value: "new", label: "New" },
                    { value: "investigating", label: "Investigating" },
                    { value: "resolved", label: "Resolved" },
                    { value: "dismissed", label: "Dismissed" },
                  ]}
                  value={statusFilter}
                  onChange={(value) => {
                    setStatusFilter(value as ErrorReportStatus | "all");
                    setPage(1);
                  }}
                  className="w-full"
                />
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <Dropdown
                  options={[
                    { value: "all", label: "All Categories" },
                    { value: "payment", label: "Payment" },
                    { value: "network", label: "Network" },
                    { value: "api", label: "API" },
                    { value: "system", label: "System" },
                    { value: "recovery", label: "Recovery" },
                    { value: "unknown", label: "Unknown" },
                  ]}
                  value={categoryFilter}
                  onChange={(value) => {
                    setCategoryFilter(value);
                    setPage(1);
                  }}
                  className="w-full"
                />
              </div>

              {/* Severity Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                <Dropdown
                  options={[
                    { value: "all", label: "All Severities" },
                    { value: "critical", label: "Critical" },
                    { value: "high", label: "High" },
                    { value: "medium", label: "Medium" },
                    { value: "low", label: "Low" },
                  ]}
                  value={severityFilter}
                  onChange={(value) => {
                    setSeverityFilter(value);
                    setPage(1);
                  }}
                  className="w-full"
                />
              </div>

              {/* User Email Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User Email</label>
                <input
                  type="text"
                  placeholder="Filter by email..."
                  value={userEmailFilter}
                  onChange={(e) => {
                    setUserEmailFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white text-xs sm:text-sm shadow-sm hover:shadow-md transition-all duration-200"
                />
              </div>

              {/* Auto-Logged Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Auto-Logged</label>
                <Dropdown
                  options={[
                    { value: "all", label: "All" },
                    { value: "true", label: "Auto-Logged Only" },
                    { value: "false", label: "User-Reported Only" },
                  ]}
                  value={autoLoggedFilter}
                  onChange={(value) => {
                    setAutoLoggedFilter(value as "all" | "true" | "false");
                    setPage(1);
                  }}
                  className="w-full"
                />
              </div>

              {/* API Endpoint Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Endpoint</label>
                <input
                  type="text"
                  placeholder="Filter by endpoint..."
                  value={apiEndpointFilter}
                  onChange={(e) => {
                    setApiEndpointFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white text-xs sm:text-sm shadow-sm hover:shadow-md transition-all duration-200"
                />
              </div>

              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white text-xs sm:text-sm shadow-sm hover:shadow-md transition-all duration-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white text-xs sm:text-sm shadow-sm hover:shadow-md transition-all duration-200"
                />
              </div>

              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <div className="flex items-end">
                  <button
                    onClick={clearAllFilters}
                    className="w-full px-4 py-2 border-2 border-red-300 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-400 transition-colors font-medium"
                  >
                    Clear All Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ✅ NEW: Grouping Controls */}
        {!showAnalytics && (
          <div className="pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">Group By</label>
            <Dropdown
              options={[
                { value: "none", label: "No Grouping" },
                { value: "error", label: "Error Message" },
                { value: "endpoint", label: "API Endpoint" },
                { value: "user", label: "User" },
              ]}
              value={groupBy}
              onChange={(value) => {
                setGroupBy(value as "none" | "error" | "endpoint" | "user");
                setPage(1);
              }}
              className="w-full sm:w-auto"
            />
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        {isLoading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            <p className="text-gray-600 mt-4">Loading error reports...</p>
          </div>
        ) : !data?.reports || data.reports.length === 0 ? (
          <div className="p-12 text-center">
            <Bug className="w-12 h-12 mx-auto text-gray-400" />
            <p className="text-gray-600 mt-4">No error reports found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    {/* ✅ NEW: Bulk select checkbox */}
                    <th className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      <button
                        onClick={handleSelectAll}
                        className="flex items-center justify-center"
                        title="Select all"
                      >
                        {selectedReports.size === data.reports.length && data.reports.length > 0 ? (
                          <CheckSquare className="w-5 h-5 text-red-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                    </th>
                    <th className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Error
                    </th>
                    <th className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Severity
                    </th>
                    <th className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      API Endpoint
                    </th>
                    <th className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {groupBy !== "none" && groupedReports ? (
                    // ✅ NEW: Grouped view
                    groupedReports.map((group) => (
                      <React.Fragment key={group.key}>
                        <tr className="bg-gray-100">
                          <td colSpan={9} className="px-4 py-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900">{group.key}</span>
                                <span className="text-xs text-gray-600 bg-gray-200 px-2 py-1 rounded">
                                  {group.count} {group.count === 1 ? "error" : "errors"}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {group.reports.map((report) => {
                          const StatusIcon = statusIcons[report.status];
                          const isSelected = selectedReports.has(report._id);
                          return (
                            <tr key={report._id} className={`hover:bg-gray-50 ${isSelected ? "bg-red-50" : ""}`}>
                              {/* ✅ NEW: Checkbox column */}
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleToggleSelect(report._id)}
                                  className="flex items-center justify-center"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-5 h-5 text-red-600" />
                                  ) : (
                                    <Square className="w-5 h-5 text-gray-400" />
                                  )}
                                </button>
                              </td>
                              <td className="px-4 py-3 pl-8">
                                <div className="text-sm font-medium text-gray-900 max-w-md truncate">
                                  {report.errorMessage}
                                </div>
                                {report.autoLogged && (
                                  <span className="text-xs text-gray-500 mt-1 block">Auto-logged</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {report.category ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                    {report.category}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {report.severity ? (
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                      report.severity === "critical"
                                        ? "bg-red-100 text-red-800"
                                        : report.severity === "high"
                                        ? "bg-orange-100 text-orange-800"
                                        : "bg-yellow-100 text-yellow-800"
                                    }`}
                                  >
                                    {report.severity}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusColors[report.status]}`}
                                >
                                  <StatusIcon className="w-3 h-3" />
                                  {report.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {report.isAuthenticated ? (
                                  <ClickableUserDisplay
                                    displayText={
                                      typeof report.userId === "object" && report.userId && report.userId !== null && "firstName" in report.userId && "lastName" in report.userId
                                        ? formatDisplayName((report.userId as { firstName?: string; lastName?: string }).firstName, (report.userId as { firstName?: string; lastName?: string }).lastName) || report.userEmail || "Unknown"
                                        : report.userEmail || "Unknown"
                                    }
                                    userId={typeof report.userId === "string" ? report.userId : null}
                                  />
                                ) : (
                                  <span>
                                    {report.userEmail || report.guestEmail ? (
                                      <span className="text-gray-600">Guest: {report.userEmail || report.guestEmail}</span>
                                    ) : (
                                      <span className="text-gray-400">Anonymous</span>
                                    )}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                                {report.apiEndpoint ? (
                                  <span className="truncate max-w-xs block">
                                    {report.httpMethod} {report.apiEndpoint}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {format(new Date(report.createdAt), "MMM d, yyyy HH:mm")}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleViewReport(report)}
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                >
                                  <Eye className="w-5 h-5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))
                  ) : (
                    // Regular view (no grouping)
                    data.reports.map((report) => {
                      const StatusIcon = statusIcons[report.status];
                      const isSelected = selectedReports.has(report._id);
                      return (
                        <tr key={report._id} className={`hover:bg-gray-50 ${isSelected ? "bg-red-50" : ""}`}>
                          {/* ✅ NEW: Checkbox column */}
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleToggleSelect(report._id)}
                              className="flex items-center justify-center"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-red-600" />
                              ) : (
                                <Square className="w-5 h-5 text-gray-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900 max-w-md truncate">
                              {report.errorMessage}
                            </div>
                            {report.autoLogged && (
                              <span className="text-xs text-gray-500 mt-1 block">Auto-logged</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {report.category ? (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                {report.category}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {report.severity ? (
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                  report.severity === "critical"
                                    ? "bg-red-100 text-red-800"
                                    : report.severity === "high"
                                    ? "bg-orange-100 text-orange-800"
                                    : "bg-yellow-100 text-yellow-800"
                                }`}
                              >
                                {report.severity}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusColors[report.status]}`}
                            >
                              <StatusIcon className="w-3 h-3" />
                              {report.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {report.isAuthenticated ? (
                              <ClickableUserDisplay
                                displayText={
                                  typeof report.userId === "object" && report.userId && report.userId !== null && "firstName" in report.userId && "lastName" in report.userId
                                    ? formatDisplayName((report.userId as { firstName?: string; lastName?: string }).firstName, (report.userId as { firstName?: string; lastName?: string }).lastName) || report.userEmail || "Unknown"
                                    : report.userEmail || "Unknown"
                                }
                                userId={typeof report.userId === "string" ? report.userId : null}
                              />
                            ) : (
                              <span>
                                {report.userEmail || report.guestEmail ? (
                                  <span className="text-gray-600">Guest: {report.userEmail || report.guestEmail}</span>
                                ) : (
                                  <span className="text-gray-400">Anonymous</span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                            {report.apiEndpoint ? (
                              <span className="truncate max-w-xs block">
                                {report.httpMethod} {report.apiEndpoint}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {format(new Date(report.createdAt), "MMM d, yyyy HH:mm")}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleViewReport(report)}
                              className="text-red-600 hover:text-red-800 transition-colors"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination - Matching UsersManagement pattern */}
            {data.pagination.totalPages > 1 && (
              <div className="px-3 sm:px-4 py-3 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      onClick={() => setPage(1)}
                      disabled={data.pagination.page === 1}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-label="First page"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={data.pagination.page === 1}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm text-gray-700 font-medium">
                      Page {data.pagination.page} of {data.pagination.totalPages}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                      disabled={data.pagination.page === data.pagination.totalPages}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(data.pagination.totalPages)}
                      disabled={data.pagination.page === data.pagination.totalPages}
                      className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-label="Last page"
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      <ErrorReportDetailModal
        report={selectedReport}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedReport(null);
        }}
        onUpdate={handleUpdate}
      />
    </div>
  );
}

