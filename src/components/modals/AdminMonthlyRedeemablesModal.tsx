"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Gift, Loader2, Target, Users } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  FormSection,
  Input,
  Button,
  DateTimePicker,
} from "@/components/modals/ui";
import Dropdown from "@/components/modals/ui/Dropdown";
import CampaignTargetingModal, {
  type CampaignTargetingConfirmPayload,
  type RedeemableTierId,
} from "@/components/modals/CampaignTargetingModal";

type CampaignMode = "global" | "unique" | "both";
type TargetingMode = "all-active-subscribers" | "manual-users" | "csv-users" | "dynamic-segment";
type PurchaseRequirement = "none" | "membership" | "one-time" | "any";

export interface MonthlyRedeemableSegmentConfig {
  minInactiveDays?: number;
  maxInactiveDays?: number;
  requiresEmailVerified?: boolean;
  requiresRecentPurchaseDays?: number;
  includeUserIds?: string[];
  excludeUserIds?: string[];
  states?: string[];
  membershipTiers?: string[];
  topEntriesPercent?: number;
}

interface AdminMonthlyRedeemablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editingCampaign?: {
    id: string;
    monthKey: string;
    name: string;
    displayLabel?: string;
    entriesAmount: number;
    campaignMode: CampaignMode;
    targetingMode: TargetingMode;
    startsAt: string;
    endsAt?: string;
    neverExpires?: boolean;
    code: string;
    requiresPurchase?: boolean;
    purchaseRequirement?: PurchaseRequirement;
    segmentConfig?: MonthlyRedeemableSegmentConfig | null;
  } | null;
}

const campaignModeOptions = [
  { value: "both", label: "Both (Global + Unique)" },
  { value: "global", label: "Global" },
  { value: "unique", label: "Unique" },
];

const targetingModeOptions = [
  { value: "all-active-subscribers", label: "All Active Subscribers" },
  { value: "manual-users", label: "Manual Users" },
  { value: "csv-users", label: "CSV Users" },
  { value: "dynamic-segment", label: "Dynamic Segment" },
];

const purchaseRequirementOptions = [
  { value: "none", label: "No purchase required" },
  { value: "membership", label: "Membership purchase" },
  { value: "one-time", label: "One-time package purchase" },
  { value: "any", label: "Any purchase" },
];

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeCouponCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function tierLabel(id: string): string {
  if (id === "tradie-subscription") return "Tradie";
  if (id === "foreman-subscription") return "Foreman";
  if (id === "boss-subscription") return "Boss";
  return id;
}

