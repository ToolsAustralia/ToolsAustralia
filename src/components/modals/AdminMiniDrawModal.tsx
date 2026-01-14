"use client";

import React, { useState } from "react";
import { ClipboardList, Trophy, AlertTriangle, Settings } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  Input,
  Textarea,
  Select,
  Button,
  FormSection,
  ImageUpload,
} from "./ui";
import { brandOptions } from "@/utils/brand-utils";
import RichTextEditor from "@/components/ui/RichTextEditor";

interface AdminMiniDrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface MiniDrawFormData {
  name: string;
  description: string;
  brandId: string;
  minimumEntries: number;
  status: "active" | "cancelled";
  prize: {
    name: string;
    description: string;
    value: number;
    images: File[]; // Changed from string[] to File[] for local storage
    category: string;
  };
}

const AdminMiniDrawModal: React.FC<AdminMiniDrawModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<MiniDrawFormData>({
    name: "",
    description: "",
    brandId: brandOptions[0]?.value ?? "",
    minimumEntries: 0,
    status: "active",
    prize: {
      name: "",
      description: "",
      value: 0,
      images: [],
      category: "other",
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.startsWith("prize.")) {
      const prizeField = name.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        prize: {
          ...prev.prize,
          [prizeField]: prizeField === "value" ? parseFloat(value) || 0 : value,
        },
      }));
    } else if (name === "brandId") {
      setFormData((prev) => ({
        ...prev,
        brandId: value,
      }));
    } else {
      const nextValue = name === "minimumEntries" ? (value === "" ? 0 : parseInt(value, 10) || 0) : value;
      setFormData((prev) => ({
        ...prev,
        [name]: nextValue,
      }));
    }
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleImageUpload = (images: (File | string)[]) => {
    // Store File objects locally (preview only, no upload yet)
    const fileObjects = images.filter((img): img is File => img instanceof File);
    setFormData((prev) => ({
      ...prev,
      prize: {
        ...prev.prize,
        images: fileObjects,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    try {
      // Send FormData with files - server will validate first, then upload images only if validation passes
      const formDataToSend = new FormData();

      // Add all text fields
      formDataToSend.append("name", formData.name);
      formDataToSend.append("description", formData.description);
      formDataToSend.append("minimumEntries", formData.minimumEntries.toString());
      formDataToSend.append("brandId", formData.brandId);
      formDataToSend.append("status", formData.status);
      formDataToSend.append("prize.name", formData.prize.name);
      formDataToSend.append("prize.description", formData.prize.description);
      formDataToSend.append("prize.value", formData.prize.value.toString());
      formDataToSend.append("prize.category", formData.prize.category);

      // Add image files
      formData.prize.images.forEach((file) => {
        formDataToSend.append("images", file);
      });

      // Send to create API - server will validate first, then upload images only if validation succeeds
      const response = await fetch("/api/admin/mini-draw/create", {
        method: "POST",
        body: formDataToSend,
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details) {
          setErrors(
            data.details.reduce((acc: Record<string, string>, detail: { field: string; message: string }) => {
              acc[detail.field] = detail.message;
              return acc;
            }, {})
          );
        } else {
          setErrors({ submit: data.error || "Failed to create mini draw" });
        }
        return;
      }

      // Success
      if (onSuccess) {
        onSuccess();
      }
      handleClose();
    } catch (error) {
      console.error("Error creating mini draw:", error);
      setErrors({ submit: "Failed to create mini draw. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      description: "",
      brandId: brandOptions[0]?.value ?? "",
      minimumEntries: 0,
      status: "active",
      prize: {
        name: "",
        description: "",
        value: 0,
        images: [],
        category: "other",
      },
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="4xl" height="fixed" closeOnBackdrop={false}>
      <ModalHeader
        title="Create New Mini Draw"
        subtitle="Set up a new mini draw (no monthly restriction - multiple can be active)"
        onClose={handleClose}
        showLogo={false}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6">
          <FormSection title="Basic Information" icon={ClipboardList}>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              label="Mini Draw Name"
              placeholder="e.g., Weekend Special Mini Draw"
              required
              error={errors.name}
            />

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              {errors.description && (
                <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {errors.description}
                </p>
              )}
              <RichTextEditor
                value={formData.description}
                onChange={(html) => {
                  const syntheticEvent = {
                    target: { name: "description", value: html },
                  } as React.ChangeEvent<HTMLInputElement>;
                  handleInputChange(syntheticEvent);
                }}
                placeholder="Describe the mini draw..."
                minHeight="150px"
              />
            </div>
          </FormSection>

          <FormSection title="Prize Details" icon={Trophy}>
            <Input
              id="prize.name"
              name="prize.name"
              value={formData.prize.name}
              onChange={handleInputChange}
              label="Prize Name"
              placeholder="e.g., $500 Gift Card"
              required
              error={errors["prize.name"]}
            />

            <div>
              <label htmlFor="prize.description" className="block text-sm font-medium text-gray-700 mb-2">
                Prize Description <span className="text-red-500">*</span>
              </label>
              {errors["prize.description"] && (
                <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {errors["prize.description"]}
                </p>
              )}
              <RichTextEditor
                value={formData.prize.description}
                onChange={(html) => {
                  const syntheticEvent = {
                    target: { name: "prize.description", value: html },
                  } as React.ChangeEvent<HTMLInputElement>;
                  handleInputChange(syntheticEvent);
                }}
                placeholder="Describe the prize..."
                minHeight="150px"
              />
            </div>

            <Select
              id="brandId"
              name="brandId"
              value={formData.brandId}
              onChange={handleInputChange}
              label="Prize Brand"
              required
              error={errors.brandId}
              options={brandOptions.map((brand) => ({ value: brand.value, label: brand.label }))}
            />

            <Input
              id="prize.value"
              name="prize.value"
              type="number"
              value={formData.prize.value === 0 ? "" : formData.prize.value}
              onChange={handleInputChange}
              label="Prize Value ($)"
              placeholder="0"
              required
              min={0}
              step={0.01}
              error={errors["prize.value"]}
            />

            <ImageUpload
              label="Prize Images"
              images={formData.prize.images}
              onImagesChange={handleImageUpload}
              maxImages={25}
              uploadToCloudinary={false}
            />
          </FormSection>

          <FormSection title="Draw Configuration" icon={Settings}>
            <Input
              id="minimumEntries"
              name="minimumEntries"
              type="number"
              value={formData.minimumEntries === 0 ? "" : formData.minimumEntries}
              onChange={handleInputChange}
              label="Minimum Entries"
              placeholder="e.g., 100"
              required
              min={1}
              step={1}
              error={errors.minimumEntries}
            />
            <p className="text-sm text-gray-500 mt-1">
              Draw will automatically close when this many entries are reached
            </p>

            <Select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              label="Initial Status"
              options={[
                { value: "active", label: "Active (accept entries immediately)" },
                { value: "cancelled", label: "Cancelled (set up for later)" },
              ]}
              error={errors.status}
            />
          </FormSection>

          {errors.submit && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>{errors.submit}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Mini Draw"}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
};

export default AdminMiniDrawModal;
