"use client";

import { useState, useEffect } from "react";
import ProductCard from "@/components/ui/ProductCard";
import ProductFilters from "@/components/features/ProductFilters";
import MetallicButton from "@/components/ui/MetallicButton";
import { Grid, List, Filter, X, Search, Clock, ArrowUpDown } from "lucide-react";
import { Product as ProductType } from "@/types/product";
import { useProducts, type Product as ReactQueryProduct } from "@/hooks/queries";
import { SectionContainer } from "@/components/ui";
import Dropdown from "@/components/modals/ui/Dropdown";

// Filter state interface
interface FilterState {
  category: string[];
  priceRange: [number, number];
  brands: string[];
  styles: string[];
}

// Remove ApiResponse interface as it's now handled by React Query

// Sort options - Updated to match API
const sortOptions = [
  { value: "createdAt-desc", label: "Newest Arrivals" },
  { value: "createdAt-asc", label: "Oldest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating-desc", label: "Top Rated" },
  { value: "name-asc", label: "Name (A-Z)" },
];

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
  // State management for shop page
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({
    category: [],
    priceRange: [0, 500],
    // If a default brand is provided we pre-populate the filters array.
    brands: defaultBrand ? [defaultBrand] : [],
    styles: [],
  });
  const [sortBy, setSortBy] = useState("createdAt-desc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

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
    minPrice: filters.priceRange[0] > 0 ? filters.priceRange[0] : undefined,
    maxPrice: filters.priceRange[1] < 500 ? filters.priceRange[1] : undefined,
    sortBy: sortField,
    sortOrder: sortOrder as "asc" | "desc",
  });

  // Transform React Query products to match expected ProductType interface
  const transformedProducts: ProductType[] =
    productsData?.products?.map((product: ReactQueryProduct) => ({
      ...product,
      reviews: product.reviewCount || 0,
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

  // Handle add to cart
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAddToCart = (product: any) => {
    // TODO: Implement add to cart functionality
    console.log("Add to cart:", product);
  };

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page when search changes
  };

  // Handle filter changes
  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  // Handle closing mobile filters (useful after applying filters)
  const handleCloseFilters = () => {
    setIsFiltersOpen(false);
  };

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
      styles: [],
    });
    setSortBy("createdAt-desc");
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
    filters.styles.length +
    (filters.priceRange[0] > 0 || filters.priceRange[1] < 500 ? 1 : 0);
  const hasControlsApplied = activeFilterCount > 0 || debouncedSearch.trim().length > 0 || sortBy !== "createdAt-desc";

  return (
    <SectionContainer className="py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Filters - Desktop */}
        <div className="hidden lg:block w-80 flex-shrink-0">
          <ProductFilters selectedFilters={filters} onFilterChange={handleFilterChange} isMobile={false} />
        </div>

        {/* Mobile/Tablet Filter Overlay */}
        {isFiltersOpen && (
          <div className="fixed inset-0 z-[110] lg:hidden">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-300"
              onClick={handleCloseFilters}
            />

            {/* Sidebar */}
            <div className="absolute left-0 top-0 h-full w-80 max-w-[90vw] bg-white dark:bg-neutral-900 shadow-xl overflow-y-auto brand-scrollbar transform transition-transform duration-300 ease-in-out border-r-2 border-gray-200 dark:border-red-900/40">
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
          ) : (
            <div className="text-center py-16">
              <div className="text-gray-400 mb-6">
                <Clock className="w-20 h-20 mx-auto text-gray-300" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3 font-['Poppins']">
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
