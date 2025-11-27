"use client";

import React, { useState } from "react";
import { useAdminActivePromos } from "@/hooks/queries/usePromoQueries";
import AdminPromoToggle from "@/components/modals/AdminPromoToggle";
import PromoBadge from "@/components/ui/PromoBadge";
import { Zap, Loader2, RefreshCw, Settings } from "lucide-react";

export default function PromoManagement() {
  const [isToggleModalOpen, setIsToggleModalOpen] = useState(false);

  const { data: activePromos = [], isLoading: activeLoading, refetch: refetchActive } = useAdminActivePromos();

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Promo Management</h2>
          <p className="text-gray-600 mt-1">Manage promotional campaigns and entry multipliers</p>
        </div>
        <button
          onClick={() => setIsToggleModalOpen(true)}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700 text-white px-4 py-2 rounded-lg font-semibold hover:from-red-700 hover:to-red-800 transition-all duration-200 transform hover:scale-105 shadow-lg"
        >
          <Settings className="w-4 h-4" />
          Toggle Promos
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
                      {promo.createdBy && (
                        <div className="text-sm text-gray-600">
                          Created by: {promo.createdBy.firstName} {promo.createdBy.lastName}
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">Use toggle button above to change or turn off</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toggle Promo Modal */}
      <AdminPromoToggle isOpen={isToggleModalOpen} onClose={() => setIsToggleModalOpen(false)} />
    </div>
  );
}