export default function AdminMonthlyRedeemablesModal({
  isOpen,
  onClose,
  onSuccess,
  editingCampaign,
}: AdminMonthlyRedeemablesModalProps) {
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("both");
  const [targetingMode, setTargetingMode] = useState<TargetingMode>("all-active-subscribers");
  const [purchaseRequirement, setPurchaseRequirement] = useState<PurchaseRequirement>("none");
  const [formData, setFormData] = useState({
    monthKey: getCurrentMonthKey(),
    name: "",
    displayLabel: "",
    entriesAmount: "100",
    startsAt: "",
    endsAt: "",
    code: "",
    neverExpires: false,
    minInactiveDays: "",
    maxInactiveDays: "",
    requiresEmailVerified: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetingOpen, setTargetingOpen] = useState(false);
  const [audiencePick, setAudiencePick] = useState<CampaignTargetingConfirmPayload | null>(null);

  const canSubmit = useMemo(() => {
    const hasDates = Boolean(formData.startsAt && (formData.neverExpires || formData.endsAt));
    const hasCode = Boolean(formData.code.trim());
    return Boolean(
      formData.monthKey.trim() &&
        formData.name.trim() &&
        Number(formData.entriesAmount) > 0 &&
        hasDates &&
        hasCode
    );
  }, [formData]);

  const audienceSummary = useMemo(() => {
    if (!audiencePick) return null;
    const parts: string[] = [];
    const sc = audiencePick.segmentConfig;
    if (sc.membershipTiers?.length) {
      parts.push(sc.membershipTiers.map(tierLabel).join(" + "));
    }
    if (sc.states?.length) {
      parts.push(sc.states.join(", "));
    }
    if (typeof sc.topEntriesPercent === "number") {
      parts.push(`Top ${sc.topEntriesPercent}% draw entries`);
    }
    if (audiencePick.includeUserIds.length) {
      parts.push(`${audiencePick.includeUserIds.length} pinned`);
    }
    return parts.length ? parts.join(" · ") : null;
  }, [audiencePick]);

  const resetForm = () => {
    setCampaignMode("both");
    setTargetingMode("all-active-subscribers");
    setPurchaseRequirement("none");
    setFormData({
      monthKey: getCurrentMonthKey(),
      name: "",
      displayLabel: "",
      entriesAmount: "100",
      startsAt: "",
      endsAt: "",
      code: "",
      neverExpires: false,
      minInactiveDays: "",
      maxInactiveDays: "",
      requiresEmailVerified: true,
    });
    setError(null);
    setAudiencePick(null);
  };

  const buildSegmentConfigPayload = (): MonthlyRedeemableSegmentConfig | undefined => {
    if (targetingMode === "all-active-subscribers") return undefined;

    const pick = audiencePick;
    const sc = pick?.segmentConfig;
    const out: MonthlyRedeemableSegmentConfig = {};

    if (targetingMode === "dynamic-segment") {
      if (formData.minInactiveDays.trim()) {
        out.minInactiveDays = Number(formData.minInactiveDays);
      }
      if (formData.maxInactiveDays.trim()) {
        out.maxInactiveDays = Number(formData.maxInactiveDays);
      }
      out.requiresEmailVerified = sc?.requiresEmailVerified ?? formData.requiresEmailVerified;
    } else if (sc?.requiresEmailVerified === false) {
      out.requiresEmailVerified = false;
    }

    if (pick?.includeUserIds?.length) {
      out.includeUserIds = pick.includeUserIds;
    }

    if (sc?.states?.length) {
      out.states = sc.states;
    }
    if (sc?.membershipTiers?.length) {
      out.membershipTiers = sc.membershipTiers;
    }
    if (typeof sc?.topEntriesPercent === "number") {
      out.topEntriesPercent = sc.topEntriesPercent;
    }

    const hasKeys = Object.keys(out).length > 0;
    if (!hasKeys) return undefined;
    return out;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (targetingMode === "manual-users" && !(audiencePick?.includeUserIds?.length)) {
      setError("For manual targeting, open Configure audience and pin at least one user (or switch targeting mode).");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const isEdit = Boolean(editingCampaign?.id);
      const segmentConfig = buildSegmentConfigPayload();
      const response = await fetch(
        isEdit ? `/api/admin/monthly-coupon/campaign/${editingCampaign?.id}` : "/api/admin/monthly-coupon/campaign",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            monthKey: formData.monthKey.trim(),
            name: formData.name.trim(),
            displayLabel: formData.displayLabel.trim() || undefined,
            entriesAmount: Number(formData.entriesAmount),
            campaignMode,
            targetingMode,
            startsAt: formData.startsAt,
            endsAt: formData.neverExpires ? undefined : formData.endsAt,
            neverExpires: formData.neverExpires,
            code: normalizeCouponCode(formData.code),
            purchaseRequirement,
            segmentConfig,
            isActive: true,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok || !data?.success) {
        const detailedMessage =
          Array.isArray(data?.details) && data.details.length > 0
            ? data.details[0]?.message || data.error
            : data?.error;
        throw new Error(detailedMessage || "Failed to create coupon");
      }

      onSuccess?.();
      if (!editingCampaign) {
        resetForm();
      }
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create coupon");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!editingCampaign) {
      resetForm();
      return;
    }
    setCampaignMode(editingCampaign.campaignMode);
    setTargetingMode(editingCampaign.targetingMode);
    setPurchaseRequirement(
      editingCampaign.purchaseRequirement ?? (editingCampaign.requiresPurchase ? "membership" : "none")
    );
    const sc = editingCampaign.segmentConfig;
    setFormData({
      monthKey: editingCampaign.monthKey,
      name: editingCampaign.name,
      displayLabel: editingCampaign.displayLabel || "",
      entriesAmount: String(editingCampaign.entriesAmount),
      startsAt: editingCampaign.startsAt ? new Date(editingCampaign.startsAt).toISOString().slice(0, 16) : "",
      endsAt: editingCampaign.endsAt ? new Date(editingCampaign.endsAt).toISOString().slice(0, 16) : "",
      code: editingCampaign.code,
      neverExpires: Boolean(editingCampaign.neverExpires),
      minInactiveDays: sc?.minInactiveDays != null ? String(sc.minInactiveDays) : "",
      maxInactiveDays: sc?.maxInactiveDays != null ? String(sc.maxInactiveDays) : "",
      requiresEmailVerified: sc?.requiresEmailVerified ?? true,
    });

    if (sc) {
      setAudiencePick({
        includeUserIds: sc.includeUserIds ?? [],
        segmentConfig: {
          requiresEmailVerified: sc.requiresEmailVerified ?? true,
          states: sc.states,
          membershipTiers: sc.membershipTiers as RedeemableTierId[] | undefined,
          topEntriesPercent: sc.topEntriesPercent,
          minInactiveDays: sc.minInactiveDays,
          maxInactiveDays: sc.maxInactiveDays,
        },
      });
    } else {
      setAudiencePick(null);
    }
    setError(null);
  }, [editingCampaign, isOpen]);

  useEffect(() => {
    if (targetingMode === "all-active-subscribers") {
      setAudiencePick(null);
    }
  }, [targetingMode]);

  return (
    <>
      <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
        <ModalHeader
          title={editingCampaign ? "Edit Monthly Redeemables Coupon" : "Create Monthly Redeemables Coupon"}
          onClose={onClose}
          showLogo={false}
        />
        <ModalContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormSection title="Coupon Basics">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  value={formData.monthKey}
                  onChange={(e) => setFormData((prev) => ({ ...prev, monthKey: e.target.value }))}
                  placeholder="YYYY-MM"
                />
                <Input
                  type="number"
                  min={1}
                  value={formData.entriesAmount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, entriesAmount: e.target.value }))}
                  placeholder="Entries amount"
                />
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Coupon name"
                />
                <Input
                  value={formData.displayLabel}
                  onChange={(e) => setFormData((prev) => ({ ...prev, displayLabel: e.target.value }))}
                  placeholder="Display label (e.g. Toolbox Code)"
                  className="sm:col-span-2"
                />
              </div>
            </FormSection>

            <FormSection title="Modes">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Dropdown
                  options={campaignModeOptions}
                  value={campaignMode}
                  onChange={(value) => setCampaignMode(value as CampaignMode)}
                />
                <Dropdown
                  options={targetingModeOptions}
                  value={targetingMode}
                  onChange={(value) => setTargetingMode(value as TargetingMode)}
                />
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  value={formData.code}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      code: normalizeCouponCode(e.target.value),
                    }))
                  }
                  placeholder="Coupon code (required, e.g. TOOLBOX-APR26)"
                />
                <Dropdown
                  options={purchaseRequirementOptions}
                  value={purchaseRequirement}
                  onChange={(value) => setPurchaseRequirement(value as PurchaseRequirement)}
                />
              </div>
            </FormSection>

            {targetingMode !== "all-active-subscribers" && (
              <FormSection title="Audience">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                  <Button type="button" variant="outline" size="md" onClick={() => setTargetingOpen(true)} className="inline-flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Configure audience…
                  </Button>
                  {audienceSummary && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 border border-gray-200 dark:border-neutral-700">
                      {audienceSummary}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-neutral-500 mt-2">
                  Filter by membership tier, state, verified email, and top % of major draw entries. Pin specific users so they always receive the redeemable when eligible.
                </p>
              </FormSection>
            )}

            <FormSection title="Coupon Window">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-red-600" />
                      Start
                    </span>
                  </label>
                  <DateTimePicker
                    id="monthly-start-date"
                    name="startsAt"
                    type="datetime-local"
                    value={formData.startsAt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, startsAt: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-red-600" />
                      End
                    </span>
                  </label>
                  <DateTimePicker
                    id="monthly-end-date"
                    name="endsAt"
                    type="datetime-local"
                    value={formData.endsAt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, endsAt: e.target.value }))}
                    disabled={formData.neverExpires}
                  />
                </div>
              </div>
              <label className="mt-3 h-11 px-3 rounded-lg border border-gray-300 bg-white dark:border-neutral-600 dark:bg-neutral-900 flex items-center gap-2 text-sm text-gray-700 dark:text-neutral-200">
                <input
                  type="checkbox"
                  checked={formData.neverExpires}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      neverExpires: e.target.checked,
                      endsAt: e.target.checked ? "" : prev.endsAt,
                    }))
                  }
                />
                Never expires
              </label>
            </FormSection>

            {targetingMode === "dynamic-segment" && (
              <FormSection title="Dynamic Segment Rules">
                <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900/50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-neutral-100 mb-2">
                    <Target className="w-4 h-4 text-red-600" />
                    Inactivity (optional)
                  </div>
                  <p className="text-xs text-gray-500 dark:text-neutral-500 mb-2">
                    Email verification for dynamic segments is also set in <strong>Configure audience</strong> (or use the checkbox below as default before opening the picker).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      type="number"
                      min={0}
                      value={formData.minInactiveDays}
                      onChange={(e) => setFormData((prev) => ({ ...prev, minInactiveDays: e.target.value }))}
                      placeholder="Min inactive days"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={formData.maxInactiveDays}
                      onChange={(e) => setFormData((prev) => ({ ...prev, maxInactiveDays: e.target.value }))}
                      placeholder="Max inactive days"
                    />
                    <label className="h-11 px-3 rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 flex items-center gap-2 text-sm text-gray-700 dark:text-neutral-200">
                      <input
                        type="checkbox"
                        checked={formData.requiresEmailVerified}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, requiresEmailVerified: e.target.checked }))
                        }
                      />
                      Email verified only
                    </label>
                  </div>
                </div>
              </FormSection>
            )}

            {error && (
              <div className="text-sm text-red-700 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-neutral-800">
              <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" className="flex-1" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Gift className="w-4 h-4 mr-2" />
                    {editingCampaign ? "Save Coupon" : "Create Coupon"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </ModalContent>
      </ModalContainer>

      <CampaignTargetingModal
        isOpen={targetingOpen}
        onClose={() => setTargetingOpen(false)}
        onConfirm={setAudiencePick}
        parentSegmentDefaults={{
          minInactiveDays: formData.minInactiveDays.trim() ? Number(formData.minInactiveDays) : undefined,
          maxInactiveDays: formData.maxInactiveDays.trim() ? Number(formData.maxInactiveDays) : undefined,
          requiresEmailVerified: formData.requiresEmailVerified,
        }}
        initialIncludeUserIds={audiencePick?.includeUserIds}
        initialPersistedSegment={audiencePick?.segmentConfig}
      />
    </>
  );
}
