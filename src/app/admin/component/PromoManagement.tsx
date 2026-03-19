"use client";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminActivePromos } from "@/hooks/queries/usePromoQueries";
import AdminPromoToggle from "@/components/modals/AdminPromoToggle";
import AdminBonusEntryPromoModal from "@/components/modals/AdminBonusEntryPromoModal";
import BonusEntryPromoList from "@/components/admin/BonusEntryPromoList";
import AdminScheduledPromoModal from "@/components/modals/AdminScheduledPromoModal";
import ScheduledPromoList from "@/components/admin/ScheduledPromoList";
import AdminPromoLinkModal from "@/components/modals/AdminPromoLinkModal";
import PromoLinkList from "@/components/admin/PromoLinkList";
import AdminPromoBannerTextModal from "@/components/modals/AdminPromoBannerTextModal";
import PromoBannerTextList from "@/components/admin/PromoBannerTextList";
import AdminAlternatingMultiplierModal from "@/components/modals/AdminAlternatingMultiplierModal";
import AlternatingMultiplierList from "@/components/admin/AlternatingMultiplierList";
import MonthlyRedeemablesCampaignPanel from "@/components/admin/MonthlyRedeemablesCampaignPanel";
import MilestoneRewardsPanel from "@/components/admin/MilestoneRewardsPanel";
import PromoBadgeImage from "@/components/ui/PromoBadgeImage";
import type { ScheduledPromo } from "@/types/admin";
import { Zap, Loader2, RefreshCw, Settings, Gift, Plus, Link2, Calendar, Repeat, Medal } from "lucide-react";
import { formatDisplayName } from "@/utils/display-name";

