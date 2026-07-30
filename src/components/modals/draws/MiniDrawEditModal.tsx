"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Settings, Trophy } from "lucide-react";
import { brandOptions } from "@/utils/brand-utils";

import {
  FormSection,
  ImageUpload,
  Input,
  Select,
} from "../ui";
import RichTextEditor from "@/components/ui/RichTextEditor";
import DrawModalShell from "./DrawModalShell";

interface MiniDrawPrizeForm {
  name: string;
  description: string;
  value: number;
  images: (string | File)[];
  category: string;
}

interface MiniDrawFormState {
  name: string;
  description: string;
  minimumEntries: number;
  status: "active" | "completed" | "cancelled";
  brandId: string;
  prize: MiniDrawPrizeForm;
}

export interface AdminMiniDrawSummary {
  _id: string;
  name: string;
  description: string;
  minimumEntries: number;
  status: "active" | "completed" | "cancelled";
  configurationLocked?: boolean;
  brandId: string;
  displayOrder: number;
  prize: {
    name: string;
    description: string;
    value: number;
    images: string[];
    category: string;
  };
}

export interface MiniDrawEditPayload {
  id: string;
  name: string;
  description: string;
  minimumEntries: number;
  status: "active" | "completed" | "cancelled";
  brandId: string;
  prize: {
    name: string;
    description: string;
    value: number;
    category: string;
    images: string[];
  };
}

interface MiniDrawEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  miniDraw: AdminMiniDrawSummary | null;
  onSave: (payload: MiniDrawEditPayload) => Promise<void>;
  isSaving?: boolean;
}

