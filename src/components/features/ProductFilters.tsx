"use client";

import { useMemo } from "react";
import { useShopFacets } from "@/hooks/queries/useProductQueries";
import { SlidersHorizontal, Ticket, Truck } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * The shop's Refine panel — one component for the desktop rail and the mobile sheet.
 *
 * EVERY FACET IS DERIVED from the catalogue (`useShopFacets` →
 * /api/products/categories), never hard-coded. This file once declared eight tool
 * categories, five tool brands and a "Tool Style" list as literal arrays with no
 * connection to any product, so most of the rail returned zero results and the
 * things a customer would actually filter by were missing entirely.
 *
 * The counts beside each category come from the same aggregation, which is what
 * lets a row say "2 products" without a second request — and what stops the rail
 * ever offering a value that returns nothing.
 */

export interface FilterState {
  category: string[];
  /** `[min, max]`. Max at or above the catalogue ceiling means "Any". */
  priceRange: [number, number];
  brands: string[];
  /** Apparel sizes (variants[].size) — replaced the meaningless "Tool Style" facet. */
  sizes: string[];
  /** Apparel colours (variants[].colour). */
  colours: string[];
  /** Show only: products that include free entries (includedEntries > 0). */
  hasEntries: boolean;
  /** Show only: stock-tracked products with units on hand, i.e. dispatchable today. */
  readyToShip: boolean;
}

interface ProductFiltersProps {
  selectedFilters: FilterState;
  onFilterChange?: (filters: Partial<FilterState>) => void;
  isMobile?: boolean;
}

/** Floor of the price slider. The ceiling is the catalogue's own top price. */
const MIN_PRICE = 0;

/**
 * "No maximum" — the slider's Any position.
 *
 * A sentinel rather than a number, because the real ceiling is whatever the
 * catalogue's dearest product costs and that changes when stock does. The old
 * code compared against a literal 500 in five places; when a $899 tool chest was
 * added, every one of them silently treated "Any" as "under $500" and the chest
 * became unreachable from a slider that looked fully open.
 */
export const PRICE_NO_MAX = Number.MAX_SAFE_INTEGER;

export default function ProductFilters({ selectedFilters, onFilterChange, isMobile = false }: ProductFiltersProps) {
  const { data: facets } = useShopFacets();

  const categories = useMemo(() => facets?.categories ?? [], [facets]);
  const brands = useMemo(() => facets?.brands ?? [], [facets]);

  /**
   * The ceiling is the dearest thing in the catalogue, rounded up to a round
   * number — not a constant.
   *
   * A hard-coded $500 max silently excluded every product above it: the slider
   * looked fully open at its right end while a $899 tool chest could not be
   * reached at all. Deriving it means the range always covers what is for sale.
   */
  const ceiling = useMemo(() => {
    const top = facets?.priceRange?.maxPrice ?? 0;
    if (!Number.isFinite(top) || top <= 0) return 500;
    return Math.ceil(top / 50) * 50;
  }, [facets]);

  const currentMax = Math.min(selectedFilters.priceRange[1], ceiling);
  const isAnyPrice = currentMax >= ceiling;

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const sectionLabel = "text-[10.5px] font-extrabold uppercase tracking-[.1em] text-gray-400 dark:text-neutral-500";

  return (
    <div className={cn("flex flex-col gap-5", isMobile ? "pb-4" : "")}>
      {/* Header — names the panel and what is currently in view. */}
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-600/10 text-red-600">
          <SlidersHorizontal className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold leading-tight text-gray-900 dark:text-white">Refine</div>
          <div className="truncate text-[11.5px] text-gray-500 dark:text-neutral-400">
            {selectedFilters.category.length === 0
              ? "All products"
              : selectedFilters.category.join(", ")}
          </div>
        </div>
      </div>

      {/* CATEGORY — a card per category, with its own count. */}
      {categories.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className={sectionLabel}>Category</span>
          {categories.map((c) => {
            const on = selectedFilters.category.includes(c.name);
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => onFilterChange?.({ category: toggleIn(selectedFilters.category, c.name) })}
                aria-pressed={on}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                  on
                    ? "border-red-600 bg-red-600/5"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-gray-900 dark:text-white">{c.name}</span>
                  <span className="block text-[11px] text-gray-500 dark:text-neutral-400">
                    {c.count} {c.count === 1 ? "product" : "products"}
                  </span>
                </span>
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                    on ? "border-red-600" : "border-gray-300 dark:border-neutral-600"
                  )}
                >
                  {on && <span className="h-2 w-2 rounded-full bg-red-600" />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* MAX PRICE — one handle, because a floor is a filter nobody reaches for. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className={sectionLabel}>Max price</span>
          <span className="text-[12.5px] font-extrabold text-gray-900 dark:text-white">
            {isAnyPrice ? "Any" : `$${currentMax}`}
          </span>
        </div>
        <input
          type="range"
          min={MIN_PRICE}
          max={ceiling}
          step={10}
          value={currentMax}
          onChange={(e) => onFilterChange?.({ priceRange: [MIN_PRICE, Number(e.target.value)] })}
          aria-label="Maximum price"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-red-600 dark:bg-neutral-800"
        />
      </div>

      {/* BRAND — chips, multi-select. */}
      {brands.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className={sectionLabel}>Brand</span>
          <div className="flex flex-wrap gap-2">
            {brands.map((b) => {
              const on = selectedFilters.brands.includes(b.name);
              return (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => onFilterChange?.({ brands: toggleIn(selectedFilters.brands, b.name) })}
                  aria-pressed={on}
                  className={cn(
                    "h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors",
                    on
                      ? "border-red-600 bg-red-600 text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                  )}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/*
        SHOW ONLY.

        Both toggles read fields the catalogue already carries. A third —
        "Member exclusives" — is in the design but NOT here: `Product` has no
        member-only field, so the control would filter on nothing. Rendering a
        switch that changes no results is worse than leaving the row out; it needs
        a model field and an admin toggle first.
      */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabel}>Show only</span>
        {(
          [
            {
              key: "hasEntries" as const,
              label: "Has free entries",
              Icon: Ticket,
              tint: "bg-red-600/10 text-red-600",
            },
            {
              key: "readyToShip" as const,
              label: "Ready to ship",
              Icon: Truck,
              tint: "bg-green-500/10 text-green-600 dark:text-green-400",
            },
          ]
        ).map(({ key, label, Icon, tint }) => {
          const on = selectedFilters[key];
          return (
            <button
              key={key}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => onFilterChange?.({ [key]: !on } as Partial<FilterState>)}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
                on
                  ? "border-red-600 bg-red-600/5"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
              )}
            >
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", tint)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 text-left text-[12.5px] font-bold text-gray-900 dark:text-white">{label}</span>
              <span
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  on ? "bg-red-600" : "bg-gray-300 dark:bg-neutral-700"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                    on ? "translate-x-[1.125rem]" : "translate-x-0.5"
                  )}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
