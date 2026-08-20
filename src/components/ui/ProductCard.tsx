"use client";

import React, { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, ShoppingCart, Ticket, Check, Loader2, AlertCircle, RefreshCw, Tag, Zap } from "lucide-react";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { useCart } from "@/contexts/CartContext";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { getBrandMeta, defaultBrandLogo } from "@/utils/brand-utils";
import type { BrandLogo } from "@/data/brandLogos";
import BrandLogoCard from "@/components/ui/BrandLogoCard";
import { useUserContext } from "@/contexts/UserContext";
import { useMiniDraw } from "@/hooks/queries/useMiniDrawQueries";
import { cn } from "@/utils/cn";
import SignInToBuyModal from "@/components/modals/SignInToBuyModal";
import { resolveMemberShopPrice } from "@/utils/shop/member-discount";
import { shouldShowReviews } from "@/utils/shop/reviews";

// Types
interface ProductItem {
  _id: string;
  name: string;
  price: number;
  images: string[];
  brand: string;
  stock: number;
  /**
   * Print-to-order items sit at stock 0 permanently — the printer makes each one on
   * demand. Without this the card reads stock 0 as "Sold Out" and disables its own
   * Add button, which is what made every merchandise item unbuyable from the shop
   * listing while the product page (which does check it) said "Made to order".
   * Absent = true, so tracked stock keeps its existing behaviour exactly.
   */
  trackInventory?: boolean;
  /** Reviews as stored — an array, matching the model. The count is reviewCount. */
  reviews?: { rating: number }[];
  /** ALL reviews, including ones below the display threshold. */
  reviewCount?: number;
  rating?: number;
}

interface MiniDrawType {
  _id: string;
  name: string;
  status: "active" | "completed" | "cancelled";
  totalEntries: number;
  minimumEntries: number;
  entriesRemaining?: number;
  isActive?: boolean;
  requiresMembership: boolean;
  hasActiveMembership?: boolean;
  brandId?: string;
  userEntryCount?: number; // User's entry count in this specific minidraw
  prize: {
    name: string;
    value: number;
    images: string[];
  };
}

interface NormalizedProductData {
  id: string;
  name: string;
  price: number;
  images: string[];
  brand: string;
  brandAccent: {
    label: string;
    logo: string;
    overlayScale: number;
    hasBrand: boolean;
    brandData: BrandLogo;
    gradientOverride?: string | null;
  } | null;
  stock: number | null;
  /** False for print-to-order: stock 0 must not read as sold out. */
  trackInventory: boolean;
  rating: number;
  isPrize: boolean;
  endDate: Date | null;
  startDate: Date | null;
  isActive: boolean;
  totalEntries: number | null;
  minimumEntries: number | null;
  status: MiniDrawType["status"] | null;
  entriesRemaining: number | null;
  requiresMembership: boolean;
  hasActiveMembership: boolean;
}

type ProductCardProps = {
  product: ProductItem | MiniDrawType;
  onAddToCart?: (product: ProductItem | MiniDrawType) => void;
  width?: string;
  viewMode?: "grid" | "list";
};

/**
 * The member price, stated next to the shelf price.
 *
 * Shared by this card and the product detail page. It lives in this module
 * rather than a file of its own because the detail page already mounts
 * ProductCard for its related-products row, so both surfaces carry this chunk
 * either way — and that page is a server component, which cannot read who is
 * signed in.
 *
 * The figure comes from resolveMemberShopPrice, which resolves the percentage
 * and the money through the same functions the checkout route runs. Working a
 * percentage out here instead is how a shop ends up showing one price and
 * charging another.
 */
