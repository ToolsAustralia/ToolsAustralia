"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Loader2, Target } from "lucide-react";
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

type MilestoneType = "spend-amount" | "entries-gained" | "loyalty-days";

export interface MilestoneRewardFormItem {
  id: string;
  name: string;
  displayLabel?: string;
  milestoneType: MilestoneType;
  threshold: number;
  entriesAmount: number;
  code: string;
  isActive: boolean;
  neverExpires: boolean;
  startsAt?: string;
  endsAt?: string;
  isRecurring: boolean;
}

interface AdminMilestoneRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editingReward?: MilestoneRewardFormItem | null;
}

const milestoneTypeOptions = [
  { value: "spend-amount", label: "Amount Spent" },
  { value: "entries-gained", label: "Entries Gained" },
  { value: "loyalty-days", label: "Loyalty Days (Active Subscription)" },
];

function normalizeCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function AdminMilestoneRewardModal({
  isOpen,
  onClose,
  onSuccess,
  editingReward,
}: AdminMilestoneRewardModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    displayLabel: "",
    milestoneType: "spend-amount" as MilestoneType,
    threshold: "100",
    entriesAmount: "50",
    code: "",
    startsAt: "",
    endsAt: "",
    neverExpires: false,
    isRecurring: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editingReward) return;
    setFormData({
      name: editingReward.name,
      displayLabel: editingReward.displayLabel || "",
      milestoneType: editingReward.milestoneType,
      threshold: String(editingReward.threshold),
      entriesAmount: String(editingReward.entriesAmount),
      code: editingReward.code,
      startsAt: editingReward.startsAt || "",
      endsAt: editingReward.endsAt || "",
      neverExpires: editingReward.neverExpires,
      isRecurring: editingReward.isRecurring,
    });
  }, [editingReward]);

  const canSubmit = useMemo(
    () =>
      Boolean(
        formData.name.trim() &&
          Number(formData.threshold) > 0 &&
          Number(formData.entriesAmount) > 0 &&
          formData.code.trim() &&
          formData.startsAt &&
          (formData.neverExpires || formData.endsAt)
      ),
    [formData]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: formData.name.trim(),
        displayLabel: formData.displayLabel.trim() || undefined,
        milestoneType: formData.milestoneType,
        threshold: Number(formData.threshold),
        entriesAmount: Number(formData.entriesAmount),
        code: normalizeCode(formData.code),
        startsAt: formData.startsAt,
        endsAt: formData.neverExpires ? undefined : formData.endsAt,
        neverExpires: formData.neverExpires,
        isRecurring: formData.isRecurring,
      };

      const isEdit = Boolean(editingReward?.id);
      const response = await fetch(
        isEdit ? `/api/admin/milestone-rewards/${editingReward?.id}` : "/api/admin/milestone-rewards",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();
      if (!response.ok || !data?.success) {
        const detailedMessage =
          Array.isArray(data?.details) && data.details.length > 0 ? data.details[0]?.message || data.error : data?.error;
        throw new Error(detailedMessage || "Failed to save milestone reward");
      }

      onSuccess?.();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save milestone reward");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader title={editingReward ? "Edit Milestone Reward" : "Create Milestone Reward"} onClose={onClose} showLogo={false} />
      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormSection title="Reward Basics">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Reward name"
              />
              <Input
                value={formData.displayLabel}
                onChange={(e) => setFormData((prev) => ({ ...prev, displayLabel: e.target.value }))}
                placeholder="Display label (optional)"
              />
              <Input
                type="number"
                min={1}
                value={formData.threshold}
                onChange={(e) => setFormData((prev) => ({ ...prev, threshold: e.target.value }))}
                placeholder="Threshold"
              />
              <Input
                type="number"
                min={1}
                value={formData.entriesAmount}
                onChange={(e) => setFormData((prev) => ({ ...prev, entriesAmount: e.target.value }))}
                placeholder="Entries awarded"
              />
            </div>
          </FormSection>

          <FormSection title="Milestone Rules">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Dropdown
                options={milestoneTypeOptions}
                value={formData.milestoneType}
                onChange={(value) => setFormData((prev) => ({ ...prev, milestoneType: value as MilestoneType }))}
              />
              <Input
                value={formData.code}
                onChange={(e) => setFormData((prev) => ({ ...prev, code: normalizeCode(e.target.value) }))}
                placeholder="Reward code (e.g. LOYALTY-100D)"
              />
            </div>
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-neutral-100 mb-2">
                <Target className="w-4 h-4 text-red-600" />
                Behaviour
              </div>
              <label className="h-10 px-3 rounded-lg border border-gray-300 bg-white flex items-center gap-2 text-sm text-gray-700 dark:text-neutral-200">
                <input
                  type="checkbox"
                  checked={formData.isRecurring}
                  onChange={(e) => setFormData((prev) => ({ ...prev, isRecurring: e.target.checked }))}
                />
                Recurring reward (can trigger multiple cycles)
              </label>
            </div>
          </FormSection>

          <FormSection title="Reward Window">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-red-600" />
                    Start
                  </span>
                </label>
                <DateTimePicker
                  id="milestone-start-date"
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
                  id="milestone-end-date"
                  name="endsAt"
                  type="datetime-local"
                  value={formData.endsAt}
                  onChange={(e) => setFormData((prev) => ({ ...prev, endsAt: e.target.value }))}
                  disabled={formData.neverExpires}
                />
              </div>
            </div>
            <label className="mt-3 h-10 px-3 rounded-lg border border-gray-300 bg-white flex items-center gap-2 text-sm text-gray-700 dark:text-neutral-200">
              <input
                type="checkbox"
                checked={formData.neverExpires}
                onChange={(e) => setFormData((prev) => ({ ...prev, neverExpires: e.target.checked }))}
              />
              Never expires
            </label>
          </FormSection>

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
                "Save Reward"
              )}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
}
