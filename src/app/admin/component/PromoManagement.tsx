"use client";

import React, { useState } from "react";
import { useAdminActivePromos, usePromoHistory, useEndPromo } from "@/hooks/queries/usePromoQueries";
import AdminPromoModal from "@/components/modals/AdminPromoModal";
import PromoBadge from "@/components/ui/PromoBadge";
import { format } from "date-fns";
import { Plus, Clock, Zap, Calendar, User, AlertTriangle, CheckCircle, X, Loader2, RefreshCw } from "lucide-react";

export default function PromoManagement() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedType, setSelectedType] = useState<"one-time-packages" | "mini-packages" | "all">("all");
  const [isEndingPromo, setIsEndingPromo] = useState<string | null>(null);

  const { data: activePromos = [], isLoading: activeLoading, refetch: refetchActive } = useAdminActivePromos();
  const {
    data: historyData,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = usePromoHistory(currentPage, 10, selectedType === "all" ? undefined : selectedType);

  const endPromoMutation = useEndPromo();

  const handleEndPromo = async (promoId: string) => {
    setIsEndingPromo(promoId);
    try {
      await endPromoMutation.mutateAsync(promoId);
      refetchActive();
      refetchHistory();
    } catch (error) {
      console.error("Failed to end promo:", error);
    } finally {
      setIsEndingPromo(null);
    }
  };

  const formatTimeRemaining = (endDate: string) => {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return "Expired";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getStatusColor = (promo: { endDate: string; isActive: boolean; timeRemaining: number }) => {
    const now = new Date();
    const end = new Date(promo.endDate);

    if (!promo.isActive) return "text-gray-500";
    if (end.getTime() <= now.getTime()) return "text-red-500";
    if (promo.timeRemaining < 24 * 60 * 60 * 1000) return "text-orange-500"; // Less than 24 hours
    return "text-green-500";
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Promo Management</h2>
          <p className="text-gray-600 mt-1">Manage promotional campaigns and entry multipliers</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700 text-white px-4 py-2 rounded-lg font-semibold hover:from-red-700 hover:to-red-800 transition-all duration-200 transform hover:scale-105 shadow-lg"
        >
          <Plus className="w-4 h-4" />
          Create Promo
        </button>
      </div>

      {/* Active Promos */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Active Promos
            </h3>
            <button
              onClick={() => refetchActive()}
              disabled={activeLoading}
              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${activeLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {activeLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-red-600" />
            </div>
          ) : activePromos.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No active promos</p>
              <p className="text-sm text-gray-400 mt-1">Create a new promo to boost package sales</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activePromos.map((promo) => (
                <div
                  key={promo.id}
                  className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-4 border border-red-200"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <PromoBadge multiplier={promo.multiplier} />
                        <span className="text-sm font-medium text-gray-700 capitalize">
                          {promo.type.replace("-", " ")}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">
                            Ends: {format(new Date(promo.endDate), "MMM dd, yyyy 'at' HH:mm")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className={`font-medium ${getStatusColor(promo)}`}>
                            {formatTimeRemaining(promo.endDate)}
                          </span>
                        </div>
                        {promo.createdBy && (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600">
                              {promo.createdBy.firstName} {promo.createdBy.lastName}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEndPromo(promo.id)}
                        disabled={isEndingPromo === promo.id}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                      >
                        {isEndingPromo === promo.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                        End Promo
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Promo History */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h3 className="text-lg font-semibold text-gray-900">Promo History</h3>
            <div className="flex items-center gap-2">
              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value as "one-time-packages" | "mini-packages" | "all");
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="all">All Types</option>
                <option value="one-time-packages">One-Time Packages</option>
                <option value="mini-packages">Mini Packages</option>
              </select>
              <button
                onClick={() => refetchHistory()}
                disabled={historyLoading}
                className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${historyLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-red-600" />
            </div>
          ) : !historyData?.data || historyData.data.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No promo history found</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {historyData.data.map((promo) => (
                  <div key={promo.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <PromoBadge multiplier={promo.multiplier} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 capitalize">{promo.type.replace("-", " ")}</span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                              promo.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {promo.isActive ? (
                              <>
                                <CheckCircle className="w-3 h-3" />
                                Active
                              </>
                            ) : (
                              <>
                                <X className="w-3 h-3" />
                                Ended
                              </>
                            )}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          {format(new Date(promo.startDate), "MMM dd, yyyy")} -{" "}
                          {format(new Date(promo.endDate), "MMM dd, yyyy")}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">{promo.duration} hours</div>
                      <div className="text-xs text-gray-500">
                        {promo.createdBy
                          ? "firstName" in promo.createdBy && "lastName" in promo.createdBy
                            ? `${promo.createdBy.firstName} ${promo.createdBy.lastName}`
                            : promo.createdBy.name
                          : "System"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {historyData.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-gray-700">
                    Page {currentPage} of {historyData.pagination.totalPages} ({historyData.pagination.totalCount}{" "}
                    total)
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(Math.min(historyData.pagination.totalPages, currentPage + 1))}
                      disabled={currentPage === historyData.pagination.totalPages}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Promo Modal */}
      <AdminPromoModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </div>
  );
}