export default function PromoManagement() {
  const [isToggleModalOpen, setIsToggleModalOpen] = useState(false);
  const [isScheduledModalOpen, setIsScheduledModalOpen] = useState(false);
  const [editingScheduledPromo, setEditingScheduledPromo] = useState<ScheduledPromo | null>(null);
  const [isBonusEntryModalOpen, setIsBonusEntryModalOpen] = useState(false);
  const [isPromoLinkModalOpen, setIsPromoLinkModalOpen] = useState(false);
  const [isBannerTextModalOpen, setIsBannerTextModalOpen] = useState(false);
  const [isAlternatingMultiplierModalOpen, setIsAlternatingMultiplierModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "redeemables" | "milestones" | "scheduled" | "bonus-entry" | "promo-links" | "banner-text" | "alternating"
  >("scheduled");

  const queryClient = useQueryClient();
  const { data: activePromos = [], isLoading: activeLoading, refetch: refetchActive } = useAdminActivePromos();

  const tabs = [
    { id: "scheduled" as const, label: "Scheduled", icon: Calendar },
    { id: "alternating" as const, label: "Alternating", icon: Repeat },
    { id: "promo-links" as const, label: "Promo Links", icon: Link2 },
    { id: "banner-text" as const, label: "Banner Text", icon: Calendar },
    { id: "bonus-entry" as const, label: "Bonus Entry", icon: Gift },
    { id: "redeemables" as const, label: "Redeemables", icon: Gift },
    { id: "milestones" as const, label: "Milestones", icon: Medal },
  ];

  const primaryActionButtonClass =
    "inline-flex items-center gap-1.5 sm:gap-2 bg-gradient-to-r from-red-600 to-red-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-semibold text-sm sm:text-base hover:from-red-700 hover:to-red-800 transition-all duration-200 shadow-lg w-full sm:w-auto justify-center shrink-0";

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Promo Management</h2>
          <p className="text-gray-600 text-sm sm:text-base mt-0.5 sm:mt-1">Manage campaigns and entry multipliers</p>
        </div>
      </div>

      {/* Promo Tabs */}
      <div className="space-y-3 sm:space-y-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors w-full sm:w-auto ${
                    isActive
                      ? "bg-gradient-to-r from-red-600 to-red-700 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {activeTab === "redeemables" && <MonthlyRedeemablesCampaignPanel />}

          {activeTab === "milestones" && <MilestoneRewardsPanel />}

          {activeTab === "scheduled" && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-red-600" />
                    Scheduled Promos
                  </h3>
                  <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
                    Campaign phases with date ranges; apply automatically. Priority: Scheduled &gt; Toggle &gt; Alternating.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingScheduledPromo(null);
                    setIsScheduledModalOpen(true);
                  }}
                  className={primaryActionButtonClass}
                >
                  <Plus className="w-4 h-4" />
                  Schedule Promo
                </button>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
                <div className="p-3 sm:p-4 border-b border-gray-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h4 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      Active Promos
                    </h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => refetchActive()}
                        disabled={activeLoading}
                        className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <RefreshCw className={`w-4 h-4 ${activeLoading ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        onClick={() => setIsToggleModalOpen(true)}
                        className="inline-flex items-center gap-1.5 bg-gradient-to-r from-red-600 to-red-700 text-white px-3 py-1.5 rounded-lg font-semibold text-xs sm:text-sm hover:from-red-700 hover:to-red-800 transition-all duration-200"
                      >
                        <Settings className="w-3.5 h-3.5 shrink-0" />
                        Toggle Promos
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-3 sm:p-4">
                  {activeLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-red-600" />
                    </div>
                  ) : activePromos.length === 0 ? (
                    <div className="text-center py-6">
                      <Zap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">No active promos</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {activePromos.map((promo) => (
                        <div
                          key={promo.id}
                          className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-3 border border-red-200"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2.5 mb-1">
                                <PromoBadgeImage multiplier={promo.multiplier} size="small" className="shrink-0" />
                                <span className="text-sm font-medium text-gray-700 capitalize truncate">
                                  {promo.type.replace("-", " ")}
                                </span>
                              </div>
                              {promo.createdBy && (
                                <div className="text-xs text-gray-600 truncate">
                                  Created by: {formatDisplayName(promo.createdBy.firstName, promo.createdBy.lastName)}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 shrink-0">Managed via Toggle Promos</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <ScheduledPromoList
                onEditRequested={(promo) => {
                  setEditingScheduledPromo(promo);
                  setIsScheduledModalOpen(true);
                }}
              />
            </>
          )}

          {activeTab === "bonus-entry" && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Gift className="w-5 h-5 text-red-600" />
                    Bonus Entry Promos
                  </h3>
                  <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
                    Date-based promos granting bonus entries during specific periods
                  </p>
                </div>
                <button
                  onClick={() => setIsBonusEntryModalOpen(true)}
                  className={primaryActionButtonClass}
                >
                  <Plus className="w-4 h-4" />
                  Create Bonus Entry Promo
                </button>
              </div>
              <BonusEntryPromoList />
            </>
          )}

          {activeTab === "promo-links" && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-red-600" />
                    Promo Links
                  </h3>
                  <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
                    Shareable promo links with unique codes for bonus entries on next purchase
                  </p>
                </div>
                <button
                  onClick={() => setIsPromoLinkModalOpen(true)}
                  className={primaryActionButtonClass}
                >
                  <Plus className="w-4 h-4" />
                  Create Promo Link
                </button>
              </div>
              <PromoLinkList />
            </>
          )}

          {activeTab === "banner-text" && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-red-600" />
                    Promo Banner Text Schedule
                  </h3>
                  <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
                    Custom banner text for holidays. One-time or recurring (weekdays/weekends). AEST timezone.
                  </p>
                </div>
                <button
                  onClick={() => setIsBannerTextModalOpen(true)}
                  className={primaryActionButtonClass}
                >
                  <Plus className="w-4 h-4" />
                  Create Scheduled Text
                </button>
              </div>
              <PromoBannerTextList />
            </>
          )}

          {activeTab === "alternating" && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Repeat className="w-5 h-5 text-red-600" />
                    Alternating Multiplier Settings
                  </h3>
                  <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
                    Daily alternating multipliers at midnight AEST. Priority: Active &gt; Alternating &gt; Default
                  </p>
                </div>
                <button
                  onClick={() => setIsAlternatingMultiplierModalOpen(true)}
                  className={primaryActionButtonClass}
                >
                  <Plus className="w-4 h-4" />
                  Create Configuration
                </button>
              </div>
              <AlternatingMultiplierList />
            </>
          )}
        </div>
      </div>

      {/* Toggle Promo Modal */}
      <AdminPromoToggle isOpen={isToggleModalOpen} onClose={() => setIsToggleModalOpen(false)} />

      {/* Scheduled Promo Modal */}
      <AdminScheduledPromoModal
        isOpen={isScheduledModalOpen}
        onClose={() => {
          setIsScheduledModalOpen(false);
          setEditingScheduledPromo(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["promos", "scheduled"] });
          queryClient.invalidateQueries({ queryKey: ["promos", "admin", "active"] });
          setIsScheduledModalOpen(false);
          setEditingScheduledPromo(null);
        }}
        editingPromo={editingScheduledPromo}
      />

      {/* Bonus Entry Promo Modal */}
      <AdminBonusEntryPromoModal
        isOpen={isBonusEntryModalOpen}
        onClose={() => setIsBonusEntryModalOpen(false)}
        onSuccess={() => {
          setIsBonusEntryModalOpen(false);
        }}
      />

      {/* Promo Link Modal */}
      <AdminPromoLinkModal
        isOpen={isPromoLinkModalOpen}
        onClose={() => setIsPromoLinkModalOpen(false)}
        onSuccess={() => {
          setIsPromoLinkModalOpen(false);
        }}
      />

      {/* Banner Text Modal */}
      <AdminPromoBannerTextModal
        isOpen={isBannerTextModalOpen}
        onClose={() => setIsBannerTextModalOpen(false)}
        onSuccess={() => {
          setIsBannerTextModalOpen(false);
        }}
      />

      {/* Alternating Multiplier Modal */}
      <AdminAlternatingMultiplierModal
        isOpen={isAlternatingMultiplierModalOpen}
        onClose={() => setIsAlternatingMultiplierModalOpen(false)}
        onSuccess={() => {
          setIsAlternatingMultiplierModalOpen(false);
        }}
      />
    </div>
  );
}
