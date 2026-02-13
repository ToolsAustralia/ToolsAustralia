"use client";

import React, { useState, useEffect } from "react";
import { X, Copy, Check, Edit2, Trash2, Save, AlertTriangle } from "lucide-react";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";
import ClickableUserDisplay from "./ClickableUserDisplay";

interface AffiliateDetail {
  affiliate: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    username: string;
    affiliateCode: string;
    affiliateLink: string;
    isActive: boolean;
    commissionRate?: number;
    totalSignups: number;
    totalSales: number;
    totalCommissions: number;
    bankDetails?: {
      accountName?: string;
      bsb?: string;
      accountNumber?: string;
      bankName?: string;
    };
    createdAt: string;
    updatedAt: string;
  };
  referredUsers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    referredAt: string;
  }>;
  commissions: Array<{
    id: string;
    type: string;
    packageName: string;
    purchaseAmount: number;
    commissionAmount: number;
    status: string;
    earnedAt: string;
    paidAt?: string;
    referredUser: {
      id: string;
      name: string;
      email: string;
    } | null;
  }>;
  payouts: Array<{
    id: string;
    totalAmount: number;
    commissionCount: number;
    paidAt: string;
    processedBy: {
      name: string;
      email: string;
    } | null;
    notes?: string;
  }>;
}

