"use client";

import React, { useState } from "react";
import { useScheduledPromos, useDeleteScheduledPromo } from "@/hooks/queries/useScheduledPromoQueries";
import type { ScheduledPromo } from "@/types/admin";
import PromoBadgeImage from "@/components/ui/PromoBadgeImage";
import { Calendar, Edit2, Trash2, Loader2, RefreshCw } from "lucide-react";
import { formatDateReadable } from "@/utils/common/timezone";

interface ScheduledPromoListProps {
  filters?: {
    type?: "membership-packages" | "one-time-packages" | "mini-packages";
    isActive?: boolean;
  };
  /** When provided, Edit opens the parent-controlled modal; otherwise no edit. */
  onEditRequested?: (promo: ScheduledPromo) => void;
}

/**
 * Scheduled Promo List Component
 * Displays scheduled promo phases with edit and delete actions.
 */
export default function ScheduledPromoList({ filters, onEditRequested }: ScheduledPromoListProps) {
  const { data: promos = [], isLoading, refetch } = useScheduledPromos(filters);
  const deleteMutation = useDeleteScheduledPromo();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleEdit = (promo: ScheduledPromo) => {
    onEditRequested?.(promo);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this scheduled phase? It will be soft-deleted and no longer apply.")) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
      await refetch();
    } catch (error) {
      console.error("Failed to delete scheduled promo:", error);
      alert("Failed to delete scheduled promo. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const getTypeLabel = (type: ScheduledPromo["type"]) => {
    switch (type) {
      case "membership-packages":
        return "Membership Packages";
      case "one-time-packages":
        return "One-Time Packages";
      case "mini-packages":
        return "Mini Draw Packages";
      default:
        return type;
    }
  };

  const getStatusBadge = (promo: ScheduledPromo) => {
    if (promo.isCurrentlyActive) {
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950/55 dark:text-green-300">
          Active Now
        </span>
      );
    }
    if (promo.isUpcoming) {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
          Upcoming
        </span>
      );
    }
    if (promo.isExpired) {
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-neutral-800 dark:text-neutral-300">
          Expired
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-950/45 dark:text-yellow-200">
        Inactive
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-3 sm:p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-red-600" />
              Scheduled Phases
            </h3>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-neutral-200 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6">
          {promos.length === 0 ? (
            <div className="py-8 text-center">
              <Calendar className="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-neutral-600" />
              <p className="text-gray-500 dark:text-neutral-400">No scheduled phases found</p>
              <p className="mt-1 text-sm text-gray-400 dark:text-neutral-500">
                Add a phase to apply multipliers automatically during specific date ranges
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: Card layout */}
              <div className="sm:hidden space-y-3">
                {promos.map((promo) => (
                  <div
                    key={promo.id}
                    className="rounded-lg border border-gray-200 p-3 hover:bg-gray-50/50 dark:border-neutral-700 dark:hover:bg-neutral-800/50"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <PromoBadgeImage multiplier={promo.multiplier} size="small" className="shrink-0" />
                        <span className="truncate text-sm font-medium text-gray-900 dark:text-neutral-100">
                          {promo.name || getTypeLabel(promo.type)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {getStatusBadge(promo)}
                        <button
                          onClick={() => handleEdit(promo)}
                          className="rounded p-1.5 text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(promo.id)}
                          disabled={deletingId === promo.id}
                          className="rounded p-1.5 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === promo.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-neutral-400 space-y-0.5">
                      <div>{getTypeLabel(promo.type)}</div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {promo.startDateFormatted || formatDateReadable(new Date(promo.startDate))} →{" "}
                        {promo.endDateFormatted || formatDateReadable(new Date(promo.endDate))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table layout */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700">
                  <thead className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:bg-neutral-800 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Multiplier
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Date Range
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-neutral-700 dark:bg-neutral-900/80">
                    {promos.map((promo) => (
                      <tr key={promo.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/60">
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-neutral-100">{getTypeLabel(promo.type)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <PromoBadgeImage multiplier={promo.multiplier} size="small" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="max-w-[140px] truncate text-sm text-gray-900 dark:text-neutral-100">
                            {promo.name || <span className="italic text-gray-400 dark:text-neutral-500">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900 dark:text-neutral-100">
                            <div className="mb-0.5 flex items-center gap-1">
                              <Calendar className="h-3 w-3 shrink-0 text-gray-400 dark:text-neutral-500" />
                              <span className="font-medium">Start:</span>
                              <span>{promo.startDateFormatted || formatDateReadable(new Date(promo.startDate))}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 shrink-0 text-gray-400 dark:text-neutral-500" />
                              <span className="font-medium">End:</span>
                              <span>{promo.endDateFormatted || formatDateReadable(new Date(promo.endDate))}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{getStatusBadge(promo)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(promo)}
                              className="rounded p-1.5 text-blue-600 transition-colors hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                              title="Edit phase"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(promo.id)}
                              disabled={deletingId === promo.id}
                              className="rounded p-1.5 text-red-600 transition-colors hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Delete phase"
                            >
                              {deletingId === promo.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