export function MemberPriceLine({
  price,
  variant = "card",
}: {
  price: number;
  variant?: "card" | "detail";
}) {
  const { userData } = useUserContext();
  const memberPrice = resolveMemberShopPrice(price, userData);

  // Nothing to say when no tier discounts this item — never a 0% claim.
  if (!memberPrice) return null;

  if (variant === "card") {
    const scheme = getElectricPackageColorScheme(memberPrice.packageId);

    // A STRIKETHROUGH IS A CLAIM, and it is only true for a member.
    //
    // For someone holding the tier, the full price genuinely is not what they
    // pay, so striking it is accurate and the discounted figure is the headline.
    //
    // For everyone else the full price IS what they pay. Striking it through
    // presents a reduction they do not have — a misleading price representation
    // under Australian Consumer Law, and the exact misrepresentation the older
    // detail block was rewritten to remove. Non-members get the real price as the
    // headline and the member price as a clearly-labelled offer beside it.
    if (memberPrice.isMember) {
      return (
        <div className="mt-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[17px] sm:text-[19px] lg:text-[21px] font-extrabold leading-none text-gray-900 dark:text-white">
              {memberPrice.priceLabel}
            </span>
            <span className="text-[12px] sm:text-[13px] font-medium leading-none text-gray-400 line-through dark:text-neutral-500">
              {memberPrice.fullPriceLabel}
            </span>
          </div>
          <p className="text-[11px] font-medium text-gray-500 dark:text-neutral-400">
            {memberPrice.tierName} price — saves {memberPrice.savingLabel}
          </p>
        </div>
      );
    }

    return (
      <div className="mt-1 space-y-1">
        <div className="text-[17px] sm:text-[19px] lg:text-[21px] font-extrabold leading-none text-gray-900 dark:text-white">
          {memberPrice.fullPriceLabel}
        </div>
        <p className="text-[11px] font-semibold" style={{ color: scheme.accentHex }}>
          {memberPrice.tierName} members pay {memberPrice.priceLabel} — save{" "}
          {memberPrice.savingLabel}
        </p>
      </div>
    );
  }

  const scheme = getElectricPackageColorScheme(memberPrice.packageId);

  // A member: their price is the headline, the shelf price is struck.
  if (memberPrice.isMember) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-poppins text-4xl font-bold text-red-600">
            {memberPrice.priceLabel}
          </span>
          <span className="text-lg font-medium text-gray-400 line-through dark:text-neutral-500">
            {memberPrice.fullPriceLabel}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black uppercase leading-none tracking-wide text-black"
            style={{ backgroundImage: scheme.bgGradient }}
          >
            {memberPrice.percent}% off
          </span>
        </div>
        <p className="text-sm font-medium text-gray-600 dark:text-neutral-400">
          Your {memberPrice.tierName} membership saves you {memberPrice.savingLabel} on this
          item, applied at checkout.
        </p>
      </div>
    );
  }

  // Everyone else: the price they actually pay is the headline, and the
  // membership is presented as an offer rather than as a discount they hold.
  return (
    <div className="space-y-3">
      <span className="font-poppins text-4xl font-bold text-red-600">
        {memberPrice.fullPriceLabel}
      </span>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-3"
        style={{ borderColor: scheme.accentHex }}
      >
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black uppercase leading-none tracking-wide text-black"
          style={{ backgroundImage: scheme.bgGradient }}
        >
          {memberPrice.percent}% off
        </span>
        <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
          {memberPrice.tierName} members pay {memberPrice.priceLabel} — save{" "}
          {memberPrice.savingLabel}
        </p>
        <Link
          href="/membership"
          className="text-xs font-semibold underline underline-offset-2"
          style={{ color: scheme.accentHex }}
        >
          See membership options
        </Link>
      </div>
    </div>
  );
}

