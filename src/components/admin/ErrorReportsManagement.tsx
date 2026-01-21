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
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Filter,
  RefreshCw,
  Bug,
  Calendar,
  User,
  Globe,
  FileText,
  MessageSquare,
} from "lucide-react";
import { ErrorReportStatus, IErrorReport } from "@/types/error-reporting";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/queries";
import { useToast } from "@/components/ui/Toast";
import { format } from "date-fns";
import ErrorReportsAnalytics from "./ErrorReportsAnalytics";

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

  const statusColors = {
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
                  <span className="text-sm">
                    {typeof report.userId === "object" && report.userId && report.userId !== null && "firstName" in report.userId && "lastName" in report.userId
                      ? `${String((report.userId as { firstName?: string; lastName?: string }).firstName || "")} ${String((report.userId as { firstName?: string; lastName?: string }).lastName || "")}`.trim() || report.userEmail || "Unknown"
                      : report.userEmail || "Unknown"}
                  </span>
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [groupBy, setGroupBy] = useState<"none" | "error" | "endpoint" | "user">("none");
  const [selectedReport, setSelectedReport] = useState<IErrorReport | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
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

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Error Reports</h2>
          <p className="text-gray-600 mt-1">View and manage error reports from users</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              showAnalytics
                ? "bg-red-600 text-white"
                : "bg-white border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {showAnalytics ? "Hide Analytics" : "Show Analytics"}
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            title="Export to CSV"
          >
            <FileText className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={handleExportJSON}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            title="Export to JSON"
          >
            <FileText className="w-4 h-4" />
            Export JSON
          </button>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Analytics Dashboard */}
      {showAnalytics && data?.reports && (
        <ErrorReportsAnalytics reports={data.reports} />
      )}

      {/* Statistics */}
      {data?.statistics && !showAnalytics && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600">Total Reports</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{data.statistics.total}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600">New</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {data.statistics.byStatus.new}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600">Investigating</div>
            <div className="text-2xl font-bold text-yellow-600 mt-1">
              {data.statistics.byStatus.investigating}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600">Resolved</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {data.statistics.byStatus.resolved}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600">Last 24h</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {data.statistics.recentCount}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search error messages, emails, endpoints..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1); // Reset to first page on search
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as ErrorReportStatus | "all");
              setPage(1); // Reset to first page on filter change
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
          >
            <option value="all">All Status</option>
            <option value="new">New</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            {showAdvancedFilters ? "Hide" : "Show"} Filters
          </button>
        </div>

        {/* ✅ NEW: Advanced Filters */}
        {showAdvancedFilters && (
          <div className="pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="all">All Categories</option>
                <option value="payment">Payment</option>
                <option value="network">Network</option>
                <option value="api">API</option>
                <option value="system">System</option>
                <option value="recovery">Recovery</option>
              </select>
            </div>

            {/* Severity Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
              <select
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            {/* Auto-Logged Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auto-Logged</label>
              <select
                value={autoLoggedFilter}
                onChange={(e) => {
                  setAutoLoggedFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="all">All</option>
                <option value="true">Auto-Logged Only</option>
                <option value="false">User-Reported Only</option>
              </select>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            {/* Clear Filters Button */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setCategoryFilter("all");
                  setSeverityFilter("all");
                  setUserEmailFilter("");
                  setAutoLoggedFilter("all");
                  setApiEndpointFilter("");
                  setStartDate("");
                  setEndDate("");
                  setPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}

        {/* ✅ NEW: Grouping Controls */}
        {!showAnalytics && (
          <div className="pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">Group By</label>
            <select
              value={groupBy}
              onChange={(e) => {
                setGroupBy(e.target.value as "none" | "error" | "endpoint" | "user");
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            >
              <option value="none">No Grouping</option>
              <option value="error">Error Message</option>
              <option value="endpoint">API Endpoint</option>
              <option value="user">User</option>
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
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
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Error
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Severity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      API Endpoint
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                          <td colSpan={8} className="px-4 py-2">
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
                          return (
                            <tr key={report._id} className="hover:bg-gray-50">
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
                                  <span>
                                    {typeof report.userId === "object" && report.userId && report.userId !== null && "firstName" in report.userId && "lastName" in report.userId
                                      ? `${String((report.userId as { firstName?: string; lastName?: string }).firstName || "")} ${String((report.userId as { firstName?: string; lastName?: string }).lastName || "")}`.trim() || report.userEmail || "Unknown"
                                      : report.userEmail || "Unknown"}
                                  </span>
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
                      return (
                        <tr key={report._id} className="hover:bg-gray-50">
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
                              <span>
                                {typeof report.userId === "object" && report.userId && report.userId !== null && "firstName" in report.userId && "lastName" in report.userId
                                  ? `${String((report.userId as { firstName?: string; lastName?: string }).firstName || "")} ${String((report.userId as { firstName?: string; lastName?: string }).lastName || "")}`.trim() || report.userEmail || "Unknown"
                                  : report.userEmail || "Unknown"}
                              </span>
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

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Showing {(data.pagination.page - 1) * data.pagination.limit + 1} to{" "}
                  {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)}{" "}
                  of {data.pagination.total} reports
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={data.pagination.page === 1}
                    className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={data.pagination.page === data.pagination.totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
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

