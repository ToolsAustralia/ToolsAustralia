"use client";

import React, { useState } from "react";
import { useBonusEntryPromos, useDeleteBonusEntryPromo } from "@/hooks/queries/usePromoQueries";
import AdminBonusEntryPromoModal from "@/components/modals/AdminBonusEntryPromoModal";
import type { BonusEntryPromo } from "@/types/admin";
import { Gift, Edit2, Trash2, Calendar, Loader2, RefreshCw, CheckCircle } from "lucide-react";
import { AdminBadge } from "@/components/admin/ui/AdminBadge";
import { formatDateReadable } from "@/utils/common/timezone";
import { cn } from "@/utils/cn";

interface BonusEntryPromoListProps {
  filters?: {
    type?: "membership-packages" | "one-time-packages" | "mini-packages";
    isActive?: boolean;
  };
}

/**
 * Bonus Entry Promo List Component
 * Displays a list of bonus entry promos with edit and delete actions
 */
export default function BonusEntryPromoList({ filters }: BonusEntryPromoListProps) {
  const { data: promos = [], isLoading, refetch } = useBonusEntryPromos(filters);
  const deleteMutation = useDeleteBonusEntryPromo();

  const [editingPromo, setEditingPromo] = useState<BonusEntryPromo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleEdit = (promo: BonusEntryPromo) => {
    setEditingPromo(promo);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this bonus entry promo? This action cannot be undone.")) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
      await refetch();
    } catch (error) {
      console.error("Failed to delete bonus entry promo:", error);
      alert("Failed to delete bonus entry promo. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPromo(null);
  };

  const handleSuccess = () => {
    refetch();
  };

  const getTypeLabel = (type: BonusEntryPromo["type"]) => {
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

  const getStatusBadge = (promo: BonusEntryPromo) => {
    if (promo.isCurrentlyActive) {
      return (
        <AdminBadge variant="success" icon={CheckCircle} iconClassName="text-emerald-600 dark:text-emerald-400">
          Active Now
        </AdminBadge>
      );
    }
    if (promo.isUpcoming) {
      return <AdminBadge variant="info">Upcoming</AdminBadge>;
    }
    if (promo.isExpired) {
      return <AdminBadge variant="neutral">Expired</AdminBadge>;
    }
    return <AdminBadge variant="warning">Inactive</AdminBadge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-400" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700">
        <div className="p-3 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-red-600 dark:text-red-400" />
              Bonus Entry Promos
            </h3>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="p-2 text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800"
              title="Refresh"
              type="button"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading ? "animate-spin" : "")} />
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6">
          {promos.length === 0 ? (
            <div className="text-center py-8">
              <Gift className="w-12 h-12 text-gray-300 dark:text-neutral-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-neutral-400">No bonus entry promos found</p>
              <p className="text-sm text-gray-400 dark:text-neutral-500 mt-1">
                Create a new promo to grant bonus entries during specific date ranges
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
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Gift className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
                          {promo.bonusEntries} entries
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
                        <Calendar className="w-3 h-3 shrink-0" />
                        {promo.startDateFormatted || formatDateReadable(new Date(promo.startDate))} →{" "}
                        {promo.endDateFormatted || formatDateReadable(new Date(promo.endDate))}
                      </div>
                      {promo.description && (
                        <div className="truncate">{promo.description}</div>
                      )}
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
                        Bonus Entries
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Date Range
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-neutral-700 dark:bg-neutral-900/80">
                    {promos.map((promo) => (
                      <tr key={promo.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/60">
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-neutral-100">
                            {getTypeLabel(promo.type)}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Gift className="h-4 w-4 text-red-600 dark:text-red-400" />
                            <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
                              {promo.bonusEntries}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-neutral-400">entries</span>
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
                        <td className="whitespace-nowrap px-4 py-3">{getStatusBadge(promo)}</td>
                        <td className="px-4 py-3">
                          <div className="max-w-xs truncate text-sm text-gray-500 dark:text-neutral-400">
                            {promo.description || (
                              <span className="italic text-gray-400 dark:text-neutral-500">No description</span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(promo)}
                              className="rounded p-1.5 text-blue-600 transition-colors hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                              title="Edit promo"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(promo.id)}
                              disabled={deletingId === promo.id}
                              className="rounded p-1.5 text-red-600 transition-colors hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Delete promo"
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

      {/* Edit Modal */}
      <AdminBonusEntryPromoModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={handleSuccess}
        editingPromo={editingPromo}
      />
    </>
  );
}
