"use client";

import React, { useState } from "react";
import { usePromoLinks, useDeletePromoLink } from "@/hooks/queries/usePromoQueries";
import AdminPromoLinkModal from "@/components/modals/AdminPromoLinkModal";
import type { PromoLink } from "@/types/admin";
import { Link2, Edit2, Trash2, Calendar, Loader2, RefreshCw, Copy, Check } from "lucide-react";
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
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          Inactive
        </span>
      );
    } else if (promoLink.isExpired) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Expired
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Active
        </span>
      );
    }
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
        <div className="p-3 sm:p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-red-600" />
              Promo Links
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

        <div className="p-3 sm:p-6">
          {promoLinks.length === 0 ? (
            <div className="text-center py-8">
              <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No promo links found</p>
              <p className="text-sm text-gray-400 mt-1">Create a new promo link to share with users</p>
            </div>
          ) : (
            <>
              {/* Mobile: Card layout */}
              <div className="sm:hidden space-y-3">
                {promoLinks.map((promoLink) => (
                  <div
                    key={promoLink.id}
                    className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50/50"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-mono font-semibold text-gray-900 truncate">
                          {promoLink.code}
                        </span>
                        <button
                          onClick={() => handleCopyLink(promoLink.promoUrl, promoLink.id)}
                          className="text-gray-400 hover:text-gray-600 shrink-0"
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
                          className="text-blue-600 hover:text-blue-900 p-1.5 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(promoLink.id)}
                          disabled={deletingId === promoLink.id}
                          className="text-red-600 hover:text-red-900 p-1.5 rounded disabled:opacity-50"
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
                    <div className="text-xs text-gray-600 space-y-0.5">
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
                              ? "bg-orange-100 text-orange-800"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {promoLink.campaignType === "cancelled-membership-comeback" ? "Comeback" : "General"}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
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
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Bonus Entries
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Package Types
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Expiration
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Usage
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Campaign
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {promoLinks.map((promoLink) => (
                      <tr key={promoLink.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-semibold text-gray-900">{promoLink.code}</span>
                            <button
                              onClick={() => handleCopyLink(promoLink.promoUrl, promoLink.id)}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
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
                            <span className="text-sm font-semibold text-gray-900">{promoLink.bonusEntries}</span>
                            <span className="text-xs text-gray-500">entries</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {promoLink.appliesToMembership && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                Membership
                              </span>
                            )}
                            {promoLink.appliesToOneTime && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                One-Time
                              </span>
                            )}
                            {!promoLink.appliesToMembership && !promoLink.appliesToOneTime && (
                              <span className="text-xs text-gray-400 italic">None selected</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">
                            {promoLink.expiresAt ? (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-gray-400 shrink-0" />
                                <span>
                                  {promoLink.expiresAtFormatted || formatDateReadable(new Date(promoLink.expiresAt))}
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-400 italic">No expiration</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            <span className="font-medium">{promoLink.usageCount}</span>
                            <span className="text-gray-500 ml-1">{promoLink.usageCount === 1 ? "use" : "uses"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                promoLink.campaignType === "cancelled-membership-comeback"
                                  ? "bg-orange-100 text-orange-800"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {promoLink.campaignType === "cancelled-membership-comeback" ? "Comeback" : "General"}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                              {promoLink.eligibilityAudience === "cancelled-members"
                                ? "Cancelled Members"
                                : "All Users"}
                            </span>
                            {promoLink.eligibilityRules?.cancelledWithinDays ? (
                              <span className="text-xs text-gray-500">
                                {promoLink.eligibilityRules.cancelledWithinDays}d window
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{getStatusBadge(promoLink)}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-500 max-w-xs truncate">
                            {promoLink.description || <span className="text-gray-400 italic">No description</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(promoLink)}
                              className="text-blue-600 hover:text-blue-900 p-1.5 rounded transition-colors"
                              title="Edit promo link"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(promoLink.id)}
                              disabled={deletingId === promoLink.id}
                              className="text-red-600 hover:text-red-900 p-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

