"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Search, Mail, Phone, MapPin, SearchX, AlertCircle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/utils/cn";
import { formatDisplayName } from "@/utils/display-name";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";
import DrawModalShell from "./DrawModalShell";

// Types for participant data
interface Participant {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  totalEntries: number;
  entriesBySource: {
    membership?: number;
    "one-time-package"?: number;
    upsell?: number;
    "mini-draw"?: number;
    referral?: number;
    "bonus-entry-promo"?: number;
  };
  firstAddedDate: Date | string;
  lastUpdatedDate: Date | string;
}

interface ParticipantsResponse {
  success: boolean;
  data: {
    participants: Participant[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      limit: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
    majorDraw: {
      _id: string;
      name: string;
      totalEntries: number;
    };
  };
}

interface ParticipantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  majorDrawId: string;
  majorDrawName?: string;
}

/** The design specifies 8 per page for this list. */
const PAGE_SIZE = 8;

export default function ParticipantsModal({ isOpen, onClose, majorDrawId, majorDrawName }: ParticipantsModalProps) {
  const { openUserModal } = useAdminUserModal();
  const [searchQuery, setSearchQuery] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    limit: PAGE_SIZE,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Debounce search query to avoid excessive API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const fetchParticipants = useCallback(
    async (search: string = "", page: number = 1) => {
      setIsLoading(true);
      setError(null);

      try {
        const searchParams = new URLSearchParams({
          majorDrawId: majorDrawId,
          page: page.toString(),
          limit: String(PAGE_SIZE),
        });

        if (search.trim()) searchParams.append("search", search.trim());

        const response = await fetch(`/api/admin/major-draw/participants?${searchParams.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch participants");

        const data: ParticipantsResponse = await response.json();
        if (!data.success) throw new Error("Failed to fetch participants");

        setParticipants(data.data.participants);
        setPagination(data.data.pagination);
      } catch (err) {
        console.error("Participants fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch participants");
        setParticipants([]);
      } finally {
        setIsLoading(false);
      }
    },
    [majorDrawId]
  );

  // Search resets to page 1 — a page-3 query would otherwise land on an empty page.
  useEffect(() => {
    if (isOpen && majorDrawId) {
      fetchParticipants(debouncedSearchQuery, 1);
    }
  }, [isOpen, majorDrawId, debouncedSearchQuery, fetchParticipants]);

  // Reset search when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setParticipants([]);
      setError(null);
      setPagination({
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        limit: PAGE_SIZE,
        hasNextPage: false,
        hasPrevPage: false,
      });
    }
  }, [isOpen]);

  const handlePageChange = (newPage: number) => {
    fetchParticipants(debouncedSearchQuery, newPage);
  };

  const rangeStart = pagination.totalCount === 0 ? 0 : (pagination.currentPage - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(pagination.currentPage * pagination.limit, pagination.totalCount);

  return (
    <DrawModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      eyebrow={majorDrawName ? `${majorDrawName} · entry pool` : "Entry pool"}
      title="Participants"
      secondaryLabel="Close"
      footer={
        <footer className="flex flex-wrap items-center justify-between gap-[10px] border-t border-[var(--line)] bg-[var(--panel2)] px-[16px] py-[11px]">
          <p data-figure className="text-[11.5px] text-[var(--text3)]">
            {pagination.totalCount === 0
              ? "No participants"
              : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${pagination.totalCount.toLocaleString()} participants`}
          </p>
          <div className="flex items-center gap-[8px]">
            <PagerButton
              onClick={() => handlePageChange(pagination.currentPage - 1)}
              disabled={!pagination.hasPrevPage || isLoading}
            >
              <ChevronLeft className="h-[14px] w-[14px]" />
              Previous
            </PagerButton>
            <PagerButton
              onClick={() => handlePageChange(pagination.currentPage + 1)}
              disabled={!pagination.hasNextPage || isLoading}
            >
              Next
              <ChevronRight className="h-[14px] w-[14px]" />
            </PagerButton>
          </div>
        </footer>
      }
    >
      {/* Search row. The API matches firstName / lastName / email / mobile. */}
      <div className="flex h-[var(--m-field)] items-center gap-[8px] rounded-[8px] border border-[var(--line)] bg-[var(--input-bg)] px-[10px]">
        <Search className="h-[15px] w-[15px] shrink-0 text-[var(--text3)]" aria-hidden />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, email or mobile…"
          aria-label="Search participants"
          className="w-full self-stretch bg-transparent text-[12.5px] text-[var(--text)] placeholder:text-[var(--text3)] outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
            className="shrink-0 rounded-[5px] p-[2px] text-[var(--text3)] hover:text-[var(--text)]"
          >
            <X className="h-[14px] w-[14px]" />
          </button>
        )}
      </div>

      <div className="mt-[12px] flex flex-col gap-[8px]">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="admin-draws-skeleton h-[58px] rounded-[9px]" aria-busy="true" />
          ))
        ) : error ? (
          <div
            role="alert"
            className="flex items-start gap-[8px] rounded-[9px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-[12px] py-[10px]"
          >
            <AlertCircle className="mt-[1px] h-[16px] w-[16px] shrink-0 text-[var(--danger)]" aria-hidden />
            <div>
              <p className="text-[12.5px] font-semibold text-[var(--danger)]">Couldn&apos;t load participants</p>
              <p className="mt-[2px] text-[11.5px] text-[var(--text2)]">{error} — retrying is safe.</p>
            </div>
          </div>
        ) : participants.length === 0 ? (
          <div className="flex flex-col items-center px-[20px] py-[38px] text-center">
            <SearchX className="h-[24px] w-[24px] text-[var(--text3)]" aria-hidden />
            <div className="mt-[10px] font-poppins text-[14px] font-bold text-[var(--text)]">
              {searchQuery ? "No participant matches that search" : "No participants yet"}
            </div>
            <p className="mt-[5px] max-w-[330px] text-[12px] leading-[1.6] text-[var(--text2)] text-pretty">
              {searchQuery
                ? "Try a partial surname, an email domain, or an unspaced mobile."
                : "Entrants appear here as soon as the first purchase lands in this draw."}
            </p>
          </div>
        ) : (
          participants.map((participant) => (
            <button
              key={participant.userId}
              type="button"
              // KEPT deliberately. The design specifies a read-only list, but these
              // rows open the admin user record today, and losing a working
              // drill-through to match a visual spec is a net regression.
              onClick={() => openUserModal(participant.userId)}
              className="flex items-start justify-between gap-[10px] rounded-[9px] border border-[var(--line)] bg-[var(--panel)] px-[12px] py-[10px] text-left hover:border-[var(--accent-line)] hover:bg-[var(--hover)]"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-[var(--text)]">
                  {formatDisplayName(participant.firstName, participant.lastName)}
                </div>
                <div className="mt-[3px] flex flex-wrap items-center gap-x-[12px] gap-y-[2px] text-[11.5px] text-[var(--text3)]">
                  {participant.email && (
                    <span className="inline-flex min-w-0 items-center gap-[4px]">
                      <Mail className="h-[12px] w-[12px] shrink-0" aria-hidden />
                      <span className="truncate">{participant.email}</span>
                    </span>
                  )}
                  {participant.mobile && (
                    <span className="inline-flex items-center gap-[4px]">
                      <Phone className="h-[12px] w-[12px] shrink-0" aria-hidden />
                      {participant.mobile}
                    </span>
                  )}
                  {participant.state && (
                    <span className="inline-flex items-center gap-[4px]">
                      <MapPin className="h-[12px] w-[12px] shrink-0" aria-hidden />
                      {participant.state}
                    </span>
                  )}
                </div>
              </div>

              <span
                data-figure
                className="shrink-0 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-[9px] py-[3px] text-[11.5px] font-bold text-[var(--accent)]"
              >
                {participant.totalEntries.toLocaleString()}
              </span>
            </button>
          ))
        )}
      </div>
    </DrawModalShell>
  );
}

function PagerButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-[var(--m-btn-h)] items-center gap-[5px] rounded-[8px] border border-[var(--line)] bg-[var(--panel)] px-[11px] text-[12px] font-semibold text-[var(--text)]",
        // Dimmed to .6 with not-allowed at the ends, per the design.
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-[var(--accent-line)] hover:text-[var(--accent)]"
      )}
    >
      {children}
    </button>
  );
}
