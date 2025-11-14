"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Save, Settings, Trophy } from "lucide-react";

import {
  Button,
  FormSection,
  ImageUpload,
  Input,
  ModalContainer,
  ModalContent,
  ModalHeader,
  Select,
  Textarea,
} from "./ui";

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
  prize: MiniDrawPrizeForm;
}

export interface AdminMiniDrawSummary {
  _id: string;
  name: string;
  description: string;
  minimumEntries: number;
  status: "active" | "completed" | "cancelled";
  configurationLocked?: boolean;
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

const categoryOptions = [
  { value: "vehicle", label: "Vehicle" },
  { value: "electronics", label: "Electronics" },
  { value: "travel", label: "Travel" },
  { value: "cash", label: "Cash" },
  { value: "experience", label: "Experience" },
  { value: "home", label: "Home" },
  { value: "fashion", label: "Fashion" },
  { value: "sports", label: "Sports" },
  { value: "other", label: "Other" },
];

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
  const prizeImages = formState?.prize.images ?? [];
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
    if (!formState.prize.category) {
      nextErrors["prize.category"] = "Select a prize category.";
    }
    if ((formState.prize.images || []).length === 0) {
      nextErrors["prize.images"] = "Upload at least one prize image.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" closeOnBackdrop={false}>
      <ModalHeader
        title="Edit Mini Draw"
        subtitle={`Update settings for ${miniDraw.name}`}
        onClose={onClose}
        showLogo={false}
      />

      <ModalContent>
        {miniDraw.configurationLocked && (
          <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-800">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Configuration Locked
            </div>
            <p className="mt-1 text-sm">
              Entries are frozen for this draw, so prize details cannot be changed until the configuration unlocks.
            </p>
          </div>
        )}

        {errors.submit && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Save failed
            </div>
            <p className="mt-1 text-sm">{errors.submit}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
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

            <Textarea
              id="description"
              name="description"
              label="Description"
              value={formState.description}
              onChange={(event) => handleFieldChange("description", event.target.value)}
              error={errors.description}
              rows={4}
              required
              disabled={disableConfigFields}
            />
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

            <Textarea
              id="prize.description"
              name="prize.description"
              label="Prize Description"
              value={formState.prize.description}
              onChange={(event) => handleFieldChange("prize", event.target.value, "description")}
              error={errors["prize.description"]}
              rows={3}
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

            <Select
              id="prize.category"
              name="prize.category"
              label="Prize Category"
              value={formState.prize.category}
              onChange={(event) => handleFieldChange("prize", event.target.value, "category")}
              options={categoryOptions}
              error={errors["prize.category"]}
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

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting || isSaving}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon={Save}
              loading={isSubmitting || isSaving}
              disabled={isSubmitting || isSaving}
            >
              {isSubmitting || isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
}
