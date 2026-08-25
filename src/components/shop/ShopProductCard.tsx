"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Check, SlidersHorizontal } from "lucide-react";
import { cn } from "@/utils/cn";
import { useCart } from "@/contexts/CartContext";
import { useUserContext } from "@/contexts/UserContext";
import { useToast } from "@/components/ui/Toast";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { ProductBadges, FulfilmentLine } from "@/components/shop/ProductBadges";
import { PriceBlock } from "@/components/shop/PriceBlock";
import { resolveMemberShopPrice } from "@/utils/shop/member-discount";
import { useSidebar } from "@/contexts/SidebarContext";
import SignInToBuyModal from "@/components/modals/SignInToBuyModal";

/**
 * The shop's product card.
 *
 * WHY THIS IS NOT `ui/ProductCard`. That component renders BOTH shop products and
 * mini-draw packs from one 1000-line body, and the two have divergent rules —
 * entry packs have no variants, no stock, no member discount and a different CTA.
 * The redesigned badge system, the variant-aware CTA and the member price block
 * apply only to the shop half. Forking the shop path out is less machinery than
 * branching that component further, and it leaves the mini-draw card untouched.
 *
 * THE INTERACTION THIS FIXES. Adding to cart used to be a dead end: the button
 * said "Added" and then offered nothing to do. Here the button BECOMES the route
 * to the cart once the item is in, and the toast carries a `View cart` action.
 *
 * VARIANTS ARE NOT ADDABLE FROM A GRID. The purchasable unit is a variant
 * (size × colour), so a card for a product that has them routes to the detail
 * page instead of adding. Adding "a hoodie" would have to guess a size, and the
 * server rejects an unknown sku with a 400 anyway.
 */

export interface ShopProductCardProduct {
  _id: string;
  name: string;
  price: number;
  images?: string[];
  brand?: string;
  category?: string;
  stock?: number;
  trackInventory?: boolean;
  isFeatured?: boolean;
  includedEntries?: number;
  entryMultiplier?: number | null;
  /**
   * Whether this product is chosen rather than added.
   *
   * Derived server-side by /api/products, because the listing projection does not
   * ship `variants` — hundreds of rows per garment for a card that renders none.
   * The full array is present only where a caller already has it (the product
   * page's related-products list), so both are accepted and the boolean wins.
   */
  hasVariants?: boolean;
  variants?: { sku: string; isActive?: boolean }[];
  createdAt?: string | Date;
}

/** A product is "new" for its first 30 days. Derived here, not stored. */
const NEW_FOR_DAYS = 30;
function isNewArrival(createdAt?: string | Date): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
}

