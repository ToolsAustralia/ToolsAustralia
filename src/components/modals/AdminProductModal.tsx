"use client";

import React, { useState } from "react";
import { Package, DollarSign, Warehouse, Tag, FileText } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  Input,
  Textarea,
  Select,
  Button,
  Checkbox,
  FormSection,
} from "./ui";
import ImageUpload from "@/components/upload/ImageUpload";

interface AdminProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: ProductFormData) => void;
}

interface ProductFormData {
  name: string;
  brand: string;
  description: string;
  shortDescription: string;
  price: number;
  originalPrice?: number;
  category: string;
  subcategory: string;
  sku: string;
  stock: number;
  weight: number;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  images: File[]; // Files to be uploaded to Cloudinary
  uploadedImageUrls: string[]; // URLs after upload
  specifications: string;
  warranty: string;
  status: "active" | "inactive" | "draft";
  featured: boolean;
  onSale: boolean;
  freeShipping: boolean;
  tags: string;
}

const AdminProductModal: React.FC<AdminProductModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    brand: "",
    description: "",
    shortDescription: "",
    price: 0,
    originalPrice: undefined,
    category: "",
    subcategory: "",
    sku: "",
    stock: 0,
    weight: 0,
    dimensions: {
      length: 0,
      width: 0,
      height: 0,
    },
    images: [],
    uploadedImageUrls: [],
    specifications: "",
    warranty: "",
    status: "active",
    featured: false,
    onSale: false,
    freeShipping: false,
    tags: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Category options
  const categoryOptions = [
    { value: "power-tools", label: "Power Tools" },
    { value: "hand-tools", label: "Hand Tools" },
    { value: "safety-equipment", label: "Safety Equipment" },
    { value: "tool-storage", label: "Tool Storage" },
    { value: "accessories", label: "Accessories" },
    { value: "outdoor-tools", label: "Outdoor Tools" },
    { value: "automotive", label: "Automotive Tools" },
    { value: "electronics", label: "Electronics" },
    { value: "hardware", label: "Hardware" },
    { value: "measuring", label: "Measuring Tools" },
  ];

  // Brand options
  const brandOptions = [
    { value: "dewalt", label: "DeWalt" },
    { value: "makita", label: "Makita" },
    { value: "milwaukee", label: "Milwaukee" },
    { value: "bosch", label: "Bosch" },
    { value: "ryobi", label: "Ryobi" },
    { value: "stanley", label: "Stanley" },
    { value: "kincrome", label: "Kincrome" },
    { value: "sidchrome", label: "Sidchrome" },
    { value: "festool", label: "Festool" },
    { value: "black-decker", label: "Black & Decker" },
    { value: "other", label: "Other" },
  ];

  // Status options
  const statusOptions = [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "draft", label: "Draft" },
  ];

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    // Safety check for name property
    if (!name) return;

    if (name.includes(".")) {
      // Handle nested properties (dimensions)
      const [parent, child] = name.split(".");
      if (parent === "dimensions") {
        setFormData((prev) => ({
          ...prev,
          dimensions: {
            ...prev.dimensions,
            [child]: type === "number" ? parseFloat(value) || 0 : value,
          },
        }));
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]:
          type === "number"
            ? parseFloat(value) || 0
            : type === "checkbox"
            ? (e.target as HTMLInputElement).checked
            : value,
      }));
    }

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

    if (!formData.name.trim()) newErrors.name = "Product name is required";
    if (!formData.brand.trim()) newErrors.brand = "Brand is required";
    if (!formData.description.trim()) newErrors.description = "Description is required";
    if (formData.price <= 0) newErrors.price = "Price must be greater than 0";
    if (!formData.category.trim()) newErrors.category = "Category is required";
    if (!formData.sku.trim()) newErrors.sku = "SKU is required";
    if (formData.stock < 0) newErrors.stock = "Stock cannot be negative";
    if (formData.uploadedImageUrls.length === 0) newErrors.images = "Product image is required";

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
      name: "",
      brand: "",
      description: "",
      shortDescription: "",
      price: 0,
      originalPrice: undefined,
      category: "",
      subcategory: "",
      sku: "",
      stock: 0,
      weight: 0,
      dimensions: {
        length: 0,
        width: 0,
        height: 0,
      },
      images: [],
      uploadedImageUrls: [],
      specifications: "",
      warranty: "",
      status: "active",
      featured: false,
      onSale: false,
      freeShipping: false,
      tags: "",
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="4xl" height="fixed" closeOnBackdrop={false}>
      <ModalHeader
        title="Add New Product"
        subtitle="Create a new product listing for your store"
        onClose={handleClose}
        showLogo={false}
      />

      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6">
          {/* Basic Information */}
          <FormSection title="Basic Information" icon={Package}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                label="Product Name"
                placeholder="e.g., DeWalt 20V Max Cordless Drill Kit"
                required
                error={errors.name}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />

              <Select
                id="brand"
                name="brand"
                value={formData.brand}
                onChange={handleInputChange}
                label="Brand"
                options={brandOptions}
                placeholder="Select a brand"
                required
                error={errors.brand}
              />
            </div>

            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              label="Full Description"
              placeholder="Provide a detailed description of the product, its features, and benefits..."
              required
              error={errors.description}
              rows={4}
              className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
            />

            <Textarea
              id="shortDescription"
              name="shortDescription"
              value={formData.shortDescription}
              onChange={handleInputChange}
              label="Short Description"
              placeholder="Brief description for product cards and listings..."
              rows={2}
              className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
            />
          </FormSection>

          {/* Product Image */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Product Image <span className="text-red-500">*</span>
            </label>
            <ImageUpload
              onUpload={(urls) => {
                setFormData((prev) => ({ ...prev, uploadedImageUrls: urls }));
              }}
              onError={(error) => console.error("Upload error:", error)}
              maxFiles={1}
              maxSize={10}
              className="w-full"
            />
            {errors.images && <p className="text-sm text-red-600">{errors.images}</p>}
          </div>

          {/* Pricing & Inventory */}
          <FormSection title="Pricing & Inventory" icon={DollarSign}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-4">
              <Input
                id="price"
                name="price"
                type="number"
                value={formData.price}
                onChange={handleInputChange}
                label="Price ($)"
                placeholder="299.99"
                icon={DollarSign}
                min={0}
                step={0.01}
                required
                error={errors.price}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />

              <Input
                id="originalPrice"
                name="originalPrice"
                type="number"
                value={formData.originalPrice || ""}
                onChange={handleInputChange}
                label="Original Price ($)"
                placeholder="399.99"
                icon={DollarSign}
                min={0}
                step={0.01}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />

              <Input
                id="stock"
                name="stock"
                type="number"
                value={formData.stock}
                onChange={handleInputChange}
                label="Stock Quantity"
                placeholder="100"
                icon={Warehouse}
                min={0}
                required
                error={errors.stock}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />

              <Input
                id="sku"
                name="sku"
                value={formData.sku}
                onChange={handleInputChange}
                label="SKU"
                placeholder="DW20V-DRILL-001"
                icon={Tag}
                required
                error={errors.sku}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />
            </div>
          </FormSection>

          {/* Categories & Classification */}
          <FormSection title="Categories & Classification" icon={Tag}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
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

              <Input
                id="subcategory"
                name="subcategory"
                value={formData.subcategory}
                onChange={handleInputChange}
                label="Subcategory"
                placeholder="e.g., Cordless Drills"
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />
            </div>

            <Input
              id="tags"
              name="tags"
              value={formData.tags}
              onChange={handleInputChange}
              label="Tags"
              placeholder="cordless, drill, 20v, battery, professional (comma separated)"
              className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
            />
          </FormSection>

          {/* Physical Properties */}
          <FormSection title="Physical Properties" icon={Package}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-4">
              <Input
                id="weight"
                name="weight"
                type="number"
                value={formData.weight}
                onChange={handleInputChange}
                label="Weight (kg)"
                placeholder="2.5"
                min={0}
                step={0.1}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />

              <Input
                id="dimensions.length"
                name="dimensions.length"
                type="number"
                value={formData.dimensions.length}
                onChange={handleInputChange}
                label="Length (cm)"
                placeholder="30"
                min={0}
                step={0.1}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />

              <Input
                id="dimensions.width"
                name="dimensions.width"
                type="number"
                value={formData.dimensions.width}
                onChange={handleInputChange}
                label="Width (cm)"
                placeholder="25"
                min={0}
                step={0.1}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />

              <Input
                id="dimensions.height"
                name="dimensions.height"
                type="number"
                value={formData.dimensions.height}
                onChange={handleInputChange}
                label="Height (cm)"
                placeholder="20"
                min={0}
                step={0.1}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />
            </div>
          </FormSection>

          {/* Additional Details */}
          <FormSection title="Additional Details" icon={FileText}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
              <Textarea
                id="specifications"
                name="specifications"
                value={formData.specifications}
                onChange={handleInputChange}
                label="Specifications"
                placeholder="Technical specifications, features, included accessories..."
                rows={4}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />

              <Textarea
                id="warranty"
                name="warranty"
                value={formData.warranty}
                onChange={handleInputChange}
                label="Warranty Information"
                placeholder="3-year manufacturer warranty, terms and conditions..."
                rows={4}
                className="text-xs sm:text-sm px-2 py-1.5 sm:px-4 sm:py-3"
              />
            </div>
          </FormSection>

          {/* Status & Options */}
          <FormSection title="Status & Options">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  label="Product Status"
                  options={statusOptions}
                />
              </div>

              <div className="space-y-4">
                <Checkbox
                  id="featured"
                  name="featured"
                  checked={formData.featured}
                  onChange={handleCheckboxChange}
                  label="Featured Product"
                  description="Show on homepage and featured sections"
                />

                <Checkbox
                  id="onSale"
                  name="onSale"
                  checked={formData.onSale}
                  onChange={handleCheckboxChange}
                  label="On Sale"
                  description="Display sale badge and use original price"
                />

                <Checkbox
                  id="freeShipping"
                  name="freeShipping"
                  checked={formData.freeShipping}
                  onChange={handleCheckboxChange}
                  label="Free Shipping"
                  description="Eligible for free shipping promotion"
                />
              </div>
            </div>
          </FormSection>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
            <Button type="button" onClick={handleClose} variant="secondary" fullWidth>
              Cancel
            </Button>
            <Button type="submit" variant="primary" fullWidth icon={Package} iconPosition="left">
              Add Product
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
};

export default AdminProductModal;
