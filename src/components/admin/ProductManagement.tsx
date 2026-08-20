"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowUpDown,
  ExternalLink,
  GripVertical,
  Loader2,
  Package,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
} from "lucide-react";
import AdminProductModal, { type ProductFormItem } from "@/components/modals/AdminProductModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import SelectMenu from "@/components/ui/SelectMenu";
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

/**
 * Drag wrapper for one product row.
 *
 * Module scope, not inline: a component defined during render is a new type on
 * every render, which would remount every card mid-drag.
 *
 * The handle is a separate control rather than the whole card being draggable —
 * the card carries Edit / Deactivate / Delete buttons, and a card-wide drag
 * listener swallows their clicks.
 */
function SortableProductRow({
  id,
  reorderMode,
  children,
}: {
  id: string;
  reorderMode: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !reorderMode,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-50 opacity-95" : undefined}
    >
      <div className="flex items-stretch gap-2">
        {reorderMode && (
          <button
            type="button"
            aria-label="Drag to reorder"
            className="flex w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-400 hover:text-gray-600 active:cursor-grabbing dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:text-neutral-300"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
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
  // The product awaiting delete confirmation. `window.confirm` BLOCKED the thread
  // and returned a boolean inline; a real modal cannot, so the pending product has
  // to be held in state and the delete resumed from the modal's onConfirm.
  const [pendingDelete, setPendingDelete] = useState<ProductFormItem | null>(null);

  // Search + filters are CLIENT-side, matching MiniDrawManagement. The admin list
  // already fetches the whole catalogue in one request (limit 200), so filtering
  // here is instant and costs no round-trip. It would need to move server-side if
  // the catalogue ever outgrew that single fetch.
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [isReorderMode, setIsReorderMode] = useState(false);
  const [isOrderDirty, setIsOrderDirty] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // Both pointer and touch, so the list reorders on a phone as well as a desk.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );
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

  /** Categories actually present, so the filter cannot offer an empty bucket. */
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of products) {
      const raw = (p.category ?? "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, raw);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      // Name, brand, category AND sku — an admin looking for a product usually has
      // the sku off an order, not the display name.
      const matchesQuery =
        q === "" ||
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q) ||
        (p.variants ?? []).some((v) => (v.sku ?? "").toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? p.isActive !== false : p.isActive === false);

      const matchesCategory =
        categoryFilter === "all" ||
        (p.category ?? "").toLowerCase() === categoryFilter.toLowerCase();

      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [products, searchTerm, statusFilter, categoryFilter]);

  // Reordering a FILTERED list would be a lie: the positions saved are 1..N over
  // what is on screen, so hidden rows would be silently repositioned too. Reorder
  // mode is therefore only available on the unfiltered list.
  const isFiltered =
    searchTerm.trim() !== "" || statusFilter !== "all" || categoryFilter !== "all";

  // Reorder mode is only reachable when unfiltered (the Reorder button is disabled
  // otherwise), but this stays defensive: dragging a filtered subset would save
  // positions that silently move rows the admin cannot see.
  const visibleProducts = isReorderMode ? products : filteredProducts;

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setProducts((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setIsOrderDirty(true);
  }, []);

  const saveOrder = async () => {
    if (!isOrderDirty || isSavingOrder) return;
    setIsSavingOrder(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/products/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: products.map((p) => p.id) }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to save order");
      setFeedback({ type: "success", message: "Catalogue order saved. The shop now lists products in this order." });
      setIsOrderDirty(false);
      setIsReorderMode(false);
      await loadProducts();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to save order",
      });
    } finally {
      setIsSavingOrder(false);
    }
  };

  /** Discards the local drag state by refetching — the server is the truth. */
  const cancelReorder = async () => {
    setIsReorderMode(false);
    setIsOrderDirty(false);
    await loadProducts();
  };

  /** Runs only after the confirmation modal resolves — it no longer asks. */
  const deleteProduct = async (productId: string) => {
    setPendingDelete(null);
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
            <div className="flex shrink-0 items-center gap-2">
            {canEdit && !isReorderMode && (
              <button
                onClick={() => setIsReorderMode(true)}
                disabled={isFiltered || products.length < 2}
                title={
                  isFiltered
                    ? "Clear the search and filters first — positions are saved across the whole catalogue"
                    : undefined
                }
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <ArrowUpDown className="h-4 w-4" />
                Reorder
              </button>
            )}
            {canEdit && isReorderMode && (
              <>
                <button
                  onClick={() => void cancelReorder()}
                  disabled={isSavingOrder}
                  className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void saveOrder()}
                  disabled={!isOrderDirty || isSavingOrder}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isSavingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save order
                </button>
              </>
            )}
            {canEdit && !isReorderMode && (
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

          {/*
            Search + filters. Hidden in reorder mode on purpose: positions are saved
            as 1..N across the WHOLE catalogue, so dragging a filtered subset would
            silently reposition the rows you cannot see.
          */}
          {!isReorderMode && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search name, brand, category or SKU"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                />
              </div>
              <SelectMenu
                id="product-status-filter"
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active only" },
                  { value: "inactive", label: "Inactive only" },
                ]}
                className="sm:w-44"
              />
              <SelectMenu
                id="product-category-filter"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { value: "all", label: "All categories" },
                  ...categories.map((c) => ({ value: c, label: c })),
                ]}
                className="sm:w-48"
              />
            </div>
          )}

          {isReorderMode && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
              Drag the cards into the order customers should see on /shop. Nothing is saved
              until you press <strong>Save order</strong>.
            </p>
          )}
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
          ) : visibleProducts.length === 0 ? (
            <div className="text-center py-10">
              <Package className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-neutral-600" />
              <p className="text-gray-600 dark:text-neutral-400">
                No products match that search or filter.
              </p>
              <button
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("all");
                  setCategoryFilter("all");
                }}
                className="mt-3 text-sm font-semibold text-red-600 hover:underline dark:text-red-400"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              {/* rect, not verticalList: the cards sit in a GRID now, so a drag has to
                  resolve horizontally as well as vertically. Same strategy
                  MiniDrawManagement uses, for the same reason. */}
              <SortableContext
                items={visibleProducts.map((p) => p.id)}
                strategy={rectSortingStrategy}
              >
                {/*
                  Two up from sm, three from xl. Not more: each card carries a
                  thumbnail, brand/category/price, a sku chip and three action
                  buttons, and below ~300px wide those buttons start wrapping into
                  two rows — which costs more vertical space than the extra column
                  saves.
                */}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleProducts.map((product) => (
                    <SortableProductRow
                      key={product.id}
                      id={product.id}
                      reorderMode={isReorderMode}
                    >
                <article
                  className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-3.5 dark:border-neutral-700 dark:bg-neutral-900/80"
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
                  {/*
                    Actions. `mt-auto` pins this row to the bottom of the card, so a
                    grid row of cards with different name lengths still lines its
                    buttons up.

                    NOT gated on canEdit/canDelete any more: the View link is a read,
                    and a read-only admin checking how a product looks to a customer is
                    exactly who needs it. The edit/delete buttons keep their own gates
                    below.
                  */}
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    {/*
                      An inactive product 404s on /shop (the page filters on
                      `isActive: true`), so the tooltip says so rather than pretending
                      the link is useful.
                    */}
                    <a
                        href={`/shop/${product.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={
                          product.isActive === false
                            ? "Not live — activate it first to view the shop page"
                            : "Open the live shop page in a new tab"
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View
                      </a>
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
                          onClick={() => setPendingDelete(product)}
                          disabled={actionProductId === product.id}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                </article>
                    </SortableProductRow>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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

      {/*
        The app's own confirmation modal, not `window.confirm`. The native dialog
        is chrome-styled ("localhost:3000 says"), ignores the theme, cannot show
        WHICH product is about to go, and blocks the JS thread while it is open.
        `type="delete"` gives it the destructive treatment the other admin
        destructive actions use.

        Naming the product in the message is the point: the list renders a Delete
        button per row, and a generic "Delete this product?" gives an admin no way
        to catch a misclick before it is irreversible.
      */}
      <ConfirmationModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteProduct(pendingDelete.id);
        }}
        type="delete"
        title="Delete product"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? This cannot be undone. Past orders keep their own snapshot of the item, so order history is not affected.`
            : ""
        }
        confirmText="Delete product"
        cancelText="Keep it"
        isLoading={actionProductId !== null && actionProductId === pendingDelete?.id}
      />
    </>
  );
}
