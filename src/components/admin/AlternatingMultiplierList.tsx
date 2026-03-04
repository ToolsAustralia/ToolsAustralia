"use client";

import React, { useState } from "react";
import { Zap, Edit, Trash2, Loader2, AlertCircle, CheckCircle2, Info } from "lucide-react";
import {
  useAlternatingMultiplierConfigs,
  useDeleteAlternatingMultiplier,
} from "@/hooks/queries/useAlternatingMultiplierQueries";
import AdminAlternatingMultiplierModal from "@/components/modals/AdminAlternatingMultiplierModal";
import type { AlternatingPromoMultiplier } from "@/types/admin";
import { getAlternatingMultiplier } from "@/utils/promo-banner/alternating-multiplier-manager";

export default function AlternatingMultiplierList() {
  const { data, isLoading, error } = useAlternatingMultiplierConfigs();
  const deleteMutation = useDeleteAlternatingMultiplier();
  const [editingConfig, setEditingConfig] = useState<AlternatingPromoMultiplier | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const configs = data?.data || [];

  const handleEdit = (config: AlternatingPromoMultiplier) => {
    setEditingConfig(config);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this alternating multiplier configuration?")) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error) {
      console.error("Failed to delete alternating multiplier config:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingConfig(null);
  };

  const handleModalSuccess = () => {
    // Modal will close and queries will refetch automatically
  };

  const getTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      "membership-packages": "Membership Packages",
      "one-time-packages": "One-Time Packages",
      "mini-packages": "Mini Packages",
    };
    return labels[type] || type;
  };

  const getCurrentMultiplier = (config: AlternatingPromoMultiplier): number | null => {
    if (!config.isEnabled) return null;
    return getAlternatingMultiplier(config.multipliers);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-red-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-600">Failed to load alternating multiplier configurations</p>
      </div>
    );
  }

  if (configs.length === 0) {
    return (
      <div className="text-center py-8">
        <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No alternating multiplier configurations</p>
        <p className="text-sm text-gray-400 mt-1">Create a configuration to enable automatic multiplier alternation</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 sm:space-y-4">
        {configs.map((config) => {
          const currentMultiplier = getCurrentMultiplier(config);
          const otherMultiplier = config.multipliers.find((m) => m !== currentMultiplier);

          return (
            <div
              key={config.id}
              className={`bg-white rounded-lg border-2 p-3 sm:p-4 ${
                config.isEnabled ? "border-green-200 bg-green-50" : "border-gray-200"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                    <h4 className="text-base sm:text-lg font-semibold text-gray-900">{getTypeLabel(config.type)}</h4>
                    {config.isEnabled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                        <CheckCircle2 className="w-3 h-3" />
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                        Disabled
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Multipliers:</span>
                      <div className="flex items-center gap-2">
                        {config.multipliers.map((multiplier, index) => (
                          <React.Fragment key={multiplier}>
                            <span className="px-2 py-1 bg-red-100 text-red-800 text-sm font-semibold rounded">
                              {multiplier}x
                            </span>
                            {index < config.multipliers.length - 1 && (
                              <span className="text-gray-400">↔</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    {config.isEnabled && currentMultiplier && (
                      <div className="flex items-center gap-2 text-sm">
                        <Info className="w-4 h-4 text-blue-500" />
                        <span className="text-gray-600">
                          <strong>Today:</strong> {currentMultiplier}x (tomorrow: {otherMultiplier}x)
                        </span>
                      </div>
                    )}

                    {config.description && (
                      <p className="text-sm text-gray-500 mt-2">{config.description}</p>
                    )}

                    {config.createdBy && (
                      <p className="text-xs text-gray-400 mt-2">
                        Created by: {config.createdBy.firstName} {config.createdBy.lastName}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(config)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit configuration"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(config.id)}
                    disabled={deletingId === config.id}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete configuration"
                  >
                    {deletingId === config.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <AdminAlternatingMultiplierModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
        editingConfig={editingConfig}
      />
    </>
  );
}

