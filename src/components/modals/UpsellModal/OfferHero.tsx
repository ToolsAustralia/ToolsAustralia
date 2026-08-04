"use client";

import React from "react";
import Image from "next/image";

interface OfferHeroProps {
  /**
   * Real artwork, or null when this offer has none. Null is a NORMAL state, not an error:
   * artwork exists only for the multipliers actually in use, and the others are follow-ups.
   */
  imageSrc: string | null;
  title?: string;
}

const OfferHero: React.FC<OfferHeroProps> = ({ imageSrc, title }) => {
  // Render nothing rather than a stand-in. Pointing <Image> at a file that does not exist 404s,
  // Next's image optimizer then answers 400, and the modal shows bare alt text — which is what
  // customers saw. Collapsing to null keeps the offer clean: the title, price and CTA carry it,
  // and there is no empty box where a hero would have been.
  if (!imageSrc) return null;

  return (
    <div className="relative w-full overflow-hidden">
      <div className="relative w-full">
        <Image
          src={imageSrc}
          alt={title || "Special Offer"}
          width={600}
          height={800}
          className="w-full h-auto"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 600px"
          priority
          placeholder="empty"
        />
      </div>
    </div>
  );
};

export default OfferHero;