export default function MiniDrawEditModal({
  isOpen,
  onClose,
  miniDraw,
  onSave,
  isSaving = false,
}: MiniDrawEditModalProps) {
  const [formState, setFormState] = useState<MiniDrawFormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const prizeImages = useMemo(
    () => formState?.prize.images ?? [],
    [formState?.prize?.images]
  );
  const disableConfigFields = miniDraw?.configurationLocked ?? false;

  useEffect(() => {
    if (!isOpen) {
      setFormState(null);
      setErrors({});
      return;
    }

    if (miniDraw) {
      setFormState({
        name: miniDraw.name,
        description: miniDraw.description,
        minimumEntries: miniDraw.minimumEntries,
        status: miniDraw.status,
        brandId: miniDraw.brandId,
        prize: {
          name: miniDraw.prize.name,
          description: miniDraw.prize.description,
          value: miniDraw.prize.value,
          images: [...miniDraw.prize.images],
          category: miniDraw.prize.category,
        },
      });
      setErrors({});
    }
  }, [isOpen, miniDraw]);

  const handleFieldChange = (
    field: keyof MiniDrawFormState,
    value: string | number,
    nestedField?: keyof MiniDrawPrizeForm
  ) => {
    if (!formState) return;

    setFormState((prev) => {
      if (!prev) return prev;
      if (nestedField) {
        const updatedPrize: MiniDrawPrizeForm = {
          ...prev.prize,
          [nestedField]: value,
        } as MiniDrawPrizeForm;
        return { ...prev, prize: updatedPrize };
      }
      return { ...prev, [field]: value };
    });

    const errorKey = nestedField ? `prize.${nestedField}` : field;
    if (errors[errorKey]) {
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated[errorKey];
        return updated;
      });
    }
  };

  const handleImagesChange = (images: (File | string)[]) => {
    if (!formState) return;
    setFormState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        prize: {
          ...prev.prize,
          images,
        },
      };
    });
    if (errors["prize.images"]) {
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated["prize.images"];
        return updated;
      });
    }
  };

  const existingImageUrls = useMemo(() => {
    // Keep URLs for images that already live in Cloudinary so we don't upload them again.
    return prizeImages.filter((image): image is string => typeof image === "string");
  }, [prizeImages]);

  const validateForm = () => {
    if (!formState) return false;
    const nextErrors: Record<string, string> = {};

    if (!formState.name.trim()) {
      nextErrors.name = "Mini draw name is required.";
    }
    if (!formState.description.trim()) {
      nextErrors.description = "Please provide a brief description.";
    }
    if (!formState.minimumEntries || formState.minimumEntries < 1) {
      nextErrors.minimumEntries = "Minimum entries must be at least 1.";
    }

    if (!formState.prize.name.trim()) {
      nextErrors["prize.name"] = "Prize name is required.";
    }
    if (!formState.prize.description.trim()) {
      nextErrors["prize.description"] = "Please describe the prize.";
    }
    if (!formState.prize.value || formState.prize.value <= 0) {
      nextErrors["prize.value"] = "Prize value must be greater than zero.";
    }
    if ((formState.prize.images || []).length === 0) {
      nextErrors["prize.images"] = "Upload at least one prize image.";
    }
    if (!formState.brandId) {
      nextErrors.brandId = "Select a prize brand.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // Invoked by DrawModalShell's primary, which sits outside the <form>.
  const handleSubmit = async () => {
    if (!miniDraw || !formState) return;

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors((prev) => {
      const updated = { ...prev };
      delete updated.submit;
      return updated;
    });

    try {
      const newFiles = prizeImages.filter((image): image is File => image instanceof File);
      const finalImages: string[] = [...existingImageUrls];

      for (const file of newFiles) {
        // Upload each new file through our secure upload API so validation happens server-side.
        const uploadFormData = new FormData();
        uploadFormData.append("file", file);
        uploadFormData.append("folder", "mini-draws");

        const response = await fetch("/api/upload/cloudinary", {
          method: "POST",
          body: uploadFormData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to upload prize image.");
        }

        const data = await response.json();
        finalImages.push(data.url);
      }

      const payload: MiniDrawEditPayload = {
        id: miniDraw._id,
        name: formState.name.trim(),
        description: formState.description.trim(),
        minimumEntries: formState.minimumEntries,
        status: formState.status,
        brandId: formState.brandId,
        prize: {
          name: formState.prize.name.trim(),
          description: formState.prize.description.trim(),
          value: Number(formState.prize.value),
          category: formState.prize.category,
          images: finalImages,
        },
      };

      await onSave(payload);
      onClose();
    } catch (error) {
      console.error("Failed to save mini draw:", error);
      setErrors((prev) => ({
        ...prev,
        submit: error instanceof Error ? error.message : "Failed to save mini draw. Please try again.",
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !miniDraw || !formState) {
    return null;
  }

  return (
    <DrawModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="4xl"
      eyebrow={`Mini draw · ${miniDraw.status}`}
      title="Edit mini draw"
      primaryLabel="Save mini draw"
      onPrimary={() => void handleSubmit()}
      isSubmitting={isSubmitting || isSaving}
      submittingLabel="Saving…"
      // Field-level errors only — `submit` is a request failure, shown as a banner.
      errorCount={Object.keys(errors).filter((k) => k !== "submit").length}
    >
        {miniDraw.configurationLocked && (
          <div className="mb-[14px] rounded-[9px] border border-[var(--warn-line)] bg-[var(--warn-bg)] px-[12px] py-[10px]">
            <div className="flex items-center gap-[7px] text-[12.5px] font-semibold text-[var(--warn)]">
              <AlertTriangle className="h-[15px] w-[15px] shrink-0" aria-hidden />
              Configuration locked
            </div>
            <p className="mt-[3px] text-[11.5px] leading-[1.5] text-[var(--warn)]">
              Entries are frozen for this draw, so prize details cannot be changed until the configuration unlocks.
            </p>
          </div>
        )}

        {errors.submit && (
          <div
            role="alert"
            className="mb-[14px] rounded-[9px] border border-[var(--danger-line)] bg-[var(--danger-bg)] px-[12px] py-[10px]"
          >
            <div className="flex items-center gap-[7px] text-[12.5px] font-semibold text-[var(--danger)]">
              <AlertTriangle className="h-[15px] w-[15px] shrink-0" aria-hidden />
              Save failed
            </div>
            <p className="mt-[3px] text-[11.5px] leading-[1.5] text-[var(--text2)]">{errors.submit}</p>
          </div>
        )}

        <div className="flex flex-col gap-[16px]">
          <FormSection title="Basic Information" icon={ClipboardList}>
            <Input
              id="name"
              name="name"
              label="Mini Draw Name"
              value={formState.name}
              onChange={(event) => handleFieldChange("name", event.target.value)}
              error={errors.name}
              required
              disabled={disableConfigFields}
            />

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              {errors.description && (
                <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {errors.description}
                </p>
              )}
              <RichTextEditor
                value={formState.description}
                onChange={(html) => handleFieldChange("description", html)}
                placeholder="Enter the mini draw description..."
                minHeight="150px"
              />
            </div>
          </FormSection>

          <FormSection title="Prize Details" icon={Trophy}>
            <Input
              id="prize.name"
              name="prize.name"
              label="Prize Name"
              value={formState.prize.name}
              onChange={(event) => handleFieldChange("prize", event.target.value, "name")}
              error={errors["prize.name"]}
              required
              disabled={disableConfigFields}
            />

            <div>
              <label htmlFor="prize.description" className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
                Prize Description <span className="text-red-500">*</span>
              </label>
              {errors["prize.description"] && (
                <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {errors["prize.description"]}
                </p>
              )}
              <RichTextEditor
                value={formState.prize.description}
                onChange={(html) => handleFieldChange("prize", html, "description")}
                placeholder="Enter the prize description..."
                minHeight="150px"
              />
            </div>

          <Select
            id="brandId"
            name="brandId"
            label="Prize Brand"
            value={formState.brandId}
            onChange={(event) => handleFieldChange("brandId", event.target.value)}
            options={brandOptions.map((brand) => ({ value: brand.value, label: brand.label }))}
            error={errors.brandId}
            required
            disabled={disableConfigFields}
          />

            <Input
              id="prize.value"
              name="prize.value"
              label="Prize Value ($)"
              type="number"
              value={formState.prize.value === 0 ? "" : formState.prize.value}
              onChange={(event) =>
                handleFieldChange("prize", event.target.value === "" ? 0 : Number(event.target.value), "value")
              }
              error={errors["prize.value"]}
              min={0}
              step={0.01}
              required
              disabled={disableConfigFields}
            />

            <ImageUpload
              label="Prize Images"
              images={prizeImages}
              onImagesChange={handleImagesChange}
              maxImages={25}
              maxFileSize={10}
              uploadToCloudinary={false}
              storeLocally
              disabled={disableConfigFields}
              error={errors["prize.images"]}
            />
          </FormSection>

          <FormSection title="Draw Configuration" icon={Settings}>
            <Input
              id="minimumEntries"
              name="minimumEntries"
              label="Minimum Entries"
              type="number"
              value={formState.minimumEntries === 0 ? "" : formState.minimumEntries}
              onChange={(event) => {
                const raw = event.target.value;
                const parsed = raw === "" ? 0 : Number.parseInt(raw, 10);
                handleFieldChange("minimumEntries", Number.isNaN(parsed) ? 0 : parsed);
              }}
              error={errors.minimumEntries}
              min={1}
              step={1}
              required
              disabled={disableConfigFields}
            />

            <Select
              id="status"
              name="status"
              label="Status"
              value={formState.status}
              onChange={(event) => handleFieldChange("status", event.target.value as MiniDrawFormState["status"])}
              options={[
                { value: "active", label: "Active" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </FormSection>

        </div>
    </DrawModalShell>
  );
}