export default function ShopProductCard({
  product,
  className,
}: {
  product: ShopProductCardProduct;
  className?: string;
}) {
  const router = useRouter();
  const { items, addToCart, isAddingToCart } = useCart();
  const { userData, isAuthenticated } = useUserContext();
  const { showToast } = useToast();
  const { setIsCartOpen } = useSidebar();
  const { trackAddToCart } = usePixelTracking();
  const { trackAddToCart: trackKlaviyoAddToCart } = useKlaviyoTracking();

  /**
   * A local flag for the window BEFORE the optimistic op lands. `isAddingToCart`
   * only goes true once the operation is queued, so without this the button has a
   * frame where a second tap starts a second add — and POST /api/cart is additive,
   * so that silently doubles the stored quantity.
   */
  const [justPressed, setJustPressed] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);

  /*
    Prefer the server's boolean, fall back to counting a full array when a caller
    has one. Getting this wrong is not cosmetic: treating a garment as a simple
    item adds it with no sku, the cart route rejects that with a 400, and the
    button spins forever on a request that cannot succeed.
  */
  const hasVariants =
    product.hasVariants ?? (product.variants ?? []).some((v) => v.isActive !== false);

  // The same resolver the PriceBlock and the till use, so the badge and the price
  // can never disagree about the percentage.
  const memberDiscountPercent = useMemo(() => {
    const p = resolveMemberShopPrice(product.price, userData);
    return p?.isMember ? p.percent : undefined;
  }, [product.price, userData]);

  const inCartQty = useMemo(
    () =>
      items
        .filter((i) => i.type === "product" && i.productId === product._id)
        .reduce((n, i) => n + i.quantity, 0),
    [items, product._id]
  );

  // Stock only gates a product that actually tracks it. Print-to-order merch sits
  // at 0 forever, and an unconditional check makes every garment unbuyable.
  const tracked = product.trackInventory !== false;
  const soldOut = tracked && typeof product.stock === "number" && product.stock <= 0;

  // NEVER `useCart().isLoading` here — that is the global sync flag and it would
  // freeze every button on the page whenever any cart op is in flight.
  const busy = isAddingToCart(product._id) || justPressed;

  const href = `/shop/${product._id}`;

  const handleAdd = useCallback(async () => {
    if (busy || soldOut) return;
    // A variant product is chosen, not guessed.
    if (hasVariants) {
      router.push(href);
      return;
    }

    /*
      SIGNED OUT IS A HARD STOP, not an optimistic add.

      The cart lives on the server (user.cart in Mongo) and CartContext drains its
      queue through an effect that begins with a userId guard. So adding while
      signed out queues an operation that can NEVER drain: the optimistic line
      appears, the button flips to "In cart", and the spinner runs forever against
      a sync that will not happen. The product page already guards this with the
      same modal; the card did not, which is how a shop grid ended up with a
      permanently spinning button for every signed-out visitor.
    */
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }

    setJustPressed(true);
    try {
      await addToCart({
        productId: product._id,
        quantity: 1,
        price: product.price,
        product: {
          _id: product._id,
          name: product.name,
          price: product.price,
          images: product.images ?? [],
          brand: product.brand ?? "",
          stock: product.stock ?? 0,
        },
      });
      // Meta/TikTok take camelCase; Klaviyo takes snake_case. They are not
      // interchangeable — Klaviyo silently drops keys it does not recognise, so a
      // camelCase payload there reports an AddToCart with no product on it.
      trackAddToCart({
        value: product.price,
        currency: "AUD",
        productId: product._id,
        contentName: product.name,
        contentIds: [product._id],
        numItems: 1,
      });
      trackKlaviyoAddToCart({
        value: product.price,
        currency: "AUD",
        product_id: product._id,
        product_name: product.name,
        content_ids: [product._id],
        num_items: 1,
      });
      showToast({
        type: "success",
        title: "Added to cart",
        message: product.name,
        duration: 3000,
        action: { label: "View cart", onClick: () => setIsCartOpen(true) },
      });
    } catch {
      showToast({ type: "error", title: "Could not add that", message: "Give it another go." });
    } finally {
      setJustPressed(false);
    }
  }, [
    busy, soldOut, hasVariants, isAuthenticated, router, href, addToCart, product,
    trackAddToCart, trackKlaviyoAddToCart, showToast, setIsCartOpen,
  ]);

  const ctaLabel = soldOut
    ? "Sold out"
    : hasVariants
      ? "Choose options"
      : inCartQty > 0
        ? "In cart · add another"
        : "Add to cart";

  const image = product.images?.[0];

  return (
    <article
      className={cn(
        // Deliberately NOT overflow-hidden: the mobile FAB half-overlaps the
        // image's bottom edge, and clipping it is what a rounded card does by
        // default. The image clips its own corners instead.
        "group relative flex flex-col rounded-2xl border border-token bg-surface",
        "shadow-[0_14px_30px_-22px_rgba(15,23,42,.35)] dark:shadow-[0_14px_30px_-18px_rgba(0,0,0,.9)]",
        "transition-transform duration-150 ease-out hover:-translate-y-0.5",
        className
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-t-2xl bg-white sm:aspect-[4/3]">
        <Link href={href} className="absolute inset-0" aria-label={product.name}>
          {image ? (
            <Image
              src={image}
              alt={product.name}
              fill
              // Product shots sit on white, so contain — cover would crop the tool.
              className="object-contain p-3"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-[11px] text-muted-token">
              No image yet
            </span>
          )}
        </Link>
        <ProductBadges
          input={{
            stock: product.stock,
            trackInventory: product.trackInventory,
            // Only a MEMBER gets the discount badge. The prototype showed it on
            // every card, but to a guest "10% OFF" claims a price they cannot
            // get — the PriceBlock already invites them with "join and save",
            // which is the honest version of the same message.
            discountPercent: memberDiscountPercent,
            isFeatured: product.isFeatured,
            isNew: isNewArrival(product.createdAt),
            includedEntries: product.includedEntries,
            entryMultiplier: product.entryMultiplier,
          }}
        />
      </div>

      {/*
        MOBILE FAB, half-overlapping the image's bottom edge.

        The wrapper is a ZERO-HEIGHT anchor sitting exactly on the image/body
        boundary, so `-top-[17px]` (half of 34px) centres the button on that line
        without knowing the image's height or the body's. Pinning it with a pixel
        offset from the card's bottom instead breaks the moment a product name
        wraps to a second line.

        It is a sibling of the Link, not a child — a button inside an anchor is
        invalid markup and the tap would navigate instead of adding.
      */}
      <div className="relative z-10 h-0 sm:hidden">
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy || soldOut}
          aria-label={ctaLabel}
          className={cn(
            "absolute -top-[17px] right-2.5 grid h-[34px] w-[34px] place-items-center rounded-full",
            "text-white shadow-lg transition-transform duration-150 active:scale-95",
            "focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1",
            soldOut ? "cursor-not-allowed bg-neutral-400 dark:bg-neutral-600" : "bg-red-600 disabled:opacity-60"
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasVariants ? (
            <SlidersHorizontal className="h-4 w-4" />
          ) : inCartQty > 0 ? (
            <Check className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
        <div className="flex items-center justify-between gap-2">
          <FulfilmentLine stock={product.stock} trackInventory={product.trackInventory} />
          {product.brand ? (
            <span className="min-w-0 truncate text-right text-[9.5px] font-extrabold uppercase tracking-[.05em] text-muted-token">
              {product.brand}
            </span>
          ) : null}
        </div>

        {/*
          Clamped to two lines with a min-height so a one-line name and a
          three-line name still produce cards whose price rows align across the
          grid. Without the floor the grid stair-steps.
        */}
        <Link
          href={href}
          className="line-clamp-2 min-h-[2.64em] text-[12px] font-bold leading-[1.32] text-primary-token hover:text-red-600 sm:text-[15px]"
        >
          {product.name}
        </Link>

        <PriceBlock priceDollars={product.price} user={userData} variant="card" className="mt-auto pt-1" />

        {/* DESKTOP: the full-width button. Hidden on mobile, where the FAB serves. */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy || soldOut}
          className={cn(
            "mt-2 hidden h-[46px] w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold transition-colors sm:inline-flex",
            "focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1",
            soldOut
              ? "cursor-not-allowed bg-gray-100 text-muted-token dark:bg-neutral-900"
              : inCartQty > 0
                ? "border border-token bg-surface text-primary-token hover:border-red-600 hover:text-red-600"
                : "bg-red-600 text-white hover:bg-red-700"
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {ctaLabel}
        </button>
      </div>

      {showSignIn && (
        <SignInToBuyModal
          isOpen={showSignIn}
          onClose={() => setShowSignIn(false)}
          onSignedIn={() => setShowSignIn(false)}
          intent="add this to your cart"
        />
      )}
    </article>
  );
}
