"use client";

import React, { useState, useEffect } from "react";
import { Edit, Save, AlertCircle, Calendar, DollarSign, Package, Sparkles, Plus, Trash2, X } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  Input,
  Button,
  Select,
  Textarea,
  DateTimePicker,
  ImageUpload,
  IconPickerModal,
} from "./ui";

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
    components?: Array<{
      title: string;
      description: string;
      icon?: string;
    }>;
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
  // Remember which highlight card is currently choosing an icon.
  const [iconPickerState, setIconPickerState] = useState<{ open: boolean; componentIndex: number | null }>({
    open: false,
    componentIndex: null,
  });

  // Translate an icon name into a Lucide component so the preview stays in sync.
  const resolveIconComponent = (iconName?: string): LucideIcon => {
    const iconsMap = LucideIcons as unknown as Record<string, LucideIcon>;
    if (!iconName) {
      return iconsMap.Sparkles ?? Sparkles;
    }
    const formatIconKey = (value: string) =>
      value
        .split(/[\s-_]+/)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join("");

    const candidates = [iconName, iconName.charAt(0).toUpperCase() + iconName.slice(1), formatIconKey(iconName)];
    for (const key of candidates) {
      if (iconsMap[key]) {
        return iconsMap[key];
      }
    }
    return iconsMap.Sparkles ?? Sparkles;
  };

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
        components:
          majorDraw.prize.components && majorDraw.prize.components.length > 0
            ? majorDraw.prize.components.map((component) => ({
                title: component.title,
                description: component.description,
                icon: component.icon || "",
              }))
            : [
                {
                  title: "",
                  description: "",
                  icon: "",
                },
              ],
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

  const handleComponentChange = (index: number, field: "title" | "description" | "icon", value: string) => {
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize!,
        components: prev.prize?.components?.map((component, i) =>
          i === index ? { ...component, [field]: value } : component
        ),
      },
    }));

    if (errors["prize.components"]) {
      setErrors((prev) => ({
        ...prev,
        "prize.components": "",
      }));
    }
  };

  const addComponent = () => {
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize!,
        components: [
          ...(prev.prize?.components || []),
          {
            title: "",
            description: "",
            icon: "",
          },
        ],
      },
    }));

    if (errors["prize.components"]) {
      setErrors((prev) => ({
        ...prev,
        "prize.components": "",
      }));
    }
  };

  const removeComponent = (index: number) => {
    setFormData((prev) => {
      const nextComponents = (prev.prize?.components || []).filter((_, i) => i !== index);
      return {
        ...prev,
        prize: {
          ...prev.prize!,
          components:
            nextComponents.length > 0
              ? nextComponents
              : [
                  {
                    title: "",
                    description: "",
                    icon: "",
                  },
                ],
        },
      };
    });

    if (errors["prize.components"]) {
      setErrors((prev) => ({
        ...prev,
        "prize.components": "",
      }));
    }
  };

  const openIconPicker = (index: number) => {
    setIconPickerState({ open: true, componentIndex: index });
  };

  const handleIconSelect = (iconName: string) => {
    // Bail out if we somehow lost the index reference.
    if (iconPickerState.componentIndex === null) {
      return;
    }
    // Persist the selected icon on the target highlight card.
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize!,
        components: prev.prize?.components?.map((component, i) =>
          i === iconPickerState.componentIndex ? { ...component, icon: iconName } : component
        ),
      },
    }));

    if (errors["prize.components"]) {
      setErrors((prev) => ({
        ...prev,
        "prize.components": "",
      }));
    }
    setIconPickerState({ open: false, componentIndex: null });
  };

  const clearIcon = (index: number) => {
    // Clearing the icon keeps the UI simple and avoids stale names.
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize!,
        components: prev.prize?.components?.map((component, i) =>
          i === index ? { ...component, icon: "" } : component
        ),
      },
    }));
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
    const validComponents =
      formData.prize?.components?.filter((component) => component.title.trim() && component.description.trim()) || [];
    if (validComponents.length === 0) {
      newErrors["prize.components"] = "Add at least one prize highlight";
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
              components: formData.prize.components?.map((component) => ({ ...component })),
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

        // Clean up optional data so we don't send empty strings to the backend.
        updatedFormData.prize.components = (updatedFormData.prize.components || [])
          .filter((component) => component.title.trim() && component.description.trim())
          .map((component) => ({
            title: component.title.trim(),
            description: component.description.trim(),
            ...(component.icon && component.icon.trim() ? { icon: component.icon.trim() } : {}),
          }));
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
                This draw&apos;s configuration is locked and cannot be edited. Only basic information can be modified.
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
                <Textarea
                  label="Description"
                  value={formData.description || ""}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  error={errors.description}
                  required
                  rows={3}
                  disabled={majorDraw.configurationLocked}
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
                  disabled={majorDraw.configurationLocked}
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
                <Textarea
                  label="Prize Description"
                  value={formData.prize?.description || ""}
                  onChange={(e) => handlePrizeChange("description", e.target.value)}
                  error={errors["prize.description"]}
                  required
                  rows={3}
                  disabled={majorDraw.configurationLocked}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Input
                  label="Brand (optional)"
                  value={formData.prize?.brand || ""}
                  onChange={(e) => handlePrizeChange("brand", e.target.value)}
                  disabled={majorDraw.configurationLocked}
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
                  disabled={majorDraw.configurationLocked}
                  accept="image/*"
                  error={errors["prize.images"]}
                />
              </div>

              <div className="mt-4 bg-white/70 border border-blue-200 rounded-lg p-4">
                <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Prize Highlights
                </h4>

                <div className="space-y-3">
                  {(formData.prize?.components || []).map((component, index) => (
                    <div key={index} className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2">
                      <div className="flex items-start gap-3">
                        <Input
                          label="Highlight Title"
                          value={component.title}
                          onChange={(e) => handleComponentChange(index, "title", e.target.value)}
                          disabled={majorDraw.configurationLocked}
                          className="flex-1"
                        />
                        {(formData.prize?.components?.length || 0) > 1 && !majorDraw.configurationLocked && (
                          <button
                            type="button"
                            onClick={() => removeComponent(index)}
                            className="text-red-600 hover:text-red-800 text-xs font-semibold mt-6 flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove
                          </button>
                        )}
                      </div>

                      <Textarea
                        label="Highlight Description"
                        value={component.description}
                        onChange={(e) => handleComponentChange(index, "description", e.target.value)}
                        rows={2}
                        disabled={majorDraw.configurationLocked}
                      />

                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide block">
                          Icon (optional)
                        </span>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => openIconPicker(index)}
                            className="text-xs"
                            disabled={majorDraw.configurationLocked}
                          >
                            Choose Icon
                          </Button>
                          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-gray-100">
                              {(() => {
                                const PreviewIcon = resolveIconComponent(component.icon);
                                return <PreviewIcon className="w-4 h-4 text-red-600" />;
                              })()}
                            </span>
                            <span>{component.icon || "None selected"}</span>
                          </div>
                          {component.icon && !majorDraw.configurationLocked && (
                            <button
                              type="button"
                              onClick={() => clearIcon(index)}
                              className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                            >
                              <X className="w-3 h-3" />
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {!majorDraw.configurationLocked && (
                    <button
                      type="button"
                      onClick={addComponent}
                      className="text-blue-600 hover:text-blue-800 text-sm font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add Highlight
                    </button>
                  )}

                  {errors["prize.components"] && <p className="text-red-600 text-sm">{errors["prize.components"]}</p>}
                </div>
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

      <IconPickerModal
        isOpen={iconPickerState.open}
        onClose={() => setIconPickerState({ open: false, componentIndex: null })}
        onSelect={handleIconSelect}
        title="Select Highlight Icon"
      />
    </>
  );
}
