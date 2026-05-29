"use client";

import React from "react";
import Image from "next/image";
import { Trophy } from "lucide-react";
import type { PrizeCatalogEntry } from "@/config/prizes";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";
import { getImageForMode } from "@/utils/promo/landing-image-resolver";
import { usePerSlugHeroOverride } from "@/hooks/ab-testing/usePerSlugHeroOverride";
import UpsellHero from "../upsell-shell/UpsellHero";

interface HeroProps {
  prize: PrizeCatalogEntry;
}

/** Resolve the landscape "landing hero" image PrizeShowcase uses for this prize.
 *  Default: dark/desktop variant for clean composition over the modal's dark gradient.
 *  When an A/B variant overrides the desktop slot for this slug, that override is
 *  used directly (single-mode, theme-agnostic — matches the resolver's behavior on
 *  brands that only ship one mode). Falls back to gallery[0] if no landing image
 *  is configured. */
const pickHeroImage = (
  prize: PrizeCatalogEntry,
  variantDesktopOverride: string | undefined
): { src: string; alt: string } | null => {
  if (variantDesktopOverride) {
    return { src: variantDesktopOverride, alt: prize.heroHeading || prize.label };
  }
  const paths = getLandingHeroImagePaths(prize.slug);
  if (paths) {
    return {
      src: getImageForMode(paths, "dark", "desktop"),
      alt: prize.heroHeading || prize.label,
    };
  }
  const first = prize.gallery[0];
  return first ? { src: first.src, alt: first.alt } : null;
};

const Hero: React.FC<HeroProps> = ({ prize }) => {
  const variantOverride = usePerSlugHeroOverride(prize.slug);
  const photo = pickHeroImage(prize, variantOverride?.desktop);

  return (
    <UpsellHero
      tone="neutral"
      titleId="prize-specs-headline"
      className="shrink-0 bg-none bg-[#0a0a0a] px-6 pt-6 pb-5 max-xs:px-5 max-xs:pt-5 max-xs:pb-4"
      eyebrow={
        <>
          <span className="basis-7 grow-0 shrink-0 h-px bg-[linear-gradient(90deg,transparent,rgba(212,175,55,0.6))] max-xs:basis-[18px]" />
          <span className="text-premium-gold inline-flex">
            <Trophy size={14} strokeWidth={2.2} />
          </span>
          <span className="font-extrabold text-[11px] tracking-[0.22em] uppercase text-premium-gold max-xs:text-2xs max-xs:tracking-[0.18em]">
            Featured prize
          </span>
          <span className="text-premium-gold inline-flex">
            <Trophy size={14} strokeWidth={2.2} />
          </span>
          <span className="basis-7 grow-0 shrink-0 h-px bg-[linear-gradient(90deg,rgba(212,175,55,0.6),transparent)] max-xs:basis-[18px]" />
        </>
      }
      infographic={
        photo ? (
          <div
            className="rounded-xl overflow-hidden border border-white/10 leading-none max-xs:rounded-[10px] relative"
            style={{
              background:
                "radial-gradient(600px 200px at 50% 50%, rgba(238, 0, 0, 0.10), transparent 70%), linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(0, 0, 0, 0.15))",
              aspectRatio: "16 / 6",
            }}
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(max-width: 640px) 92vw, 540px"
              style={{ objectFit: "cover" }}
            />
          </div>
        ) : undefined
      }
    />
  );
};

export default Hero;
