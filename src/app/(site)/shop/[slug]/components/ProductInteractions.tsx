"use client";

import { useEffect, useMemo, useState } from "react";
import { ShoppingCart, Minus, Plus, Ticket } from "lucide-react";
import { ProductData } from "@/data";
import { useCart } from "@/contexts/CartContext";
import { useSession } from "next-auth/react";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { useUserContext } from "@/contexts/UserContext";
import {
  activeVariants,
  variantLabel,
  isVariantPurchasable,
  purchasableColours,
  sizesForColour,
  findVariantByOptions,
  SIZE_ORDER,
  type ProductVariantLike,
  type ColourwayLike,
} from "@/utils/shop/variants";
import { useProductColourStore } from "@/stores/useProductColourStore";
import SignInToBuyModal from "@/components/modals/SignInToBuyModal";
import { useToast } from "@/components/ui/Toast";
// The PURE module, never the service: the service imports a Mongoose model,
// and mongoose is a serverExternalPackage — reaching it from a client bundle
// makes `mongoose.models` undefined and the model file throws on load.
import { DEFAULT_ENTRY_MULTIPLIER } from "@/utils/shop/entry-multiplier";

interface DatabaseProduct {
  _id: string;
  name: string;
  price: number;
  stock: number;
  brand: string;
  [key: string]: unknown;
}

interface ProductInteractionsProps {
  product: ProductData | DatabaseProduct;
  /**
   * The multiplier ceiling in force for this product, already resolved through
   * product -> category -> shop-wide on the server. null = no ceiling.
   *
   * Resolved there rather than here because two of the three tiers are admin
   * config; the client only needs the answer, not the table.
   */
  entryMultiplier?: number | null;
}

