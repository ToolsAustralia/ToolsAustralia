"use client";

import React from "react";
import Image from "next/image";

interface OfferHeroProps {
  imageSrc: string;
  title?: string;
}

const OfferHero: React.FC<OfferHeroProps> = ({ imageSrc, title }) => {
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
