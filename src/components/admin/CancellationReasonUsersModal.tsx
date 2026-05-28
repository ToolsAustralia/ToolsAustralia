"use client";

import React, { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Loader2, Users, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import {
  ModalContainer,
  ModalHeader,
  ModalContent,
} from "@/components/modals/ui";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import { useCancellationFlowUsersByReason } from "@/hooks/queries/admin/useCancellationFlowAnalytics";
import type { CancellationReason } from "@/models/CancellationFlowEvent";

const AEST_TIMEZONE = "Australia/Sydney";

const REASON_LABELS: Record<CancellationReason, string> = {
  too_expensive: "Too expensive",
  prefer_cheaper: "Prefer a cheaper plan",
  dont_use_benefits: "Don’t use the benefits",
  too_many_messages: "Too many messages",
  joined_for_giveaway: "Joined for a giveaway",
  havent_won: "Haven’t won",
  other: "Other",
};

type OutcomeFilter = "all" | "saved" | "cancelled" | "in_progress";

const OUTCOME_FILTERS: ReadonlyArray<{ value: OutcomeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "saved", label: "Saved" },
  { value: "cancelled", label: "Cancelled" },
  { value: "in_progress", label: "In progress" },
];

const OUTCOME_CHIP: Record<"saved" | "cancelled" | "in_progress", string> = {
  saved:
    "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50",
  cancelled:
    "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200/80 dark:border-red-800/50",
  in_progress:
    "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 border border-gray-200/80 dark:border-neutral-600",
};

interface CancellationReasonUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: CancellationReason | null;
  /** AEST yyyy-MM-dd inclusive lower bound. */
  startDate?: string;
  /** AEST yyyy-MM-dd inclusive upper bound. */
  endDate?: string;
}

export default function CancellationReasonUsersModal({
  isOpen,
  onClose,
  reason,
  startDate,
  endDate,
}: CancellationReasonUsersModalProps) {
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    if (isOpen) {
      setOutcomeFilter("all");
      setPage(1);
    }
  }, [isOpen, reason]);

  useEffect(() => {
    setPage(1);
  }, [outcomeFilter]);

  const { data, isLoading, isError } = useCancellationFlowUsersByReason(
    reason
      ? {
          reason,
          outcome: outcomeFilter === "all" ? undefined : outcomeFilter,
          startDate,
          endDate,
          page,
          limit,
        }
      : null,
    { enabled: isOpen && !!reason }
  );

  const rows = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const isOther = reason === "other";

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" className="!max-w-[1000px]">
      <ModalHeader
        title={reason ? `Reason: ${REASON_LABELS[reason]}` : "Cancellation reason"}
        subtitle={
          data
            ? `${totalCount.toLocaleString()} ${outcomeFilter === "all" ? "event" : outcomeFilter.replace("_", " ")}${totalCount === 1 ? "" : "s"}`
            : "Loading..."
        }
        onClose={onClose}
      />

      <div className="px-4 sm:px-6 pt-2 pb-4 border-b border-gray-200 dark:border-neutral-800 bg-gray-50/80 dark:bg-neutral-950/40">
        <div className="flex flex-wrap gap-2">
          {OUTCOME_FILTERS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setOutcomeFilter(opt.value)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                outcomeFilter === opt.value
                  ? "bg-red-600 text-white shadow"
                  : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-neutral-700 border border-transparent dark:border-neutral-600"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <ModalContent padding="none">
        <div>
          {isError && (
            <div className="p-4 m-4 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900/45 rounded-lg">
              <span className="text-red-700 dark:text-red-300 text-sm">Failed to load users for this reason.</span>
            </div>
          )}

          {isLoading && !data && (
            <div className="p-8 text-center">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-gray-400 animate-spin" />
              <p className="text-gray-600 dark:text-neutral-400">Loading users...</p>
            </div>
          )}

          {!isLoading && data && rows.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-neutral-400">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-neutral-600" />
              <p className="text-lg font-medium text-gray-900 dark:text-neutral-100">No users in this window</p>
              <p className="text-sm mt-1">
                {outcomeFilter === "all"
                  ? "Try expanding the date range."
                  : `No ${outcomeFilter.replace("_", " ")} events for this reason yet.`}
              </p>
            </div>
          )}

          {data && rows.length > 0 && (
            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-neutral-800/80 border-b border-gray-200 dark:border-neutral-700">
                    <tr>
                      <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100 w-28">
                        Outcome
                      </th>
                      <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100 w-44">
                        Started
                      </th>
                      <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100">
                        User
                      </th>
                      {isOther ? (
                        <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100">
                          Free text
                        </th>
                      ) : (
                        <th className="text-left p-3 font-semibold text-gray-800 dark:text-neutral-100 w-44">
                          Offer accepted
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const fullName = [row.userFirstName, row.userLastName]
                        .filter(Boolean)
                        .join(" ")
                        .trim();
                      const displayText = row.userEmail
                        ? row.userEmail
                        : row.userId
                          ? `User ${row.userId.slice(-6)}`
                          : "—";
                      return (
                        <tr
                          key={row.eventId}
                          className="border-t border-gray-100 dark:border-neutral-800 align-top"
                        >
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${OUTCOME_CHIP[row.outcome]}`}
                            >
                              {row.outcome === "in_progress" ? "in progress" : row.outcome}
                            </span>
                          </td>
                          <td className="p-3 text-gray-600 dark:text-neutral-400 font-mono tabular-nums whitespace-nowrap">
                            {formatInTimeZone(new Date(row.startedAt), AEST_TIMEZONE, "yyyy-MM-dd HH:mm")}
                          </td>
                          <td className="p-3">
                            {row.userId ? (
                              <ClickableUserDisplay
                                displayText={displayText}
                                userId={row.userId}
                                subtext={fullName || undefined}
                                className="text-sm font-medium text-gray-900 dark:text-neutral-100"
                              />
                            ) : (
                              <span className="text-sm text-gray-500 dark:text-neutral-500">—</span>
                            )}
                          </td>
                          {isOther ? (
                            <td className="p-3 text-gray-900 dark:text-neutral-100 whitespace-pre-wrap break-words">
                              {row.reasonText || (
                                <span className="text-gray-400 dark:text-neutral-500">(empty)</span>
                              )}
                            </td>
                          ) : (
                            <td className="p-3 text-gray-700 dark:text-neutral-300 whitespace-nowrap">
                              {row.offerAccepted
                                ? row.offerAccepted.replaceAll("_", " ")
                                : (
                                  <span className="text-gray-400 dark:text-neutral-500">—</span>
                                )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="bg-gray-50/90 dark:bg-neutral-950/80 px-4 sm:px-6 py-3 sm:py-4 border-t-2 border-gray-200 dark:border-neutral-800 -mx-4 -mb-4 mt-6">
                  <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => setPage(1)}
                        disabled={page <= 1 || isLoading}
                        className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200 hover:border-gray-400 dark:hover:border-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="First page"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1 || isLoading}
                        className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200 hover:border-gray-400 dark:hover:border-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-xs sm:text-sm text-gray-700 dark:text-neutral-200 font-medium">
                      Page {page} of {totalPages}
                    </span>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages || isLoading}
                        className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200 hover:border-gray-400 dark:hover:border-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage(totalPages)}
                        disabled={page >= totalPages || isLoading}
                        className="p-1.5 sm:p-2 rounded-lg border-2 border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200 hover:border-gray-400 dark:hover:border-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
