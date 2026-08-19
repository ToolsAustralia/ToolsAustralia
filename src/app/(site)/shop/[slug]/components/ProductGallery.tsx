"use client";

import { useState } from "react";
import Image from "next/image";
import { useSelectedColour } from "@/stores/useProductColourStore";
import type { ColourwayLike } from "@/utils/shop/variants";

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
}

export default function ProductGallery({
  productId,
  name,
  images,
  colourways = [],
}: ProductGalleryProps) {
  const selectedColour = useSelectedColour(productId);
  const [activeIndex, setActiveIndex] = useState(0);

  const colourway = selectedColour
    ? colourways.find((c) => c.name === selectedColour)
    : undefined;

  // A colour with mockups drives the gallery; otherwise the product's own images.
  const gallery =
    colourway?.images && colourway.images.length > 0 ? colourway.images : images;

  const src = gallery[activeIndex] ?? gallery[0] ?? "/images/placeholder-product.jpg";
  const alt = colourway ? `${name} — ${colourway.name}` : name;

  return (
    <div className="space-y-4">
      <div className="aspect-square overflow-hidden rounded-2xl bg-gray-100 dark:bg-neutral-900">
        <Image
          // Re-keying on the source forces a fresh element per colour, so the
          // browser cannot briefly paint the previous colour's decoded frame.
          key={src}
          src={src}
          alt={alt}
          width={600}
          height={600}
          className="h-full w-full object-cover"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority
        />
      </div>

      {gallery.length > 1 && (
        <div className="flex flex-wrap gap-2">
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
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
