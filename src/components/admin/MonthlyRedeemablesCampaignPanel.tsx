"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Gift, Loader2, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import AdminMonthlyRedeemablesModal from "@/components/modals/AdminMonthlyRedeemablesModal";

interface MonthlyCampaignListItem {
  id: string;
  monthKey: string;
  name: string;
  displayLabel?: string;
  code: string;
  entriesAmount: number;
  campaignMode: "global" | "unique" | "both";
  targetingMode: "all-active-subscribers" | "manual-users" | "csv-users" | "dynamic-segment";
  startsAt: string;
  endsAt?: string;
  neverExpires?: boolean;
  isActive: boolean;
  requiresPurchase?: boolean;
  purchaseRequirement?: "none" | "membership" | "one-time" | "any";
  redeemedCount: number;
}

interface RedemptionAnalyticsItem {
  issuanceId: string;
  userId: string;
  userName: string;
  userEmail: string;
  redeemedAt: string;
  code?: string;
  entriesAmount: number;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MonthlyRedeemablesCampaignPanel() {
  const [campaigns, setCampaigns] = useState<MonthlyCampaignListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<MonthlyCampaignListItem | null>(null);
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [redemptionsModal, setRedemptionsModal] = useState<{ campaignId: string; campaignName: string } | null>(null);
  const [isLoadingRedemptions, setIsLoadingRedemptions] = useState(false);
  const [redemptions, setRedemptions] = useState<RedemptionAnalyticsItem[]>([]);
  const [redemptionsPage, setRedemptionsPage] = useState(1);
  const [redemptionsTotalPages, setRedemptionsTotalPages] = useState(1);

  const loadCampaigns = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/monthly-coupon/campaign");
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to fetch coupons");
      }
      setCampaigns(data.data || []);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load coupons",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const handleToggle = async (campaignId: string, isActive: boolean) => {
    setBusyCampaignId(campaignId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/monthly-coupon/campaign/${campaignId}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to toggle campaign");
      }
      setFeedback({
        type: "success",
        message: isActive ? "Coupon activated." : "Coupon deactivated.",
      });
      await loadCampaigns();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to toggle coupon",
      });
    } finally {
      setBusyCampaignId(null);
    }
  };

  const handleDelete = async (campaignId: string) => {
    if (!window.confirm("Delete this coupon? If issuances exist, it will be deactivated instead.")) return;
    setBusyCampaignId(campaignId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/monthly-coupon/campaign/${campaignId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to delete coupon");
      }
      setFeedback({
        type: "success",
        message: data?.message || "Coupon deleted.",
      });
      await loadCampaigns();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to delete coupon",
      });
    } finally {
      setBusyCampaignId(null);
    }
  };

  const loadRedemptions = useCallback(async (campaignId: string, page = 1) => {
    setIsLoadingRedemptions(true);
    try {
      const response = await fetch(`/api/admin/monthly-coupon/campaign/${campaignId}/redemptions?page=${page}&limit=10`);
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to load redemptions");
      }
      setRedemptions(data.data?.items || []);
      setRedemptionsPage(data.data?.page || 1);
      setRedemptionsTotalPages(data.data?.totalPages || 1);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load redemptions",
      });
    } finally {
      setIsLoadingRedemptions(false);
    }
  }, []);

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                <Gift className="w-5 h-5 text-red-600" />
                Redeemable Coupons
              </h3>
              <p className="text-gray-600 mt-1 text-xs sm:text-sm">
                Create coupons via modal. Eligible users now receive rewards automatically.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  setEditingCampaign(null);
                  setIsModalOpen(true);
                }}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 w-full sm:w-auto rounded-lg bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold hover:from-red-700 hover:to-red-800"
              >
                <Plus className="w-4 h-4" />
                Create Coupon
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {feedback && (
            <div
              className={`mb-4 rounded-lg px-3 py-2 text-sm ${
                feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {feedback.message}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-red-600" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-10">
              <Gift className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">No redeemable coupons yet.</p>
              <p className="text-sm text-gray-500 mt-1">Create one with the modal to make rewards available automatically.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="md:hidden space-y-3">
                {campaigns.map((campaign) => (
                  <article key={campaign.id} className="rounded-xl border border-gray-200 bg-white p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500">{campaign.monthKey}</p>
                        <h4 className="text-sm font-semibold text-gray-900 truncate">{campaign.name}</h4>
                        {campaign.displayLabel && <p className="text-xs text-indigo-600 font-semibold">{campaign.displayLabel}</p>}
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          campaign.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {campaign.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-gray-50 px-2 py-1.5">
                        <span className="text-gray-500">Code</span>
                        <p className="font-mono text-gray-900 mt-0.5 break-all">{campaign.code}</p>
                      </div>
                      <div className="rounded-md bg-gray-50 px-2 py-1.5">
                        <span className="text-gray-500">Entries</span>
                        <p className="font-semibold text-gray-900 mt-0.5">{campaign.entriesAmount.toLocaleString()}</p>
                      </div>
                      <div className="rounded-md bg-gray-50 px-2 py-1.5">
                        <span className="text-gray-500">Mode</span>
                        <p className="font-medium text-gray-900 mt-0.5 capitalize">{campaign.campaignMode}</p>
                      </div>
                      <div className="rounded-md bg-gray-50 px-2 py-1.5">
                        <span className="text-gray-500">Redeemed</span>
                        <p className="font-semibold text-gray-900 mt-0.5">{campaign.redeemedCount}</p>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-gray-600">
                      <p className="truncate">{campaign.targetingMode}</p>
                      <p className="mt-1">Start: {formatDateTime(campaign.startsAt)}</p>
                      <p>End: {campaign.neverExpires ? "Never Expires" : formatDateTime(campaign.endsAt || "")}</p>
                      {campaign.neverExpires && <p className="mt-1 text-indigo-700 font-medium">No expiration</p>}
                      {(() => {
                        const req = campaign.purchaseRequirement ?? (campaign.requiresPurchase ? "membership" : "none");
                        if (req === "membership") return <p className="mt-1 text-amber-700 font-medium">Membership purchase required</p>;
                        if (req === "one-time") return <p className="mt-1 text-amber-700 font-medium">One-time purchase required</p>;
                        if (req === "any") return <p className="mt-1 text-amber-700 font-medium">Any purchase required</p>;
                        return null;
                      })()}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setEditingCampaign(campaign);
                          setIsModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 bg-white text-gray-800 text-xs font-semibold hover:bg-gray-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setRedemptionsModal({ campaignId: campaign.id, campaignName: campaign.name });
                          loadRedemptions(campaign.id, 1);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 bg-white text-gray-800 text-xs font-semibold hover:bg-gray-50"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Redeemed
                      </button>
                      <button
                        onClick={() => handleToggle(campaign.id, !campaign.isActive)}
                        disabled={busyCampaignId === campaign.id}
                        className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 bg-white text-gray-800 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                      >
                        <Power className="w-3.5 h-3.5" />
                        {campaign.isActive ? "Disable" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleDelete(campaign.id)}
                        disabled={busyCampaignId === campaign.id}
                        className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-red-300 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Month</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Coupon</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Code</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Mode</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Targeting</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Redeemed</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Window</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {campaigns.map((campaign) => (
                      <tr key={campaign.id} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-sm font-semibold text-gray-900">{campaign.monthKey}</td>
                        <td className="px-3 py-3 text-sm text-gray-800">
                          <div className="font-medium">{campaign.name}</div>
                          {campaign.displayLabel && <div className="text-xs text-indigo-600 font-semibold">{campaign.displayLabel}</div>}
                          <div className="text-xs text-gray-500">
                            {campaign.entriesAmount.toLocaleString()} entries
                            {(() => {
                              const req = campaign.purchaseRequirement ?? (campaign.requiresPurchase ? "membership" : "none");
                              if (req === "membership") return " · Membership Required";
                              if (req === "one-time") return " · One-Time Required";
                              if (req === "any") return " · Purchase Required";
                              return "";
                            })()}
                            {campaign.neverExpires ? " · Never Expires" : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-700">
                          <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{campaign.code}</span>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-700 capitalize">{campaign.campaignMode}</td>
                        <td className="px-3 py-3 text-sm text-gray-700">{campaign.targetingMode}</td>
                        <td className="px-3 py-3 text-sm font-semibold text-gray-800">{campaign.redeemedCount}</td>
                        <td className="px-3 py-3 text-xs text-gray-600">
                          <div>{formatDateTime(campaign.startsAt)}</div>
                          <div>{campaign.neverExpires ? "Never Expires" : formatDateTime(campaign.endsAt || "")}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              campaign.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {campaign.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingCampaign(campaign);
                                setIsModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-300 bg-white text-gray-800 text-xs font-semibold hover:bg-gray-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setRedemptionsModal({ campaignId: campaign.id, campaignName: campaign.name });
                                loadRedemptions(campaign.id, 1);
                              }}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-300 bg-white text-gray-800 text-xs font-semibold hover:bg-gray-50"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Redeemed
                            </button>
                            <button
                              onClick={() => handleToggle(campaign.id, !campaign.isActive)}
                              disabled={busyCampaignId === campaign.id}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-300 bg-white text-gray-800 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                            >
                              <Power className="w-3.5 h-3.5" />
                              {campaign.isActive ? "Disable" : "Activate"}
                            </button>
                            <button
                              onClick={() => handleDelete(campaign.id)}
                              disabled={busyCampaignId === campaign.id}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-300 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <AdminMonthlyRedeemablesModal
        isOpen={isModalOpen}
        editingCampaign={editingCampaign}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCampaign(null);
        }}
        onSuccess={() => {
          loadCampaigns();
          setFeedback({ type: "success", message: editingCampaign ? "Coupon updated successfully." : "Coupon created successfully." });
          setEditingCampaign(null);
        }}
      />

      {redemptionsModal && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl border border-gray-200 shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h4 className="text-lg font-bold text-gray-900">Redeemed Users</h4>
                <p className="text-sm text-gray-600">{redemptionsModal.campaignName}</p>
              </div>
              <button
                onClick={() => setRedemptionsModal(null)}
                className="w-9 h-9 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              {isLoadingRedemptions ? (
                <div className="py-8 flex items-center justify-center text-gray-500 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading redemptions...
                </div>
              ) : redemptions.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-600">No users have redeemed this coupon yet.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Redeemed At</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Code</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Entries</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {redemptions.map((item) => (
                          <tr key={item.issuanceId}>
                            <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.userName}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">{item.userEmail}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">{formatDateTime(item.redeemedAt)}</td>
                            <td className="px-3 py-2 text-xs text-gray-700">
                              {item.code ? <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{item.code}</span> : "—"}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-900">{item.entriesAmount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      onClick={() => redemptionsModal && loadRedemptions(redemptionsModal.campaignId, redemptionsPage - 1)}
                      disabled={redemptionsPage <= 1 || isLoadingRedemptions}
                      className="h-9 px-3 rounded-lg border border-gray-300 text-sm text-gray-700 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-gray-600">
                      Page {redemptionsPage} of {redemptionsTotalPages}
                    </span>
                    <button
                      onClick={() => redemptionsModal && loadRedemptions(redemptionsModal.campaignId, redemptionsPage + 1)}
                      disabled={redemptionsPage >= redemptionsTotalPages || isLoadingRedemptions}
                      className="h-9 px-3 rounded-lg border border-gray-300 text-sm text-gray-700 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
