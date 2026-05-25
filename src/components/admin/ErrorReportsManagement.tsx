"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowUp,
  Bug,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Clock,
  Copy,
  Eye,
  Filter,
  Search,
  ShieldAlert,
  Square,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/queries";
import { useToast } from "@/components/ui/Toast";
import Dropdown from "@/components/modals/ui/Dropdown";
import ClickableUserDisplay from "./ClickableUserDisplay";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDisplayName } from "@/utils/display-name";
import { ErrorReportStatus, IErrorReport } from "@/types/error-reporting";
import { cn } from "@/utils/cn";
import { usePermissions } from "@/hooks/usePermissions";

type SortField = "createdAt" | "status" | "errorMessage" | "category" | "severity";
type SortOrder = "asc" | "desc";
type BulkAction = ErrorReportStatus | "archive";

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
    needsAttention?: number;
    criticalUnresolved?: number;
    repeatedErrors?: number;
    affectedUsers?: number;
  };
}

interface ErrorReportDetailModalProps {
  report: IErrorReport | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const statusOptions: Array<{ value: ErrorReportStatus | "all"; label: string }> = [
  { value: "all", label: "All Status" },
  { value: "new", label: "New" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

const statusColors: Record<ErrorReportStatus, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  investigating: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-200",
  resolved: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200",
  dismissed: "bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-neutral-200",
};

const severityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-200",
};

const categoryColors: Record<string, string> = {
  payment: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  network: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  api: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  system: "bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-200",
  recovery: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
};

function httpStatusColor(status?: number): string {
  if (!status) return "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300";
  if (status >= 500) return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200";
  if (status >= 400) return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200";
  return "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300";
}

function getUserDisplay(report: IErrorReport) {
  const userId = report.userId as unknown;
  if (report.isAuthenticated) {
    if (typeof userId === "object" && userId && "firstName" in userId && "lastName" in userId) {
      const typedUser = userId as { firstName?: string; lastName?: string; email?: string; _id?: string };
      return {
        text: formatDisplayName(typedUser.firstName, typedUser.lastName) || typedUser.email || report.userEmail || "Unknown",
        userId: typedUser._id || null,
      };
    }

    return {
      text: report.userEmail || "Unknown",
      userId: typeof report.userId === "string" ? report.userId : null,
    };
  }

  return {
    text: report.userEmail || report.guestEmail ? `Guest: ${report.userEmail || report.guestEmail}` : "Anonymous",
    userId: null,
  };
}

function formatMaybeDate(value?: Date | string) {
  return value ? format(new Date(value), "MMM d, yyyy HH:mm") : "Unknown";
}

function Badge({ value, type }: { value?: string; type: "status" | "severity" | "category" }) {
  if (!value) {
    return <span className="text-xs text-gray-400 dark:text-neutral-500">Missing</span>;
  }

  const classes =
    type === "status"
      ? statusColors[value as ErrorReportStatus]
      : type === "severity"
      ? severityColors[value]
      : categoryColors[value];

  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold capitalize", classes || "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200")}>
      {value}
    </span>
  );
}

function SortButton({
  field,
  activeField,
  sortOrder,
  onSort,
  children,
}: {
  field: SortField;
  activeField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}) {
  const active = field === activeField;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-left transition-colors hover:text-gray-800 dark:hover:text-neutral-100"
    >
      {children}
      {active ? (
        sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : null}
    </button>
  );
}

