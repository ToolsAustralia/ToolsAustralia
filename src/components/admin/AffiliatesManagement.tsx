"use client";

import React, { useState } from "react";
import {
  Search,
  Plus,
  Eye,
  Users,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import AffiliateDetailModal from "./AffiliateDetailModal";

interface Affiliate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  username: string;
  affiliateCode: string;
  affiliateLink: string;
  isActive: boolean;
  totalSignups: number;
  totalSales: number;
  totalCommissions: number;
  unpaidCommissions: number;
  unpaidAmount: number;
  createdAt: string;
  updatedAt: string;
}

interface AffiliatesResponse {
  affiliates: Affiliate[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

type AffiliateListSort =
  | "name"
  | "email"
  | "affiliateCode"
  | "totalSignups"
  | "totalSales"
  | "unpaidAmount"
  | "isActive"
  | "createdAt";

/**
 * Main Affiliates Management component
 */
export default function AffiliatesManagement() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedAffiliateId, setSelectedAffiliateId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [sortField, setSortField] = useState<AffiliateListSort>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const debouncedSearch = useDebounce(search, 300);

  // Fetch affiliates data
  const [affiliatesData, setAffiliatesData] = useState<AffiliatesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const affiliateList = affiliatesData?.affiliates ?? [];

  React.useEffect(() => {
    fetchAffiliates();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAffiliates is defined below, adding would cause circular dep
  }, [page, debouncedSearch, sortField, sortOrder]);

  const fetchAffiliates = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "25",
        sort: sortField,
        order: sortOrder,
        ...(debouncedSearch && { search: debouncedSearch }),
      });
      const response = await fetch(`/api/admin/affiliate/list?${params}`);
      const data = await response.json();
      if (data.success) {
        setAffiliatesData(data.data);
      } else {
        setError(data.error || "Failed to load affiliates");
      }
    } catch (err) {
      setError("Failed to load affiliates");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAffiliateClick = (affiliate: Affiliate) => {
    setSelectedAffiliateId(affiliate.id);
    setIsDetailModalOpen(true);
  };

  const handleCreateAffiliate = async (formData: {
    name: string;
    email: string;
    phone?: string;
    username: string;
    password: string;
    commissionRate?: number;
  }) => {
    try {
      const response = await fetch("/api/admin/affiliate/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (data.success) {
        setIsCreateModalOpen(false);
        fetchAffiliates();
      } else {
        alert(data.error || "Failed to create affiliate");
      }
    } catch (err) {
      alert("Failed to create affiliate");
      console.error(err);
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const handleSortHeaderClick = (field: AffiliateListSort) => {
    setPage(1);
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(
        field === "name" || field === "email" || field === "affiliateCode" ? "asc" : "desc"
      );
    }
  };

  const SortHeaderIcon = ({ field }: { field: AffiliateListSort }) => {
    const active = sortField === field;
    if (!active) {
      return <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 shrink-0 text-[#ee0000]" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 shrink-0 text-[#ee0000]" aria-hidden />
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header — aligned with Users Management (compact on mobile) */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm sm:text-lg lg:text-xl font-bold text-gray-900 dark:text-white truncate">Affiliates Management</h1>
          <p className="text-[11px] sm:text-sm text-gray-600 dark:text-neutral-400 mt-0.5 sm:mt-1 line-clamp-2 sm:line-clamp-none">
            Manage affiliate accounts and track commissions
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="flex shrink-0 items-center gap-1 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white text-xs sm:text-sm font-medium hover:from-[#cc0000] hover:to-[#e60000] transition-all shadow-sm hover:shadow-md"
        >
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="sm:hidden">Create</span>
          <span className="hidden sm:inline">Create Affiliate</span>
        </button>
      </div>

      {/* Search — same density as Users Management filter bar */}
      <div className="relative z-20 bg-gradient-to-br from-white via-gray-50 to-white dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 p-2 sm:p-4 backdrop-blur-sm">
        <div className="relative">
          <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-neutral-500 w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, email, code, username…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-8 sm:pl-10 pr-3 py-1.5 sm:py-2 border-2 border-gray-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white text-xs sm:text-sm shadow-sm hover:shadow-md transition-all placeholder:text-gray-400 dark:placeholder:text-neutral-500"
          />
        </div>
      </div>

      {/* Results Summary */}
      {affiliatesData && (
        <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600 dark:text-neutral-400">
          <p>
            Showing {(affiliatesData.pagination.page - 1) * affiliatesData.pagination.limit + 1}–
            {Math.min(
              affiliatesData.pagination.page * affiliatesData.pagination.limit,
              affiliatesData.pagination.total
            )}{" "}
            of {affiliatesData.pagination.total}
          </p>
          <button
            type="button"
            onClick={() => fetchAffiliates()}
            className="text-[#ee0000] hover:text-[#cc0000] transition-colors flex items-center gap-1 font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Refresh
          </button>
        </div>
      )}

      {/* Affiliates list */}
      <div className="relative z-10 bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
        {isLoading ? (
          <div className="p-3 sm:p-6">
            <div className="space-y-3 sm:space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-2 sm:gap-4 animate-pulse">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gray-200 dark:bg-neutral-700 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="h-3.5 bg-gray-200 dark:bg-neutral-700 rounded w-2/3" />
                    <div className="h-3 bg-gray-200 dark:bg-neutral-700 rounded w-1/2" />
                  </div>
                  <div className="h-6 bg-gray-200 dark:bg-neutral-700 rounded w-14 hidden sm:block" />
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          // Error state
          <div className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Error Loading Affiliates</h3>
            <p className="text-gray-600 dark:text-neutral-400 mb-4">{error}</p>
            <button
              onClick={() => fetchAffiliates()}
              className="px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all"
            >
              Try Again
            </button>
          </div>
        ) : affiliatesData && affiliateList.length === 0 ? (
          // Empty state
          <div className="p-6 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Affiliates Found</h3>
            <p className="text-gray-600 dark:text-neutral-400 mb-4">
              {search ? "Try adjusting your search criteria" : "Get started by creating your first affiliate account"}
            </p>
            {!search && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all"
              >
                Create Affiliate
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Single responsive table — column layout on all breakpoints (like Users Management) */}
            <div className="overflow-x-auto relative touch-pan-x">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b-2 border-gray-200 dark:border-neutral-700">
                    <th className="sticky top-0 z-[1] bg-gray-50 dark:bg-neutral-800 p-0 text-left shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                      <button
                        type="button"
                        onClick={() => handleSortHeaderClick("name")}
                        className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-3 lg:px-6 sm:py-2.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-800 dark:text-neutral-100 hover:bg-gray-100/90 dark:hover:bg-neutral-800/80 transition-colors"
                      >
                        Affiliate
                        <SortHeaderIcon field="name" />
                      </button>
                    </th>
                    <th className="sticky top-0 z-[1] hidden bg-gray-50 dark:bg-neutral-800 p-0 text-left shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)] lg:table-cell">
                      <button
                        type="button"
                        onClick={() => handleSortHeaderClick("affiliateCode")}
                        className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-3 lg:px-6 sm:py-2.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-800 dark:text-neutral-100 hover:bg-gray-100/90 dark:hover:bg-neutral-800/80 transition-colors"
                      >
                        Code
                        <SortHeaderIcon field="affiliateCode" />
                      </button>
                    </th>
                    <th className="sticky top-0 z-[1] bg-gray-50 dark:bg-neutral-800 p-0 text-left shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                      <button
                        type="button"
                        onClick={() => handleSortHeaderClick("totalSignups")}
                        title="Sort by signups"
                        className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-3 lg:px-6 sm:py-2.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-800 dark:text-neutral-100 hover:bg-gray-100/90 dark:hover:bg-neutral-800/80 transition-colors"
                      >
                        Stats
                        <SortHeaderIcon field="totalSignups" />
                      </button>
                    </th>
                    <th className="sticky top-0 z-[1] hidden bg-gray-50 dark:bg-neutral-800 p-0 text-right shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)] md:table-cell">
                      <button
                        type="button"
                        onClick={() => handleSortHeaderClick("totalSales")}
                        title="Sort by sales"
                        className="flex w-full items-center justify-end gap-1 px-2 py-2 sm:px-3 lg:px-6 sm:py-2.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-800 dark:text-neutral-100 hover:bg-gray-100/90 dark:hover:bg-neutral-800/80 transition-colors"
                      >
                        Sales
                        <SortHeaderIcon field="totalSales" />
                      </button>
                    </th>
                    <th className="sticky top-0 z-[1] bg-gray-50 dark:bg-neutral-800 p-0 text-left shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                      <button
                        type="button"
                        onClick={() => handleSortHeaderClick("unpaidAmount")}
                        className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-3 lg:px-6 sm:py-2.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-800 dark:text-neutral-100 hover:bg-gray-100/90 dark:hover:bg-neutral-800/80 transition-colors"
                      >
                        Unpaid
                        <SortHeaderIcon field="unpaidAmount" />
                      </button>
                    </th>
                    <th className="sticky top-0 z-[1] bg-gray-50 dark:bg-neutral-800 p-0 text-left shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                      <button
                        type="button"
                        onClick={() => handleSortHeaderClick("isActive")}
                        className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-3 lg:px-6 sm:py-2.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-800 dark:text-neutral-100 hover:bg-gray-100/90 dark:hover:bg-neutral-800/80 transition-colors"
                      >
                        Status
                        <SortHeaderIcon field="isActive" />
                      </button>
                    </th>
                    <th className="sticky top-0 z-[1] bg-gray-50 dark:bg-neutral-800 px-2 py-2 sm:px-3 lg:px-6 sm:py-2.5 text-left text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-800 dark:text-neutral-100 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-neutral-800 dark:bg-neutral-950">
                  {affiliateList.map((affiliate) => (
                    <tr
                      key={affiliate.id}
                      className="cursor-pointer transition-colors hover:bg-gray-50 even:bg-gray-50/30 dark:hover:bg-neutral-800/70 even:dark:bg-neutral-900/35"
                      onClick={() => handleAffiliateClick(affiliate)}
                    >
                      <td className="whitespace-nowrap px-2 py-2 sm:px-3 sm:py-2.5 lg:px-6">
                        <div>
                          <div className="text-[10px] font-semibold text-gray-900 dark:text-neutral-100 sm:text-xs">{affiliate.name}</div>
                          <div className="truncate text-[9px] text-gray-500 dark:text-neutral-400 sm:text-xs">{affiliate.email}</div>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-2 py-2 sm:px-3 sm:py-2.5 lg:table-cell lg:px-6">
                        <div className="font-mono text-[10px] text-gray-900 dark:text-neutral-100 sm:text-xs">{affiliate.affiliateCode}</div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 sm:px-3 sm:py-2.5 md:hidden lg:px-6">
                        <div className="text-[10px] text-gray-900 dark:text-neutral-100 sm:text-xs">
                          <div>Signups: {affiliate.totalSignups}</div>
                          <div>Sales: {formatCurrency(affiliate.totalSales)}</div>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 text-gray-900 dark:text-white md:table-cell">
                        <span className="text-[10px] sm:text-xs">{affiliate.totalSignups}</span>
                      </td>
                      <td className="hidden whitespace-nowrap px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 text-right text-gray-900 dark:text-white md:table-cell">
                        <span className="text-[10px] sm:text-xs">{formatCurrency(affiliate.totalSales)}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5">
                        <div>
                          <div className="text-[10px] sm:text-xs font-semibold text-green-600 dark:text-green-400">
                            {formatCurrency(affiliate.unpaidAmount)}
                          </div>
                          <div className="text-[9px] sm:text-xs text-gray-500 dark:text-neutral-400">
                            {affiliate.unpaidCommissions} comm.
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5">
                        {affiliate.isActive ? (
                          <span className="inline-flex rounded-full bg-green-100 dark:bg-green-950/50 px-2 py-0.5 text-[9px] sm:text-xs font-medium text-green-800 dark:text-green-300 border border-green-200/80 dark:border-green-800/50">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-red-100 dark:bg-red-950/40 px-2 py-0.5 text-[9px] sm:text-xs font-medium text-red-800 dark:text-red-300 border border-red-200/80 dark:border-red-800/50">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 sm:px-3 lg:px-6 py-2 sm:py-2.5 text-[10px] sm:text-xs font-medium">
                        <div className="flex items-center gap-1.5 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleAffiliateClick(affiliate)}
                            className="flex items-center gap-1 text-[#ee0000] transition-colors hover:text-[#cc0000]"
                          >
                            <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span className="hidden lg:inline">View</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => copyLink(affiliate.affiliateLink)}
                            className="text-gray-600 dark:text-neutral-400 transition-colors hover:text-gray-900 dark:hover:text-white"
                            title="Copy affiliate link"
                          >
                            {copiedLink === affiliate.affiliateLink ? (
                              <Check className="h-3.5 w-3.5 text-green-600 sm:h-4 sm:w-4" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {affiliatesData && affiliatesData.pagination.totalPages > 1 && (
              <div className="border-t-2 border-gray-200 bg-gray-50 px-3 py-3 dark:border-neutral-700 dark:bg-neutral-950 sm:px-6 sm:py-4">
                <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                      className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                      aria-label="First page"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </div>

                  <span className="text-xs font-medium text-gray-700 dark:text-neutral-200 sm:text-sm">
                    Page {affiliatesData.pagination.page} of {affiliatesData.pagination.totalPages}
                  </span>

                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(affiliatesData.pagination.totalPages, p + 1))}
                      disabled={page === affiliatesData.pagination.totalPages}
                      className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(affiliatesData.pagination.totalPages)}
                      disabled={page === affiliatesData.pagination.totalPages}
                      className="rounded-lg border-2 border-gray-300 p-1.5 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200 sm:p-2"
                      aria-label="Last page"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Affiliate Modal */}
      {isCreateModalOpen && (
        <CreateAffiliateModal onClose={() => setIsCreateModalOpen(false)} onSubmit={handleCreateAffiliate} />
      )}

      {/* Affiliate Detail Modal */}
      {isDetailModalOpen && selectedAffiliateId && (
        <AffiliateDetailModal
          affiliateId={selectedAffiliateId}
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedAffiliateId(null);
          }}
          onUpdate={fetchAffiliates}
        />
      )}
    </div>
  );
}

/**
 * Create Affiliate Modal Component
 */
function CreateAffiliateModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: { name: string; email: string; phone?: string; username: string; password: string; commissionRate?: number }) => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    username: "",
    password: "",
    commissionRate: "30", // Default 30% as percentage string for display
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (!formData.username.trim()) newErrors.username = "Username is required";
    if (formData.password.length < 6) newErrors.password = "Password must be at least 6 characters";
    
    // Validate commission rate (0-100%)
    const commissionRateNum = parseFloat(formData.commissionRate);
    if (isNaN(commissionRateNum) || commissionRateNum < 0 || commissionRateNum > 100) {
      newErrors.commissionRate = "Commission rate must be between 0 and 100%";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Convert percentage to decimal (30% -> 0.3)
    const commissionRateDecimal = commissionRateNum / 100;

    onSubmit({
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim() || undefined,
      username: formData.username.trim(),
      password: formData.password,
      commissionRate: commissionRateDecimal,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 max-w-md w-full flex max-h-[90dvh] flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Create Affiliate</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 transition-colors" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-[#ee0000] dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              required
            />
            {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-[#ee0000] dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              required
            />
            {errors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-[#ee0000] dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Username *</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-[#ee0000] dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              required
            />
            {errors.username && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.username}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Password *</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
              required
            />
            {errors.password && <p className="text-red-600 text-xs mt-1">{errors.password}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Commission Rate (%) *</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={formData.commissionRate}
              onChange={(e) => setFormData({ ...formData, commissionRate: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-[#ee0000] dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              placeholder="30"
              required
            />
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1">
              Enter commission rate as percentage (0-100%). Default: 30%
            </p>
            {errors.commissionRate && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.commissionRate}</p>}
          </div>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-950 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-800 dark:text-neutral-100 px-4 py-2 transition-colors hover:bg-gray-100 dark:hover:bg-neutral-700 sm:min-h-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2 text-white transition-all hover:from-[#cc0000] hover:to-[#e60000] sm:min-h-0"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
