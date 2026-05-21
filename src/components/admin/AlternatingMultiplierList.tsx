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
import { formatDisplayName } from "@/utils/display-name";

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
        <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
        <p className="text-red-600 dark:text-red-400">Failed to load alternating multiplier configurations</p>
      </div>
    );
  }

  if (configs.length === 0) {
    return (
      <div className="py-8 text-center">
        <Zap className="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-neutral-600" />
        <p className="text-gray-500 dark:text-neutral-400">No alternating multiplier configurations</p>
        <p className="mt-1 text-sm text-gray-400 dark:text-neutral-500">
          Create a configuration to enable automatic multiplier alternation
        </p>
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
              className={`rounded-lg border-2 p-3 sm:p-4 ${
                config.isEnabled
                  ? "border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-950/25"
                  : "border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2 sm:mb-2 sm:gap-3">
                    <h4 className="text-base font-semibold text-gray-900 sm:text-lg dark:text-white">
                      {getTypeLabel(config.type)}
                    </h4>
                    {config.isEnabled ? (
                      <span className="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-950/50 dark:text-green-200">
                        <CheckCircle2 className="h-3 w-3" />
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-400">
                        Disabled
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-neutral-400">Multipliers:</span>
                      <div className="flex items-center gap-2">
                        {config.multipliers.map((multiplier, index) => (
                          <React.Fragment key={multiplier}>
                            <span className="rounded bg-red-100 px-2 py-1 text-sm font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-200">
                              {multiplier}x
                            </span>
                            {index < config.multipliers.length - 1 && (
                              <span className="text-gray-400 dark:text-neutral-500">↔</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    {config.isEnabled && currentMultiplier && (
                      <div className="flex items-center gap-2 text-sm">
                        <Info className="w-4 h-4 text-blue-500" />
                        <span className="text-gray-600 dark:text-neutral-400">
                          <strong>Today:</strong> {currentMultiplier}x (tomorrow: {otherMultiplier}x)
                        </span>
                      </div>
                    )}

                    {config.description && (
                      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{config.description}</p>
                    )}

                    {config.createdBy && (
                      <p className="mt-2 text-xs text-gray-400 dark:text-neutral-500">
                        Created by: {formatDisplayName(config.createdBy.firstName, config.createdBy.lastName)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(config)}
                    className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                    title="Edit configuration"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(config.id)}
                    disabled={deletingId === config.id}
                    className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
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

