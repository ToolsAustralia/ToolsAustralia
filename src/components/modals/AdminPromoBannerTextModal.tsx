"use client";

import React, { useState, useEffect } from "react";
import { Calendar, AlertTriangle, Loader2 } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  Input,
  Textarea,
  Button,
  FormSection,
  Select,
  Checkbox,
} from "./ui";
import {
  useCreatePromoBannerText,
  useUpdatePromoBannerText,
} from "@/hooks/queries/usePromoBannerTextQueries";
import type {
  PromoBannerText,
  CreatePromoBannerTextPayload,
  UpdatePromoBannerTextPayload,
  PromoBannerTextScheduleType,
  PromoBannerTextRecurrencePattern,
} from "@/types/admin";
import DateRangeCalendar from "@/components/admin/DateRangeCalendar";
import { convertUTCToAEST } from "@/utils/common/timezone";

interface AdminPromoBannerTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editingText?: PromoBannerText | null; // If provided, modal is in edit mode
}

interface PromoBannerTextFormData {
  text: string;
  scheduleType: PromoBannerTextScheduleType;
  startDate: Date | null;
  endDate: Date | null;
  recurrencePattern?: PromoBannerTextRecurrencePattern;
  description: string;
  isActive: boolean;
}

const RECURRENCE_PATTERNS: { value: PromoBannerTextRecurrencePattern; label: string }[] = [
  { value: "weekdays", label: "Every Weekdays (Mon-Fri)" },
  { value: "weekends", label: "Every Weekends (Sat-Sun)" },
  { value: "monday", label: "Every Monday" },
  { value: "tuesday", label: "Every Tuesday" },
  { value: "wednesday", label: "Every Wednesday" },
  { value: "thursday", label: "Every Thursday" },
  { value: "friday", label: "Every Friday" },
  { value: "saturday", label: "Every Saturday" },
  { value: "sunday", label: "Every Sunday" },
];

