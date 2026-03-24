"use client";

import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import {
  Copy,
  Check,
  Edit2,
  Trash2,
  Save,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Users,
  Receipt,
  Wallet,
  Info,
  Loader2,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";
import ClickableUserDisplay from "./ClickableUserDisplay";
import { formatDisplayName } from "@/utils/display-name";
import ModalContainer from "@/components/modals/ui/ModalContainer";
import ModalContent from "@/components/modals/ui/ModalContent";
import Button from "@/components/modals/ui/Button";
import Input from "@/components/modals/ui/Input";
import Textarea from "@/components/modals/ui/Textarea";
import Checkbox from "@/components/modals/ui/Checkbox";

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
  commissionsPagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    sort: string;
    order: string;
    q?: string;
  };
  pendingCommissionsSummary?: {
    count: number;
    totalAmount: number;
  };
  referredUsersPagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

type AffiliateDetailTab = "overview" | "referred" | "commissions" | "payouts";

type CommissionSortField =
  | "earnedAt"
  | "commissionAmount"
  | "user"
  | "type"
  | "purchaseAmount"
  | "packageName"
  | "status";

type ReferredSortField = "name" | "email" | "phone" | "referredAt";

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

  const [commissionPage, setCommissionPage] = useState(1);
  const [commissionSort, setCommissionSort] = useState<CommissionSortField>("earnedAt");
  const [commissionOrder, setCommissionOrder] = useState<"asc" | "desc">("desc");
  const [commissionSearchInput, setCommissionSearchInput] = useState("");
  const [commissionSearch, setCommissionSearch] = useState("");
  const [referredPage, setReferredPage] = useState(1);
  const [referredSort, setReferredSort] = useState<ReferredSortField>("referredAt");
  const [referredOrder, setReferredOrder] = useState<"asc" | "desc">("desc");
  const [activeTab, setActiveTab] = useState<AffiliateDetailTab>("overview");

  const fetchAffiliateDetails = useCallback(
    async (
      page: number,
      sort: CommissionSortField,
      order: "asc" | "desc",
      q: string,
      referredPageNum: number,
      refSort: ReferredSortField,
      refOrder: "asc" | "desc"
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "20",
          sort,
          order,
          referredPage: String(referredPageNum),
          referredPageSize: "10",
          referredSort: refSort,
          referredOrder: refOrder,
        });
        if (q) params.set("q", q);
        const response = await fetch(`/api/admin/affiliate/${affiliateId}?${params.toString()}`);
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
    },
    [affiliateId]
  );

  useLayoutEffect(() => {
    if (!isOpen || !affiliateId) return;
    setCommissionPage(1);
    setCommissionSort("earnedAt");
    setCommissionOrder("desc");
    setCommissionSearchInput("");
    setCommissionSearch("");
    setReferredPage(1);
    setReferredSort("referredAt");
    setReferredOrder("desc");
    setActiveTab("overview");
    setIsEditing(false);
  }, [isOpen, affiliateId]);

  useEffect(() => {
    if (!isOpen) return;
    const hasPayouts = (data?.payouts.length ?? 0) > 0;
    if (!hasPayouts && activeTab === "payouts") setActiveTab("overview");
  }, [isOpen, data?.payouts.length, activeTab]);

  useEffect(() => {
    if (!isOpen || !affiliateId) return;
    const t = window.setTimeout(() => setCommissionSearch(commissionSearchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [commissionSearchInput, isOpen, affiliateId]);

  useEffect(() => {
    if (!isOpen || !affiliateId) return;
    fetchAffiliateDetails(
      commissionPage,
      commissionSort,
      commissionOrder,
      commissionSearch,
      referredPage,
      referredSort,
      referredOrder
    );
  }, [
    isOpen,
    affiliateId,
    commissionPage,
    commissionSort,
    commissionOrder,
    commissionSearch,
    referredPage,
    referredSort,
    referredOrder,
    fetchAffiliateDetails,
  ]);

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
        fetchAffiliateDetails(
          commissionPage,
          commissionSort,
          commissionOrder,
          commissionSearch,
          referredPage,
          referredSort,
          referredOrder
        );
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
        fetchAffiliateDetails(
          commissionPage,
          commissionSort,
          commissionOrder,
          commissionSearch,
          referredPage,
          referredSort,
          referredOrder
        );
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

  const formatCommissionTypeLabel = (t: string) => t.replace(/-/g, " ");

  const pendingCount = data?.pendingCommissionsSummary?.count ?? 0;
  const unpaidAmount = data?.pendingCommissionsSummary?.totalAmount ?? 0;
  const commPagination = data?.commissionsPagination;
  const commissionTotal = commPagination?.total ?? data?.commissions.length ?? 0;
  const commissionTotalPages = commPagination?.totalPages ?? 1;

  const referredPag = data?.referredUsersPagination;
  const referredTotalCount = referredPag?.total ?? 0;
  const referredTotalPagesRaw = referredPag?.totalPages ?? 0;

  const isInitialLoad = isLoading && !data;
  const showPayoutsTab = (data?.payouts.length ?? 0) > 0;

  const handleCommissionHeaderClick = (field: CommissionSortField) => {
    setCommissionPage(1);
    if (commissionSort === field) {
      setCommissionOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setCommissionSort(field);
      setCommissionOrder(
        field === "user" || field === "type" || field === "packageName" ? "asc" : "desc"
      );
    }
  };

  const handleReferredHeaderClick = (field: ReferredSortField) => {
    setReferredPage(1);
    if (referredSort === field) {
      setReferredOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setReferredSort(field);
      setReferredOrder(field === "referredAt" ? "desc" : "asc");
    }
  };

  const commissionRowsForTable = useMemo(() => {
    const list = data?.commissions ?? [];
    if (commissionSort !== "type" || list.length === 0) {
      return list.map((c) => ({ kind: "row" as const, commission: c }));
    }
    type RowItem =
      | { kind: "group"; typeKey: string; label: string }
      | { kind: "row"; commission: (typeof list)[0] };
    const out: RowItem[] = [];
    let prev = "";
    for (const c of list) {
      if (c.type !== prev) {
        prev = c.type;
        out.push({
          kind: "group",
          typeKey: c.type,
          label: c.type.replace(/-/g, " "),
        });
      }
      out.push({ kind: "row", commission: c });
    }
    return out;
  }, [data?.commissions, commissionSort]);

  const SortHeaderIcon = ({ field }: { field: CommissionSortField }) => {
    const active = commissionSort === field;
    if (!active) {
      return <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />;
    }
    return commissionOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 shrink-0 text-[#ee0000]" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 shrink-0 text-[#ee0000]" aria-hidden />
    );
  };

  const ReferredSortHeaderIcon = ({ field }: { field: ReferredSortField }) => {
    const active = referredSort === field;
    if (!active) {
      return <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />;
    }
    return referredOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 shrink-0 text-[#ee0000]" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 shrink-0 text-[#ee0000]" aria-hidden />
    );
  };

  if (!isOpen) return null;
  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" fixedHeight="h-[90dvh]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="relative flex-shrink-0 border-b border-gray-200 bg-white px-3 sm:px-5 py-3 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-2.5 right-2 sm:top-3 sm:right-3 z-10 rounded-lg p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          <div className="pr-12 sm:pr-14">
            <div className="min-w-0 flex-1">
              <h2 id="modal-title" className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                Affiliate Details
              </h2>
              {data?.affiliate && (
                <p className="text-xs sm:text-sm text-gray-500 truncate mt-0.5">{data.affiliate.email}</p>
              )}
            </div>
          </div>
        </div>

        {data && (
          <div className="flex-shrink-0 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-white">
            <nav
              className="flex gap-1 sm:gap-2 px-2 sm:px-4 overflow-x-auto scroll-smooth"
              aria-label="Affiliate detail sections"
            >
              {(
                [
                  { id: "overview" as const, label: "Overview", icon: Info },
                  { id: "referred" as const, label: "Referred users", icon: Users },
                  { id: "commissions" as const, label: "Commissions", icon: Receipt },
                  ...(showPayoutsTab
                    ? [{ id: "payouts" as const, label: "Payouts", icon: Wallet }]
                    : []),
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 sm:gap-2 py-3 sm:py-3 px-3 sm:px-4 border-b-2 font-semibold text-xs sm:text-sm transition-all whitespace-nowrap min-h-[48px] shrink-0 ${
                      isActive
                        ? "border-[#ee0000] text-[#ee0000] bg-red-50/30"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50/50"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        <ModalContent padding="md" className="relative flex-1 min-h-0">
          {isInitialLoad && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-9 h-9 animate-spin text-red-600" />
            </div>
          )}

          {!isInitialLoad && error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {data && (
            <div className={`space-y-6 ${isLoading && !isInitialLoad ? "opacity-60" : ""}`}>
              {activeTab === "overview" && (
                <div className="space-y-5 sm:space-y-6">
                  <section className="min-w-0" aria-labelledby="affiliate-basic-heading">
                      <h3
                        id="affiliate-basic-heading"
                        className="font-semibold mb-2 sm:mb-3 text-gray-900 text-sm sm:text-base tracking-tight"
                      >
                        Basic information
                      </h3>
                      {isEditing ? (
                        <div className="grid grid-cols-2 gap-2 sm:gap-4">
                          <Input
                            label="Name"
                            required
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            size="lg"
                          />
                          <Input
                            label="Email"
                            type="email"
                            required
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            size="lg"
                          />
                          <Input
                            label="Phone"
                            type="tel"
                            value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            size="lg"
                          />
                          <Input
                            label="Username"
                            required
                            value={editForm.username}
                            onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                            size="lg"
                          />
                          <div className="col-span-2">
                            <Input
                              label="Password"
                              type="password"
                              value={editForm.password}
                              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                              placeholder="Leave blank to keep current password"
                              size="lg"
                            />
                            <p className="text-xs text-gray-500 mt-1">Leave blank to keep current password</p>
                          </div>
                          <div className="col-span-2 grid grid-cols-2 gap-2 sm:gap-4 items-end">
                            <div>
                              <Input
                                label="Commission Rate (%)"
                                type="number"
                                required
                                min={0}
                                max={100}
                                step={0.1}
                                value={editForm.commissionRate}
                                onChange={(e) => setEditForm({ ...editForm, commissionRate: e.target.value })}
                                placeholder="30"
                                size="lg"
                              />
                              <p className="text-xs text-gray-500 mt-1">Commission rate as percentage (0–100%)</p>
                            </div>
                            <div className="pb-1">
                              <Checkbox
                                id="affiliate-active"
                                checked={editForm.isActive}
                                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                                label="Active status"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden ring-1 ring-gray-100/70">
                          <dl className="grid grid-cols-2 xl:grid-cols-4 divide-x divide-y divide-gray-100 [&>*]:min-h-0">
                            <div className="p-2 sm:p-3.5 xl:p-4 bg-white min-w-0">
                              <dt className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Name
                              </dt>
                              <dd className="mt-1 text-sm text-gray-900 font-medium break-words leading-snug">
                                {data.affiliate.name}
                              </dd>
                            </div>
                            <div className="p-2 sm:p-3.5 xl:p-4 bg-white min-w-0">
                              <dt className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Email
                              </dt>
                              <dd className="mt-1 text-sm min-w-0">
                                <a
                                  href={`mailto:${data.affiliate.email}`}
                                  className="text-[#ee0000] hover:underline font-medium break-all leading-snug"
                                >
                                  {data.affiliate.email}
                                </a>
                              </dd>
                            </div>
                            <div className="p-2 sm:p-3.5 xl:p-4 bg-white min-w-0">
                              <dt className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Phone
                              </dt>
                              <dd className="mt-1 text-sm text-gray-900 leading-snug">
                                {data.affiliate.phone ? (
                                  <a href={`tel:${data.affiliate.phone}`} className="hover:text-[#ee0000] font-medium">
                                    {data.affiliate.phone}
                                  </a>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </dd>
                            </div>
                            <div className="p-2 sm:p-3.5 xl:p-4 bg-white min-w-0">
                              <dt className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                Username
                              </dt>
                              <dd className="mt-1 text-sm font-mono text-[12px] sm:text-[13px] text-gray-900 break-all leading-snug">
                                {data.affiliate.username}
                              </dd>
                            </div>
                            <div className="p-2 sm:p-3.5 xl:p-4 col-span-2 xl:col-span-4 bg-gradient-to-br from-red-50/90 via-white to-white min-w-0 flex flex-row items-center justify-between gap-2 sm:gap-4">
                              <div>
                                <dt className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                                  Commission rate
                                </dt>
                                <dd className="mt-0.5 text-xl sm:text-2xl font-bold text-gray-900 tabular-nums tracking-tight">
                                  {((data.affiliate.commissionRate ?? 0.3) * 100).toFixed(1)}%
                                </dd>
                              </div>
                              <div className="hidden sm:block h-10 w-px bg-red-200/60 shrink-0" aria-hidden />
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                  Status
                                </span>
                                {data.affiliate.isActive ? (
                                  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/60">
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-800 ring-1 ring-red-200/60">
                                    Inactive
                                  </span>
                                )}
                              </div>
                            </div>
                          </dl>
                        </div>
                      )}
                  </section>

                  <section
                    className="min-w-0 pt-5 sm:pt-6 border-t border-gray-200"
                    aria-labelledby="affiliate-link-heading"
                  >
                    <h3
                      id="affiliate-link-heading"
                      className="font-semibold mb-2 sm:mb-3 text-gray-900 text-sm sm:text-base tracking-tight"
                    >
                      Affiliate link
                    </h3>
                    {isEditing ? (
                      <p className="text-xs text-gray-500 mb-2">
                        Save your edits before copying the link, or copy from the preview below.
                      </p>
                    ) : null}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-2.5 sm:p-4 ring-1 ring-gray-100/70">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
                        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                          <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Shareable URL
                          </p>
                          <div
                            className="min-h-[2.75rem] sm:min-h-[3rem] flex-1 rounded-lg border border-gray-200 bg-slate-50 px-2 py-2 sm:px-3 sm:py-2.5 flex items-center"
                            title={data.affiliate.affiliateLink}
                          >
                            <span className="font-mono text-[10px] sm:text-xs md:text-sm text-gray-800 select-all break-all leading-relaxed">
                              {data.affiliate.affiliateLink}
                            </span>
                          </div>
                        </div>
                        <div className="flex sm:flex-col sm:justify-end shrink-0">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={copyLink}
                            icon={copiedLink ? Check : Copy}
                            className="min-h-[44px] sm:min-h-[40px] w-full sm:w-auto sm:min-w-[7.5rem]"
                          >
                            {copiedLink ? "Copied" : "Copy link"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">Total Signups</div>
                      <div className="text-lg sm:text-2xl font-bold text-gray-900">{data.affiliate.totalSignups}</div>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">Total Sales</div>
                      <div className="text-lg sm:text-2xl font-bold text-gray-900">
                        {formatCurrency(data.affiliate.totalSales)}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">Unpaid Commissions</div>
                      <div className="text-lg sm:text-2xl font-bold text-green-600">{formatCurrency(unpaidAmount)}</div>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">Pending Count</div>
                      <div className="text-lg sm:text-2xl font-bold text-gray-900">{pendingCount}</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2 sm:mb-3 text-gray-900 text-sm sm:text-base">Bank Details</h3>
                    {data.affiliate.bankDetails ? (
                      <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200 space-y-2 text-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
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
                          <strong>Note:</strong> BSB (Bank State Branch) is a 6-digit code used in Australia to identify
                          banks and branches. It&apos;s typically required for Australian bank accounts but may not be
                          needed for international accounts.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-gray-600 text-sm">
                          No bank details provided. The affiliate needs to add their bank details to receive payouts.
                        </p>
                      </div>
                    )}
                  </div>

                  {pendingCount > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 p-3 sm:p-4 rounded-lg">
                      <h3 className="font-semibold mb-2 text-gray-900 text-sm sm:text-base">Process Payout</h3>
                      <p className="text-sm text-gray-600 mb-3">
                        {pendingCount} unpaid commissions totaling {formatCurrency(unpaidAmount)}
                      </p>
                      <div className="space-y-3">
                        <Textarea
                          placeholder="Optional notes for this payout..."
                          value={payoutNotes}
                          onChange={(e) => setPayoutNotes(e.target.value)}
                          rows={2}
                        />
                        <Button
                          type="button"
                          onClick={handleProcessPayout}
                          disabled={isProcessingPayout}
                          loading={isProcessingPayout}
                          variant="secondary"
                          size="sm"
                          className="!bg-emerald-600 !text-white border-emerald-600 hover:!bg-emerald-700 min-h-[44px] sm:min-h-[40px]"
                          fullWidth
                        >
                          Process Payout
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "referred" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">
                      Referred users
                      {referredTotalCount > 0 && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 align-middle">
                          {referredTotalCount} total
                        </span>
                      )}
                    </h3>
                    <span className="text-xs text-gray-500">
                      {data.affiliate.totalSignups} signups (affiliate record)
                    </span>
                  </div>
                  {data.referredUsers.length === 0 ? (
                    <p className="text-gray-600 text-sm">No referred users yet.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-lg border border-gray-200 -mx-1 sm:mx-0 touch-pan-x">
                        <table className="w-full min-w-[520px] text-[10px] sm:text-sm">
                          <thead className="border-b-2 border-gray-200 bg-gray-50">
                            <tr>
                              <th className="p-0 text-left font-medium uppercase tracking-wider text-gray-500">
                                <button
                                  type="button"
                                  onClick={() => handleReferredHeaderClick("name")}
                                  className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-4 sm:py-3 hover:bg-gray-100/90 transition-colors"
                                >
                                  Name
                                  <ReferredSortHeaderIcon field="name" />
                                </button>
                              </th>
                              <th className="p-0 text-left font-medium uppercase tracking-wider text-gray-500">
                                <button
                                  type="button"
                                  onClick={() => handleReferredHeaderClick("email")}
                                  className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-4 sm:py-3 hover:bg-gray-100/90 transition-colors"
                                >
                                  Email
                                  <ReferredSortHeaderIcon field="email" />
                                </button>
                              </th>
                              <th className="p-0 text-left font-medium uppercase tracking-wider text-gray-500">
                                <button
                                  type="button"
                                  onClick={() => handleReferredHeaderClick("phone")}
                                  className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-4 sm:py-3 hover:bg-gray-100/90 transition-colors"
                                >
                                  Phone
                                  <ReferredSortHeaderIcon field="phone" />
                                </button>
                              </th>
                              <th className="p-0 text-left font-medium uppercase tracking-wider text-gray-500">
                                <button
                                  type="button"
                                  onClick={() => handleReferredHeaderClick("referredAt")}
                                  className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-4 sm:py-3 hover:bg-gray-100/90 transition-colors"
                                >
                                  Referred
                                  <ReferredSortHeaderIcon field="referredAt" />
                                </button>
                              </th>
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
                                <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                                  <div className="font-medium text-gray-900">
                                    {formatDisplayName(user.firstName, user.lastName)}
                                  </div>
                                </td>
                                <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-gray-600">{user.email}</td>
                                <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-gray-600">
                                  {user.phone || "N/A"}
                                </td>
                                <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-gray-600">
                                  {formatDate(user.referredAt)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {referredTotalCount > 0 && referredTotalPagesRaw > 0 && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-gray-100">
                          <p className="text-xs text-gray-500 text-center sm:text-left">
                            Page {referredPag?.page ?? referredPage} of {referredTotalPagesRaw} · {referredTotalCount}{" "}
                            total
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={referredPage <= 1 || isLoading}
                              onClick={() => setReferredPage((p) => Math.max(1, p - 1))}
                              icon={ChevronLeft}
                              iconPosition="left"
                              className="min-h-[44px] sm:min-h-[40px]"
                            >
                              Prev
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={referredPage >= referredTotalPagesRaw || isLoading}
                              onClick={() => setReferredPage((p) => p + 1)}
                              icon={ChevronRight}
                              iconPosition="right"
                              className="min-h-[44px] sm:min-h-[40px]"
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === "commissions" && (
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">
                      All commissions ({commissionTotal})
                    </h3>
                    <div className="w-full sm:max-w-xs">
                      <Input
                        label="Search referred user"
                        value={commissionSearchInput}
                        onChange={(e) => {
                          setCommissionSearchInput(e.target.value);
                          setCommissionPage(1);
                        }}
                        placeholder="Email or name"
                        size="md"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-500">
                    Sort by clicking column headers. Sorting by Type groups rows by commission type on this page.
                  </p>

                  <div className="overflow-x-auto rounded-lg border border-gray-200 touch-pan-x">
                    <table className="w-full min-w-[640px] text-[10px] sm:text-xs lg:text-sm">
                      <thead className="sticky top-0 z-[1] border-b-2 border-gray-200 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                        <tr>
                          <th className="p-0 text-left font-medium text-gray-500 uppercase tracking-wider">
                            <button
                              type="button"
                              onClick={() => handleCommissionHeaderClick("user")}
                              className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-4 sm:py-3 hover:bg-gray-100/90 transition-colors"
                            >
                              User
                              <SortHeaderIcon field="user" />
                            </button>
                          </th>
                          <th className="p-0 text-left font-medium text-gray-500 uppercase tracking-wider">
                            <button
                              type="button"
                              onClick={() => handleCommissionHeaderClick("earnedAt")}
                              className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-4 sm:py-3 hover:bg-gray-100/90 transition-colors"
                            >
                              Date
                              <SortHeaderIcon field="earnedAt" />
                            </button>
                          </th>
                          <th className="p-0 text-left font-medium text-gray-500 uppercase tracking-wider">
                            <button
                              type="button"
                              onClick={() => handleCommissionHeaderClick("type")}
                              className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-4 sm:py-3 hover:bg-gray-100/90 transition-colors"
                              title="Sort by type; groups rows by type"
                            >
                              Type
                              <SortHeaderIcon field="type" />
                            </button>
                          </th>
                          <th className="p-0 text-left font-medium text-gray-500 uppercase tracking-wider">
                            <button
                              type="button"
                              onClick={() => handleCommissionHeaderClick("packageName")}
                              className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-4 sm:py-3 hover:bg-gray-100/90 transition-colors"
                            >
                              Package
                              <SortHeaderIcon field="packageName" />
                            </button>
                          </th>
                          <th className="p-0 text-right font-medium text-gray-500 uppercase tracking-wider">
                            <button
                              type="button"
                              onClick={() => handleCommissionHeaderClick("purchaseAmount")}
                              className="flex w-full items-center justify-end gap-1 px-2 py-2 sm:px-4 sm:py-3 hover:bg-gray-100/90 transition-colors"
                            >
                              Purchase
                              <SortHeaderIcon field="purchaseAmount" />
                            </button>
                          </th>
                          <th className="p-0 text-right font-medium text-gray-500 uppercase tracking-wider">
                            <button
                              type="button"
                              onClick={() => handleCommissionHeaderClick("commissionAmount")}
                              className="flex w-full items-center justify-end gap-1 px-2 py-2 sm:px-4 sm:py-3 hover:bg-gray-100/90 transition-colors"
                            >
                              Commission
                              <SortHeaderIcon field="commissionAmount" />
                            </button>
                          </th>
                          <th className="p-0 text-left font-medium text-gray-500 uppercase tracking-wider">
                            <button
                              type="button"
                              onClick={() => handleCommissionHeaderClick("status")}
                              className="flex w-full items-center justify-start gap-1 px-2 py-2 sm:px-4 sm:py-3 hover:bg-gray-100/90 transition-colors"
                            >
                              Status
                              <SortHeaderIcon field="status" />
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {data.commissions.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">
                              No commissions match your filters.
                            </td>
                          </tr>
                        ) : (
                          commissionRowsForTable.map((item, idx) =>
                            item.kind === "group" ? (
                              <tr key={`g-${item.typeKey}-${idx}`} className="bg-gray-100/90">
                                <td
                                  colSpan={7}
                                  className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 capitalize"
                                >
                                  {item.label}
                                </td>
                              </tr>
                            ) : (
                              <tr key={item.commission.id} className="hover:bg-gray-50 transition-colors even:bg-gray-50/30">
                                <td className="px-2 py-2 sm:px-4 sm:py-3 whitespace-nowrap">
                                  {item.commission.referredUser ? (
                                    <ClickableUserDisplay
                                      displayText={item.commission.referredUser.name || "N/A"}
                                      subtext={item.commission.referredUser.email}
                                      userId={item.commission.referredUser.id ?? null}
                                      className="text-[10px] sm:text-xs lg:text-sm"
                                    />
                                  ) : (
                                    <span className="text-gray-400">N/A</span>
                                  )}
                                </td>
                                <td className="px-2 py-2 sm:px-4 sm:py-3 whitespace-nowrap text-gray-600">
                                  {formatDate(item.commission.earnedAt)}
                                </td>
                                <td className="px-2 py-2 sm:px-4 sm:py-3 whitespace-nowrap capitalize text-gray-600">
                                  {formatCommissionTypeLabel(item.commission.type)}
                                </td>
                                <td className="px-2 py-2 sm:px-4 sm:py-3 whitespace-nowrap text-gray-600">
                                  {item.commission.packageName}
                                </td>
                                <td className="px-2 py-2 sm:px-4 sm:py-3 whitespace-nowrap text-right text-gray-600">
                                  {formatCurrency(item.commission.purchaseAmount)}
                                </td>
                                <td className="px-2 py-2 sm:px-4 sm:py-3 whitespace-nowrap text-right font-semibold text-green-600">
                                  {formatCurrency(item.commission.commissionAmount)}
                                </td>
                                <td className="px-2 py-2 sm:px-4 sm:py-3 whitespace-nowrap">
                                  {item.commission.status === "paid" ? (
                                    <span className="px-2 py-1 rounded-full text-[10px] sm:text-xs font-medium bg-green-100 text-green-800">
                                      Paid
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 rounded-full text-[10px] sm:text-xs font-medium bg-yellow-100 text-yellow-800">
                                      Pending
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          )
                        )}
                      </tbody>
                    </table>
                  </div>

                  {commissionTotal > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        Page {commPagination?.page ?? commissionPage} of{" "}
                        {commissionTotalPages === 0 ? 1 : commissionTotalPages} · {commissionTotal} total
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={commissionPage <= 1 || isLoading}
                          onClick={() => setCommissionPage((p) => Math.max(1, p - 1))}
                          icon={ChevronLeft}
                          iconPosition="left"
                          className="min-h-[44px] sm:min-h-[40px]"
                        >
                          Prev
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={
                            commissionPage >= commissionTotalPages || commissionTotalPages === 0 || isLoading
                          }
                          onClick={() => setCommissionPage((p) => p + 1)}
                          icon={ChevronRight}
                          iconPosition="right"
                          className="min-h-[44px] sm:min-h-[40px]"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "payouts" && showPayoutsTab && (
                <div>
                  <h3 className="font-semibold mb-3 text-gray-900 text-sm sm:text-base">Payout history</h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 -mx-1 sm:mx-0">
                    <table className="w-full min-w-[480px] text-xs sm:text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-2 sm:px-4 py-2 sm:py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-2 sm:px-4 py-2 sm:py-3 text-right font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-2 sm:px-4 py-2 sm:py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                            Commissions
                          </th>
                          <th className="px-2 sm:px-4 py-2 sm:py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                            Processed By
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {data.payouts.map((payout) => (
                          <tr key={payout.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-gray-600">
                              {formatDate(payout.paidAt)}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-right font-semibold text-gray-900">
                              {formatCurrency(payout.totalAmount)}
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-gray-600">
                              {payout.commissionCount} commissions
                            </td>
                            <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-gray-600">
                              {payout.processedBy?.name || "N/A"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </ModalContent>

        {data && (
          <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-3 sm:px-5 py-3 sm:py-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!isEditing ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    icon={Edit2}
                    className="min-h-[44px] sm:min-h-[40px]"
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    loading={isDeleting}
                    icon={Trash2}
                    className="min-h-[44px] sm:min-h-[40px]"
                  >
                    Delete
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="min-h-[44px] sm:min-h-[40px]"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    loading={isSaving}
                    icon={Save}
                    className="min-h-[44px] sm:min-h-[40px]"
                  >
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalContainer>
  );
}
