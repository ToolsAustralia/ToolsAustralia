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
                  <span className="text-sm text-gray-500">Anonymous</span>
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
    return params.toString();
  }, [page, limit, statusFilter, search]);

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
        <button
          onClick={() => refetch()}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Statistics */}
      {data?.statistics && (
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
      <div className="bg-white p-4 rounded-lg border border-gray-200 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search error messages..."
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
                  {data.reports.map((report) => {
                    const StatusIcon = statusIcons[report.status];
                    return (
                      <tr key={report._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 max-w-md truncate">
                            {report.errorMessage}
                          </div>
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
                            <span className="text-gray-400">Anonymous</span>
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

