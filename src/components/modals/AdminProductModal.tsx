"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  FormSection,
  Input,
  Textarea,
  Checkbox,
  Button,
  ImageUpload,
} from "@/components/modals/ui";

export interface ProductVariantFormItem {
  sku: string;
  size?: string;
  colour?: string;
  gtin?: string;
  isActive: boolean;
}

export interface ProductFormItem {
  id: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  category: string;
  brand: string;
  variants: ProductVariantFormItem[];
  includedEntries: number;
  trackInventory: boolean;
  stock: number;
  isActive: boolean;
  isFeatured: boolean;
  tags: string[];
}

interface AdminProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editingProduct?: ProductFormItem | null;
}

const emptyVariant = (): ProductVariantFormItem => ({
  sku: "",
  size: "",
  colour: "",
  gtin: "",
  isActive: true,
});

export default function AdminProductModal({
  isOpen,
  onClose,
  onSuccess,
  editingProduct,
}: AdminProductModalProps) {
  const isEdit = Boolean(editingProduct);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(0);
  const [includedEntries, setIncludedEntries] = useState(0);
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [images, setImages] = useState<(File | string)[]>([]);
  const [variants, setVariants] = useState<ProductVariantFormItem[]>([emptyVariant()]);
  const [trackInventory, setTrackInventory] = useState(false);
  const [stock, setStock] = useState(0);
  const [isFeatured, setIsFeatured] = useState(false);
  const [tags, setTags] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingProduct) {
      setName(editingProduct.name);
      setDescription(editingProduct.description);
      setPrice(editingProduct.price);
      setIncludedEntries(editingProduct.includedEntries ?? 0);
      setCategory(editingProduct.category);
      setBrand(editingProduct.brand);
      setImages(editingProduct.images ?? []);
      setVariants(
        editingProduct.variants?.length ? editingProduct.variants : [emptyVariant()]
      );
      setTrackInventory(editingProduct.trackInventory ?? false);
      setStock(editingProduct.stock ?? 0);
      setIsFeatured(editingProduct.isFeatured ?? false);
      setTags((editingProduct.tags ?? []).join(", "));
    } else {
      setName("");
      setDescription("");
      setPrice(0);
      setIncludedEntries(0);
      setCategory("");
      setBrand("");
      setImages([]);
      setVariants([emptyVariant()]);
      setTrackInventory(false);
      setStock(0);
      setIsFeatured(false);
      setTags("");
    }
  }, [isOpen, editingProduct]);

  // Quick-add state. Apparel is a size RUN, not a list of unrelated items: adding a
  // tee meant hand-typing five near-identical rows and getting the SKU pattern right
  // five times, which is both slow and the easiest place to typo.
  const [runColour, setRunColour] = useState("Black");
  const [runSizes, setRunSizes] = useState<string[]>(["S", "M", "L"]);
  const SIZE_RUN = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

  /** `TEE-BLK-L` — derived from the product name and colour so SKUs stay consistent. */
  const skuFor = (colour: string, size: string) => {
    const stem = (name || "ITEM")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .split(/s+/)
      .map((w) => w.slice(0, 4).toUpperCase())
      .slice(0, 2)
      .join("-");
    const col = colour.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
    return [stem, col, size.toUpperCase()].filter(Boolean).join("-");
  };

  const addSizeRun = () => {
    if (runSizes.length === 0) return;
    setVariants((prev) => {
      // Keep any row the admin already filled in; a blank starter row is noise.
      const kept = prev.filter((v) => v.sku.trim().length > 0);
      const existing = new Set(kept.map((v) => v.sku.trim().toUpperCase()));
      const added = runSizes
        .map((size) => ({ ...emptyVariant(), sku: skuFor(runColour, size), size, colour: runColour }))
        .filter((v) => !existing.has(v.sku.toUpperCase()));
      const next = [...kept, ...added];
      return next.length > 0 ? next : [emptyVariant()];
    });
  };

  const updateVariant = (index: number, patch: Partial<ProductVariantFormItem>) => {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Images are uploaded to Cloudinary by ImageUpload, so anything left as a
    // File means an upload is still pending — submitting now would drop it.
    const uploadedImages = images.filter((img): img is string => typeof img === "string");
    if (uploadedImages.length === 0) {
      setError("Add at least one product image.");
      return;
    }

    const cleanedVariants = variants
      .map((v) => ({
        sku: v.sku.trim(),
        size: v.size?.trim() || undefined,
        colour: v.colour?.trim() || undefined,
        gtin: v.gtin?.trim() || undefined,
        isActive: v.isActive,
      }))
      .filter((v) => v.sku.length > 0);

    if (cleanedVariants.length === 0) {
      setError("Add at least one variant with a SKU. The variant is what a customer selects.");
      return;
    }

    const skus = cleanedVariants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) {
      setError("Variant SKUs must be unique within a product.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        price,
        images: uploadedImages,
        category: category.trim(),
        brand: brand.trim(),
        variants: cleanedVariants,
        includedEntries,
        trackInventory,
        stock: trackInventory ? stock : 0,
        isFeatured,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };

      const response = await fetch(
        isEdit ? `/api/admin/products/${editingProduct?.id}` : "/api/admin/products",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to save product");
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader
        title={isEdit ? "Edit Product" : "Create Product"}
        onClose={onClose}
        showLogo={false}
      />
      <ModalContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}

          <FormSection title="Details">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
            />
            <Textarea
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={2000}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                required
              />
              <Input
                label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              />
            </div>
          </FormSection>

          {/*
            Price and included entries sit side by side deliberately. They are
            authored independently — an entry count must never be derived from
            price — so a repricing edit has to show both in one glance or the
            two drift apart silently.
          */}
          <FormSection title="Price and included entries">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Price (AUD, GST inclusive)"
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                min={0}
                step={0.01}
                required
              />
              <Input
                label="Free entries included"
                type="number"
                value={includedEntries}
                onChange={(e) => setIncludedEntries(Number(e.target.value))}
                min={0}
                step={1}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Entries are a free inclusion with the item and are authored per product, never
              calculated from the price. Leave at 0 until entries are live.
            </p>
          </FormSection>

          <FormSection title="Images">
            <ImageUpload
              images={images}
              onImagesChange={setImages}
              maxImages={8}
              uploadToCloudinary
              label="Product images"
            />
          </FormSection>

          <FormSection title="Variants">
            <div className="space-y-3">
              {/* Quick add a size run. One colour at a time, because that is how a garment
                  is actually stocked — pick the colour, tick the sizes, and the rows are
                  generated with a consistent SKU. Re-running it for a second colour keeps
                  everything already entered. */}
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 dark:border-neutral-600 dark:bg-neutral-800/50">
                <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-neutral-200">
                  Quick add a size run
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-40">
                    <Input
                      label="Colour"
                      value={runColour}
                      onChange={(e) => setRunColour(e.target.value)}
                      placeholder="Black"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 pb-1">
                    {SIZE_RUN.map((size) => {
                      const on = runSizes.includes(size);
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() =>
                            setRunSizes((prev) =>
                              prev.includes(size) ? prev.filter((v) => v !== size) : [...prev, size]
                            )
                          }
                          className={`h-8 min-w-[38px] rounded-lg border px-2 text-xs font-semibold transition-colors ${
                            on
                              ? "border-red-600 bg-red-600 text-white"
                              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200"
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={addSizeRun}
                    disabled={runSizes.length === 0 || !runColour.trim()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add {runSizes.length || 0} variant{runSizes.length === 1 ? "" : "s"}
                  </button>
                </div>
              </div>

              {variants.some((v) => v.sku.trim()) && (
                <p className="text-xs text-gray-600 dark:text-neutral-300">
                  <span className="font-semibold">
                    {variants.filter((v) => v.sku.trim()).length} variant
                    {variants.filter((v) => v.sku.trim()).length === 1 ? "" : "s"}
                  </span>
                  {" · "}
                  {[...new Set(variants.filter((v) => v.colour?.trim()).map((v) => v.colour))].join(", ") ||
                    "no colour set"}
                  {" · "}
                  {variants.filter((v) => v.gtin?.trim()).length} with a GTIN
                </p>
              )}
              {variants.map((variant, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-gray-200 p-3 dark:border-neutral-700"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <Input
                      label="SKU"
                      value={variant.sku}
                      onChange={(e) => updateVariant(index, { sku: e.target.value })}
                      required
                    />
                    <Input
                      label="Size"
                      value={variant.size ?? ""}
                      onChange={(e) => updateVariant(index, { size: e.target.value })}
                    />
                    <Input
                      label="Colour"
                      value={variant.colour ?? ""}
                      onChange={(e) => updateVariant(index, { colour: e.target.value })}
                    />
                    <Input
                      label="GTIN"
                      value={variant.gtin ?? ""}
                      onChange={(e) => updateVariant(index, { gtin: e.target.value })}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <Checkbox
                      label="Active"
                      checked={variant.isActive}
                      onChange={(e) => updateVariant(index, { isActive: e.target.checked })}
                    />
                    {variants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setVariants((prev) => prev.filter((_, i) => i !== index))}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setVariants((prev) => [...prev, emptyVariant()])}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Add variant
              </button>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                <strong>SKU</strong> is ours — it identifies the line on an order and on the
                customer&apos;s receipt, and it is what the cart uses to tell two sizes apart.
                It must be unique within this product.
                <br />
                <strong>Size</strong> and <strong>Colour</strong> are what the customer picks on
                the product page, and they are what the shop filter rail is built from.
                <br />
                <strong>GTIN</strong> is the print provider&apos;s identifier for the blank
                garment — their catalogue decides which colours and sizes exist, and this is the
                code that tells them exactly which one to print. Leave it blank until the
                supplier gives us one; it is only needed to submit an order for printing. An
                incorrect GTIN prints the wrong garment, so check it against their catalogue
                rather than guessing.
              </p>
            </div>
          </FormSection>

          <FormSection title="Inventory">
            <Checkbox
              label="Track stock for this product"
              checked={trackInventory}
              onChange={(e) => setTrackInventory(e.target.checked)}
            />
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Leave off for print-to-order items — the printer makes them on demand, so stock
              is meaningless and would only block sales.
            </p>
            {trackInventory && (
              <Input
                label="Stock"
                type="number"
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
                min={0}
                step={1}
              />
            )}
          </FormSection>

          <FormSection title="Merchandising">
            <Checkbox
              label="Featured"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
            />
            <Input
              label="Tags (comma separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </FormSection>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              className="flex-1"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="md" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </span>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create product"
              )}
            </Button>
          </div>
        </form>
      </ModalContent>
    </ModalContainer>
  );
}
