"use client";

import React, { useState, useEffect } from "react";
import { X, DollarSign, CheckCircle, XCircle, Copy, Check, Edit2, Trash2, Save, AlertTriangle } from "lucide-react";

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
  });

  useEffect(() => {
    if (isOpen && affiliateId) {
      fetchAffiliateDetails();
      setIsEditing(false);
    }
  }, [isOpen, affiliateId]);

  // Initialize edit form when data loads
  useEffect(() => {
    if (data?.affiliate) {
      setEditForm({
        name: data.affiliate.name,
        email: data.affiliate.email,
        phone: data.affiliate.phone || "",
        username: data.affiliate.username,
        password: "", // Don't pre-fill password
        isActive: data.affiliate.isActive,
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
      setEditForm({
        name: data.affiliate.name,
        email: data.affiliate.email,
        phone: data.affiliate.phone || "",
        username: data.affiliate.username,
        password: "",
        isActive: data.affiliate.isActive,
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

              {/* Commissions */}
              <div>
                <h3 className="font-semibold mb-3">All Commissions ({data.commissions.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Type</th>
                        <th className="px-4 py-2 text-left">Package</th>
                        <th className="px-4 py-2 text-right">Purchase</th>
                        <th className="px-4 py-2 text-right">Commission</th>
                        <th className="px-4 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.commissions.map((commission) => (
                        <tr key={commission.id}>
                          <td className="px-4 py-2">{formatDate(commission.earnedAt)}</td>
                          <td className="px-4 py-2 capitalize">{commission.type.replace("-", " ")}</td>
                          <td className="px-4 py-2">{commission.packageName || "N/A"}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(commission.purchaseAmount)}</td>
                          <td className="px-4 py-2 text-right font-semibold text-green-600">
                            {formatCurrency(commission.commissionAmount)}
                          </td>
                          <td className="px-4 py-2">
                            {commission.status === "paid" ? (
                              <span className="text-green-600">Paid</span>
                            ) : (
                              <span className="text-yellow-600">Pending</span>
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
                  <h3 className="font-semibold mb-3">Payout History</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                          <th className="px-4 py-2 text-left">Commissions</th>
                          <th className="px-4 py-2 text-left">Processed By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.payouts.map((payout) => (
                          <tr key={payout.id}>
                            <td className="px-4 py-2">{formatDate(payout.paidAt)}</td>
                            <td className="px-4 py-2 text-right font-semibold">
                              {formatCurrency(payout.totalAmount)}
                            </td>
                            <td className="px-4 py-2">{payout.commissionCount}</td>
                            <td className="px-4 py-2">{payout.processedBy?.name || "N/A"}</td>
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

