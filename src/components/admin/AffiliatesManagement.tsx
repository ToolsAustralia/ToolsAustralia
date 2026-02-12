"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Eye,
  DollarSign,
  Users,
  CheckCircle,
  XCircle,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import AffiliateDetailModal from "./AffiliateDetailModal";

interface Affiliate {
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
  unpaidCommissions: number;
  unpaidAmount: number;
  createdAt: string;
  updatedAt: string;
}

interface AffiliatesResponse {
  affiliates: Affiliate[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Main Affiliates Management component
 */
export default function AffiliatesManagement() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedAffiliateId, setSelectedAffiliateId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  // Fetch affiliates data
  const [affiliatesData, setAffiliatesData] = useState<AffiliatesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const affiliateList = affiliatesData?.affiliates ?? [];

  React.useEffect(() => {
    fetchAffiliates();
  }, [page, debouncedSearch]);

  const fetchAffiliates = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "25",
        ...(debouncedSearch && { search: debouncedSearch }),
      });
      const response = await fetch(`/api/admin/affiliate/list?${params}`);
      const data = await response.json();
      if (data.success) {
        setAffiliatesData(data.data);
      } else {
        setError(data.error || "Failed to load affiliates");
      }
    } catch (err) {
      setError("Failed to load affiliates");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAffiliateClick = (affiliate: Affiliate) => {
    setSelectedAffiliateId(affiliate.id);
    setIsDetailModalOpen(true);
  };

  const handleCreateAffiliate = async (formData: {
    name: string;
    email: string;
    phone?: string;
    username: string;
    password: string;
    commissionRate?: number;
  }) => {
    try {
      const response = await fetch("/api/admin/affiliate/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (data.success) {
        setIsCreateModalOpen(false);
        fetchAffiliates();
      } else {
        alert(data.error || "Failed to create affiliate");
      }
    } catch (err) {
      alert("Failed to create affiliate");
      console.error(err);
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliates Management</h1>
          <p className="text-gray-600 mt-1">Manage affiliate accounts and track commissions</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all"
        >
          <Plus className="w-4 h-4" />
          Create Affiliate
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search affiliates by name, email, code, or username..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
          />
        </div>
      </div>

      {/* Results Summary */}
      {affiliatesData && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <p>
            Showing {(affiliatesData.pagination.page - 1) * affiliatesData.pagination.limit + 1} to{" "}
            {Math.min(
              affiliatesData.pagination.page * affiliatesData.pagination.limit,
              affiliatesData.pagination.total
            )}{" "}
            of {affiliatesData.pagination.total} affiliates
          </p>
          <button
            onClick={() => fetchAffiliates()}
            className="text-[#ee0000] hover:text-[#cc0000] transition-colors flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      )}

      {/* Affiliates Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        {isLoading ? (
          // Loading skeleton
          <div className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4 animate-pulse">
                  <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-20"></div>
                  <div className="h-6 bg-gray-200 rounded w-16"></div>
                  <div className="h-8 bg-gray-200 rounded w-24"></div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          // Error state
          <div className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Affiliates</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => fetchAffiliates()}
              className="px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all"
            >
              Try Again
            </button>
          </div>
        ) : affiliatesData && affiliateList.length === 0 ? (
          // Empty state
          <div className="p-6 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Affiliates Found</h3>
            <p className="text-gray-600 mb-4">
              {search ? "Try adjusting your search criteria" : "Get started by creating your first affiliate account"}
            </p>
            {!search && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all"
              >
                Create Affiliate
              </button>
            )}
          </div>
        ) : (
          // Affiliates Table
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Affiliate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stats
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unpaid
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {affiliateList.map((affiliate) => (
                  <tr
                    key={affiliate.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleAffiliateClick(affiliate)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{affiliate.name}</div>
                        <div className="text-sm text-gray-500">{affiliate.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-mono text-gray-900">{affiliate.affiliateCode}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div>Signups: {affiliate.totalSignups}</div>
                        <div>Sales: {formatCurrency(affiliate.totalSales)}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-semibold text-green-600">{formatCurrency(affiliate.unpaidAmount)}</div>
                        <div className="text-gray-500">{affiliate.unpaidCommissions} commissions</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {affiliate.isActive ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleAffiliateClick(affiliate)}
                          className="text-[#ee0000] hover:text-[#cc0000] flex items-center gap-1 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                        <button
                          onClick={() => copyLink(affiliate.affiliateLink)}
                          className="text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors"
                          title="Copy affiliate link"
                        >
                          {copiedLink === affiliate.affiliateLink ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {affiliatesData && affiliatesData.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page {affiliatesData.pagination.page} of {affiliatesData.pagination.totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(affiliatesData.pagination.totalPages, p + 1))}
              disabled={page === affiliatesData.pagination.totalPages}
              className="flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create Affiliate Modal */}
      {isCreateModalOpen && (
        <CreateAffiliateModal onClose={() => setIsCreateModalOpen(false)} onSubmit={handleCreateAffiliate} />
      )}

      {/* Affiliate Detail Modal */}
      {isDetailModalOpen && selectedAffiliateId && (
        <AffiliateDetailModal
          affiliateId={selectedAffiliateId}
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedAffiliateId(null);
          }}
          onUpdate={fetchAffiliates}
        />
      )}
    </div>
  );
}

/**
 * Create Affiliate Modal Component
 */
function CreateAffiliateModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: { name: string; email: string; phone?: string; username: string; password: string; commissionRate?: number }) => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    username: "",
    password: "",
    commissionRate: "30", // Default 30% as percentage string for display
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    if (!formData.username.trim()) newErrors.username = "Username is required";
    if (formData.password.length < 6) newErrors.password = "Password must be at least 6 characters";
    
    // Validate commission rate (0-100%)
    const commissionRateNum = parseFloat(formData.commissionRate);
    if (isNaN(commissionRateNum) || commissionRateNum < 0 || commissionRateNum > 100) {
      newErrors.commissionRate = "Commission rate must be between 0 and 100%";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Convert percentage to decimal (30% -> 0.3)
    const commissionRateDecimal = commissionRateNum / 100;

    onSubmit({
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim() || undefined,
      username: formData.username.trim(),
      password: formData.password,
      commissionRate: commissionRateDecimal,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">Create Affiliate</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
              required
            />
            {errors.name && <p className="text-red-600 text-xs mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
              required
            />
            {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
              required
            />
            {errors.username && <p className="text-red-600 text-xs mt-1">{errors.username}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
              required
            />
            {errors.password && <p className="text-red-600 text-xs mt-1">{errors.password}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Commission Rate (%) *</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={formData.commissionRate}
              onChange={(e) => setFormData({ ...formData, commissionRate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
              placeholder="30"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Enter commission rate as percentage (0-100%). Default: 30%</p>
            {errors.commissionRate && <p className="text-red-600 text-xs mt-1">{errors.commissionRate}</p>}
          </div>
          <div className="flex gap-2 justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
