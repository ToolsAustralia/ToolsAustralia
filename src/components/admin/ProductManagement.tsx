"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Package, Pencil, Plus, Power, Trash2 } from "lucide-react";
import AdminProductModal, { type ProductFormItem } from "@/components/modals/AdminProductModal";
import { usePermissions } from "@/hooks/usePermissions";
import { variantLabel } from "@/utils/shop/variants";

interface ProductListItem extends ProductFormItem {
  _id?: string;
}

/** The API returns Mongo documents, whose id is `_id`. */
function normalise(raw: ProductListItem): ProductFormItem {
  return {
    ...raw,
    id: raw.id ?? raw._id ?? "",
    variants: raw.variants ?? [],
    images: raw.images ?? [],
    tags: raw.tags ?? [],
    includedEntries: raw.includedEntries ?? 0,
    trackInventory: raw.trackInventory ?? false,
    stock: raw.stock ?? 0,
  };
}

export default function ProductManagement() {
  const { has } = usePermissions();
  const canEdit = has("shop.edit");
  const canDelete = has("shop.delete");

  const [products, setProducts] = useState<ProductFormItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductFormItem | null>(null);
  const [actionProductId, setActionProductId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/products");
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to fetch products");
      }
      setProducts((data.data || []).map(normalise));
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load products",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const toggleProduct = async (productId: string, isActive: boolean) => {
    setActionProductId(productId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to toggle product");
      }
      setFeedback({
        type: "success",
        message: isActive
          ? "Product activated — it is now visible in the shop."
          : "Product deactivated — it no longer appears in the shop.",
      });
      await loadProducts();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to toggle product",
      });
    } finally {
      setActionProductId(null);
    }
  };

  const deleteProduct = async (productId: string) => {
    if (!window.confirm("Delete this product? This action cannot be undone.")) return;
    setActionProductId(productId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to delete product");
      }
      setFeedback({ type: "success", message: "Product deleted successfully." });
      await loadProducts();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to delete product",
      });
    } finally {
      setActionProductId(null);
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700">
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-red-600 dark:text-red-400" />
                Products
              </h3>
              <p className="text-gray-600 dark:text-neutral-400 mt-1 text-xs sm:text-sm">
                Shop catalog. Deactivating every product returns /shop to its Coming Soon state.
              </p>
            </div>
            {canEdit && (
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setIsModalOpen(true);
                }}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold hover:from-red-700 hover:to-red-800"
              >
                <Plus className="w-4 h-4" />
                Create Product
              </button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {feedback && (
            <div
              className={`mb-4 rounded-lg px-3 py-2 text-sm ${
                feedback.type === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : "border border-red-200 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-200"
              }`}
            >
              {feedback.message}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-400" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-10">
              <Package className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-neutral-600" />
              <p className="text-gray-600 dark:text-neutral-400">No products in the catalog yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="rounded-xl border border-gray-200 bg-white p-3.5 dark:border-neutral-700 dark:bg-neutral-900/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      {product.images?.[0] && (
                        <Image
                          src={product.images[0]}
                          alt=""
                          width={56}
                          height={56}
                          className="h-14 w-14 flex-shrink-0 rounded-lg border border-gray-200 object-cover dark:border-neutral-700"
                        />
                      )}
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-gray-900 sm:text-base dark:text-neutral-100">
                          {product.name}
                        </h4>
                        <p className="text-xs text-gray-600 dark:text-neutral-400 mt-1">
                          {product.brand} · {product.category} · $
                          {product.price.toFixed(2)}
                          {product.includedEntries > 0 && (
                            <> · includes {product.includedEntries} free entries</>
                          )}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {product.variants.slice(0, 6).map((v) => (
                            <span
                              key={v.sku}
                              className={`rounded px-1.5 py-0.5 text-2xs ${
                                v.isActive
                                  ? "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200"
                                  : "bg-gray-50 text-gray-400 line-through dark:bg-neutral-800/50 dark:text-neutral-500"
                              }`}
                            >
                              {variantLabel(v)}
                            </span>
                          ))}
                          {product.variants.length > 6 && (
                            <span className="text-2xs text-gray-500 dark:text-neutral-400">
                              +{product.variants.length - 6} more
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-2xs text-gray-500 dark:text-neutral-400">
                          {product.variants.length} variant
                          {product.variants.length === 1 ? "" : "s"} ·{" "}
                          {product.trackInventory ? `${product.stock} in stock` : "Print to order"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${
                        product.isActive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
                          : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-200"
                      }`}
                    >
                      {product.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canEdit && (
                        <>
                          <button
                            onClick={() => {
                              setEditingProduct(product);
                              setIsModalOpen(true);
                            }}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => toggleProduct(product.id, !product.isActive)}
                            disabled={actionProductId === product.id}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                          >
                            <Power className="w-3.5 h-3.5" />
                            {product.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => deleteProduct(product.id)}
                          disabled={actionProductId === product.id}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <AdminProductModal
        isOpen={isModalOpen}
        editingProduct={editingProduct}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProduct(null);
        }}
        onSuccess={() => {
          loadProducts();
          setFeedback({
            type: "success",
            message: editingProduct
              ? "Product updated successfully."
              : "Product created successfully.",
          });
        }}
      />
    </>
  );
}
