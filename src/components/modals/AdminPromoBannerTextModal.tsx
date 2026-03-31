"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, Loader2, ImageIcon } from "lucide-react";
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
import ImageUpload from "./ui/ImageUpload";
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
import { createAESTDateAsUTC } from "@/utils/common/timezone";

interface AdminPromoBannerTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editingText?: PromoBannerText | null;
}

interface PromoBannerTextFormData {
  scheduleType: PromoBannerTextScheduleType;
  startDate: Date | null;
  endDate: Date | null;
  recurrencePattern?: PromoBannerTextRecurrencePattern;
  description: string;
  isActive: boolean;
  altText: string;
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

const CLOUDINARY_FOLDER = "promo-banner";

async function uploadPromoBannerImageToCloudinary(file: File): Promise<string> {
  const uploadFormData = new FormData();
  uploadFormData.append("file", file);
  uploadFormData.append("folder", CLOUDINARY_FOLDER);

  const response = await fetch("/api/upload/cloudinary", {
    method: "POST",
    body: uploadFormData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to upload image");
  }

  const data = await response.json();
  return data.url as string;
}

const AdminPromoBannerTextModal: React.FC<AdminPromoBannerTextModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingText,
}) => {
  const createMutation = useCreatePromoBannerText();
  const updateMutation = useUpdatePromoBannerText();

  const [formData, setFormData] = useState<PromoBannerTextFormData>({
    scheduleType: "one-time",
    startDate: null,
    endDate: null,
    recurrencePattern: undefined,
    description: "",
    isActive: true,
    altText: "",
  });

  const [bannerImages, setBannerImages] = useState<(File | string)[]>([]);
  const [errors, setErrors] = useState<
    Partial<Record<keyof PromoBannerTextFormData | "bannerImage", string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingText) {
        setFormData({
          scheduleType: editingText.scheduleType,
          startDate: editingText.startDate ? new Date(editingText.startDate) : null,
          endDate: editingText.endDate ? new Date(editingText.endDate) : null,
          recurrencePattern: editingText.recurrencePattern,
          description: editingText.description || "",
          isActive: editingText.isActive,
          altText: editingText.altText || "",
        });
        setBannerImages(editingText.imageUrl ? [editingText.imageUrl] : []);
      } else {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        setFormData({
          scheduleType: "one-time",
          startDate: now,
          endDate: tomorrow,
          recurrencePattern: undefined,
          description: "",
          isActive: true,
          altText: "",
        });
        setBannerImages([]);
      }
      setErrors({});
    }
  }, [isOpen, editingText]);

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof PromoBannerTextFormData | "bannerImage", string>> = {};

    if (bannerImages.length === 0) {
      newErrors.bannerImage = "Image is required";
    }

    if (formData.altText.length > 200) {
      newErrors.altText = "Alt text cannot exceed 200 characters";
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

  const convertDateToAESTISO = (date: Date | null): string | undefined => {
    if (!date) return undefined;

    const selectedYear = date.getFullYear();
    const selectedMonth = date.getMonth() + 1;
    const selectedDay = date.getDate();

    const aestDateUTC = createAESTDateAsUTC(selectedYear, selectedMonth, selectedDay, 0, 0);

    return aestDateUTC.toISOString();
  };

  const resolveImageUrlForSubmit = async (): Promise<string> => {
    const first = bannerImages[0];
    if (typeof first === "string" && first.trim()) {
      return first.trim();
    }
    if (first instanceof File) {
      return uploadPromoBannerImageToCloudinary(first);
    }
    throw new Error("No image to save");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const imageUrl = await resolveImageUrlForSubmit();
      const altTrim = formData.altText.trim();

      if (editingText) {
        const updateData: UpdatePromoBannerTextPayload = {
          imageUrl,
          altText: altTrim || undefined,
          scheduleType: formData.scheduleType,
          startDate: convertDateToAESTISO(formData.startDate),
          endDate: convertDateToAESTISO(formData.endDate),
          recurrencePattern: formData.recurrencePattern,
          description: formData.description.trim() || undefined,
          isActive: formData.isActive,
        };

        await updateMutation.mutateAsync({ id: editingText.id, data: updateData });
      } else {
        const createData: CreatePromoBannerTextPayload = {
          imageUrl,
          altText: altTrim || undefined,
          scheduleType: formData.scheduleType,
          startDate: convertDateToAESTISO(formData.startDate),
          endDate: convertDateToAESTISO(formData.endDate),
          recurrencePattern: formData.recurrencePattern,
          description: formData.description.trim() || undefined,
          isActive: formData.isActive,
        };

        await createMutation.mutateAsync(createData);
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to save scheduled banner image:", error);
      setErrors((prev) => ({
        ...prev,
        bannerImage: error instanceof Error ? error.message : "Upload failed",
      }));
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
        title={editingText ? "Edit Promo Banner Image" : "Schedule Promo Banner Image"}
        onClose={handleClose}
        showLogo={false}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <FormSection title="Banner image" icon={ImageIcon}>
            <ImageUpload
              images={bannerImages}
              onImagesChange={(imgs) => {
                setBannerImages(imgs);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.bannerImage;
                  return next;
                });
              }}
              maxImages={1}
              maxFileSize={10}
              label=""
              uploadToCloudinary={false}
              disabled={isSubmitting}
            />
            {errors.bannerImage && <p className="text-sm text-red-600 mt-1">{errors.bannerImage}</p>}
            <p className="text-sm text-gray-500 mt-2">
              Image uploads to Cloudinary only when you save. Use PNG or WebP recommended for sharp text.
            </p>
          </FormSection>

          <FormSection title="Accessibility">
            <Input
              id="altText"
              name="altText"
              value={formData.altText}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  altText: e.target.value,
                }))
              }
              label="Alt text (optional)"
              placeholder="Describe the banner for screen readers"
              maxLength={200}
              error={errors.altText}
              disabled={isSubmitting}
            />
          </FormSection>

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
                  All dates are in AEST. The left banner image shows when the schedule matches.
                </p>
              </div>
            </FormSection>
          )}

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
                  Day-of-week matching uses AEST. Optionally bound the pattern with dates below.
                </p>
              </FormSection>

              <FormSection title="Optional Date Boundaries">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-neutral-400">
                    Optionally limit when the recurring pattern applies. Leave empty for indefinite recurrence.
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
              placeholder="Internal notes about this schedule..."
              rows={3}
              maxLength={500}
              disabled={isSubmitting}
            />
          </FormSection>

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
                label="Active (image applies when schedule matches)"
              />
            </div>
          </FormSection>

          {Object.keys(errors).length > 0 && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Please fix the errors above before submitting.</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {editingText ? "Saving..." : "Creating..."}
                </>
              ) : editingText ? (
                "Save changes"
              ) : (
                "Create schedule"
              )}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
};

export default AdminPromoBannerTextModal;
