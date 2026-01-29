"use client";

import React, { useState } from "react";
import { useScheduledPromos, useDeleteScheduledPromo } from "@/hooks/queries/useScheduledPromoQueries";
import type { ScheduledPromo } from "@/types/admin";
import PromoBadge from "@/components/ui/PromoBadge";
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
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Active Now
        </span>
      );
    }
    if (promo.isUpcoming) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Upcoming
        </span>
      );
    }
    if (promo.isExpired) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Expired
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
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
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-red-600" />
              Scheduled Phases
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

        <div className="p-4 sm:p-6">
          {promos.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No scheduled phases found</p>
              <p className="text-sm text-gray-400 mt-1">
                Add a phase to apply multipliers automatically during specific date ranges
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Multiplier
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date Range
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {promos.map((promo) => (
                    <tr key={promo.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{getTypeLabel(promo.type)}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <PromoBadge multiplier={promo.multiplier} size="small" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900 max-w-[140px] truncate">
                          {promo.name || <span className="text-gray-400 italic">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">
                          <div className="flex items-center gap-1 mb-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            <span className="font-medium">Start:</span>
                            <span>{promo.startDateFormatted || formatDateReadable(new Date(promo.startDate))}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            <span className="font-medium">End:</span>
                            <span>{promo.endDateFormatted || formatDateReadable(new Date(promo.endDate))}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">{getStatusBadge(promo)}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(promo)}
                            className="text-blue-600 hover:text-blue-900 p-1.5 rounded transition-colors"
                            title="Edit phase"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(promo.id)}
                            disabled={deletingId === promo.id}
                            className="text-red-600 hover:text-red-900 p-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          )}
        </div>
      </div>
    </>
  );
}
