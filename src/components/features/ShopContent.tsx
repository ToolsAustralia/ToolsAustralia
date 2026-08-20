"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useScrollLock, useModalA11y } from "@/hooks/useModalBlocking";
import ProductCard from "@/components/ui/ProductCard";
import ProductFilters from "@/components/features/ProductFilters";
import { useShopFacets } from "@/hooks/queries/useProductQueries";
import MetallicButton from "@/components/ui/MetallicButton";
import { Grid, List, Filter, X, Search, Clock, ArrowUpDown } from "lucide-react";
import { Product as ProductType } from "@/types/product";
import { useProducts, type Product as ReactQueryProduct } from "@/hooks/queries";
import { SectionContainer } from "@/components/ui";
import Dropdown from "@/components/modals/ui/Dropdown";

/**
 * Duration of the `sidebar-slide-in` / `sidebar-slide-out` keyframes in globals.css.
 * Kept as a named constant so the close timeout and the CSS cannot drift apart silently.
 */
const SIDEBAR_ANIM_MS = 300;

// Filter state interface
interface FilterState {
  category: string[];
  priceRange: [number, number];
  brands: string[];
  /** Apparel sizes and colours, from variants[]. Replaced the old "styles" (Tool Style) facet. */
  sizes: string[];
  colours: string[];
}

// Remove ApiResponse interface as it's now handled by React Query

// Sort options - Updated to match API
/**
 * The FIRST entry is the default, and it must stay the admin's curated order.
 *
 * This list is why reordering in admin appeared to do nothing: the page always
 * sends an explicit `sortBy`, so making `displayOrder` the API's default had no
 * effect at all — the client never omitted the parameter for the default to apply.
 * A server-side default cannot fix a client that always overrides it.
 */
const sortOptions = [
  { value: "displayOrder-asc", label: "Featured" },
  { value: "createdAt-desc", label: "Newest Arrivals" },
  { value: "createdAt-asc", label: "Oldest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating-desc", label: "Top Rated" },
  { value: "name-asc", label: "Name (A-Z)" },
];

/**
 * Single source for the default. It was written out as a string literal in three
 * places — the initial state, the reset handler and the has-controls-applied
 * check — so changing the default meant changing three unrelated lines and the
 * "Clear" affordance silently disagreeing with reality if you missed one.
 */
const DEFAULT_SORT = sortOptions[0].value;

interface ShopContentProps {
  initialProducts: ProductType[];
  totalProducts: number;
  /**
   * Setting a default brand allows brand landing pages to pre-filter results.
   * We keep it optional so the main shop page behaves like before.
   */
  defaultBrand?: string;
}

