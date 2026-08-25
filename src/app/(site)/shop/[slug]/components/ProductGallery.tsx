"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useSelectedColour } from "@/stores/useProductColourStore";
import type { ColourwayLike } from "@/utils/shop/variants";
import { ProductBadges } from "@/components/shop/ProductBadges";
import { useUserContext } from "@/contexts/UserContext";
import { resolveMemberShopPrice } from "@/utils/shop/member-discount";

/**
 * The product image, following the colour the customer picked.
 *
 * Apparel is bought on colour, so a static hero showing the black tee while the
 * customer has Forest Green selected is actively misleading. Colourway images are
 * OUR Cloudinary copies — the print provider serves mockups from a path that
 * contains the account uid, so their URLs are never rendered.
 *
 * Falls back to `images` for the existing tool catalogue, which has no colourways
 * and must keep behaving exactly as it did.
 */

interface ProductGalleryProps {
  productId: string;
  name: string;
  images: string[];
  colourways?: ColourwayLike[];
  /**
   * Everything the badge corners need. Optional so the gallery still renders bare
   * for any caller that has no product context to give it.
   */
  badges?: {
    price?: number;
    stock?: number;
    trackInventory?: boolean;
    isFeatured?: boolean;
    includedEntries?: number;
    entryMultiplier?: number | null;
  };
}

export default function ProductGallery({
  productId,
  name,
  images,
  colourways = [],
  badges,
}: ProductGalleryProps) {
  const selectedColour = useSelectedColour(productId);
  const [activeIndex, setActiveIndex] = useState(0);
  const { userData } = useUserContext();

  // Resolved here rather than passed in: the page is a server component and cannot
  // read the session, and a discount badge shown to someone who does not hold the
  // tier claims a price they cannot get.
  const memberPercent = useMemo(() => {
    if (!badges?.price) return undefined;
    const p = resolveMemberShopPrice(badges.price, userData);
    return p?.isMember ? p.percent : undefined;
  }, [badges?.price, userData]);

  const colourway = selectedColour
    ? colourways.find((c) => c.name === selectedColour)
    : undefined;

  // A colour with mockups drives the gallery.
  //
  // With nothing selected yet, fall back to the FIRST colourway rather than the
  // product's own images: those hold one lead shot per colour, so a 51-colour tee
  // rendered 51 thumbnails and shoved the rest of the page down. The swatch row
  // is already the colour chooser — the strip only needs this colour's views.
  const gallery =
    colourway?.images && colourway.images.length > 0
      ? colourway.images
      : colourways[0]?.images && colourways[0].images.length > 0
        ? colourways[0].images
        : images;

  const src = gallery[activeIndex] ?? gallery[0] ?? "/images/placeholder-product.jpg";
  const alt = colourway ? `${name} — ${colourway.name}` : name;

  return (
    <div className="space-y-4">
      {/*
        FULL BLEED ON A PHONE.

        The page wraps everything in px-4, so the image sat inset with rounded
        corners and a visible gutter on both sides — a card floating on the page
        rather than the product itself. Cancelling the gutter with a negative margin
        lets it reach both edges, and the radius comes back from sm up where the
        two-column layout gives it a container to sit inside.
      */}
      <div className="relative -mx-4 aspect-square overflow-hidden bg-gray-100 dark:bg-neutral-900 sm:mx-0 sm:rounded-2xl">
        <Image
          // Re-keying on the source forces a fresh element per colour, so the
          // browser cannot briefly paint the previous colour's decoded frame.
          key={src}
          src={src}
          alt={alt}
          width={600}
          height={600}
          className="h-full w-full object-contain"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority
        />
        {badges && (
          <ProductBadges
            size="lg"
            input={{
              stock: badges.stock,
              trackInventory: badges.trackInventory,
              discountPercent: memberPercent,
              isFeatured: badges.isFeatured,
              includedEntries: badges.includedEntries,
              entryMultiplier: badges.entryMultiplier,
            }}
          />
        )}
      </div>

      {gallery.length > 1 && (
        <div className="flex flex-wrap gap-2 px-4 sm:px-0">
          {gallery.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`View ${alt}, image ${i + 1}`}
              aria-pressed={i === activeIndex}
              className={`h-16 w-16 overflow-hidden rounded-lg border-2 transition-colors ${
                i === activeIndex
                  ? "border-red-600"
                  : "border-gray-200 hover:border-red-300 dark:border-neutral-700"
              }`}
            >
              <Image
                src={url}
                alt=""
                width={64}
                height={64}
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