function ErrorReportDetailModal({ report, isOpen, onClose, onUpdate }: ErrorReportDetailModalProps) {
  const [status, setStatus] = useState<ErrorReportStatus>("new");
  const [adminNotes, setAdminNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (report) {
      setStatus(report.status);
      setAdminNotes(report.adminNotes || "");
    }
  }, [report]);

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [isOpen, onClose]);

  const updateMutation = useMutation({
    mutationFn: async (data: { status?: ErrorReportStatus; adminNotes?: string }) => {
      if (!report) throw new Error("No report selected");
      return apiPatch(`/api/admin/error-reports/${report._id}`, data);
    },
    onSuccess: () => {
      showToast({ type: "success", title: "Updated", message: "Error report updated successfully" });
      onUpdate();
      onClose();
    },
    onError: (error: Error) => {
      showToast({ type: "error", title: "Update Failed", message: error.message || "Failed to update error report" });
    },
  });

  const handleSubmit = async (nextStatus = status) => {
    setIsUpdating(true);
    try {
      await updateMutation.mutateAsync({
        status: nextStatus,
        adminNotes: adminNotes.trim() || undefined,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const copyValue = async (label: string, value?: string | number) => {
    if (!value) return;
    await navigator.clipboard.writeText(String(value));
    showToast({ type: "success", title: "Copied", message: `${label} copied to clipboard` });
  };

  if (!isOpen || !report) return null;

  const userDisplay = getUserDisplay(report);
  const pageDisplay = report.route || report.currentUrl || "";
  const apiDisplay = report.apiEndpoint ? `${report.httpMethod || ""} ${report.apiEndpoint}`.trim() : "";
  const diagnosticContext = [
    `Message: ${report.errorMessage}`,
    report.errorName ? `Name: ${report.errorName}` : null,
    apiDisplay ? `API: ${apiDisplay}` : null,
    report.httpStatus ? `HTTP Status: ${report.httpStatus}` : null,
    pageDisplay ? `Page: ${pageDisplay}` : null,
    `User: ${userDisplay.text}`,
    report.deduplicationHash ? `Deduplication Hash: ${report.deduplicationHash}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="error-report-dialog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl outline-none sm:max-h-[92vh] sm:rounded-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none"
      >
        <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-red-600 to-red-700 px-4 py-3.5 text-white sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id="error-report-dialog-title" className="text-base font-bold sm:text-2xl">
              Investigation Workspace
            </h2>
            <p className="mt-0.5 text-xs text-red-100 sm:mt-1 sm:text-sm">Reported {formatMaybeDate(report.createdAt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close error report details"
            className="-mr-1 rounded-lg p-1.5 text-white transition-colors hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <XCircle className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:space-y-5 sm:p-6">
          <section className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge value={report.severity} type="severity" />
                  <Badge value={report.category} type="category" />
                  <Badge value={report.status} type="status" />
                  {report.autoLogged && (
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-800">
                      Auto-logged
                    </span>
                  )}
                </div>
                <p className="break-words text-sm font-semibold text-red-950 dark:text-red-100">{report.errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => copyValue("Diagnostic context", diagnosticContext)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              >
                <Copy className="h-4 w-4" />
                Copy Context
              </button>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-3 sm:p-4 dark:border-neutral-700">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">User</h3>
              <div className="mt-2 break-words text-sm font-medium text-gray-900 dark:text-white">
                {userDisplay.userId ? (
                  <ClickableUserDisplay displayText={userDisplay.text} userId={userDisplay.userId} />
                ) : (
                  <span>{userDisplay.text}</span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-neutral-400">
                {report.isAuthenticated ? "Authenticated user" : "Guest or anonymous session"}
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-3 sm:p-4 dark:border-neutral-700">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">API</h3>
              <p className="mt-2 break-all font-mono text-sm text-gray-900 dark:text-white">
                {apiDisplay || <span className="font-sans text-gray-400 dark:text-neutral-600">No API call recorded</span>}
              </p>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-neutral-400">
                {report.httpStatus ? `HTTP ${report.httpStatus}` : "Status not captured"}
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-3 sm:p-4 dark:border-neutral-700">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">Page</h3>
              <p className="mt-2 break-all font-mono text-sm text-gray-900 dark:text-white">
                {pageDisplay || <span className="font-sans text-gray-400 dark:text-neutral-600">No page recorded</span>}
              </p>
              <p className="mt-1.5 truncate text-xs text-gray-500 dark:text-neutral-400" title={report.referrer || undefined}>
                {report.referrer ? `via ${report.referrer}` : "No referrer captured"}
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-3 sm:p-4 dark:border-neutral-700">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">Environment</h3>
              <p className="mt-2 text-sm text-gray-900 dark:text-white">
                {report.browserInfo
                  ? `${report.browserInfo.name || "Unknown"} ${report.browserInfo.version || ""}`
                  : "Unknown browser"}
              </p>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-neutral-400">
                {report.browserInfo?.os || "OS unknown"}
              </p>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {report.errorStack && (
              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Stack Trace</h3>
                  <button
                    type="button"
                    onClick={() => copyValue("Stack trace", report.errorStack)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
                  {report.errorStack}
                </pre>
              </div>
            )}

            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Console Logs / Notes</h3>
              <div className="max-h-72 space-y-2 overflow-y-auto overflow-x-hidden rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-950">
                {report.consoleErrors?.length ? (
                  report.consoleErrors.map((consoleError, index) => (
                    <div key={`${consoleError.timestamp}-${index}`} className="min-w-0 overflow-hidden rounded-md bg-white p-2 text-xs text-gray-700 dark:bg-neutral-900 dark:text-neutral-300">
                      <p className="whitespace-pre-wrap break-all font-medium">{consoleError.message}</p>
                      <p className="mt-1 break-all text-gray-500 dark:text-neutral-500">
                        {consoleError.source || "Unknown source"}
                        {consoleError.line ? `:${consoleError.line}` : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-neutral-400">No console errors captured.</p>
                )}
              </div>
            </div>
          </section>

          {report.userNotes && (
            <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
              <h3 className="mb-2 text-sm font-semibold text-blue-950 dark:text-blue-100">User Notes</h3>
              <p className="whitespace-pre-wrap text-sm text-blue-900 dark:text-blue-200">{report.userNotes}</p>
            </section>
          )}

          <section className="rounded-lg border border-gray-200 p-4 dark:border-neutral-700">
            <div className="mb-3 flex flex-wrap gap-2">
              {(["investigating", "resolved", "dismissed"] as ErrorReportStatus[]).map((quickStatus) => (
                <button
                  key={quickStatus}
                  type="button"
                  disabled={isUpdating}
                  onClick={() => {
                    setStatus(quickStatus);
                    void handleSubmit(quickStatus);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold capitalize text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Mark {quickStatus}
                </button>
              ))}
            </div>
            <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-neutral-100">Workflow Status</label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ErrorReportStatus)}
              className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
            >
              <option value="new">New</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
            <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-neutral-100">Admin Notes</label>
            <textarea
              value={adminNotes}
              onChange={(event) => setAdminNotes(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
              placeholder="Add investigation notes, suspected cause, or resolution details..."
            />
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 bg-gray-50/80 p-4 dark:border-neutral-700 dark:bg-neutral-950/50 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isUpdating}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-neutral-900"
          >
            {isUpdating ? "Updating..." : "Save Investigation"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ErrorReportsManagement() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { has } = usePermissions();
  const canEditErrorReports = has("errorReports.edit");
  const canDeleteErrorReports = has("errorReports.delete");

  const [page, setPage] = useState(Number(searchParams.get("page") || 1));
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState<ErrorReportStatus | "all">(
    (searchParams.get("status") as ErrorReportStatus | null) || "all"
  );
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") || "all");
  const [severityFilter, setSeverityFilter] = useState(searchParams.get("severity") || "all");
  const [userEmailFilter, setUserEmailFilter] = useState(searchParams.get("userEmail") || "");
  const [autoLoggedFilter, setAutoLoggedFilter] = useState(searchParams.get("autoLogged") || "all");
  const [apiEndpointFilter, setApiEndpointFilter] = useState(searchParams.get("apiEndpoint") || "");
  const [pageUrlFilter, setPageUrlFilter] = useState(searchParams.get("pageUrl") || "");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  const [sortBy, setSortBy] = useState<SortField>((searchParams.get("sortBy") as SortField | null) || "createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>((searchParams.get("sortOrder") as SortOrder | null) || "desc");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<IErrorReport | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());

  const debouncedSearch = useDebounce(search.trim(), 350);
  const debouncedUserEmail = useDebounce(userEmailFilter.trim(), 350);
  const debouncedApiEndpoint = useDebounce(apiEndpointFilter.trim(), 350);
  const debouncedPageUrl = useDebounce(pageUrlFilter.trim(), 350);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (severityFilter !== "all") params.set("severity", severityFilter);
    if (debouncedUserEmail) params.set("userEmail", debouncedUserEmail);
    if (autoLoggedFilter !== "all") params.set("autoLogged", autoLoggedFilter);
    if (debouncedApiEndpoint) params.set("apiEndpoint", debouncedApiEndpoint);
    if (debouncedPageUrl) params.set("pageUrl", debouncedPageUrl);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return params;
  }, [
    page,
    limit,
    sortBy,
    sortOrder,
    statusFilter,
    debouncedSearch,
    categoryFilter,
    severityFilter,
    debouncedUserEmail,
    autoLoggedFilter,
    debouncedApiEndpoint,
    debouncedPageUrl,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    router.replace(`${pathname}?${queryParams.toString()}`, { scroll: false });
  }, [pathname, queryParams, router]);

  const { data, isLoading, error, refetch } = useQuery<ErrorReportsResponse>({
    queryKey: ["admin-error-reports", queryParams.toString()],
    queryFn: () => apiGet(`/api/admin/error-reports?${queryParams.toString()}`),
  });

  useEffect(() => {
    setSelectedReports(new Set());
  }, [queryParams]);

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ reportIds, status }: { reportIds: string[]; status: ErrorReportStatus }) => {
      const response = await fetch("/api/admin/error-reports/bulk-delete", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportIds, status }),
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update selected reports");
      }
      return response.json() as Promise<{ updatedCount: number; message: string }>;
    },
    onSuccess: (result) => {
      showToast({ type: "success", title: "Reports Updated", message: result.message });
      setSelectedReports(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-error-reports"] });
    },
    onError: (mutationError: Error) => {
      showToast({ type: "error", title: "Bulk Update Failed", message: mutationError.message });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (reportIds: string[]) => {
      const response = await fetch("/api/admin/error-reports/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportIds, reason: "Archived from admin error reports" }),
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to archive selected reports");
      }
      return response.json() as Promise<{ archivedCount: number; message: string }>;
    },
    onSuccess: (result) => {
      showToast({ type: "success", title: "Reports Archived", message: result.message });
      setSelectedReports(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-error-reports"] });
    },
    onError: (mutationError: Error) => {
      showToast({ type: "error", title: "Archive Failed", message: mutationError.message });
    },
  });

  const hasActiveFilters =
    !!debouncedSearch ||
    statusFilter !== "all" ||
    categoryFilter !== "all" ||
    severityFilter !== "all" ||
    !!debouncedUserEmail ||
    autoLoggedFilter !== "all" ||
    !!debouncedApiEndpoint ||
    !!debouncedPageUrl ||
    !!startDate ||
    !!endDate;

  const handleFilterChange = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const handleSort = (field: SortField) => {
    if (field === sortBy) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setSeverityFilter("all");
    setUserEmailFilter("");
    setAutoLoggedFilter("all");
    setApiEndpointFilter("");
    setPageUrlFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const applyTriageFilter = (type: "attention" | "critical" | "recent") => {
    if (type === "attention") {
      setStatusFilter("new");
    }
    if (type === "critical") {
      setSeverityFilter("critical");
      setStatusFilter("new");
    }
    if (type === "recent") {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      setStartDate(yesterday.toISOString().slice(0, 10));
    }
    setPage(1);
  };

  const handleToggleSelect = (reportId: string) => {
    setSelectedReports((previous) => {
      const next = new Set(previous);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!data?.reports) return;
    setSelectedReports((previous) =>
      previous.size === data.reports.length ? new Set() : new Set(data.reports.map((report) => report._id))
    );
  };

  const handleBulkAction = (action: BulkAction) => {
    const reportIds = Array.from(selectedReports);
    if (reportIds.length === 0) {
      showToast({ type: "error", title: "No Selection", message: "Select at least one error report first." });
      return;
    }

    if (action === "archive") {
      if (!confirm(`Archive ${reportIds.length} selected report(s)? They will be hidden from the default list.`)) return;
      archiveMutation.mutate(reportIds);
      return;
    }

    bulkStatusMutation.mutate({ reportIds, status: action });
  };

  const handleViewReport = (report: IErrorReport) => {
    setSelectedReport(report);
    setIsDetailModalOpen(true);
  };

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-error-reports"] });
    refetch();
  };

  const reports = data?.reports || [];
  const pagination = data?.pagination;
  const startResult = pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const endResult = pagination ? Math.min(pagination.page * pagination.limit, pagination.total) : 0;

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/60 dark:bg-red-950/30">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
        <h3 className="text-lg font-semibold text-red-950 dark:text-red-100">Error reports could not be loaded</h3>
        <p className="mt-2 text-sm text-red-800 dark:text-red-200">Refresh and try again. If this keeps happening, check the admin API logs.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white lg:text-xl">Error Reports</h2>
        <p className="text-sm text-gray-600 dark:text-neutral-400">Triage user and system errors by urgency, impact, and workflow status.</p>
      </div>

      {data?.statistics && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          {[
            {
              key: "attention",
              label: "Needs Attention",
              value: data.statistics.needsAttention || 0,
              icon: ShieldAlert,
              iconClassName: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300",
              active: statusFilter === "new" && severityFilter === "all",
              onClick: () => applyTriageFilter("attention"),
            },
            {
              key: "critical",
              label: "Critical Unresolved",
              value: data.statistics.criticalUnresolved || 0,
              icon: AlertCircle,
              iconClassName: "bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300",
              active: severityFilter === "critical" && statusFilter === "new",
              onClick: () => applyTriageFilter("critical"),
            },
            {
              key: "recent",
              label: "New Last 24h",
              value: data.statistics.recentCount,
              icon: Clock,
              iconClassName: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
              active: !!startDate,
              onClick: () => applyTriageFilter("recent"),
            },
            {
              key: "repeated",
              label: "Repeated Errors",
              value: data.statistics.repeatedErrors || 0,
              icon: Bug,
              iconClassName: "bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300",
              active: false,
              onClick: null,
            },
            {
              key: "users",
              label: "Affected Users",
              value: data.statistics.affectedUsers || 0,
              icon: Users,
              iconClassName: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
              active: false,
              onClick: null,
            },
          ].map((card) => {
            const Icon = card.icon;
            const baseClass = cn(
              "rounded-xl border bg-white p-3 text-left shadow-sm sm:p-4 dark:bg-neutral-900 dark:shadow-none",
              card.active
                ? "border-red-400 ring-1 ring-red-400/40 dark:border-red-500"
                : "border-gray-200 dark:border-neutral-700"
            );
            const cardBody = (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-gray-500 sm:text-xs dark:text-neutral-400">{card.label}</p>
                  <p className="mt-1.5 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">{card.value}</p>
                </div>
                <div className={cn("shrink-0 rounded-lg p-2 sm:rounded-xl sm:p-3", card.iconClassName)}>
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </div>
            );
            if (card.onClick) {
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={card.onClick}
                  aria-pressed={card.active}
                  className={cn(baseClass, "transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500")}
                >
                  {cardBody}
                </button>
              );
            }
            return (
              <div key={card.key} className={baseClass}>
                {cardBody}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-white via-gray-50 to-white p-3 shadow-sm dark:border-neutral-700 dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900 dark:shadow-none sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search messages, emails, endpoints, notes..."
              className="w-full rounded-lg border-2 border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsFiltersOpen((current) => !current)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800 sm:hidden"
            aria-expanded={isFiltersOpen}
          >
            <Filter className="h-4 w-4" />
            Filters
            {isFiltersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        <div className={cn("mt-4 space-y-4 border-t border-gray-200 pt-4 dark:border-neutral-700", isFiltersOpen ? "block" : "hidden sm:block")}>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">Categorise</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Dropdown
                options={statusOptions}
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value as ErrorReportStatus | "all");
                  setPage(1);
                }}
              />
              <Dropdown
                options={[
                  { value: "all", label: "All Categories" },
                  { value: "payment", label: "Payment" },
                  { value: "network", label: "Network" },
                  { value: "api", label: "API" },
                  { value: "system", label: "System" },
                  { value: "recovery", label: "Recovery" },
                  { value: "missing", label: "Missing Category" },
                ]}
                value={categoryFilter}
                onChange={(value) => handleFilterChange(setCategoryFilter, value)}
              />
              <Dropdown
                options={[
                  { value: "all", label: "All Severities" },
                  { value: "critical", label: "Critical" },
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "missing", label: "Missing Severity" },
                ]}
                value={severityFilter}
                onChange={(value) => handleFilterChange(setSeverityFilter, value)}
              />
              <Dropdown
                options={[
                  { value: "all", label: "All Sources" },
                  { value: "true", label: "Auto-Logged Only" },
                  { value: "false", label: "User-Reported Only" },
                ]}
                value={autoLoggedFilter}
                onChange={(value) => handleFilterChange(setAutoLoggedFilter, value)}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">Where & who</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input
                type="text"
                placeholder="User email..."
                value={userEmailFilter}
                onChange={(event) => {
                  setUserEmailFilter(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
              />
              <input
                type="text"
                placeholder="API endpoint (e.g. /api/stripe/create-subscription)"
                value={apiEndpointFilter}
                onChange={(event) => {
                  setApiEndpointFilter(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
              />
              <input
                type="text"
                placeholder="Page URL (e.g. /promotions/milwaukee)"
                value={pageUrlFilter}
                onChange={(event) => {
                  setPageUrlFilter(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400">When</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={startDate}
                onChange={(event) => handleFilterChange(setStartDate, event.target.value)}
                className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                aria-label="Start date"
              />
              <input
                type="date"
                value={endDate}
                onChange={(event) => handleFilterChange(setEndDate, event.target.value)}
                className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                aria-label="End date"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
            >
              <X className="h-4 w-4" />
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {selectedReports.size > 0 && (canEditErrorReports || canDeleteErrorReports) && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-red-900 dark:text-red-100">{selectedReports.size} selected</p>
          <div className="flex flex-wrap gap-2">
            {canEditErrorReports &&
              (["investigating", "resolved", "dismissed"] as ErrorReportStatus[]).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => handleBulkAction(action)}
                  disabled={bulkStatusMutation.isPending}
                  className="rounded-lg bg-white px-3 py-2 text-xs font-semibold capitalize text-gray-800 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50 dark:bg-neutral-900 dark:text-neutral-100 dark:ring-red-900"
                >
                  Mark {action}
                </button>
              ))}
            {canDeleteErrorReports && (
              <button
                type="button"
                onClick={() => handleBulkAction("archive")}
                disabled={archiveMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Archive className="h-4 w-4" />
                Archive
              </button>
            )}
          </div>
        </div>
      )}

      {pagination && (
        <div className="text-sm text-gray-600 dark:text-neutral-400">
          Showing {startResult} to {endResult} of {pagination.total} reports
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none">
        {isLoading ? (
          <div className="space-y-4 p-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex animate-pulse items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-neutral-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-neutral-700" />
                  <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-neutral-700" />
                </div>
              </div>
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center">
            <Bug className="mx-auto mb-4 h-14 w-14 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No error reports found</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-neutral-400">
              {hasActiveFilters ? "Try clearing filters or widening the date range." : "No reports have been captured yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-neutral-700">
                    <th className="w-12 bg-gray-50 px-4 py-3 text-left dark:bg-neutral-800">
                      <button type="button" onClick={handleSelectAll} aria-label="Select all reports" className="rounded focus:outline-none focus:ring-2 focus:ring-red-500">
                        {selectedReports.size === reports.length ? <CheckSquare className="h-5 w-5 text-red-600" /> : <Square className="h-5 w-5 text-gray-400" />}
                      </button>
                    </th>
                    {[
                      ["errorMessage", "Error"],
                      ["category", "Category"],
                      ["severity", "Severity"],
                    ].map(([field, label]) => (
                      <th key={field} className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                        <SortButton field={field as SortField} activeField={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                          {label}
                        </SortButton>
                      </th>
                    ))}
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Status</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">User</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">API</th>
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                      <SortButton field="createdAt" activeField={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                        Date
                      </SortButton>
                    </th>
                    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
                  {reports.map((report) => {
                    const selected = selectedReports.has(report._id);
                    const user = getUserDisplay(report);
                    return (
                      <tr key={report._id} className={cn("transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70", selected ? "bg-red-50 dark:bg-red-950/20" : "")}>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => handleToggleSelect(report._id)} aria-label={`Select report ${report._id}`} className="rounded focus:outline-none focus:ring-2 focus:ring-red-500">
                            {selected ? <CheckSquare className="h-5 w-5 text-red-600" /> : <Square className="h-5 w-5 text-gray-400" />}
                          </button>
                        </td>
                        <td className="max-w-md px-4 py-3">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white" title={report.errorMessage}>{report.errorMessage}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400">
                            <span>{report.autoLogged ? "Auto-logged" : "User-reported"}</span>
                            {(report.route || report.currentUrl) && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate font-mono" title={report.route || report.currentUrl}>
                                  {report.route || report.currentUrl}
                                </span>
                              </>
                            )}
                          </p>
                        </td>
                        <td className="px-4 py-3"><Badge value={report.category} type="category" /></td>
                        <td className="px-4 py-3"><Badge value={report.severity} type="severity" /></td>
                        <td className="px-4 py-3">
                          {report.httpStatus ? (
                            <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold", httpStatusColor(report.httpStatus))}>
                              HTTP {report.httpStatus}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-neutral-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                          {user.userId ? <ClickableUserDisplay displayText={user.text} userId={user.userId} /> : user.text}
                        </td>
                        <td className="max-w-xs px-4 py-3 font-mono text-xs text-gray-600 dark:text-neutral-400">
                          {report.apiEndpoint ? (
                            <span className="block truncate" title={`${report.httpMethod || ""} ${report.apiEndpoint}`}>
                              {report.httpMethod && <span className="mr-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-700 dark:bg-neutral-800 dark:text-neutral-300">{report.httpMethod}</span>}
                              {report.apiEndpoint}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-neutral-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-neutral-400 whitespace-nowrap">{formatMaybeDate(report.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => handleViewReport(report)} aria-label="View report details" className="inline-flex items-center justify-center rounded-lg p-2 text-red-600 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 dark:hover:bg-red-950/30">
                            <Eye className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-200 dark:divide-neutral-700 sm:hidden">
              {reports.map((report) => {
                const selected = selectedReports.has(report._id);
                const user = getUserDisplay(report);
                const pageDisplay = report.route || report.currentUrl;
                return (
                  <div key={report._id} className={cn("p-4", selected ? "bg-red-50 dark:bg-red-950/20" : "")}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-gray-900 dark:text-white">{report.errorMessage}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-wider text-gray-400 dark:text-neutral-500">
                          {report.autoLogged ? "Auto-logged" : "User-reported"} · {formatMaybeDate(report.createdAt)}
                        </p>
                      </div>
                      <button type="button" onClick={() => handleToggleSelect(report._id)} aria-label={`Select report ${report._id}`} className="shrink-0 rounded p-1 -m-1 focus:outline-none focus:ring-2 focus:ring-red-500">
                        {selected ? <CheckSquare className="h-5 w-5 text-red-600" /> : <Square className="h-5 w-5 text-gray-400" />}
                      </button>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      <Badge value={report.severity} type="severity" />
                      <Badge value={report.category} type="category" />
                      {report.httpStatus ? (
                        <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold", httpStatusColor(report.httpStatus))}>
                          HTTP {report.httpStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-neutral-500">No status</span>
                      )}
                    </div>
                    <dl className="space-y-1.5 text-xs">
                      <div className="flex items-baseline gap-2">
                        <dt className="w-12 shrink-0 font-semibold uppercase tracking-wider text-gray-400 dark:text-neutral-500">User</dt>
                        <dd className="min-w-0 flex-1 truncate text-gray-700 dark:text-neutral-300">{user.text}</dd>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <dt className="w-12 shrink-0 font-semibold uppercase tracking-wider text-gray-400 dark:text-neutral-500">API</dt>
                        <dd className="min-w-0 flex-1 truncate font-mono text-gray-700 dark:text-neutral-300">
                          {report.apiEndpoint ? `${report.httpMethod || ""} ${report.apiEndpoint}`.trim() : <span className="text-gray-400 dark:text-neutral-600">—</span>}
                        </dd>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <dt className="w-12 shrink-0 font-semibold uppercase tracking-wider text-gray-400 dark:text-neutral-500">Page</dt>
                        <dd className="min-w-0 flex-1 truncate font-mono text-gray-700 dark:text-neutral-300">
                          {pageDisplay || <span className="text-gray-400 dark:text-neutral-600">—</span>}
                        </dd>
                      </div>
                    </dl>
                    <button type="button" onClick={() => handleViewReport(report)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">
                      <Eye className="h-4 w-4" />
                      View Investigation
                    </button>
                  </div>
                );
              })}
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="border-t border-gray-200 px-4 py-3 dark:border-neutral-700">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPage(1)} disabled={pagination.page === 1} className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:text-gray-800 disabled:opacity-50 dark:border-neutral-600 dark:hover:text-neutral-100" aria-label="First page">
                      <ChevronsLeft className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={pagination.page === 1} className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:text-gray-800 disabled:opacity-50 dark:border-neutral-600 dark:hover:text-neutral-100" aria-label="Previous page">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={pagination.page === pagination.totalPages} className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:text-gray-800 disabled:opacity-50 dark:border-neutral-600 dark:hover:text-neutral-100" aria-label="Next page">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setPage(pagination.totalPages)} disabled={pagination.page === pagination.totalPages} className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:text-gray-800 disabled:opacity-50 dark:border-neutral-600 dark:hover:text-neutral-100" aria-label="Last page">
                      <ChevronsRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

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
