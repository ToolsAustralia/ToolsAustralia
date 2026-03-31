"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Search, Building, MessageSquare, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { formatDateInAEST } from "@/utils/common/timezone";
import { formatDisplayName } from "@/utils/display-name";
import {
  SubmissionDetailModal,
  getStatusColor,
  type PartnerApplication,
  type ContactSubmission,
} from "@/components/admin/submissions";

const ITEMS_PER_PAGE = 10;

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function SubmissionsManagement() {
  const [activeTab, setActiveTab] = useState<"partner" | "contact">("partner");
  const [partnerApplications, setPartnerApplications] = useState<PartnerApplication[]>([]);
  const [contactSubmissions, setContactSubmissions] = useState<ContactSubmission[]>([]);
  const [partnerPagination, setPartnerPagination] = useState<PaginationInfo>({
    page: 1,
    limit: ITEMS_PER_PAGE,
    total: 0,
    pages: 0,
  });
  const [contactPagination, setContactPagination] = useState<PaginationInfo>({
    page: 1,
    limit: ITEMS_PER_PAGE,
    total: 0,
    pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<PartnerApplication | ContactSubmission | null>(null);
  const [showModal, setShowModal] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Fetch partner applications
  const fetchPartnerApplications = useCallback(
    async (page: number = 1) => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(ITEMS_PER_PAGE),
          ...(statusFilter !== "all" && { status: statusFilter }),
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        });
        const response = await fetch(`/api/partner-applications?${params}`);
        if (response.ok) {
          const data = await response.json();
          setPartnerApplications(data.data.applications || []);
          setPartnerPagination(data.data.pagination || { page: 1, limit: ITEMS_PER_PAGE, total: 0, pages: 0 });
        }
      } catch (error) {
        console.error("Error fetching partner applications:", error);
      }
    },
    [statusFilter, debouncedSearch]
  );

  // Fetch contact submissions
  const fetchContactSubmissions = useCallback(
    async (page: number = 1) => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(ITEMS_PER_PAGE),
          ...(readFilter !== "all" && { readFilter }),
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        });
        const response = await fetch(`/api/contact-submissions?${params}`);
        if (response.ok) {
          const data = await response.json();
          setContactSubmissions(data.data.submissions || []);
          setContactPagination(data.data.pagination || { page: 1, limit: ITEMS_PER_PAGE, total: 0, pages: 0 });
        }
      } catch (error) {
        console.error("Error fetching contact submissions:", error);
      }
    },
    [readFilter, debouncedSearch]
  );

  // Mark submission as read when viewed
  const markAsRead = async (item: PartnerApplication | ContactSubmission) => {
    const endpoint =
      activeTab === "partner"
        ? `/api/partner-applications/${item._id}`
        : `/api/contact-submissions/${item._id}`;
    try {
      await fetch(endpoint, { method: "PATCH" });
      if (activeTab === "partner") {
        await fetchPartnerApplications(partnerPagination.page);
      } else {
        await fetchContactSubmissions(contactPagination.page);
      }
      window.dispatchEvent(new Event("admin-submissions-updated"));
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchPartnerApplications(1), fetchContactSubmissions(1)]);
      setLoading(false);
    };
    fetchData();
  }, [fetchPartnerApplications, fetchContactSubmissions]);

  const goToPage = async (tab: "partner" | "contact", page: number) => {
    setLoading(true);
    if (tab === "partner") {
      await fetchPartnerApplications(page);
    } else {
      await fetchContactSubmissions(page);
    }
    setLoading(false);
  };

  const handleViewDetails = (item: PartnerApplication | ContactSubmission) => {
    setSelectedItem(item);
    setShowModal(true);
    const isRead = "readAt" in item && item.readAt;
    if (!isRead) {
      markAsRead(item);
    }
  };

  const handleModalUpdated = async () => {
    if (activeTab === "partner") {
      await fetchPartnerApplications(partnerPagination.page);
    } else {
      await fetchContactSubmissions(contactPagination.page);
    }
    window.dispatchEvent(new Event("admin-submissions-updated"));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tabs and Filters Container */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 p-3 sm:p-6">
        {/* Tabs */}
        <div className="mb-4 border-b border-gray-200 dark:border-neutral-700">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("partner")}
              className={`border-b-2 px-1 py-2 text-sm font-medium ${
                activeTab === "partner"
                  ? "border-red-500 text-red-600 dark:text-red-400"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
              }`}
            >
              <Building className="w-4 h-4 inline mr-2" />
              Partner Applications ({partnerPagination.total})
            </button>
            <button
              onClick={() => setActiveTab("contact")}
              className={`border-b-2 px-1 py-2 text-sm font-medium ${
                activeTab === "contact"
                  ? "border-red-500 text-red-600 dark:text-red-400"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
              }`}
            >
              <MessageSquare className="w-4 h-4 inline mr-2" />
              Contact Submissions ({contactPagination.total})
            </button>
          </nav>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400 dark:text-neutral-500" />
              <input
                type="text"
                placeholder={`Search ${activeTab === "partner" ? "partner applications" : "contact submissions"}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
            </div>
          </div>
          <div className="sm:w-48">
            {activeTab === "partner" ? (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-red-500 focus:ring-2 focus:ring-red-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="under_review">Under Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="contacted">Contacted</option>
              </select>
            ) : (
              <select
                value={readFilter}
                onChange={(e) => setReadFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-red-500 focus:ring-2 focus:ring-red-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <option value="all">All</option>
                <option value="unread">Unread</option>
                <option value="read">Read</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === "partner" ? (
        <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
          <div className="border-b border-gray-200 px-4 py-2 dark:border-neutral-700">
            <p className="text-xs text-gray-600 dark:text-neutral-400 sm:text-sm">
              {partnerPagination.total > 0
                ? `Showing ${(partnerPagination.page - 1) * partnerPagination.limit + 1} to ${Math.min(partnerPagination.page * partnerPagination.limit, partnerPagination.total)} of ${partnerPagination.total} partner applications`
                : "No partner applications"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Business
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Read
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-neutral-700">
                {partnerApplications.map((app) => (
                  <tr
                    key={app._id}
                    onClick={() => handleViewDetails(app)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatDisplayName(app.firstName, app.lastName)}
                        </div>
                        <div className="text-sm text-gray-500">{app.email}</div>
                        <div className="text-sm text-gray-500">{app.phone}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{app.businessName}</div>
                      {app.abn && <div className="text-sm text-gray-500">ABN: {app.abn}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                          app.status
                        )}`}
                      >
                        {app.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          app.readAt
                            ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200"
                        }`}
                      >
                        {app.readAt ? "Read" : "Unread"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-neutral-400">
                      {formatDateInAEST(new Date(app.submittedAt), "dd MMM yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {partnerPagination.pages > 1 && (
            <div className="border-t-2 border-gray-200 bg-gray-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-950 sm:px-6 sm:py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={() => goToPage("partner", 1)}
                    disabled={partnerPagination.page <= 1}
                    className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                    aria-label="First page"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => goToPage("partner", partnerPagination.page - 1)}
                    disabled={partnerPagination.page <= 1}
                    className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-xs sm:text-sm text-gray-700 dark:text-neutral-200 font-medium">
                  Page {partnerPagination.page} of {partnerPagination.pages}
                </span>
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={() => goToPage("partner", partnerPagination.page + 1)}
                    disabled={partnerPagination.page >= partnerPagination.pages}
                    className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => goToPage("partner", partnerPagination.pages)}
                    disabled={partnerPagination.page >= partnerPagination.pages}
                    className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                    aria-label="Last page"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-none sm:rounded-xl">
          <div className="border-b border-gray-200 px-4 py-2 dark:border-neutral-700">
            <p className="text-xs text-gray-600 dark:text-neutral-400 sm:text-sm">
              {contactPagination.total > 0
                ? `Showing ${(contactPagination.page - 1) * contactPagination.limit + 1} to ${Math.min(contactPagination.page * contactPagination.limit, contactPagination.total)} of ${contactPagination.total} contact submissions`
                : "No contact submissions"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700">
              <thead className="bg-gray-50 dark:bg-neutral-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Read
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-neutral-700 dark:bg-neutral-950/90">
                {contactSubmissions.map((submission) => (
                  <tr
                    key={submission._id}
                    onClick={() => handleViewDetails(submission)}
                    className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-neutral-100">
                          {formatDisplayName(submission.firstName, submission.lastName)}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-neutral-400">{submission.email}</div>
                        <div className="text-sm text-gray-500 dark:text-neutral-400">{submission.phone}</div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-neutral-100">{submission.subject}</div>
                      <div className="max-w-xs truncate text-sm text-gray-500 dark:text-neutral-500">
                        {submission.message.substring(0, 100)}...
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          submission.readAt
                            ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200"
                        }`}
                      >
                        {submission.readAt ? "Read" : "Unread"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-neutral-400">
                      {formatDateInAEST(new Date(submission.submittedAt), "dd MMM yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {contactPagination.pages > 1 && (
            <div className="border-t-2 border-gray-200 bg-gray-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-950 sm:px-6 sm:py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={() => goToPage("contact", 1)}
                    disabled={contactPagination.page <= 1}
                    className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                    aria-label="First page"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => goToPage("contact", contactPagination.page - 1)}
                    disabled={contactPagination.page <= 1}
                    className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-xs font-medium text-gray-700 dark:text-neutral-200 sm:text-sm">
                  Page {contactPagination.page} of {contactPagination.pages}
                </span>
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={() => goToPage("contact", contactPagination.page + 1)}
                    disabled={contactPagination.page >= contactPagination.pages}
                    className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => goToPage("contact", contactPagination.pages)}
                    disabled={contactPagination.page >= contactPagination.pages}
                    className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                    aria-label="Last page"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      {showModal && selectedItem && (
        <SubmissionDetailModal
          submission={selectedItem}
          type={activeTab}
          onClose={() => {
            setShowModal(false);
            setSelectedItem(null);
          }}
          onUpdated={handleModalUpdated}
        />
      )}
    </div>
  );
}
