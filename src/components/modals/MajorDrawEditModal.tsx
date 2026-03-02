"use client";

import React, { useState, useEffect } from "react";
import { Edit, Save, AlertCircle, Calendar, DollarSign, Package } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  Input,
  Button,
  Select,
  DateTimePicker,
  ImageUpload,
} from "./ui";
import RichTextEditor from "@/components/ui/RichTextEditor";

// Types
interface MajorDrawData {
  _id: string;
  name: string;
  description: string;
  prize: {
    name: string;
    description: string;
    value: number;
    images: (string | File)[];
    brand?: string;
    specifications?: Record<string, string | number | string[]>;
    terms?: string[];
  };
  drawDate: string;
  activationDate: string;
  freezeEntriesAt: string;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  configurationLocked: boolean;
}

interface MajorDrawEditModalProps {
  isOpen: boolean;
  onCloseAction: () => void;
  onSaveAction: (data: Partial<MajorDrawData>) => Promise<void>;
  majorDraw: MajorDrawData | null;
  isLoading?: boolean;
}

export default function MajorDrawEditModal({
  isOpen,
  onCloseAction,
  onSaveAction,
  majorDraw,
  isLoading = false,
}: MajorDrawEditModalProps) {
  const [formData, setFormData] = useState<Partial<MajorDrawData>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initializedDrawId, setInitializedDrawId] = useState<string | null>(null);

  // Initialize form data when majorDraw changes
  useEffect(() => {
    if (!isOpen) {
      setInitializedDrawId(null);
      return;
    }

    if (!majorDraw) return;
    if (initializedDrawId === majorDraw._id) return;

    setFormData({
      name: majorDraw.name,
      description: majorDraw.description,
      prize: {
        name: majorDraw.prize.name,
        description: majorDraw.prize.description,
        value: majorDraw.prize.value,
        images: [...(majorDraw.prize.images || [])],
        brand: majorDraw.prize.brand || "",
        specifications: { ...(majorDraw.prize.specifications || {}) },
        terms: [...(majorDraw.prize.terms || [])],
      },
      status: majorDraw.status,
      drawDate: majorDraw.drawDate,
      activationDate: majorDraw.activationDate,
      freezeEntriesAt: majorDraw.freezeEntriesAt,
      configurationLocked: majorDraw.configurationLocked,
    });
    setErrors({});
    setInitializedDrawId(majorDraw._id);
  }, [isOpen, majorDraw, initializedDrawId]);

  const handleInputChange = (field: string, value: string | Date) => {
    setFormData((prev) => {
      // We only expect ISO strings or raw values from text inputs here.
      const nextValue = value instanceof Date ? value.toISOString() : value;
      const newFormData: Partial<MajorDrawData> = {
        ...prev,
        [field]: nextValue,
      };

      // Keep freeze entries aligned automatically when draw date changes and freeze has not been set by the user.
      if (field === "drawDate" && typeof nextValue === "string") {
        const drawDate = new Date(nextValue);
        if (!Number.isNaN(drawDate.getTime())) {
          if (!prev.freezeEntriesAt || (prev.freezeEntriesAt && prev.freezeEntriesAt === majorDraw?.freezeEntriesAt)) {
            const freezeDate = new Date(drawDate.getTime() - 30 * 60 * 1000);
            newFormData.freezeEntriesAt = freezeDate.toISOString();
          }
        }
      }

      return newFormData;
    });

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: "",
      }));
    }
  };

  const handlePrizeChange = (field: string, value: string | number | string[] | (string | File)[]) => {
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize!,
        [field]: value,
      },
    }));

    // Clear error when user starts typing
    if (errors[`prize.${field}`]) {
      setErrors((prev) => ({
        ...prev,
        [`prize.${field}`]: "",
      }));
    }
  };


  // Handle image changes - allow multiple
  const handleImagesChange = (images: (string | File)[]) => {
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize!,
        images,
      },
    }));

    if (errors["prize.images"]) {
      setErrors((prev) => ({
        ...prev,
        "prize.images": "",
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Basic validation
    if (!formData.name?.trim()) {
      newErrors.name = "Draw name is required";
    }
    if (!formData.description?.trim()) {
      newErrors.description = "Description is required";
    }
    if (!formData.prize?.name?.trim()) {
      newErrors["prize.name"] = "Prize name is required";
    }
    if (!formData.prize?.description?.trim()) {
      newErrors["prize.description"] = "Prize description is required";
    }
    if (!formData.prize?.value || formData.prize.value <= 0) {
      newErrors["prize.value"] = "Prize value must be greater than 0";
    }
    if (!formData.prize?.images || formData.prize.images.length === 0) {
      newErrors["prize.images"] = "At least one prize image is required";
    }

    // Date validation
    if (!formData.drawDate) {
      newErrors.drawDate = "Draw date is required";
    }
    if (!formData.activationDate) {
      newErrors.activationDate = "Activation date is required";
    }
    if (!formData.freezeEntriesAt) {
      newErrors.freezeEntriesAt = "Freeze entries date is required";
    }

    // Date logic validation
    if (formData.activationDate && formData.drawDate && formData.activationDate >= formData.drawDate) {
      newErrors.activationDate = "Activation date must be before draw date";
    }
    if (formData.freezeEntriesAt && formData.drawDate && formData.freezeEntriesAt >= formData.drawDate) {
      newErrors.freezeEntriesAt = "Freeze entries date must be before draw date";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedFormData: Partial<MajorDrawData> = {
        ...formData,
        prize: formData.prize
          ? {
              ...formData.prize,
              images: [...(formData.prize.images || [])],
              specifications: { ...(formData.prize.specifications || {}) },
              terms: formData.prize.terms ? [...formData.prize.terms] : [],
            }
          : undefined,
      };

      if (updatedFormData.prize?.images && updatedFormData.prize.images.length > 0) {
        const uploadedImages: string[] = [];

        for (const image of updatedFormData.prize.images) {
          if (typeof image === "string") {
            if (image) {
              uploadedImages.push(image);
            }
            continue;
          }

          if (image && typeof image === "object" && "size" in image && "type" in image) {
            try {
              const uploadFormData = new FormData();
              uploadFormData.append("file", image);
              uploadFormData.append("folder", "major-draws");

              const response = await fetch("/api/upload/cloudinary", {
                method: "POST",
                body: uploadFormData,
              });

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to upload image");
              }

              const data = await response.json();
              uploadedImages.push(data.url);
            } catch (uploadError) {
              console.error("Failed to upload image:", uploadError);
              setErrors({ submit: "Failed to upload image. Please try again." });
              return;
            }
          }
        }

        updatedFormData.prize.images = uploadedImages;
      }

      if (updatedFormData.prize) {
        const trimmedBrand = updatedFormData.prize.brand?.toString().trim();
        if (trimmedBrand) {
          updatedFormData.prize.brand = trimmedBrand;
        } else {
          delete updatedFormData.prize.brand;
        }

      }

      await onSaveAction(updatedFormData);
      onCloseAction();
    } catch (error) {
      console.error("Failed to save major draw:", error);
      setErrors({ submit: "Failed to save changes. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!majorDraw) return null;

  return (
    <>
      <ModalContainer isOpen={isOpen} onClose={onCloseAction} size="4xl" height="fixed">
        {/* Header */}
        <ModalHeader title="Edit Major Draw" subtitle={`Editing: ${majorDraw.name}`} onClose={onCloseAction} />

        {/* Content */}
        <ModalContent>
          {errors.submit && (
            <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span className="text-red-700 text-sm">{errors.submit}</span>
            </div>
          )}

          {majorDraw.configurationLocked && (
            <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">Configuration Locked</span>
              </div>
              <p className="text-sm text-yellow-700">
                This draw&apos;s prize value and dates are locked and cannot be edited. Prize images, name, description, and other details can still be modified.
              </p>
            </div>
          )}

          {majorDraw.status === "active" && !majorDraw.configurationLocked && (
            <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">Active Draw</span>
              </div>
              <p className="text-sm text-blue-700">
                This draw is currently active. Changes will affect users who are currently entering. Please review
                changes carefully.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Edit className="w-5 h-5" />
                Basic Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Draw Name"
                  value={formData.name || ""}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  error={errors.name}
                  required
                  disabled={majorDraw.configurationLocked}
                />

                <Select
                  label="Status"
                  value={formData.status || majorDraw.status}
                  onChange={(e) => handleInputChange("status", e.target.value)}
                  options={[
                    { value: "queued", label: "Queued" },
                    { value: "active", label: "Active" },
                    { value: "frozen", label: "Frozen" },
                    { value: "completed", label: "Completed" },
                    { value: "cancelled", label: "Cancelled" },
                  ]}
                  disabled={majorDraw.configurationLocked}
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description <span className="text-red-500">*</span>
                </label>
                {errors.description && (
                  <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.description}
                  </p>
                )}
                <RichTextEditor
                  value={formData.description || ""}
                  onChange={(html) => handleInputChange("description", html)}
                  placeholder="Enter the major draw description..."
                  minHeight="150px"
                />
              </div>
            </div>

            {/* Prize Information */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Prize Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Prize Name"
                  value={formData.prize?.name || ""}
                  onChange={(e) => handlePrizeChange("name", e.target.value)}
                  error={errors["prize.name"]}
                  required
                />

                <Input
                  label="Prize Value ($)"
                  type="number"
                  value={formData.prize?.value || ""}
                  onChange={(e) => handlePrizeChange("value", parseFloat(e.target.value) || 0)}
                  error={errors["prize.value"]}
                  required
                  min={0}
                  step={0.01}
                  icon={DollarSign}
                  placeholder="e.g., 75,000.00"
                  disabled={majorDraw.configurationLocked}
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prize Description <span className="text-red-500">*</span>
                </label>
                {errors["prize.description"] && (
                  <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors["prize.description"]}
                  </p>
                )}
                <RichTextEditor
                  value={formData.prize?.description || ""}
                  onChange={(html) => handlePrizeChange("description", html)}
                  placeholder="Enter the prize description..."
                  minHeight="150px"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Input
                  label="Brand (optional)"
                  value={formData.prize?.brand || ""}
                  onChange={(e) => handlePrizeChange("brand", e.target.value)}
                />
              </div>

              <div className="mt-4">
                <ImageUpload
                  label="Prize Gallery"
                  images={formData.prize?.images || []}
                  onImagesChange={handleImagesChange}
                  maxImages={25}
                  maxFileSize={10}
                  uploadToCloudinary={false}
                  storeLocally={true}
                  accept="image/*"
                  error={errors["prize.images"]}
                />
              </div>
            </div>

            {/* Dates */}
            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Important Dates
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <DateTimePicker
                  label="Activation Date"
                  value={formData.activationDate || ""}
                  onChange={(e) => handleInputChange("activationDate", e.target.value)}
                  error={errors.activationDate}
                  required
                  disabled={majorDraw?.configurationLocked}
                />

                <DateTimePicker
                  label="Freeze Entries At"
                  value={formData.freezeEntriesAt || ""}
                  onChange={(e) => handleInputChange("freezeEntriesAt", e.target.value)}
                  error={errors.freezeEntriesAt}
                  required
                  disabled={majorDraw?.configurationLocked}
                />

                <DateTimePicker
                  label="Draw Date"
                  value={formData.drawDate || ""}
                  onChange={(e) => handleInputChange("drawDate", e.target.value)}
                  error={errors.drawDate}
                  required
                  disabled={majorDraw?.configurationLocked}
                />
              </div>

              {/* Date Relationship Info */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <div className="text-blue-600 text-sm">💡</div>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Date Relationships:</p>
                    <ul className="space-y-1 text-xs">
                      <li>
                        • <strong>Activation Date</strong> = When draw becomes visible to users
                      </li>
                      <li>
                        • <strong>Freeze Entries At</strong> = When entries stop being accepted (30 min before draw)
                      </li>
                      <li>
                        • <strong>Draw Date</strong> = When the actual draw happens
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onCloseAction} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isLoading} loading={isSubmitting} icon={Save}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </ModalContent>
      </ModalContainer>
    </>
  );
}
