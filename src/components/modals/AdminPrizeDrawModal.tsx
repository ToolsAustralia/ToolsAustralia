"use client";

import React, { useState } from "react";
import { Calendar, DollarSign, Package, Users } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  Input,
  Textarea,
  Select,
  Button,
  Checkbox,
  DateTimePicker,
  FormSection,
} from "./ui";
import ImageUpload from "@/components/upload/ImageUpload";

interface AdminMiniDrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: MiniDrawFormData) => void;
}

interface MiniDrawFormData {
  title: string;
  description: string;
  prizeValue: number;
  category: string;
  drawDate: string;
  maxEntries: number;
  entryPrice: number;
  images: File[]; // Files to be uploaded to Cloudinary
  uploadedImageUrls: string[]; // URLs after upload
  status: "draft" | "active" | "completed";
  featuredPrize: boolean;
}

const AdminMiniDrawModal: React.FC<AdminMiniDrawModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState<MiniDrawFormData>({
    title: "",
    description: "",
    prizeValue: 0,
    category: "",
    drawDate: "",
    maxEntries: 1000,
    entryPrice: 0,
    images: [],
    uploadedImageUrls: [],
    status: "draft",
    featuredPrize: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Category options for the select dropdown
  const categoryOptions = [
    { value: "power-tools", label: "Power Tools" },
    { value: "hand-tools", label: "Hand Tools" },
    { value: "safety-equipment", label: "Safety Equipment" },
    { value: "tool-storage", label: "Tool Storage" },
    { value: "accessories", label: "Accessories" },
    { value: "outdoor-tools", label: "Outdoor Tools" },
    { value: "automotive", label: "Automotive Tools" },
    { value: "electronics", label: "Electronics" },
  ];

  const statusOptions = [
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "completed", label: "Completed" },
  ];

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "number"
          ? parseFloat(value) || 0
          : type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : value,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // Handle checkbox changes specifically
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: checked,
    }));
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) newErrors.title = "Title is required";
    if (!formData.description.trim()) newErrors.description = "Description is required";
    if (formData.prizeValue <= 0) newErrors.prizeValue = "Prize value must be greater than 0";
    if (!formData.category.trim()) newErrors.category = "Category is required";
    if (!formData.drawDate) newErrors.drawDate = "Draw date is required";
    if (formData.maxEntries <= 0) newErrors.maxEntries = "Max entries must be greater than 0";
    if (formData.uploadedImageUrls.length === 0) newErrors.images = "At least one prize image is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      onSubmit?.(formData);
      handleClose();
    }
  };

  // Handle modal close
  const handleClose = () => {
    setFormData({
      title: "",
      description: "",
      prizeValue: 0,
      category: "",
      drawDate: "",
      maxEntries: 1000,
      entryPrice: 0,
      images: [],
      uploadedImageUrls: [],
      status: "draft",
      featuredPrize: false,
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="4xl" height="fixed" closeOnBackdrop={false}>
      <ModalHeader
        title="Create New Mini Draw"
        subtitle="Set up a new mini draw for your customers"
        onClose={handleClose}
        showLogo={false}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6">
          <FormSection title="Basic Information" icon={Package}>
            <Input
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              label="Prize Title"
              placeholder="e.g., DeWalt 20V Max Cordless Drill Kit"
              required
              error={errors.title}
              className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
            />

            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              label="Description"
              placeholder="Describe the prize, its features, and what makes it special..."
              required
              error={errors.description}
              rows={4}
              className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
              <Input
                id="prizeValue"
                name="prizeValue"
                type="number"
                value={formData.prizeValue}
                onChange={handleInputChange}
                label="Prize Value ($)"
                placeholder="299.99"
                icon={DollarSign}
                min={0}
                step={0.01}
                required
                error={errors.prizeValue}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />

              <Select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                label="Category"
                options={categoryOptions}
                placeholder="Select a category"
                required
                error={errors.category}
              />
            </div>
          </FormSection>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Prize Images <span className="text-red-500">*</span>
            </label>
            <ImageUpload
              onUpload={(urls) => setFormData((prev) => ({ ...prev, uploadedImageUrls: urls }))}
              onError={(error) => console.error("Upload error:", error)}
              maxFiles={4}
              maxSize={10}
              className="w-full"
            />
            {errors.images && <p className="text-sm text-red-600">{errors.images}</p>}
          </div>

          <FormSection title="Draw Settings" icon={Calendar}>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
              <DateTimePicker
                id="drawDate"
                name="drawDate"
                value={formData.drawDate}
                onChange={handleInputChange}
                label="Draw Date"
                required
                error={errors.drawDate}
              />

              <Input
                id="maxEntries"
                name="maxEntries"
                type="number"
                value={formData.maxEntries}
                onChange={handleInputChange}
                label="Max Entries"
                placeholder="1000"
                icon={Users}
                min={1}
                required
                error={errors.maxEntries}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />

              <div>
                <Input
                  id="entryPrice"
                  name="entryPrice"
                  type="number"
                  className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
                  value={formData.entryPrice}
                  onChange={handleInputChange}
                  label="Entry Price ($)"
                  placeholder="0.00"
                  icon={DollarSign}
                  min={0}
                  step={0.01}
                />
                <p className="text-xs text-gray-500 mt-1">Set to 0 for free entries</p>
              </div>
            </div>
          </FormSection>

          <FormSection title="Status & Options">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                label="Status"
                options={statusOptions}
              />

              <div className="flex items-center pt-8">
                <Checkbox
                  id="featuredPrize"
                  name="featuredPrize"
                  checked={formData.featuredPrize}
                  onChange={handleCheckboxChange}
                  label="Featured Prize"
                />
              </div>
            </div>
          </FormSection>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
            <Button type="button" onClick={handleClose} variant="secondary" fullWidth>
              Cancel
            </Button>
            <Button type="submit" variant="primary" fullWidth>
              Create Mini Draw
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
};

export default AdminMiniDrawModal;