export default function ProductInteractions({
  product,
  entryMultiplier: resolvedMultiplier = null,
}: ProductInteractionsProps) {
  const [quantity, setQuantity] = useState(1);
  const [showSignIn, setShowSignIn] = useState(false);
  // Set when the sign-in sheet interrupted an add, so the session landing can
  // finish what the customer already asked for instead of making them click twice.
  const [addAfterSignIn, setAddAfterSignIn] = useState(false);
  const { showToast } = useToast();
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const { addToCart, isAddingToCart: isProductAdding } = useCart();
  // `status` matters as much as `session`: useSession returns null data while
  // it is still "loading", so treating null as "signed out" tells an already
  // signed-in customer to log in if they click before hydration finishes.
  const { data: session, status: sessionStatus } = useSession();
  const isSessionLoading = sessionStatus === "loading";
  const { trackAddToCart } = usePixelTracking();
  const { trackAddToCart: trackKlaviyoAddToCart } = useKlaviyoTracking();
  const { isAuthenticated: _isAuthenticated } = useUserContext();
  const productIdValue = ("id" in product ? product.id : product._id) as string;
  const isPendingForThisProduct = isProductAdding(productIdValue);

  // Variants are the purchasable unit for apparel. A product with none behaves
  // exactly as before, so the existing tool catalog is unaffected.
  //
  // `product` is a union of the DB shape and the legacy static `ProductData`,
  // and only the former carries these fields. One narrow cast here beats
  // widening the union or sprinkling `any`.
  const fields = product as unknown as {
    trackInventory?: boolean;
    variants?: ProductVariantLike[];
    isActive?: boolean;
    colourways?: ColourwayLike[];
  };
  const trackInventory = fields.trackInventory ?? true;
  const rawVariants = fields.variants;
  const rawColourways = fields.colourways;
  const options = useMemo<ProductVariantLike[]>(
    () => activeVariants({ variants: rawVariants ?? [] }),
    [rawVariants]
  );
  const hasVariants = options.length > 0;

  const variantHost = useMemo(
    () => ({
      isActive: fields.isActive ?? true,
      trackInventory,
      stock: product.stock ?? 0,
      variants: options,
    }),
    [fields.isActive, trackInventory, product.stock, options]
  );

  /**
   * The host used to LIST sizes — every variant, not just the sellable ones.
   *
   * `variantHost` carries only active variants, because that is the right set for
   * RESOLVING a selection. Listing from it hides a withdrawn size completely, so a
   * shopper looking for XL cannot tell whether it exists and is gone or never
   * existed, and goes looking for it elsewhere.
   *
   * `sizesForColour` already computes an `available` flag per size, so feeding it
   * the full list renders the withdrawn one struck through and disabled — present,
   * clearly not buyable. Resolution still runs against `variantHost`, and
   * `isVariantPurchasable` rejects an inactive variant regardless, so nothing here
   * widens what can actually be added.
   *
   * NOTE: `isActive` is the ONLY per-variant availability signal that exists —
   * `Product.variants` stores sku/size/colour/gtin/isActive and no stock, so stock
   * is a product-level fact. A single size cannot be out of stock on its own.
   */
  const sizeHost = useMemo(
    () => ({ ...variantHost, variants: (rawVariants ?? []) as ProductVariantLike[] }),
    [variantHost, rawVariants]
  );

  // Colour-then-size, but only when the product actually ships colourways.
  const colours = useMemo(
    () => purchasableColours(variantHost, rawColourways ?? []),
    [variantHost, rawColourways]
  );
  const hasColourways = colours.length > 0;

  const [selectedColour, setSelectedColour] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const selectColourInStore = useProductColourStore((s) => s.select);

  const sizeOptions = useMemo(
    () => (selectedColour ? sizesForColour(sizeHost, selectedColour, SIZE_ORDER) : []),
    [sizeHost, selectedColour]
  );

  const handleColourChange = (colour: string) => {
    setSelectedColour(colour);
    // Clear the size: the next colour may not be made in it, and carrying a stale
    // size forward would resolve to a sku the printer cannot fulfil.
    setSelectedSize(null);
    // Drives the gallery, which lives in the other grid column.
    selectColourInStore(productIdValue, colour);
  };

  // Flat picker for products without colourways (the existing tool catalogue).
  const [flatSku, setFlatSku] = useState<string | null>(null);
  const setSelectedSku = setFlatSku;

  const selectedVariant = hasColourways
    ? findVariantByOptions(options, selectedColour, selectedSize)
    : options.find((v) => v.sku === flatSku) ?? null;
  const selectedSku = selectedVariant?.sku ?? null;

  const canAddSelected = hasVariants
    ? Boolean(selectedVariant) && isVariantPurchasable(variantHost, selectedVariant!)
    : !trackInventory || (product.stock ?? 0) > 0;

  /**
   * What the shopper still has to choose, in their words.
   *
   * "Choose an option" is true but unhelpful — it does not say WHICH option, and
   * on a page showing both a colour row and a size row that is the only question
   * being asked. Naming the missing half turns a dead button into an instruction.
   *
   * GATED ON `hasColourways`, which is the whole subtlety. There are TWO variant
   * pickers on this page: colour-then-size for apparel, and a flat list of whole
   * variants for the tool catalogue that ships no colourways. On the flat path
   * there is no colour row and no size row to point at, so naming them would send
   * someone hunting for controls that are not on the page — worse than the vaguer
   * wording it replaced.
   *
   * Null once nothing is missing, so a caller can treat it as "ready".
   */
  const missingChoice: string | null = !hasVariants
    ? null
    : hasColourways
      ? !selectedColour && !selectedSize
        ? "Pick colour & size"
        : !selectedColour
          ? "Pick a colour"
          : !selectedSize
            ? "Pick a size"
            : null
      : selectedVariant
        ? null
        : "Choose an option";

  /**
   * The chosen variant in human terms, for the sticky bar's sub-line.
   *
   * Read off the resolved VARIANT rather than the two selection states, so it is
   * correct on both pickers — the flat path never sets selectedColour/selectedSize.
   */
  const chosenLabel = selectedVariant
    ? [selectedVariant.colour, selectedVariant.size].filter(Boolean).join(" · ")
    : "";

  // Finish the interrupted add once the session is actually live.
  //
  // Deliberately an effect and not a callback from the modal: handleAddToCart
  // reads session from its closure, so calling it straight from onSignedIn
  // would see the PRE-login value, hit the same guard and reopen the sheet.
  // This runs on the render where useSession has published the new id.
  useEffect(() => {
    if (!addAfterSignIn || !session?.user?.id) return;
    setAddAfterSignIn(false);
    void handleAddToCart();
    // handleAddToCart is redefined every render; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAfterSignIn, session?.user?.id]);

  const handleQuantityChange = (change: number) => {
    setQuantity(Math.max(1, Math.min(product.stock || 999, quantity + change)));
  };

  const handleAddToCart = async () => {
    // Never mistake "still loading" for "signed out". The button is disabled
    // while loading, so this is a belt-and-braces guard for a race where the
    // click lands in the same tick as hydration.
    if (isSessionLoading) return;

    if (!session?.user?.id) {
      // Was a native alert(): a browser dialog over a dark themed page, with no
      // way to actually sign in from it, and the chosen colour and size lost on
      // dismiss. The sheet keeps the selection and hands straight to LoginModal.
      setAddAfterSignIn(true);
      setShowSignIn(true);
      return;
    }

    try {
      setIsAddingToCart(true);

      // Track AddToCart event (standard Meta Pixel event)
      // This replaces the non-standard ButtonClick event with the official AddToCart event
      // num_items and content_name are what let Meta and TikTok tell a 1-unit add
      // from a 4-unit one, and what makes the event usable for catalogue matching.
      // Without numItems, buildMetaCustomData omits num_items entirely and the
      // TikTok provider then omits contents[].quantity too.
      trackAddToCart({
        value: (product.price as number) * quantity,
        currency: "AUD",
        productId: productIdValue,
        numItems: quantity,
        contentName: product.name,
      });

      // Track Klaviyo add to cart event
      trackKlaviyoAddToCart({
        value: (product.price as number) * quantity,
        currency: "AUD",
        product_id: productIdValue,
        product_name: product.name,
        num_items: quantity,
      });

      await addToCart({
        productId: productIdValue,
        sku: selectedSku ?? undefined,
        quantity,
        price: product.price as number,
        product: {
          _id: productIdValue,
          name: product.name,
          price: product.price as number,
          images: Array.isArray(product.images) ? product.images : [],
          brand: product.brand || "Unknown",
          stock: product.stock || 0,
        },
      });

      // Show success state
      setAddedToCart(true);

      // Reset success state after 2 seconds
      setTimeout(() => {
        setAddedToCart(false);
      }, 2000);

      console.log(`Added ${quantity} of ${product.name} to cart`);
    } catch (error) {
      console.error("Error adding to cart:", error);
      // The repo toast, not a browser alert: same reason as the sign-in sheet.
      showToast({
        type: "error",
        title: "Could not add to cart",
        message: "Something went wrong. Please try again.",
        duration: 4000,
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  // Print-to-order items carry stock 0 forever, so stock must not read as
  // "out of stock" for them — the printer makes each one on demand.
  const isOutOfStock = trackInventory && product.stock === 0;

  // Merchandise inherits the ONE-TIME pack multiplier, never its own promo type.
  //
  // Use THIS hook, not resolveMultiplierForDisplay: despite the name, the hook
  // reads the effective-multiplier endpoint, which resolves through
  // getResolvedMultiplierWithSource — the same chain resolveMultiplierForPayment
  // uses, derived-from-membership branch included. resolveMultiplierForDisplay
  // stops at active-promo -> alternating and would print a number the grant does
  // not honour. (The hook's `context` parameter is dead; the body ignores it.)
  //
  // Merchandise carries its OWN multiplier, set in admin — it does NOT inherit
  // the one-time pack promo (owner decision 2026-08-20). The server already
  // collapsed product -> category -> shop-wide into this one number, so there is
  // nothing left to resolve here and no promo hook to consult.
  const entryMultiplier = resolvedMultiplier ?? DEFAULT_ENTRY_MULTIPLIER;
  // `product` is a union of the static ProductData fixtures and the DB shape;
  // only the latter carries includedEntries, so read it defensively rather than
  // widening a type that legitimately does not have the field.
  const rawEntries = (product as { includedEntries?: unknown }).includedEntries;
  const baseEntries = typeof rawEntries === "number" && rawEntries > 0 ? rawEntries : 0;
  const entriesForQuantity = baseEntries * quantity * entryMultiplier;

  return (
    <div className="space-y-6">
      {/* Free entries included with this item.

          The count shown is base x quantity x the item's OWN multiplier, which
          the server resolved through product -> category -> shop-wide and passed
          down as one number. The grant resolves the same chain from the same
          config, so the page and the webhook cannot disagree. This route is
          force-dynamic, so the number is never frozen into cached HTML.

          Rendered only when there is something to promise: at includedEntries 0
          — the state the feature ships in until the permit lands — nothing
          appears at all.

          Rule 11: entries are a free INCLUSION with the product, never sold and
          never priced per unit. Do not add a per-entry figure here. */}
      {entriesForQuantity > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
          <Ticket className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <div className="font-medium text-gray-900 dark:text-neutral-100">
              Includes {entriesForQuantity} free {entriesForQuantity === 1 ? "entry" : "entries"}
            </div>
            <div className="text-sm text-gray-600 dark:text-neutral-400">
              Into this month&apos;s major prize draw
              {entryMultiplier > 1 ? ` — ${entryMultiplier}× entries on this item` : ""}
            </div>
          </div>
        </div>
      )}

      {/* Stock Status */}
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${
            isOutOfStock ? "bg-red-500" : trackInventory && product.stock && product.stock < 10 ? "bg-orange-500" : "bg-green-500"
          }`}
        ></div>
        <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">
          {isOutOfStock
            ? "Out of Stock"
            : !trackInventory
            ? "Made to order"
            : product.stock && product.stock < 10
            ? `Only ${product.stock} left!`
            : "In Stock"}
        </span>
      </div>

      {/* Colour, then size.
          A printed tee runs to 383 variants, so one chip per variant is unusable.
          Picking a colour narrows the sizes to what that colour is actually made
          in — 51 colours x 9 sizes is 459 pairs but only 383 exist, and offering
          a size the printer cannot make is a cancelled order.
          Products with no colourways (the tool catalogue) fall back to the flat
          list, which is exactly what they had before. */}
      {hasVariants && hasColourways && (
        <div className="space-y-5">
          <div className="space-y-2">
            {/*
              The label states the axis; the RIGHT-hand hint states what to do about
              it. Folding both into one sentence ("Colour: choose one") made the
              instruction read as a value — it looked like the colour was called
              "choose one" — and it left nothing to change once a colour was picked.
            */}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-extrabold uppercase tracking-[.08em] text-gray-500 dark:text-neutral-400">
                Colour
              </span>
              <span
                className="text-[12px] font-bold"
                style={{ color: selectedColour ? undefined : "#F5C542" }}
              >
                {selectedColour ?? "Pick one"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {colours.map((colourway) => {
                const isSelected = colourway.name === selectedColour;
                return (
                  <button
                    key={colourway.name}
                    type="button"
                    onClick={() => handleColourChange(colourway.name)}
                    aria-pressed={isSelected}
                    aria-label={colourway.name}
                    title={colourway.name}
                    style={{ backgroundColor: colourway.hex ?? "#9ca3af" }}
                    className={`h-9 w-9 rounded-full border border-black/20 transition-transform hover:scale-110 motion-reduce:transform-none dark:border-white/20 ${
                      isSelected
                        ? "ring-2 ring-red-600 ring-offset-2 ring-offset-white dark:ring-offset-neutral-950"
                        : ""
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {selectedColour && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">
                Size:
              </span>
              <div className="flex flex-wrap gap-2">
                {sizeOptions.map(({ size, available }) => {
                  const isSelected = size === selectedSize;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSelectedSize(size)}
                      disabled={!available}
                      aria-pressed={isSelected}
                      className={`min-w-[3rem] rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        isSelected
                          ? "border-red-600 bg-red-600 text-white"
                          : available
                          ? "border-gray-300 bg-white text-gray-800 hover:border-red-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                          : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 line-through dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-500"
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!selectedSku && (
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              {selectedColour ? "Pick a size to continue." : "Pick a colour to continue."}
            </p>
          )}
        </div>
      )}

      {/* Legacy flat picker — products with variants but no colourways. */}
      {hasVariants && !hasColourways && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">
            Choose an option:
          </span>
          <div className="flex flex-wrap gap-2">
            {options.map((variant) => {
              const available = isVariantPurchasable(variantHost, variant);
              const isSelected = variant.sku === selectedSku;
              return (
                <button
                  key={variant.sku}
                  type="button"
                  onClick={() => setSelectedSku(variant.sku)}
                  disabled={!available}
                  aria-pressed={isSelected}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-red-600 bg-red-600 text-white"
                      : available
                      ? "border-gray-300 bg-white text-gray-800 hover:border-red-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 line-through dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-500"
                  }`}
                >
                  {variantLabel(variant)}
                </button>
              );
            })}
          </div>
          {!selectedSku && (
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              Pick an option to continue.
            </p>
          )}
        </div>
      )}

      {/* Quantity Selector */}
      {!isOutOfStock && (
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700 dark:text-neutral-200">Quantity:</span>
          <div className="flex items-center border border-gray-300 dark:border-neutral-700 rounded-lg">
            <button
              onClick={() => handleQuantityChange(-1)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              disabled={quantity <= 1}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="px-4 py-2 font-medium">{quantity}</span>
            <button
              onClick={() => handleQuantityChange(1)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              disabled={quantity >= (product.stock || 999)}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 sm:gap-4">
        <button
          onClick={handleAddToCart}
          disabled={!canAddSelected || isSessionLoading || isAddingToCart || isPendingForThisProduct}
          className={`w-full py-2 px-4 sm:py-3 sm:px-6 rounded-lg font-semibold text-sm sm:text-lg transition-all duration-300 flex items-center justify-center gap-1 sm:gap-2 ${
            !canAddSelected || isSessionLoading || isAddingToCart || isPendingForThisProduct
              ? "bg-gray-300 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400 cursor-not-allowed"
              : addedToCart
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white hover:bg-red-675 hover:shadow-lg hover:scale-105"
          }`}
        >
          <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
          {isOutOfStock
            ? "Out of Stock"
            : /* Say why the button is dead rather than leaving it silently inert. */
            hasVariants && !selectedSku
            ? (missingChoice ?? "Choose an option")
            : /* Signed-in state is still resolving — say so instead of letting the
                 click fall through to a "Please log in" alert. */
            isSessionLoading
            ? "Loading…"
            : isAddingToCart || isPendingForThisProduct
            ? "Adding..."
            : addedToCart
            ? "Added to Cart!"
            : `Add to Cart - $${(product.price * quantity).toFixed(2)}`}
        </button>
      </div>

      {/*
        The three "trust badges" that used to sit here — Free Shipping, 3 Year
        Warranty, 30-Day Returns — were removed on 2026-08-17 because all three
        were untrue:

          - Free Shipping was UNCONDITIONAL, while priceCart waived it only at
            $100+. A $45.95 tee was shown "Free Shipping" and charged $10. Since
            2026-08-25 delivery is a flat $10 on every order, so the badge would
            now be wrong on every product rather than just the cheap ones.
          - 3 Year Warranty is not a warranty this business offers, on apparel or
            anything else.
          - 30-Day Returns states a returns window no policy backs.

        They were hard-coded decoration inherited from a storefront template, not
        facts about an order. Real shipping terms live on the Shipping & Returns
        tab and are derived from SHOP_CONFIG, so they cannot drift from what the
        customer is actually charged.

        If genuine badges are wanted here, drive each from something real (the
        resolved shipping for THIS cart, a stated returns policy) rather than a
        fixed string — a badge is a promise, and this page is where a customer
        decides to trust it.
      */}
      {/*
        STICKY BOTTOM BAR — mobile only.

        The add button sits below the description, the spec grid and the related
        rail, so on a phone a shopper who has scrolled to read about the product
        has to scroll back up to buy it. The bar keeps the price and the CTA in
        reach the whole way down.

        Its sub-line is the same `missingChoice` the button uses, so the two can
        never disagree about what is still needed, and it names the chosen variant
        once nothing is.

        `sm:hidden` because the desktop layout already keeps the buy column in
        view with a sticky image beside it.
      */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-token bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur sm:hidden"
        role="region"
        aria-label="Buy this product"
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold leading-none tracking-[-.02em] text-primary-token">
              ${(product.price * quantity).toFixed(2)}
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-token">
              {isOutOfStock
                ? "Out of stock"
                : missingChoice
                  ? missingChoice
                  : chosenLabel || "Ready to add"}
            </div>
          </div>
          <button
            onClick={handleAddToCart}
            disabled={!canAddSelected || isSessionLoading || isAddingToCart || isPendingForThisProduct}
            className={`inline-flex h-[50px] min-w-[9.5rem] items-center justify-center gap-2 rounded-xl px-5 text-[14px] font-bold transition-colors ${
              !canAddSelected || isSessionLoading || isAddingToCart || isPendingForThisProduct
                ? "cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400"
                : addedToCart
                  ? "bg-green-600 text-white"
                  : "bg-red-600 text-white"
            }`}
          >
            <ShoppingCart className="h-4 w-4" />
            {isOutOfStock
              ? "Out of stock"
              : missingChoice
                ? missingChoice
                : isAddingToCart || isPendingForThisProduct
                  ? "Adding…"
                  : addedToCart
                    ? "Added"
                    : "Add to cart"}
          </button>
        </div>
      </div>

      {showSignIn && (
        <SignInToBuyModal
          isOpen={showSignIn}
          onClose={() => {
            setShowSignIn(false);
            setAddAfterSignIn(false);
          }}
          onSignedIn={() => {
            setShowSignIn(false);
          }}
          intent="add this to your cart"
        />
      )}
    </div>
  );
}