export default function ProductCard({
  product,
  onAddToCart,
  width: _width = "w-[295px]",
  viewMode = "grid",
}: ProductCardProps) {
  const {
    items,
    addToCart,
    isAddingToCart,
    isUpdatingCart,
    failedOperations,
    hasFailedOperations,
    retryFailedOperation,
    retryAllFailedOperations,
  } = useCart();
  const { trackAddToCart } = usePixelTracking();
  const { trackAddToCart: trackKlaviyoAddToCart } = useKlaviyoTracking();
  const { userData, isAuthenticated } = useUserContext();
  const [showSignIn, setShowSignIn] = useState(false);
  const router = useRouter();

  // Helper functions
  const getValidRating = (rating: unknown): number => {
    if (typeof rating === "number" && !isNaN(rating)) {
      return Math.max(0, Math.min(5, rating));
    }
    return 4.0;
  };

  const getValidPrice = (price: unknown): number => {
    if (typeof price === "number" && !isNaN(price) && price >= 0) {
      return price;
    }
    return 0;
  };

  const isMiniDrawProduct = (item: ProductItem | MiniDrawType): item is MiniDrawType => {
    // Check for mini draw specific properties (entry-based system)
    return "prize" in item && "status" in item && "minimumEntries" in item;
  };

  // Check if this is a minidraw product
  const isMiniDraw = isMiniDrawProduct(product);

  // Subscribe to minidraw query updates for real-time UI updates
  const { data: miniDrawQueryData } = useMiniDraw(isMiniDraw ? product._id : undefined);

  /**
   * Calculate user's entry count for this specific minidraw.
   * Mini draw eligibility is package-only: only purchased mini pack entries count (no member entries).
   */
  const getUserEntryCount = (): number => {
    if (!isMiniDraw || !isAuthenticated || !userData) return 0;

    const currentMiniDrawId = String(product._id || "");

    const userWithParticipation = userData as unknown as {
      miniDrawParticipation?: Array<{
        miniDrawId: string | { toString(): string } | { _id: string | { toString(): string } };
        totalEntries: number;
        isActive?: boolean;
      }>;
    };

    const participationEntry = userWithParticipation?.miniDrawParticipation?.find((p) => {
      const pkgMiniDrawId = p.miniDrawId;
      if (typeof pkgMiniDrawId === "string") {
        return pkgMiniDrawId === currentMiniDrawId;
      }
      if (pkgMiniDrawId && typeof pkgMiniDrawId === "object") {
        if ("toString" in pkgMiniDrawId && typeof pkgMiniDrawId.toString === "function") {
          return pkgMiniDrawId.toString() === currentMiniDrawId;
        }
        if ("_id" in pkgMiniDrawId) {
          const idValue = (pkgMiniDrawId as { _id: unknown })._id;
          if (typeof idValue === "string") {
            return idValue === currentMiniDrawId;
          }
          if (idValue && typeof idValue === "object" && "toString" in idValue) {
            return (idValue as { toString: () => string }).toString() === currentMiniDrawId;
          }
        }
      }
      return false;
    });

    if (participationEntry && participationEntry.totalEntries > 0) {
      return participationEntry.totalEntries;
    }

    const userMiniDrawPackages = (
      userData as {
        miniDrawPackages?: Array<{
          isActive: boolean;
          miniDrawId?: string | { toString(): string };
          entriesGranted?: number;
        }>;
      }
    ).miniDrawPackages;
    const activeMiniDrawPackageEntries =
      userMiniDrawPackages?.reduce((sum, pkg) => {
        if (!pkg.isActive) return sum;
        const pkgMiniDrawId = pkg.miniDrawId
          ? typeof pkg.miniDrawId === "string"
            ? pkg.miniDrawId
            : pkg.miniDrawId.toString()
          : null;
        if (pkgMiniDrawId && pkgMiniDrawId === currentMiniDrawId) {
          return sum + (pkg.entriesGranted || 0);
        }
        return sum;
      }, 0) || 0;

    return activeMiniDrawPackageEntries;
  };

  const getProductData = (): NormalizedProductData => {
    if (isMiniDrawProduct(product)) {
      // Use query data if available (for real-time updates), otherwise fall back to product prop
      const totalEntries = miniDrawQueryData?.totalEntries ?? product.totalEntries ?? 0;
      const minimumEntries = miniDrawQueryData?.minimumEntries ?? product.minimumEntries ?? 0;
      const entriesRemainingData = miniDrawQueryData?.entriesRemaining ?? product.entriesRemaining;

      const remainingEntries = Math.max(
        0,
        entriesRemainingData !== undefined
          ? entriesRemainingData
          : minimumEntries > 0
          ? minimumEntries - totalEntries
          : 0
      );
      const brandMeta = getBrandMeta(product.brandId);
      const brandData = brandMeta ?? defaultBrandLogo;
      const brandLabel = brandData.name;
      const brandLogo = brandData.logo;
      // Use the overlay scale (not the image scale) so badge dimensions stay consistent across brands.
      const overlayScale = brandMeta?.overlayScale ?? defaultBrandLogo.overlayScale ?? 1;
      const gradientOverride = brandMeta ? undefined : "bg-transparent";

      return {
        id: product._id,
        name: product.name,
        price: getValidPrice(product.prize?.value || 0),
        images: product.prize?.images || [],
        brand: brandLabel,
        brandAccent: {
          label: brandLabel,
          logo: brandLogo,
          overlayScale,
          hasBrand: Boolean(brandMeta),
          brandData,
          gradientOverride,
        },
        stock: remainingEntries,
        // A mini draw has real, finite capacity — remainingEntries 0 means closed,
        // so unlike print-to-order merchandise it is genuinely stock-tracked.
        trackInventory: true,
        rating: 4.5,
        isPrize: true,
        endDate: null,
        startDate: null,
        isActive: product.status === "active" && remainingEntries > 0,
        totalEntries,
        minimumEntries,
        status: product.status,
        entriesRemaining: remainingEntries,
        requiresMembership: product.requiresMembership ?? false, // ✅ AUTHENTICATION-ONLY: Mini draws default to false
        hasActiveMembership: product.hasActiveMembership ?? false,
      };
    } else {
      return {
        id: product._id,
        name: product.name,
        price: getValidPrice(product.price),
        images: product.images,
        brand: product.brand,
        brandAccent: null,
        stock: product.stock,
        trackInventory: product.trackInventory ?? true,
        rating: getValidRating(product.rating),
        isPrize: false,
        endDate: null,
        startDate: null,
        isActive: true,
        totalEntries: null,
        minimumEntries: null,
        status: null,
        entriesRemaining: null,
        requiresMembership: false,
        hasActiveMembership: false,
      };
    }
  };

  const productData = getProductData();

  // Free entries and the item's multiplier, read defensively: `product` is a
  // union of the static ProductData fixtures and the DB shape, and only the
  // latter carries either field. Widening the type would make the fixtures lie.
  //
  // `entryMultiplier` arrives ALREADY RESOLVED from /api/products — the server
  // collapses product -> category -> shop-wide, because the last two are admin
  // config the browser has no business holding. Resolving here from a partial
  // view is how a card and the product page end up printing different numbers.
  const rawEntries = (product as { includedEntries?: unknown }).includedEntries;
  const entryCount = typeof rawEntries === "number" && rawEntries > 0 ? rawEntries : 0;
  const rawMultiplier = (product as { entryMultiplier?: unknown }).entryMultiplier;
  const entryMultiplier =
    typeof rawMultiplier === "number" && rawMultiplier > 0 ? rawMultiplier : 1;

  // The multiplier mark borrows the BOSS palette deliberately — it is the tier
  // whose colour already reads as "the biggest entry number" across the
  // membership cards, so a shopper meets one visual language for entries.
  const multiplierScheme = getElectricPackageColorScheme("boss-subscription");

  // Whether MemberPriceLine will render anything. Computed here so the plain
  // price and the discounted block are mutually exclusive rather than both
  // trying to be the headline figure.
  const memberPrice = resolveMemberShopPrice(productData.price, userData);
  const memberPriceApplies = Boolean(memberPrice);

  // The percentage moves onto the image; the price block below keeps the figures.
  // Shown for members and non-members alike because it describes the OFFER, not a
  // reduction the viewer already holds — the price block is what distinguishes
  // those two cases, and it does so without striking a price anyone would pay.
  const discountBadge = memberPrice
    ? {
        percent: memberPrice.percent,
        gradient: getElectricPackageColorScheme(memberPrice.packageId).bgGradient,
      }
    : null;
  // Garment mockups are shot whole on a white ground, so cropping them to fill
  // lops off sleeves and hems. Tools are photographed to fill the frame and still
  // look best cropped, and trackInventory is what already separates the two:
  // print-to-order apparel carries false.
  const imageFit = productData.trackInventory ? "object-cover" : "object-contain";
  const brandAccent = productData.brandAccent;

  // The cart's own item list is the single source of truth for "added": addToCart writes it
  // optimistically on click, and a failed sync reverts it from the server. A local "added"
  // flag alongside it is what used to leave the button stuck green behind a rejected add.
  const isInCart = items.some((item) => item.productId === productData.id);

  // The add is queued and POSTed later by the provider, so a rejection surfaces here as a
  // failed operation — never as a rejection from addToCart().
  const failedAddOperation = failedOperations.find(
    (operation) => operation.type === "add" && operation.data.productId === productData.id
  );
  const hasError = Boolean(failedAddOperation);

  // Optimistic add to cart handler
  const handleAddToCart = useCallback(async () => {
    // A supplied onAddToCart REPLACES the add rather than following it.
    //
    // ShopContent passes one to route the shopper to the product page, because
    // apparel needs a size and colour this card cannot collect. Adding here wrote
    // a sku-less line the cart API rejects with a 400, while still emitting
    // AddToCart to Meta, TikTok and Klaviyo for a line that never persisted — and
    // then the product page emitted a second one for the same intent. Every
    // other render site leaves this undefined, so their behaviour is unchanged.
    // Signed out, the optimistic add was queued and could never drain — both
    // drain paths are gated on userId — so the card sat on "Adding…" forever
    // and nothing was ever saved. Ask first.
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }

    if (onAddToCart) {
      onAddToCart(product);
      return;
    }

    // A PRODUCT goes to its own page; only a mini-draw ticket is added from here.
    //
    // A card cannot collect a size or a colour, and the cart API rejects a
    // variant-bearing line with no sku (400). Every render site without an
    // onAddToCart handler — the homepage rows and the Related Products strip —
    // was therefore firing a request the server refused, while still reporting
    // AddToCart to Meta, TikTok and Klaviyo for a line that never existed. The
    // card then offered Retry, which re-sent the identical rejected request.
    //
    // The list query deliberately does not carry `variants`, so a card cannot
    // know whether a choice is required; the product page is the one surface
    // that can. This is the same conclusion ShopContent already reached for the
    // shop grid, applied everywhere rather than in one caller.
    if (!isMiniDrawProduct(product)) {
      router.push(`/shop/${productData.id}`);
      return;
    }

    // Only a mini-draw ticket reaches here — the branch above sends every product
    // to its own page. A ticket has no size or colour to choose, so a card CAN
    // add one, and the compiler now proves the product branch is unreachable.
    await addToCart({
      miniDrawId: productData.id,
      quantity: 1,
      price: productData.price,
      miniDraw: {
        _id: product._id,
        name: product.name,
        ticketPrice: productData.price, // Prize value doubles as price for the cart
        totalTickets: product.minimumEntries || 0,
        soldTickets: product.totalEntries || 0,
        prize: product.prize,
      },
    });

    try {
      // Track pixel events for add to cart
      trackAddToCart({
        value: productData.price,
        currency: "AUD",
        content_type: productData.isPrize ? "prize_draw" : "product",
        content_ids: [productData.id],
        content_name: productData.name,
        content_category: productData.brand,
        num_items: 1,
      });

      // Track Klaviyo add to cart event
      trackKlaviyoAddToCart({
        value: productData.price,
        currency: "AUD",
        product_id: productData.id,
        product_name: productData.name,
        num_items: 1,
      });
    } catch (error) {
      console.error("Error tracking AddToCart:", error);
      // Don't throw - tracking should not break cart functionality
    }

  }, [productData, addToCart, onAddToCart, product, isAuthenticated, router, trackAddToCart, trackKlaviyoAddToCart]);

  // Retry the operation that actually failed, so it leaves failedOperations and the card
  // returns to its normal state. Re-running handleAddToCart would queue a second operation
  // and leave the original stuck in the failed list forever.
  const handleRetry = useCallback(async () => {
    if (!failedAddOperation) return;
    await retryFailedOperation(failedAddOperation.id);
  }, [failedAddOperation, retryFailedOperation]);

  // NOTE: ViewContent tracking removed from ProductCard component mount
  // ViewContent should only fire on product detail pages, not on card renders
  // This prevents noise (was firing 37.4K events vs 3.1K PageView)
  // Function kept commented for potential future use (e.g., click tracking)
  // const handleViewProduct = useCallback(() => {
  //   trackViewContent({
  //     value: productData.price,
  //     currency: "AUD",
  //     content_type: productData.isPrize ? "prize_draw" : "product",
  //     content_ids: [productData.id],
  //     content_name: productData.name,
  //     content_category: productData.brand,
  //   });
  // }, [productData, trackViewContent]);

  const renderStars = (rating: number) => {
    const validRating = getValidRating(rating);
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < Math.floor(validRating) ? "text-yellow-400 fill-current" : "text-gray-300"}`}
      />
    ));
  };

  // Only a stock-TRACKED item can be out of stock. A print-to-order garment is
  // never out of stock — matches ProductInteractions on the product page, which
  // has always had this check while the card did not.
  const isOutOfStock = productData.trackInventory && productData.stock === 0;
  const miniDrawStatus = productData.isPrize ? (productData.status as MiniDrawType["status"] | null) : null;
  const entriesRemaining = productData.isPrize ? productData.entriesRemaining ?? 0 : null;
  const isPrizeCancelled = productData.isPrize && miniDrawStatus === "cancelled";
  const isPrizeClosed =
    productData.isPrize && (miniDrawStatus === "completed" || (entriesRemaining !== null && entriesRemaining <= 0));

  // Check loading states — the queued operation is the accurate signal; it exists from the
  // click until the provider has drained it.
  const isCurrentlyLoading = isAddingToCart(productData.id) || isUpdatingCart(productData.id);

  // Grid view
  if (viewMode === "grid") {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-[20px] sm:rounded-[25px] lg:rounded-[30px] border border-transparent dark:border-neutral-800 shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.45)] transition-all duration-300 overflow-hidden group h-full flex flex-col">
        <div className="relative">
          {/* Product Image */}
          <Link href={productData.isPrize ? `/mini-draws/${productData.id}` : `/shop/${productData.id}`}>
            <div className="relative w-full h-[200px] sm:h-[220px] lg:h-[240px] overflow-hidden">
              <Image
                src={productData.images[0] || "/images/placeholder.jpg"}
                alt={productData.name}
                fill
                className={`${imageFit} transition-transform duration-300 group-hover:scale-105`}
                sizes="(max-width: 640px) 200px, (max-width: 1024px) 220px, 240px"
              />
            </div>
          </Link>

          {/*
            Entry marks and the member discount sit ON the image, top-left, not in
            the text block below.

            They are the reasons to look twice at this card, and in a grid the eye
            reaches the image before the copy. Putting them under the title also
            pushed the price down far enough that a 3-up row could not align its
            buttons without every card growing to match the tallest.

            pointer-events-none so the overlay never intercepts the click that
            opens the product — the whole image is a link.
          */}
          {(entryCount > 0 || discountBadge) && (
            <div className="pointer-events-none absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
              {discountBadge && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-black uppercase leading-none tracking-wide text-black shadow-sm"
                  style={{ backgroundImage: discountBadge.gradient }}
                >
                  <Tag className="h-3 w-3" aria-hidden="true" />
                  {discountBadge.percent}% off
                </span>
              )}
              {entryCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-[3px] text-[10px] font-bold uppercase leading-none tracking-wide text-white shadow-sm">
                  <Ticket className="h-3 w-3" aria-hidden="true" />
                  {entryCount} free {entryCount === 1 ? "entry" : "entries"}
                </span>
              )}
              {entryCount > 0 && entryMultiplier > 1 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-black uppercase leading-none tracking-wide text-black shadow-sm"
                  style={{ backgroundImage: multiplierScheme.bgGradient }}
                >
                  <Zap className="h-3 w-3" aria-hidden="true" />
                  {entryMultiplier}× entries
                </span>
              )}
            </div>
          )}

          {/* Brand Overlay */}
          {productData.isPrize && brandAccent && (
            <div className="absolute bottom-12 right-2 z-10">
              <BrandLogoCard
                brand={brandAccent.brandData}
                overlayMode="overlay"
                gradientOverride={brandAccent.gradientOverride ?? undefined}
                scaleOverride={brandAccent.overlayScale}
                widthClass="w-auto"
                heightClass="h-auto"
              />
            </div>
          )}

          {/* Your Entries Badge - Top Center (only shows if user has entries) */}
          {productData.isPrize && isAuthenticated && getUserEntryCount() > 0 && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 z-10 whitespace-nowrap">
              <div className="relative bg-gradient-to-r from-green-500 to-green-600 text-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-2xs sm:text-xs font-medium shadow-lg shadow-green-500/50 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 opacity-40"></div>
                <span className="relative z-10 flex items-center gap-1">
                  <Ticket className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  Your Entries: {getUserEntryCount()}
                </span>
              </div>
            </div>
          )}

          {/* Mini Draw Entry Display */}
          {productData.isPrize && productData.minimumEntries && (
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white p-2">
              <div className="flex justify-center items-center text-xs">
                <span>{productData.entriesRemaining || 0} entries remaining</span>
              </div>
            </div>
          )}

          {/* Error indicator */}
          {hasError && (
            <div className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full">
              <AlertCircle className="w-4 h-4" />
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4 lg:p-5 flex flex-col h-full">
          {/* Product Info Section - Flexible content */}
          <div className="flex-1 space-y-2">
            {/* Product Name */}
            <Link href={productData.isPrize ? `/mini-draws/${productData.id}` : `/shop/${productData.id}`}>
              <h3 className="text-[14px] sm:text-[16px] lg:text-[18px] font-bold text-gray-900 dark:text-white hover:text-blue-600 transition-colors line-clamp-2 min-h-[2.5rem]">
                {productData.name}
              </h3>
            </Link>

            {/* Brand (products only) */}
            {!productData.isPrize && (
              <p className="text-[12px] sm:text-[14px] lg:text-[16px] text-gray-600 dark:text-neutral-400 tracking-[0.1px]">
                {productData.brand}
              </p>
            )}

            {/* Rating. Same gate as the product page and the JSON-LD -- at least one
                review AND a 4-star average. Ungated, a brand-new print-to-order
                garment showed five grey stars and (0.0), which reads as a bad
                product rather than a new one, and contradicted its own detail page. */}
            {!productData.isPrize &&
              shouldShowReviews({
                // displayReviewCount, NOT reviewCount: the latter counts reviews a
                // customer never sees, so the card would show stars for a product
                // whose visible list is empty.
                displayableCount:
                  (product as { displayReviewCount?: number }).displayReviewCount ?? 0,
              }) && (
              <div className="flex items-center gap-1">
                {/* The DISPLAYED average, matching the product page. productData.rating
                    averages every review including the hidden ones, so the same
                    product read 3.2 here and 4.8 on its own page. */}
                <div className="flex items-center">
                  {renderStars((product as { displayRating?: number }).displayRating ?? 0)}
                </div>
                <span className="text-[12px] sm:text-[14px] text-gray-600 dark:text-neutral-400 ml-1">
                  ({((product as { displayRating?: number }).displayRating ?? 0).toFixed(1)})
                </span>
              </div>
            )}

            {/* Stock Status for Products */}
            {!productData.isPrize && (
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", isOutOfStock ? "bg-red-500" : "bg-green-500")} />
                <span className="text-[12px] sm:text-[14px] text-gray-600 dark:text-neutral-400">
                  {isOutOfStock ? "Out of Stock" : !productData.trackInventory ? "Made to order" : "In Stock"}
                </span>
              </div>
            )}

            {/* Mini Draw Status */}
            {productData.isPrize && (
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isPrizeCancelled ? "bg-red-500" : isPrizeClosed ? "bg-yellow-500" : "bg-green-500"
                  }`}
                />
                <span className="text-[12px] sm:text-[14px] text-gray-600 dark:text-neutral-400">
                  {isPrizeCancelled ? "Cancelled" : isPrizeClosed ? "Closed" : "Active"}
                </span>
              </div>
            )}

            {/* Error message */}
            {hasError && (
              <div className="flex items-center gap-2 text-red-600 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>Failed to add to cart</span>
              </div>
            )}
          </div>

          {/* Price and Button Section - Fixed at bottom */}
          <div className="mt-4 space-y-3">
            {/* Price */}
            {!productData.isPrize && (
              <div>
                {/* Mini draws are excluded above: their figure is a prize VALUE,
                    not a price anyone pays, so no discount applies to it.

                    MemberPriceLine renders the FULL price block when a discount
                    applies — discounted figure, struck original, tier badge. The
                    plain figure below is the no-discount fallback, so the two can
                    never both render and disagree about which number is the price. */}
                {memberPriceApplies ? (
                  <MemberPriceLine price={productData.price} />
                ) : (
                  <div className="text-[16px] sm:text-[18px] lg:text-[20px] font-bold text-gray-900 dark:text-white">
                    <span>${productData.price.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Add to Cart Button - Optimistic with Error Handling */}
            <div>
              {hasError ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleRetry}
                    className="flex-1 py-2 sm:py-2.5 lg:py-3 px-3 sm:px-4 lg:px-6 rounded-[40px] sm:rounded-[45px] lg:rounded-[50px] font-bold text-2xs sm:text-[12px] lg:text-[14px] text-white tracking-[0.1px] flex items-center justify-center gap-1 sm:gap-2 lg:gap-[9px] transition-all duration-200 bg-red-600 hover:bg-red-700"
                  >
                    <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                    <span className="hidden sm:inline">Retry</span>
                    <span className="sm:hidden">Retry</span>
                  </button>
                  {hasFailedOperations && (
                    <button
                      onClick={retryAllFailedOperations}
                      className="px-3 py-2 sm:py-2.5 lg:py-3 rounded-[40px] sm:rounded-[45px] lg:rounded-[50px] font-bold text-2xs sm:text-[12px] lg:text-[14px] text-white tracking-[0.1px] bg-orange-600 hover:bg-orange-700 transition-all duration-200"
                      title="Retry all failed operations"
                    >
                      <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                    </button>
                  )}
                </div>
              ) : productData.isPrize ? (
                // For mini draws, redirect to detail page
                <Link
                  href={`/mini-draws/${productData.id}`}
                  className="w-full py-2 sm:py-2.5 lg:py-3 px-3 sm:px-4 lg:px-6 rounded-[40px] sm:rounded-[45px] lg:rounded-[50px] font-bold text-2xs sm:text-[12px] lg:text-[14px] text-white tracking-[0.1px] flex items-center justify-center gap-1 sm:gap-2 lg:gap-[9px] transition-all duration-200 bg-black hover:bg-gray-800"
                >
                  <span className="text-3xs sm:text-2xs lg:text-xs font-semibold">$1</span>
                  <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5">
                    <Ticket className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                  </div>
                  <span className="hidden sm:inline">
                    {isPrizeCancelled ? "Cancelled" : isPrizeClosed ? "View Details" : "Enter Draw"}
                  </span>
                  <span className="sm:hidden">
                    {isPrizeCancelled ? "Cancel" : isPrizeClosed ? "View" : "Enter Draw"}
                  </span>
                </Link>
              ) : (
                <button
                  onClick={handleAddToCart}
                  disabled={isOutOfStock || isInCart || isCurrentlyLoading}
                  className={`w-full py-2 sm:py-2.5 lg:py-3 px-3 sm:px-4 lg:px-6 rounded-[40px] sm:rounded-[45px] lg:rounded-[50px] font-bold text-2xs sm:text-[12px] lg:text-[14px] text-white tracking-[0.1px] flex items-center justify-center gap-1 sm:gap-2 lg:gap-[9px] transition-all duration-200 ${
                    isOutOfStock || isInCart || isCurrentlyLoading
                      ? isInCart
                        ? "bg-green-600 cursor-not-allowed"
                        : isCurrentlyLoading
                        ? "bg-blue-600 cursor-not-allowed animate-pulse"
                        : "bg-gray-400 cursor-not-allowed"
                      : "bg-black hover:bg-gray-800"
                  }`}
                >
                  <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5">
                    {isCurrentlyLoading ? (
                      <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 animate-spin" />
                    ) : isInCart ? (
                      <Check className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                    ) : (
                      <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                    )}
                  </div>
                  <span className="hidden sm:inline">
                    {isCurrentlyLoading
                      ? "Adding..."
                      : isInCart
                      ? "Added to Cart"
                      : isOutOfStock
                      ? "Sold Out"
                      : "Add to Cart"}
                  </span>
                  <span className="sm:hidden">
                    {isCurrentlyLoading ? "Adding..." : isInCart ? "Added" : isOutOfStock ? "Sold Out" : "Add"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      {/* Mounted ONLY while open. A closed modal still mounts its whole subtree,
          and this renders once per card - a grid of twelve products would mount
          twelve LoginModals, each with its own hooks and its own dialog node,
          which is the repo perf rule about never rendering a modal closed. */}
      {showSignIn && (
        <SignInToBuyModal
          isOpen
          onClose={() => setShowSignIn(false)}
          intent="add this to your cart"
        />
      )}
      </div>
    );
  }

  // List view (similar optimistic approach)
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-[20px] border border-transparent dark:border-neutral-800 shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.45)] transition-all duration-300 overflow-hidden">
      <div className="flex">
        {/* Product Image */}
        <Link href={productData.isPrize ? `/mini-draws/${productData.id}` : `/shop/${productData.id}`}>
          <div className="relative w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0">
            <Image
              src={productData.images[0] || "/images/placeholder.jpg"}
              alt={productData.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 96px, 128px"
            />
            {productData.isPrize && brandAccent && (
              <div className="absolute bottom-1 right-1 z-10">
                <BrandLogoCard
                  brand={brandAccent.brandData}
                  overlayMode="overlay"
                  gradientOverride={brandAccent.gradientOverride ?? undefined}
                  scaleOverride={brandAccent.overlayScale}
                  widthClass="w-auto"
                  heightClass="h-auto"
                />
              </div>
            )}
            {/* Error indicator for list view */}
            {hasError && (
              <div className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded-full">
                <AlertCircle className="w-3 h-3" />
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 p-4 flex flex-col justify-between">
          <div className="space-y-2">
            {/* Product Name */}
            <Link href={productData.isPrize ? `/mini-draws/${productData.id}` : `/shop/${productData.id}`}>
              <h3 className="text-[14px] sm:text-[16px] lg:text-[18px] font-bold text-gray-900 dark:text-white hover:text-blue-600 transition-colors line-clamp-2">
                {productData.name}
              </h3>
            </Link>

            {/* Brand (products only) */}
            {!productData.isPrize && (
              <p className="text-[14px] sm:text-[16px] text-gray-600 dark:text-neutral-400 tracking-[0.1px]">{productData.brand}</p>
            )}

            {/* Rating - Only show for products, not mini draws */}
            {!productData.isPrize && (
              <div className="flex items-center gap-1">
                <div className="flex items-center">{renderStars(productData.rating)}</div>
                <span className="text-[14px] text-gray-600 dark:text-neutral-400 ml-1">
                  ({getValidRating(productData.rating).toFixed(1)})
                </span>
              </div>
            )}

            {/* Stock Status for Products */}
            {!productData.isPrize && (
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", isOutOfStock ? "bg-red-500" : "bg-green-500")} />
                <span className="text-[12px] sm:text-[14px] text-gray-600 dark:text-neutral-400">
                  {isOutOfStock ? "Out of Stock" : !productData.trackInventory ? "Made to order" : "In Stock"}
                </span>
              </div>
            )}

            {/* Mini Draw Progress Bar (Entry-based) - List View */}
            {productData.isPrize && productData.minimumEntries && (
              <div className="flex justify-center items-center text-xs">
                <span className="text-gray-700 dark:text-neutral-200">{productData.entriesRemaining || 0} entries remaining</span>
              </div>
            )}

            {/* Error message for list view */}
            {hasError && (
              <div className="flex items-center gap-2 text-red-600 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>Failed to add to cart</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4">
            {/* Price */}
            {!productData.isPrize && (
              <div>
                <div className="text-[16px] sm:text-[18px] lg:text-[20px] font-bold text-gray-900 dark:text-white">
                  <span>${productData.price.toFixed(2)}</span>
                </div>
                <MemberPriceLine price={productData.price} />
              </div>
            )}

            {/* Add to Cart Button with optimistic feedback */}
            {productData.isPrize ? (
              // For mini draws, redirect to detail page
              <Link
                href={`/mini-draws/${productData.id}`}
                className="px-4 sm:px-8 py-2 sm:py-3 rounded-[50px] font-bold text-[12px] sm:text-[14px] text-white tracking-[0.1px] flex items-center gap-[6px] sm:gap-[9px] transition-all duration-200 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
              >
                <span className="text-2xs sm:text-xs font-semibold">$1</span>
                <div className="w-4 h-4 sm:w-5 sm:h-5">
                  <Ticket className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span className="hidden sm:inline">
                  {isPrizeCancelled ? "Cancelled" : isPrizeClosed ? "View Details" : "Enter Draw"}
                </span>
                <span className="sm:hidden">{isPrizeCancelled ? "Cancel" : isPrizeClosed ? "View" : "Enter Draw"}</span>
              </Link>
            ) : hasError ? (
              <div className="flex gap-2">
                <button
                  onClick={handleRetry}
                  className="px-4 sm:px-6 py-2 sm:py-3 rounded-[50px] font-bold text-[12px] sm:text-[14px] text-white tracking-[0.1px] flex items-center gap-[6px] sm:gap-[9px] transition-all duration-200 bg-red-600 hover:bg-red-700"
                >
                  <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Retry</span>
                  <span className="sm:hidden">Retry</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock || isInCart || isCurrentlyLoading}
                className={`px-4 sm:px-8 py-2 sm:py-3 rounded-[50px] font-bold text-[12px] sm:text-[14px] text-white tracking-[0.1px] flex items-center gap-[6px] sm:gap-[9px] transition-all duration-200 ${
                  isOutOfStock || isInCart || isCurrentlyLoading
                    ? isInCart
                      ? "bg-green-600 cursor-not-allowed"
                      : isCurrentlyLoading
                      ? "bg-blue-600 cursor-not-allowed animate-pulse"
                      : "bg-gray-400 cursor-not-allowed"
                    : "bg-black hover:bg-gray-800 transition-colors"
                }`}
              >
                <div className="w-4 h-4 sm:w-5 sm:h-5">
                  {isCurrentlyLoading ? (
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  ) : isInCart ? (
                    <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : (
                    <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </div>
                <span className="hidden sm:inline">
                  {isCurrentlyLoading
                    ? "Adding..."
                    : isInCart
                    ? "Added to Cart"
                    : isOutOfStock
                    ? "Sold Out"
                    : "Add to Cart"}
                </span>
                <span className="sm:hidden">
                  {isCurrentlyLoading ? "Adding..." : isInCart ? "Added" : isOutOfStock ? "Sold Out" : "Add"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Mounted ONLY while open. A closed modal still mounts its whole subtree,
          and this renders once per card - a grid of twelve products would mount
          twelve LoginModals, each with its own hooks and its own dialog node,
          which is the repo perf rule about never rendering a modal closed. */}
      {showSignIn && (
        <SignInToBuyModal
          isOpen
          onClose={() => setShowSignIn(false)}
          intent="add this to your cart"
        />
      )}
    </div>
  );
}
