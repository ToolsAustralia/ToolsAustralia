"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Medal, Pencil, Plus, Power, Trash2 } from "lucide-react";
import AdminMilestoneRewardModal, { type MilestoneRewardFormItem } from "@/components/modals/AdminMilestoneRewardModal";

interface MilestoneRewardListItem extends MilestoneRewardFormItem {
  performance?: {
    issuedCount: number;
    redeemedCount: number;
    activeCount: number;
    expiredCount: number;
    cancelledCount: number;
    totalEntriesGranted: number;
    redemptionRate: number;
  };
}

function formatDateTime(value?: string) {
  if (!value) return "—";
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

export default function MilestoneRewardsPanel() {
  const [rewards, setRewards] = useState<MilestoneRewardListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<MilestoneRewardFormItem | null>(null);
  const [actionRewardId, setActionRewardId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadRewards = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/milestone-rewards");
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to fetch milestone rewards");
      }
      setRewards(data.data || []);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load milestone rewards",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRewards();
  }, [loadRewards]);

  const toggleReward = async (rewardId: string, isActive: boolean) => {
    setActionRewardId(rewardId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/milestone-rewards/${rewardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to toggle reward");
      }
      setFeedback({
        type: "success",
        message: isActive ? "Milestone reward activated." : "Milestone reward deactivated.",
      });
      await loadRewards();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to toggle reward",
      });
    } finally {
      setActionRewardId(null);
    }
  };

  const deleteReward = async (rewardId: string) => {
    if (!window.confirm("Delete this milestone reward? This action cannot be undone.")) return;
    setActionRewardId(rewardId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/milestone-rewards/${rewardId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to delete reward");
      }
      setFeedback({
        type: "success",
        message: "Milestone reward deleted successfully.",
      });
      await loadRewards();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to delete reward",
      });
    } finally {
      setActionRewardId(null);
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700">
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Medal className="w-5 h-5 text-red-600 dark:text-red-400" />
                Milestone Rewards
              </h3>
              <p className="text-gray-600 dark:text-neutral-400 mt-1 text-xs sm:text-sm">
                Auto-issue rewards based on spend, entries gained, and loyalty days.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingReward(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold hover:from-red-700 hover:to-red-800"
            >
              <Plus className="w-4 h-4" />
              Create Reward
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {feedback && (
            <div
              className={`mb-4 rounded-lg px-3 py-2 text-sm ${
                feedback.type === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : "border border-red-200 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200"
              }`}
            >
              {feedback.message}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-400" />
            </div>
          ) : rewards.length === 0 ? (
            <div className="text-center py-10">
              <Medal className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-neutral-600" />
              <p className="text-gray-600 dark:text-neutral-400">No milestone rewards configured yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rewards.map((reward) => (
                <article
                  key={reward.id}
                  className="rounded-xl border border-gray-200 bg-white p-3.5 dark:border-neutral-700 dark:bg-neutral-900/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-gray-900 sm:text-base dark:text-neutral-100">
                        {reward.name}
                      </h4>
                      {reward.displayLabel && (
                        <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{reward.displayLabel}</p>
                      )}
                      <p className="text-xs text-gray-600 dark:text-neutral-400 mt-1">
                        {reward.milestoneType} · Threshold {reward.threshold.toLocaleString()} · {reward.entriesAmount.toLocaleString()} entries
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-neutral-400">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono dark:bg-neutral-800 dark:text-neutral-200">
                          {reward.code}
                        </span>
                        <span>{reward.neverExpires ? "Never Expires" : `End ${formatDateTime(reward.endsAt)}`}</span>
                        <span>{reward.isRecurring ? "Recurring" : "One-time"}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                        <div className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-neutral-800/80">
                          <span className="text-gray-500 dark:text-neutral-400">Issued</span>
                          <p className="mt-0.5 font-semibold text-gray-900 dark:text-neutral-100">
                            {reward.performance?.issuedCount ?? 0}
                          </p>
                        </div>
                        <div className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-neutral-800/80">
                          <span className="text-gray-500 dark:text-neutral-400">Redeemed</span>
                          <p className="mt-0.5 font-semibold text-gray-900 dark:text-neutral-100">
                            {reward.performance?.redeemedCount ?? 0}
                          </p>
                        </div>
                        <div className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-neutral-800/80">
                          <span className="text-gray-500 dark:text-neutral-400">Active</span>
                          <p className="mt-0.5 font-semibold text-gray-900 dark:text-neutral-100">
                            {reward.performance?.activeCount ?? 0}
                          </p>
                        </div>
                        <div className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-neutral-800/80">
                          <span className="text-gray-500 dark:text-neutral-400">Redeem Rate</span>
                          <p className="mt-0.5 font-semibold text-gray-900 dark:text-neutral-100">
                            {reward.performance?.redemptionRate ?? 0}%
                          </p>
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-neutral-400">
                        Entries issued total: {reward.performance?.totalEntriesGranted?.toLocaleString() ?? 0}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        reward.isActive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
                          : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200"
                      }`}
                    >
                      {reward.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setEditingReward(reward);
                        setIsModalOpen(true);
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => toggleReward(reward.id, !reward.isActive)}
                      disabled={actionRewardId === reward.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                    >
                      <Power className="w-3.5 h-3.5" />
                      {reward.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => deleteReward(reward.id)}
                      disabled={actionRewardId === reward.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <AdminMilestoneRewardModal
        isOpen={isModalOpen}
        editingReward={editingReward}
        onClose={() => {
          setIsModalOpen(false);
          setEditingReward(null);
        }}
        onSuccess={() => {
          loadRewards();
          setFeedback({ type: "success", message: editingReward ? "Reward updated successfully." : "Reward created successfully." });
        }}
      />
    </>
  );
}
