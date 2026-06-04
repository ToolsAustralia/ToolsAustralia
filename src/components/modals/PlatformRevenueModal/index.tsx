"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, AlertCircle, Users } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { ModalContainer, ModalHeader, ModalContent } from "@/components/modals/ui";
import { usePlatformRevenueBreakdown } from "@/hooks/queries/useAdminQueries";
import UserList from "@/components/modals/RevenueDetailModal/UserList";
import Pagination from "@/components/modals/RevenueDetailModal/Pagination";
import type { SortKey, SortOrder } from "@/components/modals/RevenueDetailModal/TableHeader";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import {
  ACQUISITION_CATEGORY_META,
  moneyExact,
} from "@/app/admin/component/overview/sections/advertisingCardModel";

type AcqCategory = (typeof ACQUISITION_CATEGORY_META)[number]["id"];

export default function PlatformRevenueModal({
  isOpen,
  onClose,
  platform,
  platformLabel,
  dateRange,
  startDate,
  endDate,
  onUserClick,
}: {
  isOpen: boolean;
  onClose: () => void;
  platform: string | null;
  platformLabel: string;
  dateRange: DateRange;
  startDate?: string;
  endDate?: string;
  onUserClick?: (userId: string) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<AcqCategory | "all">("all");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>("amount");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data, isLoading, error } = usePlatformRevenueBreakdown(
    isOpen ? platform : null,
    dateRange,
    startDate,
    endDate,
    selectedCategory === "all" ? undefined : selectedCategory,
    page,
    false,
    isOpen,
  );

  useEffect(() => {
    if (!isOpen) {
      setSelectedCategory("all");
      setPage(1);
      setSearchQuery("");
      setExpandedUsers(new Set());
      setSortBy("amount");
      setSortOrder("desc");
    }
  }, [isOpen]);
  useEffect(() => {
    setPage(1);
  }, [selectedCategory, debouncedSearch]);

  const platformTotal = useMemo(
    () => (data ? data.byCategory.reduce((s, b) => s + b.revenue, 0) : 0),
    [data],
  );

  const filteredUsers = useMemo(() => {
    const users = data?.users ?? [];
    let list = users;
    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((u) => {
        const full = `${u.userInfo.firstName} ${u.userInfo.lastName}`.toLowerCase();
        return (
          u.userInfo.email.toLowerCase().includes(q) ||
          full.includes(q) ||
          u.userId.toLowerCase().includes(q) ||
          (u.userInfo.mobile || "").toLowerCase().includes(q)
        );
      });
    }
    return [...list].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortBy) {
        case "name":
          av = `${a.userInfo.firstName} ${a.userInfo.lastName}`.toLowerCase();
          bv = `${b.userInfo.firstName} ${b.userInfo.lastName}`.toLowerCase();
          break;
        case "count":
          av = a.purchaseCount;
          bv = b.purchaseCount;
          break;
        case "date":
          av = a.purchases[0] ? new Date(a.purchases[0].timestamp).getTime() : 0;
          bv = b.purchases[0] ? new Date(b.purchases[0].timestamp).getTime() : 0;
          break;
        default:
          av = a.totalContributed;
          bv = b.totalContributed;
      }
      if (sortOrder === "asc") return av > bv ? 1 : av < bv ? -1 : 0;
      return av < bv ? 1 : av > bv ? -1 : 0;
    });
  }, [data?.users, debouncedSearch, sortBy, sortOrder]);

  const toggleUser = (id: string) =>
    setExpandedUsers((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const handleSort = (k: SortKey) => {
    if (sortBy === k) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(k);
      setSortOrder("desc");
    }
  };

  const chipClass = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
      active
        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent"
        : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400"
    }`;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" className="!max-w-[1200px]">
      <ModalHeader
        title={`${platformLabel} — revenue breakdown`}
        subtitle={
          data
            ? `${moneyExact(platformTotal)} attributed • ${data.totalUsers.toLocaleString()} ${
                selectedCategory === "all" ? "buyers" : "in this category"
              }`
            : "Loading..."
        }
        onClose={onClose}
      />
      <ModalContent padding="none">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSelectedCategory("all")} className={chipClass(selectedCategory === "all")}>
              All
            </button>
            {ACQUISITION_CATEGORY_META.map((c) => (
              <button key={c.id} onClick={() => setSelectedCategory(c.id)} className={chipClass(selectedCategory === c.id)}>
                {c.label}
              </button>
            ))}
          </div>

          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, mobile…"
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
          />

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900/45 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span className="text-red-700 dark:text-red-300 text-sm">
                {error instanceof Error ? error.message : "Failed to load"}
              </span>
            </div>
          )}
          {isLoading && !data && (
            <div className="p-8 text-center">
              <Loader2 className="w-10 h-10 mx-auto mb-3 text-gray-400 animate-spin" />
              <p className="text-gray-600 dark:text-neutral-400">Loading…</p>
            </div>
          )}
          {data && filteredUsers.length > 0 && (
            <UserList
              users={filteredUsers}
              expandedUsers={expandedUsers}
              onToggleExpanded={toggleUser}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              onUserClick={onUserClick}
            />
          )}
          {data && !isLoading && filteredUsers.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-neutral-400">
              <Users className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-neutral-600" />
              <p className="text-sm">
                {data.pagination.totalCount > 50
                  ? `No matches on this page — ${data.pagination.totalCount.toLocaleString()} buyers across ${data.pagination.totalPages} pages. Clear the search or use the pager below.`
                  : "No buyers found"}
              </p>
            </div>
          )}
          {/* Pager renders whenever the platform is server-paginated, so a search that
              empties the current page never hides navigation (the user isn't trapped). */}
          {data && data.pagination.totalCount > 50 && (
            <Pagination
              isServerPaginationActive
              filteredCount={filteredUsers.length}
              totalCount={data.pagination.totalCount}
              hasActiveFilters={!!debouncedSearch.trim()}
              currentPage={data.pagination.currentPage}
              totalPages={data.pagination.totalPages}
              page={page}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          )}
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
