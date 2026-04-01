"use client";

import React, { useState } from "react";
import { useTogglePromo, useAdminActivePromos, type TogglePromoData } from "@/hooks/queries/usePromoQueries";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import PromoBadgeImage from "@/components/ui/PromoBadgeImage";
import { Loader2, Zap } from "lucide-react";

interface AdminPromoToggleProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Admin Promo Toggle Component
 * Simple toggle interface for managing promos (3x, 5x, 10x, or OFF)
 * Replaces the old date-based promo creation system
 */
const promoMultipliers: (2 | 3 | 5 | 10)[] = [10, 5, 3, 2];

const AdminPromoToggle: React.FC<AdminPromoToggleProps> = ({ isOpen, onClose }) => {
  const { data: activePromos = [], isLoading, refetch } = useAdminActivePromos();
  const togglePromoMutation = useTogglePromo();
  const [togglingPromo, setTogglingPromo] = useState<string | null>(null);

  // Get active promo for each type
  const membershipPromo = activePromos.find((p) => p.type === "membership-packages");
  const oneTimePromo = activePromos.find((p) => p.type === "one-time-packages");
  const miniPromo = activePromos.find((p) => p.type === "mini-packages");

  const handleToggle = async (
    type: "membership-packages" | "one-time-packages" | "mini-packages",
    multiplier: 2 | 3 | 5 | 10 | null
  ) => {
    const toggleKey = `${type}-${multiplier}`;
    setTogglingPromo(toggleKey);

    try {
      const data: TogglePromoData = { type, multiplier };
      await togglePromoMutation.mutateAsync(data);
      await refetch();
    } catch (error) {
      console.error("Failed to toggle promo:", error);
    } finally {
      setTogglingPromo(null);
    }
  };

  const renderToggleSection = (
    type: "membership-packages" | "one-time-packages" | "mini-packages",
    currentPromo: typeof membershipPromo | typeof oneTimePromo | typeof miniPromo,
    typeLabel: string
  ) => {
    const currentMultiplier = currentPromo?.multiplier || null;
    const isToggling = togglingPromo?.startsWith(type);

    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-neutral-100">{typeLabel}</h3>
          {currentPromo && (
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">Current:</span>
              <PromoBadgeImage multiplier={currentPromo.multiplier} size="small" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {/* Toggle buttons: 10x, 5x, 3x, 2x, OFF */}
          {promoMultipliers.map((multiplier) => {
            const isActive = currentMultiplier === multiplier;
            const toggleKey = `${type}-${multiplier}`;
            const isTogglingThis = togglingPromo === toggleKey;

            return (
              <button
                key={multiplier}
                onClick={() => handleToggle(type, multiplier)}
                disabled={isToggling || togglePromoMutation.isPending}
                className={`
                  relative px-2 py-2 sm:px-4 sm:py-3 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200
                  ${
                    isActive
                      ? "bg-gradient-to-r from-yellow-400 via-yellow-500 to-amber-600 text-black shadow-lg scale-105 ring-2 ring-yellow-300"
                      : "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 hover:bg-gray-200 dark:hover:bg-neutral-700 hover:scale-105"
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                `}
              >
                {isTogglingThis ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-1">
                      <Zap className="w-4 h-4" />
                      <span>{multiplier}x</span>
                    </div>
                    {isActive && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    )}
                  </>
                )}
              </button>
            );
          })}

          {/* OFF button */}
          <button
            onClick={() => handleToggle(type, null)}
            disabled={isToggling || togglePromoMutation.isPending || !currentPromo}
            className={`
              relative px-2 py-2 sm:px-4 sm:py-3 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200
              ${
                !currentPromo
                  ? "bg-gradient-to-r from-red-500 via-red-600 to-red-700 text-white shadow-lg scale-105 ring-2 ring-red-300"
                  : "bg-gray-100 text-gray-700 dark:text-neutral-200 hover:bg-red-100 hover:text-red-700 hover:scale-105"
              }
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
            `}
          >
            {togglingPromo === `${type}-null` ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : <span>OFF</span>}
          </button>
        </div>

        {!currentPromo && (
          <p className="text-sm text-gray-500 text-center">No active promo - select a multiplier to activate</p>
        )}
      </div>
    );
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader title="Toggle Promos" onClose={onClose} showLogo={false} />

      <ModalContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-red-600" />
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8">
            {renderToggleSection("membership-packages", membershipPromo, "Membership Subscription Promo")}
            <div className="border-t border-gray-200"></div>
            {renderToggleSection("one-time-packages", oneTimePromo, "One-Time Packages")}
            <div className="border-t border-gray-200"></div>
            {renderToggleSection("mini-packages", miniPromo, "Mini Packages")}
          </div>
        )}
      </ModalContent>

      <div className="p-4 sm:p-6 border-t border-gray-200">
        <div className="flex gap-2 sm:gap-3">
          <Button onClick={onClose} variant="outline" size="md" className="flex-1">
            Close
          </Button>
        </div>
      </div>
    </ModalContainer>
  );
};

export default AdminPromoToggle;