const AdminPromoBannerTextModal: React.FC<AdminPromoBannerTextModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingText,
}) => {
  const createMutation = useCreatePromoBannerText();
  const updateMutation = useUpdatePromoBannerText();

  const [formData, setFormData] = useState<PromoBannerTextFormData>({
    text: "",
    scheduleType: "one-time",
    startDate: null,
    endDate: null,
    recurrencePattern: undefined,
    description: "",
    isActive: true,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof PromoBannerTextFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form data when modal opens or editingText changes
  useEffect(() => {
    if (isOpen) {
      if (editingText) {
        // Edit mode: populate form with existing data
        // Convert AEST dates (from API) to Date objects
        setFormData({
          text: editingText.text,
          scheduleType: editingText.scheduleType,
          startDate: editingText.startDate ? new Date(editingText.startDate) : null,
          endDate: editingText.endDate ? new Date(editingText.endDate) : null,
          recurrencePattern: editingText.recurrencePattern,
          description: editingText.description || "",
          isActive: editingText.isActive,
        });
      } else {
        // Create mode: set defaults
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        setFormData({
          text: "",
          scheduleType: "one-time",
          startDate: now,
          endDate: tomorrow,
          recurrencePattern: undefined,
          description: "",
          isActive: true,
        });
      }
      setErrors({});
    }
  }, [isOpen, editingText]);

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof PromoBannerTextFormData, string>> = {};

    if (!formData.text.trim()) {
      newErrors.text = "Text is required";
    } else if (formData.text.length > 100) {
      newErrors.text = "Text cannot exceed 100 characters";
    }

    if (formData.scheduleType === "one-time") {
      if (!formData.startDate) {
        newErrors.startDate = "Start date is required";
      }

      if (!formData.endDate) {
        newErrors.endDate = "End date is required";
      }

      if (formData.startDate && formData.endDate) {
        const start = new Date(formData.startDate);
        const end = new Date(formData.endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        if (start > end) {
          newErrors.endDate = "End date must be on or after start date";
        }
      }
    } else if (formData.scheduleType === "recurring") {
      if (!formData.recurrencePattern) {
        newErrors.recurrencePattern = "Recurrence pattern is required";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingText) {
        // Update existing text
        const updateData: UpdatePromoBannerTextPayload = {
          text: formData.text.trim(),
          scheduleType: formData.scheduleType,
          startDate: formData.startDate ? formData.startDate.toISOString() : undefined,
          endDate: formData.endDate ? formData.endDate.toISOString() : undefined,
          recurrencePattern: formData.recurrencePattern,
          description: formData.description.trim() || undefined,
          isActive: formData.isActive,
        };

        await updateMutation.mutateAsync({ id: editingText.id, data: updateData });
      } else {
        // Create new text
        const createData: CreatePromoBannerTextPayload = {
          text: formData.text.trim(),
          scheduleType: formData.scheduleType,
          startDate: formData.startDate ? formData.startDate.toISOString() : undefined,
          endDate: formData.endDate ? formData.endDate.toISOString() : undefined,
          recurrencePattern: formData.recurrencePattern,
          description: formData.description.trim() || undefined,
          isActive: formData.isActive,
        };

        await createMutation.mutateAsync(createData);
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to save banner text:", error);
      // Error handling is done by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="lg">
      <ModalHeader
        title={editingText ? "Edit Promo Banner Text" : "Create Promo Banner Text"}
        onClose={handleClose}
        showLogo={false}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Text Input */}
          <FormSection title="Banner Text" icon={Calendar}>
            <Input
              id="text"
              name="text"
              value={formData.text}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  text: e.target.value,
                }))
              }
              label="Text"
              placeholder="e.g., Christmas Offer, Boxing Day Special"
              required
              maxLength={100}
              error={errors.text}
              disabled={isSubmitting}
            />
            <p className="text-sm text-gray-500 mt-1">
              {formData.text.length}/100 characters. Text will automatically adjust font size based on length.
            </p>
          </FormSection>

          {/* Schedule Type */}
          <FormSection title="Schedule Type">
            <Select
              id="scheduleType"
              name="scheduleType"
              value={formData.scheduleType}
              onChange={(e) => {
                const newType = e.target.value as PromoBannerTextScheduleType;
                setFormData((prev) => ({
                  ...prev,
                  scheduleType: newType,
                  // Reset dates when switching types
                  startDate: newType === "one-time" ? prev.startDate : null,
                  endDate: newType === "one-time" ? prev.endDate : null,
                  recurrencePattern: newType === "recurring" ? prev.recurrencePattern : undefined,
                }));
                setErrors({});
              }}
              label="Schedule Type"
              options={[
                { value: "one-time", label: "One-time (Date Range)" },
                { value: "recurring", label: "Recurring (Weekly Pattern)" },
              ]}
              error={errors.scheduleType}
              disabled={isSubmitting}
            />
          </FormSection>

          {/* One-time Schedule Fields */}
          {formData.scheduleType === "one-time" && (
            <FormSection title="Date Range">
              <div className="space-y-4">
                <DateRangeCalendar
                  startDate={formData.startDate}
                  endDate={formData.endDate}
                  onStartDateChange={(date) => {
                    setFormData((prev) => ({ ...prev, startDate: date }));
                    setErrors((prev) => ({ ...prev, startDate: undefined }));
                  }}
                  onEndDateChange={(date) => {
                    setFormData((prev) => ({ ...prev, endDate: date }));
                    setErrors((prev) => ({ ...prev, endDate: undefined }));
                  }}
                  minDate={new Date()}
                />
                {errors.startDate && <p className="text-sm text-red-600">{errors.startDate}</p>}
                {errors.endDate && <p className="text-sm text-red-600">{errors.endDate}</p>}
                <p className="text-sm text-gray-500">
                  All dates are in AEST timezone. Select the start and end dates for when this text should be displayed.
                </p>
              </div>
            </FormSection>
          )}

          {/* Recurring Schedule Fields */}
          {formData.scheduleType === "recurring" && (
            <>
              <FormSection title="Recurrence Pattern">
                <Select
                  id="recurrencePattern"
                  name="recurrencePattern"
                  value={formData.recurrencePattern || ""}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      recurrencePattern: e.target.value as PromoBannerTextRecurrencePattern,
                    }));
                    setErrors((prev) => ({ ...prev, recurrencePattern: undefined }));
                  }}
                  label="Pattern"
                  options={RECURRENCE_PATTERNS.map((p) => ({ value: p.value, label: p.label }))}
                  required
                  error={errors.recurrencePattern}
                  disabled={isSubmitting}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Select when this text should repeat. Day-of-week matching is based on AEST timezone.
                </p>
              </FormSection>

              <FormSection title="Optional Date Boundaries">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Optionally set start and end dates to limit when the recurring pattern applies. Leave empty for
                    indefinite recurrence.
                  </p>
                  <DateRangeCalendar
                    startDate={formData.startDate}
                    endDate={formData.endDate}
                    onStartDateChange={(date) => {
                      setFormData((prev) => ({ ...prev, startDate: date }));
                    }}
                    onEndDateChange={(date) => {
                      setFormData((prev) => ({ ...prev, endDate: date }));
                    }}
                  />
                  <p className="text-sm text-gray-500">All dates are in AEST timezone.</p>
                </div>
              </FormSection>
            </>
          )}

          {/* Description */}
          <FormSection title="Description (Optional)">
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              label="Admin Notes"
              placeholder="Internal notes about this scheduled text..."
              rows={3}
              maxLength={500}
              disabled={isSubmitting}
            />
          </FormSection>

          {/* Active Toggle */}
          <FormSection title="Status">
            <div className="flex items-center gap-3">
              <Checkbox
                id="isActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    isActive: e.target.checked,
                  }))
                }
                disabled={isSubmitting}
                label="Active (text will be displayed when schedule matches)"
              />
            </div>
          </FormSection>

          {/* Error Display */}
          {Object.keys(errors).length > 0 && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Please fix the errors above before submitting.</span>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {editingText ? "Updating..." : "Creating..."}
                </>
              ) : editingText ? (
                "Update Banner Text"
              ) : (
                "Create Banner Text"
              )}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
};

export default AdminPromoBannerTextModal;