export default function ShopContent({
  initialProducts,
  totalProducts: initialTotalProducts,
  defaultBrand,
}: ShopContentProps) {
  const router = useRouter();
  // State management for shop page
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({
    category: [],
    priceRange: [0, 500],
    // If a default brand is provided we pre-populate the filters array.
    brands: defaultBrand ? [defaultBrand] : [],
    sizes: [],
    colours: [],
  });
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  /**
   * Drives the slide-OUT. The panel is conditionally mounted, so without a closing
   * state it vanishes the instant `isFiltersOpen` flips and only half the animation
   * exists. Same two-state pattern as the header's mobile menu and cart.
   */
  const [isClosingFilters, setIsClosingFilters] = useState(false);

  // Parse sort parameters
  const [sortField, sortOrder] = sortBy.split("-");

  // Use React Query for data fetching
  const {
    data: productsData,
    isLoading,
    error,
    isError,
  } = useProducts({
    page: currentPage,
    limit: 12,
    search: debouncedSearch.trim() || undefined,
    category: filters.category.length > 0 ? filters.category : undefined,
    brand: filters.brands.length > 0 ? filters.brands : defaultBrand ? [defaultBrand] : undefined,
    // Singular here because these are the API's param names, matching `variants[].size`
    // and `variants[].colour` — the same split `brands` above already lives with.
    size: filters.sizes.length > 0 ? filters.sizes : undefined,
    colour: filters.colours.length > 0 ? filters.colours : undefined,
    minPrice: filters.priceRange[0] > 0 ? filters.priceRange[0] : undefined,
    maxPrice: filters.priceRange[1] < 500 ? filters.priceRange[1] : undefined,
    sortBy: sortField,
    sortOrder: sortOrder as "asc" | "desc",
  });

  // Transform React Query products to match expected ProductType interface
  const transformedProducts: ProductType[] =
    productsData?.products?.map((product: ReactQueryProduct) => ({
      ...product,
      // `reviews` is the array, `reviewCount` the count -- this used to map the
      // count INTO reviews, which is the confusion the mistyped field caused.
      // Both ride through the spread above; the list query carries reviewCount and
      // deliberately not the review bodies.
      reviewCount: product.reviewCount ?? 0,
      slug: product.name.toLowerCase().replace(/\s+/g, "-"),
      specifications: product.specifications as Record<string, string>,
      createdAt: new Date(product.createdAt),
      updatedAt: new Date(product.updatedAt),
    })) || initialProducts;

  const totalPages = productsData?.pagination?.totalPages || 1;
  const totalProducts = productsData?.pagination?.totalCount || initialTotalProducts;

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!defaultBrand) return;
    setFilters((prev) => {
      // Keeping the default brand applied ensures brand landing pages stay on-topic.
      if (prev.brands.length === 1 && prev.brands[0] === defaultBrand) {
        return prev;
      }
      return { ...prev, brands: [defaultBrand] };
    });
  }, [defaultBrand]);

  // Grid cards go to the product page rather than adding directly. Apparel is
  // sold by variant — size and colour — and the card has nowhere to choose one,
  // so adding from here would either guess or add an unbuyable line.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAddToCart = (product: any) => {
    const id = product?.id ?? product?._id;
    if (id) router.push(`/shop/${id}`);
  };

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page when search changes
  };

  // Handle filter changes
  const { data: shopFacets } = useShopFacets();
  const categoryChips = useMemo<string[]>(
    () => (shopFacets?.categories ?? []).map((c) => c.name),
    [shopFacets]
  );

  // Lifted verbatim from MiniDrawsContent so the two rails are visually identical.
  const chipClass = (on: boolean) =>
    [
      "h-8 shrink-0 whitespace-nowrap rounded-full px-[13px] text-[12.5px] font-semibold transition-all duration-150",
      on
        ? "border border-red-600 bg-red-600 text-white shadow-[0_6px_14px_-8px_rgba(238,0,0,.9)]"
        : "border border-[#E5E7EB] bg-white text-[#374151] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200",
    ].join(" ");

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  // Handle closing mobile filters (useful after applying filters)
  /**
   * Closes through the 300ms slide-out rather than unmounting on the spot.
   * `SIDEBAR_ANIM_MS` must stay in step with the `sidebar-slide-out` keyframe in
   * globals.css — a shorter timeout cuts the animation off mid-flight, a longer one
   * leaves an invisible scrim swallowing clicks.
   */
  const handleCloseFilters = useCallback(() => {
    // Re-entrancy guard: Escape plus a backdrop click would otherwise queue two
    // timeouts, and the second re-opens nothing but does clear the closing flag early.
    setIsClosingFilters((closing) => {
      if (closing) return closing;
      setTimeout(() => {
        setIsFiltersOpen(false);
        setIsClosingFilters(false);
      }, SIDEBAR_ANIM_MS);
      return true;
    });
  }, []);

  // The mobile filter drawer paints a full-viewport scrim, which makes it modal by the
  // shared-ui R-MODAL test — so it owes the page behind it a scroll lock and a focus trap.
  // It had neither, while the ADMIN copy of this same drawer already locked, which is what
  // marks this as an oversight rather than a decision. The drawer has its own
  // `overflow-y-auto`, so without a lock a swipe past its end chains into the product grid.
  const filtersPanelRef = useRef<HTMLDivElement>(null);
  useScrollLock(isFiltersOpen);
  useModalA11y(isFiltersOpen, filtersPanelRef, handleCloseFilters);

  // Handle sort change
  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    setCurrentPage(1); // Reset to first page when sort changes
  };

  const handleClearAll = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setFilters({
      category: [],
      priceRange: [0, 500],
      brands: defaultBrand ? [defaultBrand] : [],
      sizes: [],
      colours: [],
    });
    setSortBy(DEFAULT_SORT);
    setCurrentPage(1);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeFilterCount =
    filters.category.length +
    filters.brands.length +
    filters.sizes.length +
    filters.colours.length +
    (filters.priceRange[0] > 0 || filters.priceRange[1] < 500 ? 1 : 0);
  const hasControlsApplied =
    activeFilterCount > 0 || debouncedSearch.trim().length > 0 || sortBy !== DEFAULT_SORT;

  return (
    <SectionContainer className="py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Filters - Desktop */}
        {/*
          `sticky top-24` on an INNER div, matching MiniDrawsContent. The outer
          column has to stay a normal flex child: making it sticky itself pins a
          box whose height is the whole column, which has nowhere to travel.

          max-h + overflow-y-auto so a long brand list scrolls inside the rail
          rather than making the rail taller than the viewport, at which point
          sticky has nothing left to hold.
        */}
        <div className="hidden lg:block w-80 flex-shrink-0">
          <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto overscroll-contain brand-scrollbar pr-1">
            <ProductFilters selectedFilters={filters} onFilterChange={handleFilterChange} isMobile={false} />
          </div>
        </div>

        {/* Mobile/Tablet Filter Overlay */}
        {isFiltersOpen && (
          <div className="fixed inset-0 z-[110] lg:hidden">
            {/* Backdrop */}
            <div
              className={`absolute inset-0 bg-black/50 sidebar-overlay transition-opacity duration-300 ${
                isClosingFilters ? "opacity-0" : "animate-fade-in"
              }`}
              onClick={handleCloseFilters}
            />

            {/* Sidebar. `role="dialog"` + `aria-modal` are new and are matched by the focus
                trap above — the pair must ship together, or the attribute is a claim to
                assistive tech that nothing enforces. */}
            <div
              ref={filtersPanelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Product filters"
              className={`absolute left-0 top-0 h-full w-80 max-w-[90vw] bg-white dark:bg-neutral-900 shadow-xl overflow-y-auto overscroll-contain brand-scrollbar border-r-2 border-gray-200 dark:border-red-900/40 ${
                isClosingFilters ? "sidebar-slide-out" : "sidebar-slide-in"
              }`}
            >
              <div className="p-4 border-b border-gray-200 dark:border-neutral-800 sticky top-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm z-10">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filters</h3>
                  <button
                    onClick={handleCloseFilters}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 dark:hover:text-white rounded-full transition-colors text-gray-700 dark:text-neutral-400"
                    aria-label="Close filters"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <ProductFilters selectedFilters={filters} onFilterChange={handleFilterChange} isMobile={true} />
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1">
          <div className="mb-6 rounded-2xl border border-gray-200 dark:border-neutral-800 bg-gradient-to-br from-white via-white to-gray-50 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white sm:text-lg">Browse Products</h2>
                <p className="text-xs text-gray-500 dark:text-neutral-400 sm:text-sm">
                  Fine-tune results with filters, sorting, and view mode.
                </p>
              </div>
              {hasControlsApplied && (
                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 dark:border-red-900/50 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <X className="h-3.5 w-3.5" />
                  Reset controls
                </button>
              )}
            </div>

            <div className="space-y-3 md:hidden">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 py-2.5 pl-10 pr-4 text-sm text-gray-800 dark:text-neutral-100 placeholder:text-gray-500 dark:placeholder:text-neutral-500 outline-none transition-all duration-200 focus:border-red-600/40 focus:ring-2 focus:ring-red-600/10"
                  />
                </div>

                <button
                  onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                  className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-xl border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 text-sm font-medium text-gray-700 dark:text-neutral-200 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-red-600/10 px-1.5 py-0.5 text-xs font-semibold text-red-600">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {/*
                Mobile facet rail — the same behaviour as the mini-draws page: a
                horizontally scrolling chip row for the top-level facet, with "+ More"
                opening the full drawer. The shop previously offered only the drawer
                button, so narrowing the list on a phone always cost two taps and a
                modal.

                Categories are DERIVED (useShopFacets), so this rail lists exactly what
                the catalogue holds and grows by itself.
              */}
              {categoryChips.length > 0 && (
                <div className="-mx-4 flex gap-[7px] overflow-x-auto px-4 pb-1 scrollbar-hide">
                  <button
                    type="button"
                    onClick={() => handleFilterChange({ category: [] })}
                    className={chipClass(filters.category.length === 0)}
                  >
                    All products
                  </button>
                  {categoryChips.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() =>
                        handleFilterChange({
                          category: filters.category.includes(name)
                            ? filters.category.filter((c) => c !== name)
                            : [...filters.category, name],
                        })
                      }
                      className={chipClass(filters.category.includes(name))}
                    >
                      {name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(true)}
                    className="h-8 shrink-0 whitespace-nowrap rounded-full border border-dashed border-[#D1D5DB] bg-white px-3 text-[12.5px] font-semibold text-[#6B7280] dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"
                  >
                    + More
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="inline-flex shrink-0 items-center rounded-xl border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-950 p-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                      viewMode === "grid"
                        ? "bg-black text-white dark:bg-white dark:text-black"
                        : "text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800"
                    }`}
                    aria-label="Grid view"
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                      viewMode === "list"
                        ? "bg-black text-white dark:bg-white dark:text-black"
                        : "text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800"
                    }`}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>

                <div className="relative min-w-0 flex-1">
                  <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-500 dark:text-neutral-400">
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                  <Dropdown
                    options={sortOptions}
                    value={sortBy}
                    onChange={handleSortChange}
                    placeholder="Sort by"
                    className="[&>button]:h-[42px] [&>button]:rounded-xl [&>button]:border-gray-300 dark:[&>button]:border-neutral-600 [&>button]:bg-white dark:[&>button]:bg-neutral-950 [&>button]:pl-9 [&>button]:pr-8 [&>button]:text-sm [&>button]:font-medium [&>button]:text-gray-800 dark:text-neutral-100 dark:[&>button]:text-neutral-100 [&>button]:focus:ring-red-600/10"
                  />
                </div>
              </div>
            </div>

            <div className="hidden gap-3 md:grid md:grid-cols-[minmax(240px,1fr)_auto_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 py-2.5 pl-10 pr-4 text-sm text-gray-800 dark:text-neutral-100 placeholder:text-gray-500 dark:placeholder:text-neutral-500 outline-none transition-all duration-200 focus:border-red-600/40 focus:ring-2 focus:ring-red-600/10"
                />
              </div>

              <div className="lg:hidden">
                <button
                  onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                  className="inline-flex h-[42px] items-center gap-1.5 rounded-xl border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-950 px-3 text-sm font-medium text-gray-700 dark:text-neutral-200 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-red-600/10 px-1.5 py-0.5 text-xs font-semibold text-red-600">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="inline-flex items-center rounded-xl border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-950 p-1">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                    viewMode === "grid"
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800"
                  }`}
                  aria-label="Grid view"
                >
                  <Grid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                    viewMode === "list"
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800"
                  }`}
                  aria-label="List view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              <div className="relative min-w-[190px]">
                <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gray-500 dark:text-neutral-400">
                  <ArrowUpDown className="h-4 w-4" />
                </div>
                <Dropdown
                  options={sortOptions}
                  value={sortBy}
                  onChange={handleSortChange}
                  placeholder="Sort by"
                  className="[&>button]:h-[42px] [&>button]:rounded-xl [&>button]:border-gray-300 dark:[&>button]:border-neutral-600 [&>button]:bg-white dark:[&>button]:bg-neutral-950 [&>button]:text-gray-800 dark:text-neutral-100 dark:[&>button]:text-neutral-100 [&>button]:pl-9 [&>button]:pr-8 [&>button]:text-sm [&>button]:font-medium [&>button]:focus:ring-red-600/10"
                />
              </div>
            </div>
          </div>

          {/* Results Header - Enhanced styling */}
          <div className="flex flex-col gap-4 mb-8">
            {/* Results count and loading */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <p className="text-gray-600 dark:text-neutral-400 text-sm sm:text-base">
                  {totalProducts > 0 ? (
                    <>
                      Showing {(currentPage - 1) * 12 + 1}-{Math.min(currentPage * 12, totalProducts)} of{" "}
                      {totalProducts} Products
                    </>
                  ) : (
                    "No products found"
                  )}
                </p>
                {isLoading && (
                  <div className="w-4 h-4 border-2 border-gray-300 dark:border-neutral-600 border-t-black dark:border-t-white rounded-full animate-spin" />
                )}
              </div>
            </div>

            {/* Error message */}
            {isError && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg p-3 mb-4">
                <p className="text-red-600 dark:text-red-400 text-sm">
                  {error instanceof Error ? error.message : "Failed to load products. Please try again."}
                </p>
              </div>
            )}

          </div>

          {/* Products Grid/List */}
          {isLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 lg:gap-6 mb-12">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-neutral-900 rounded-[25px] shadow-[0px_4px_10px_0px_rgba(0,0,0,0.1)] dark:shadow-[0px_4px_10px_0px_rgba(0,0,0,0.4)] p-4 sm:p-6 animate-pulse"
                >
                  <div className="h-[150px] sm:h-[196px] bg-gray-200 dark:bg-neutral-800 rounded-[10px] mb-4" />
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 dark:bg-neutral-800 rounded w-1/2" />
                    <div className="h-3 bg-gray-200 dark:bg-neutral-800 rounded w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : transformedProducts.length > 0 ? (
            <div
              className={`grid gap-2 sm:gap-4 lg:gap-6 mb-12 ${
                viewMode === "grid"
                  ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-1"
              }`}
            >
              {transformedProducts.map((product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  onAddToCart={handleAddToCart}
                  width="w-full"
                  viewMode={viewMode}
                />
              ))}
            </div>
          ) : hasControlsApplied ? (
            /*
              Filtered to zero — NOT an empty shop.
              This branch used to render the same "Coming Soon / our shop is currently
              being set up" panel as a genuinely empty catalogue, so narrowing to a size
              with no match told the customer the shop did not exist yet. Mirrors the
              mini-draws empty state, including the clear-filters escape hatch.
            */
            <div className="flex flex-col items-center gap-2.5 px-8 py-11 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#F3F4F6] text-[#9CA3AF] dark:bg-neutral-800">
                <Search className="h-6 w-6" />
              </span>
              <h3 className="text-[15px] font-bold text-[#111827] dark:text-white">
                {searchQuery ? `No products found for "${searchQuery}"` : "No products found"}
              </h3>
              <p className="text-[13px] leading-[1.5] text-[#6B7280] dark:text-neutral-400">
                Try a different filter or clear your filters.
              </p>
              <button
                type="button"
                onClick={handleClearAll}
                className="mt-1 h-[38px] rounded-full bg-[#111827] px-[18px] text-[12.5px] font-bold text-white dark:bg-white dark:text-neutral-900"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            /* Genuinely nothing in the catalogue — the only case that may say "coming soon". */
            <div className="text-center py-16">
              <div className="text-gray-400 mb-6">
                <Clock className="w-20 h-20 mx-auto text-gray-300" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3 font-poppins">
                Coming Soon
              </h3>
              <p className="text-base sm:text-lg text-gray-600 dark:text-neutral-300 mb-6 max-w-md mx-auto font-['Inter']">
                Our shop is currently being set up. In the meantime, check out our exciting mini-draws where you can win
                amazing tools!
              </p>
              <MetallicButton href="/mini-draws" variant="primary" size="md" borderRadius="lg">
                Visit Mini Draws
              </MetallicButton>
            </div>
          )}

          {/* Pagination - Mobile optimized */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {/* Mobile pagination - simplified */}
              <div className="flex sm:hidden items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-gray-300 dark:border-neutral-600 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-900 dark:text-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <span className="px-3 py-2 text-sm text-gray-600 dark:text-neutral-400">
                  {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border border-gray-300 dark:border-neutral-600 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-900 dark:text-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>

              {/* Desktop pagination - full */}
              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-gray-300 dark:border-neutral-600 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-900 dark:text-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>

                <div className="flex gap-1">
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (currentPage <= 4) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = currentPage - 3 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-10 h-10 rounded-lg transition-colors ${
                          pageNum === currentPage
                            ? "bg-black text-white dark:bg-white dark:text-black"
                            : "border border-gray-300 dark:border-neutral-600 text-gray-900 dark:text-neutral-100 hover:bg-gray-50 dark:hover:bg-neutral-800"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border border-gray-300 dark:border-neutral-600 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-900 dark:text-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionContainer>
  );
}
