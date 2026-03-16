"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Gift, Loader2, Target } from "lucide-react";
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

type CampaignMode = "global" | "unique" | "both";
type TargetingMode = "all-active-subscribers" | "manual-users" | "csv-users" | "dynamic-segment";
type PurchaseRequirement = "none" | "membership" | "one-time" | "any";

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

function normalizeCampaignCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const isEdit = Boolean(editingCampaign?.id);
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
          code: normalizeCampaignCode(formData.code),
          purchaseRequirement,
          segmentConfig:
            targetingMode === "dynamic-segment"
              ? {
                  minInactiveDays: formData.minInactiveDays.trim() ? Number(formData.minInactiveDays) : undefined,
                  maxInactiveDays: formData.maxInactiveDays.trim() ? Number(formData.maxInactiveDays) : undefined,
                  requiresEmailVerified: formData.requiresEmailVerified,
                }
              : undefined,
          isActive: true,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        const detailedMessage =
          Array.isArray(data?.details) && data.details.length > 0
            ? data.details[0]?.message || data.error
            : data?.error;
        throw new Error(detailedMessage || "Failed to create campaign");
      }

      onSuccess?.();
      if (!editingCampaign) {
        resetForm();
      }
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create campaign");
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
      editingCampaign.purchaseRequirement ?? 
      (editingCampaign.requiresPurchase ? "membership" : "none")
    );
    setFormData({
      monthKey: editingCampaign.monthKey,
      name: editingCampaign.name,
      displayLabel: editingCampaign.displayLabel || "",
      entriesAmount: String(editingCampaign.entriesAmount),
      startsAt: editingCampaign.startsAt ? new Date(editingCampaign.startsAt).toISOString().slice(0, 16) : "",
      endsAt: editingCampaign.endsAt ? new Date(editingCampaign.endsAt).toISOString().slice(0, 16) : "",
      code: editingCampaign.code,
      neverExpires: Boolean(editingCampaign.neverExpires),
      minInactiveDays: "",
      maxInactiveDays: "",
      requiresEmailVerified: true,
    });
    setError(null);
  }, [editingCampaign, isOpen]);

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader title={editingCampaign ? "Edit Monthly Redeemables Campaign" : "Create Monthly Redeemables Campaign"} onClose={onClose} showLogo={false} />
      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormSection title="Campaign Basics">
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
                placeholder="Campaign name"
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
                    code: normalizeCampaignCode(e.target.value),
                  }))
                }
                placeholder="Campaign code (required, e.g. TOOLBOX-APR26)"
              />
              <Dropdown
                options={purchaseRequirementOptions}
                value={purchaseRequirement}
                onChange={(value) => setPurchaseRequirement(value as PurchaseRequirement)}
              />
            </div>
          </FormSection>

          <FormSection title="Campaign Window">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
            <label className="mt-3 h-11 px-3 rounded-lg border border-gray-300 bg-white flex items-center gap-2 text-sm text-gray-700">
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
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
                  <Target className="w-4 h-4 text-red-600" />
                  Audience Constraints
                </div>
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
                  <label className="h-11 px-3 rounded-lg border border-gray-300 bg-white flex items-center gap-2 text-sm text-gray-700">
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

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

          <div className="flex gap-3 pt-4 border-t border-gray-200">
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
                  {editingCampaign ? "Save Campaign" : "Create Campaign"}
                </>
              )}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
}