interface AffiliateDetailModalProps {
  affiliateId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function AffiliateDetailModal({
  affiliateId,
  isOpen,
  onClose,
  onUpdate,
}: AffiliateDetailModalProps) {
  const { openUserModal } = useAdminUserModal();
  const [data, setData] = useState<AffiliateDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingPayout, setIsProcessingPayout] = useState(false);
  const [payoutNotes, setPayoutNotes] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    username: "",
    password: "",
    isActive: true,
    commissionRate: "30", // Default 30% as percentage string for display
  });

  useEffect(() => {
    if (isOpen && affiliateId) {
      fetchAffiliateDetails();
      setIsEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, affiliateId]);

  // Initialize edit form when data loads
  useEffect(() => {
    if (data?.affiliate) {
      const commissionRate = data.affiliate.commissionRate ?? 0.3; // Default to 30% if not set
      setEditForm({
        name: data.affiliate.name,
        email: data.affiliate.email,
        phone: data.affiliate.phone || "",
        username: data.affiliate.username,
        password: "", // Don't pre-fill password
        isActive: data.affiliate.isActive,
        commissionRate: (commissionRate * 100).toString(), // Convert to percentage string
      });
    }
  }, [data]);

  const fetchAffiliateDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/affiliate/${affiliateId}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || "Failed to load affiliate details");
      }
    } catch (err) {
      setError("Failed to load affiliate details");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessPayout = async () => {
    if (!confirm("Are you sure you want to process this payout? This will mark all pending commissions as paid.")) {
      return;
    }

    setIsProcessingPayout(true);
    try {
      const response = await fetch(`/api/admin/affiliate/${affiliateId}/process-payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: payoutNotes || undefined }),
      });
      const result = await response.json();
      if (result.success) {
        alert(`Payout processed successfully! ${result.data.payout.commissionCount} commissions marked as paid.`);
        setPayoutNotes("");
        fetchAffiliateDetails();
        onUpdate();
      } else {
        alert(result.error || "Failed to process payout");
      }
    } catch (err) {
      alert("Failed to process payout");
      console.error(err);
    } finally {
      setIsProcessingPayout(false);
    }
  };

  const copyLink = () => {
    if (data?.affiliate.affiliateLink) {
      navigator.clipboard.writeText(data.affiliate.affiliateLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    setError(null);
    try {
      // Convert percentage to decimal (30% -> 0.3)
      const commissionRateDecimal = parseFloat(editForm.commissionRate) / 100;
      
      // Validate commission rate
      if (isNaN(commissionRateDecimal) || commissionRateDecimal < 0 || commissionRateDecimal > 1) {
        setError("Commission rate must be between 0 and 100%");
        setIsSaving(false);
        return;
      }

      const response = await fetch(`/api/admin/affiliate/${affiliateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone || undefined,
          username: editForm.username,
          password: editForm.password || undefined, // Only send if provided
          isActive: editForm.isActive,
          commissionRate: commissionRateDecimal,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setIsEditing(false);
        setEditForm({ ...editForm, password: "" }); // Clear password field
        fetchAffiliateDetails();
        onUpdate();
      } else {
        setError(result.error || "Failed to update affiliate");
      }
    } catch (err) {
      setError("Failed to update affiliate");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (data?.affiliate) {
      const commissionRate = data.affiliate.commissionRate ?? 0.3; // Default to 30% if not set
      setEditForm({
        name: data.affiliate.name,
        email: data.affiliate.email,
        phone: data.affiliate.phone || "",
        username: data.affiliate.username,
        password: "",
        isActive: data.affiliate.isActive,
        commissionRate: (commissionRate * 100).toString(), // Convert to percentage string
      });
    }
    setIsEditing(false);
    setError(null);
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this affiliate? This action cannot be undone. Commissions and payouts will be preserved for historical records.")) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/affiliate/${affiliateId}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (result.success) {
        alert("Affiliate deleted successfully");
        onClose();
        onUpdate();
      } else {
        setError(result.error || "Failed to delete affiliate");
      }
    } catch (err) {
      setError("Failed to delete affiliate");
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const unpaidCommissions = data?.commissions.filter((c) => c.status === "pending") || [];
  const unpaidAmount = unpaidCommissions.reduce((sum, c) => sum + c.commissionAmount, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-2xl font-bold text-gray-900">Affiliate Details</h2>
          <div className="flex items-center gap-2">
            {!isEditing && data && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 text-[#ee0000] border border-[#ee0000] rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </>
            )}
            {isEditing && (
              <>
                <button
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {data && (
            <>
              {/* Affiliate Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2 text-gray-900">Basic Information</h3>
                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input
                          type="tel"
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                        <input
                          type="text"
                          value={editForm.username}
                          onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input
                          type="password"
                          value={editForm.password}
                          onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                          placeholder="Leave blank to keep current password"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">Leave blank to keep current password</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Commission Rate (%) *</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editForm.commissionRate}
                          onChange={(e) => setEditForm({ ...editForm, commissionRate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
                          placeholder="30"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">Commission rate as percentage (0-100%)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="isActive"
                          checked={editForm.isActive}
                          onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                          className="w-4 h-4 text-[#ee0000] border-gray-300 rounded focus:ring-[#ee0000]"
                        />
                        <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                          Active Status
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="font-medium text-gray-700">Name:</span>{" "}
                        <span className="text-gray-900">{data.affiliate.name}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">Email:</span>{" "}
                        <span className="text-gray-900">{data.affiliate.email}</span>
                      </p>
                      {data.affiliate.phone && (
                        <p>
                          <span className="font-medium text-gray-700">Phone:</span>{" "}
                          <span className="text-gray-900">{data.affiliate.phone}</span>
                        </p>
                      )}
                      <p>
                        <span className="font-medium text-gray-700">Username:</span>{" "}
                        <span className="text-gray-900">{data.affiliate.username}</span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">Commission Rate:</span>{" "}
                        <span className="text-gray-900 font-semibold">
                          {((data.affiliate.commissionRate ?? 0.3) * 100).toFixed(1)}%
                        </span>
                      </p>
                      <p>
                        <span className="font-medium text-gray-700">Status:</span>{" "}
                        {data.affiliate.isActive ? (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">Inactive</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Affiliate Link</h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={data.affiliate.affiliateLink}
                      readOnly
                      className="flex-1 px-3 py-2 border rounded-lg bg-gray-50 text-sm"
                    />
                    <button
                      onClick={copyLink}
                      className="px-3 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-1"
                    >
                      {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Code: {data.affiliate.affiliateCode}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-600 mb-1">Total Signups</div>
                  <div className="text-2xl font-bold text-gray-900">{data.affiliate.totalSignups}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-600 mb-1">Total Sales</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(data.affiliate.totalSales)}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-600 mb-1">Unpaid Commissions</div>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(unpaidAmount)}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-600 mb-1">Pending Count</div>
                  <div className="text-2xl font-bold text-gray-900">{unpaidCommissions.length}</div>
                </div>
              </div>

              {/* Bank Details */}
              <div>
                <h3 className="font-semibold mb-3 text-gray-900">Bank Details</h3>
                {data.affiliate.bankDetails ? (
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2 text-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="font-medium text-gray-700">Account Name:</span>{" "}
                        <span className="text-gray-900">{data.affiliate.bankDetails.accountName || "Not provided"}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">BSB:</span>{" "}
                        <span className="text-gray-900">{data.affiliate.bankDetails.bsb || "Not provided"}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Account Number:</span>{" "}
                        <span className="text-gray-900">
                          {data.affiliate.bankDetails.accountNumber
                            ? "••••" + data.affiliate.bankDetails.accountNumber.slice(-4)
                            : "Not provided"}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Bank Name:</span>{" "}
                        <span className="text-gray-900">{data.affiliate.bankDetails.bankName || "Not provided"}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">
                      <strong>Note:</strong> BSB (Bank State Branch) is a 6-digit code used in Australia to identify banks and branches. It&apos;s typically required for Australian bank accounts but may not be needed for international accounts.
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-gray-600 text-sm">No bank details provided. The affiliate needs to add their bank details to receive payouts.</p>
                  </div>
                )}
              </div>

              {/* Process Payout */}
              {unpaidCommissions.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2 text-gray-900">Process Payout</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {unpaidCommissions.length} unpaid commissions totaling {formatCurrency(unpaidAmount)}
                  </p>
                  <div className="space-y-2">
                    <textarea
                      placeholder="Optional notes for this payout..."
                      value={payoutNotes}
                      onChange={(e) => setPayoutNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
                      rows={2}
                    />
                    <button
                      onClick={handleProcessPayout}
                      disabled={isProcessingPayout}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {isProcessingPayout ? "Processing..." : "Process Payout"}
                    </button>
                  </div>
                </div>
              )}

              {/* Referred Users */}
              <div>
                <h3 className="font-semibold mb-3 text-gray-900">
                  Referred Users ({data.referredUsers.length})
                  {data.referredUsers.length > 0 && (
                    <span className="ml-2 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {data.affiliate.totalSignups} total signups
                    </span>
                  )}
                </h3>
                {data.referredUsers.length === 0 ? (
                  <p className="text-gray-600 text-sm">No referred users yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Referred Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {data.referredUsers.map((user) => (
                          <tr
                            key={user.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openUserModal(user.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openUserModal(user.id);
                              }
                            }}
                            className="hover:bg-gray-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-inset"
                          >
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="font-medium text-gray-900">
                                {user.firstName} {user.lastName}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{user.email}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{user.phone || "N/A"}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(user.referredAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Commissions */}
              <div>
                <h3 className="font-semibold mb-3 text-gray-900">All Commissions ({data.commissions.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Purchase</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Commission</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {data.commissions.map((commission) => (
                        <tr key={commission.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            {commission.referredUser ? (
                              <ClickableUserDisplay
                                displayText={commission.referredUser.name || "N/A"}
                                subtext={commission.referredUser.email}
                                userId={commission.referredUser.id ?? null}
                                className="text-sm"
                              />
                            ) : (
                              <span className="text-gray-400">N/A</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(commission.earnedAt)}</td>
                          <td className="px-4 py-3 whitespace-nowrap capitalize text-gray-600">{commission.type.replace("-", " ")}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">{commission.packageName || "N/A"}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-gray-600">{formatCurrency(commission.purchaseAmount)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-green-600">
                            {formatCurrency(commission.commissionAmount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {commission.status === "paid" ? (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Paid</span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payout History */}
              {data.payouts.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 text-gray-900">Payout History</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commissions</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Processed By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {data.payouts.map((payout) => (
                          <tr key={payout.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(payout.paidAt)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-gray-900">
                              {formatCurrency(payout.totalAmount)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{payout.commissionCount} commissions</td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{payout.processedBy?.name || "N/A"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

