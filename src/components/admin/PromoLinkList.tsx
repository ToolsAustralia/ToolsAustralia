"use client";

import React, { useState } from "react";
import { usePromoLinks, useDeletePromoLink } from "@/hooks/queries/usePromoQueries";
import AdminPromoLinkModal from "@/components/modals/AdminPromoLinkModal";
import type { PromoLink } from "@/types/admin";
import { Link2, Edit2, Trash2, Calendar, Loader2, RefreshCw, Copy, Check, CheckCircle } from "lucide-react";
import { AdminBadge } from "@/components/admin/ui/AdminBadge";
import { formatDateReadable } from "@/utils/common/timezone";

interface PromoLinkListProps {
  filters?: {
    isActive?: boolean;
    expired?: boolean;
  };
}

/**
 * Promo Link List Component
 * Displays a list of promo links with edit and delete actions
 */
export default function PromoLinkList({ filters }: PromoLinkListProps) {
  const { data: promoLinks = [], isLoading, refetch } = usePromoLinks(filters);
  const deleteMutation = useDeletePromoLink();

  const [editingPromoLink, setEditingPromoLink] = useState<PromoLink | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleEdit = (promoLink: PromoLink) => {
    setEditingPromoLink(promoLink);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this promo link? This action cannot be undone.")) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
      await refetch();
    } catch (error) {
      console.error("Failed to delete promo link:", error);
      alert("Failed to delete promo link. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPromoLink(null);
  };

  const handleSuccess = () => {
    refetch();
  };

  const handleCopyLink = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  const getStatusBadge = (promoLink: PromoLink) => {
    if (!promoLink.isActive) {
      return <AdminBadge variant="warning">Inactive</AdminBadge>;
    }
    if (promoLink.isExpired) {
      return <AdminBadge variant="neutral">Expired</AdminBadge>;
    }
    return (
      <AdminBadge variant="success" icon={CheckCircle} iconClassName="text-emerald-600 dark:text-emerald-400">
        Active
      </AdminBadge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-400" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700">
        <div className="p-3 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Link2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              Promo Links
            </h3>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="p-2 text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800"
              title="Refresh"
              type="button"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6">
          {promoLinks.length === 0 ? (
            <div className="text-center py-8">
              <Link2 className="w-12 h-12 text-gray-300 dark:text-neutral-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-neutral-400">No promo links found</p>
              <p className="text-sm text-gray-400 dark:text-neutral-500 mt-1">Create a new promo link to share with users</p>
            </div>
          ) : (
            <>
              {/* Mobile: Card layout */}
              <div className="sm:hidden space-y-3">
                {promoLinks.map((promoLink) => (
                  <div
                    key={promoLink.id}
                    className="rounded-lg border border-gray-200 p-3 hover:bg-gray-50/50 dark:border-neutral-700 dark:hover:bg-neutral-800/50"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-mono font-semibold text-gray-900 dark:text-neutral-100 truncate">
                          {promoLink.code}
                        </span>
                        <button
                          onClick={() => handleCopyLink(promoLink.promoUrl, promoLink.id)}
                          className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 shrink-0"
                          title="Copy"
                        >
                          {copiedId === promoLink.id ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {getStatusBadge(promoLink)}
                        <button
                          onClick={() => handleEdit(promoLink)}
                          className="rounded p-1.5 text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(promoLink.id)}
                          disabled={deletingId === promoLink.id}
                          className="rounded p-1.5 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === promoLink.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-neutral-400 space-y-0.5">
                      <div className="flex items-center gap-1">
                        <Link2 className="w-3 h-3 shrink-0" />
                        {promoLink.bonusEntries} entries
                        {(promoLink.appliesToMembership || promoLink.appliesToOneTime) && (
                          <span className="ml-1">
                            ({[
                              promoLink.appliesToMembership && "Membership",
                              promoLink.appliesToOneTime && "One-Time",
                            ]
                              .filter(Boolean)
                              .join(", ")})
                          </span>
                        )}
                      </div>
                      {promoLink.expiresAt && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 shrink-0" />
                          Expires:{" "}
                          {promoLink.expiresAtFormatted ||
                            formatDateReadable(new Date(promoLink.expiresAt))}
                        </div>
                      )}
                      <div>
                        {promoLink.usageCount} {promoLink.usageCount === 1 ? "use" : "uses"}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                            promoLink.campaignType === "cancelled-membership-comeback"
                              ? "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200"
                              : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200"
                          }`}
                        >
                          {promoLink.campaignType === "cancelled-membership-comeback" ? "Comeback" : "General"}
                        </span>
                        <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-neutral-800 dark:text-neutral-200">
                          {promoLink.eligibilityAudience === "cancelled-members"
                            ? "Cancelled Members"
                            : "All Users"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table layout */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700">
                  <thead className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:bg-neutral-800 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Bonus Entries
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Package Types
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Expiration
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Usage
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Campaign
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-neutral-700 dark:bg-neutral-900/80">
                    {promoLinks.map((promoLink) => (
                      <tr key={promoLink.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/60">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-semibold text-gray-900 dark:text-neutral-100">
                              {promoLink.code}
                            </span>
                            <button
                              onClick={() => handleCopyLink(promoLink.promoUrl, promoLink.id)}
                              className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 transition-colors"
                              title="Copy link"
                            >
                              {copiedId === promoLink.id ? (
                                <Check className="w-4 h-4 text-green-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Link2 className="w-4 h-4 text-red-600" />
                            <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
                              {promoLink.bonusEntries}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-neutral-400">entries</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {promoLink.appliesToMembership && (
                              <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
                                Membership
                              </span>
                            )}
                            {promoLink.appliesToOneTime && (
                              <span className="inline-flex items-center rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-950/50 dark:text-purple-200">
                                One-Time
                              </span>
                            )}
                            {!promoLink.appliesToMembership && !promoLink.appliesToOneTime && (
                              <span className="text-xs italic text-gray-400 dark:text-neutral-500">None selected</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900 dark:text-neutral-100">
                            {promoLink.expiresAt ? (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 shrink-0 text-gray-400 dark:text-neutral-500" />
                                <span>
                                  {promoLink.expiresAtFormatted || formatDateReadable(new Date(promoLink.expiresAt))}
                                </span>
                              </div>
                            ) : (
                              <span className="italic text-gray-400 dark:text-neutral-500">No expiration</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-neutral-100">
                            <span className="font-medium">{promoLink.usageCount}</span>
                            <span className="ml-1 text-gray-500 dark:text-neutral-400">
                              {promoLink.usageCount === 1 ? "use" : "uses"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                promoLink.campaignType === "cancelled-membership-comeback"
                                  ? "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200"
                                  : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200"
                              }`}
                            >
                              {promoLink.campaignType === "cancelled-membership-comeback" ? "Comeback" : "General"}
                            </span>
                            <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-neutral-800 dark:text-neutral-200">
                              {promoLink.eligibilityAudience === "cancelled-members"
                                ? "Cancelled Members"
                                : "All Users"}
                            </span>
                            {promoLink.eligibilityRules?.cancelledWithinDays ? (
                              <span className="text-xs text-gray-500 dark:text-neutral-400">
                                {promoLink.eligibilityRules.cancelledWithinDays}d window
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{getStatusBadge(promoLink)}</td>
                        <td className="px-4 py-3">
                          <div className="max-w-xs truncate text-sm text-gray-500 dark:text-neutral-400">
                            {promoLink.description || (
                              <span className="italic text-gray-400 dark:text-neutral-500">No description</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(promoLink)}
                              className="rounded p-1.5 text-blue-600 transition-colors hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                              title="Edit promo link"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(promoLink.id)}
                              disabled={deletingId === promoLink.id}
                              className="rounded p-1.5 text-red-600 transition-colors hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Delete promo link"
                            >
                              {deletingId === promoLink.id ? (
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
      <AdminPromoLinkModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={handleSuccess}
        editingPromoLink={editingPromoLink}
      />
    </>
  );
}

