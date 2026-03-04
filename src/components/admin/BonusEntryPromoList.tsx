"use client";

import React, { useState } from "react";
import { useBonusEntryPromos, useDeleteBonusEntryPromo } from "@/hooks/queries/usePromoQueries";
import AdminBonusEntryPromoModal from "@/components/modals/AdminBonusEntryPromoModal";
import type { BonusEntryPromo } from "@/types/admin";
import { Gift, Edit2, Trash2, Calendar, Loader2, RefreshCw } from "lucide-react";
import { formatDateReadable } from "@/utils/common/timezone";

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
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Active Now
        </span>
      );
    } else if (promo.isUpcoming) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Upcoming
        </span>
      );
    } else if (promo.isExpired) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Expired
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          Inactive
        </span>
      );
    }
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
              <Gift className="w-5 h-5 text-red-600" />
              Bonus Entry Promos
            </h3>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6">
          {promos.length === 0 ? (
            <div className="text-center py-8">
              <Gift className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No bonus entry promos found</p>
              <p className="text-sm text-gray-400 mt-1">
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
                    className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50/50"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Gift className="w-4 h-4 text-red-600 shrink-0" />
                        <span className="text-sm font-semibold text-gray-900">
                          {promo.bonusEntries} entries
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {getStatusBadge(promo)}
                        <button
                          onClick={() => handleEdit(promo)}
                          className="text-blue-600 hover:text-blue-900 p-1.5 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(promo.id)}
                          disabled={deletingId === promo.id}
                          className="text-red-600 hover:text-red-900 p-1.5 rounded disabled:opacity-50"
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
                    <div className="text-xs text-gray-600 space-y-0.5">
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
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Bonus Entries
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date Range
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {promos.map((promo) => (
                      <tr key={promo.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{getTypeLabel(promo.type)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Gift className="w-4 h-4 text-red-600" />
                            <span className="text-sm font-semibold text-gray-900">{promo.bonusEntries}</span>
                            <span className="text-xs text-gray-500">entries</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">
                            <div className="flex items-center gap-1 mb-0.5">
                              <Calendar className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="font-medium">Start:</span>
                              <span>{promo.startDateFormatted || formatDateReadable(new Date(promo.startDate))}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="font-medium">End:</span>
                              <span>{promo.endDateFormatted || formatDateReadable(new Date(promo.endDate))}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{getStatusBadge(promo)}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-500 max-w-xs truncate">
                            {promo.description || <span className="text-gray-400 italic">No description</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(promo)}
                              className="text-blue-600 hover:text-blue-900 p-1.5 rounded transition-colors"
                              title="Edit promo"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(promo.id)}
                              disabled={deletingId === promo.id}
                              className="text-red-600 hover:text-red-900 p-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
