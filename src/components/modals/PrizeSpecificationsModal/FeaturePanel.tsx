"use client";

import React from "react";
import Image from "next/image";
import { Trophy } from "lucide-react";
import type { PrizeCatalogEntry } from "@/config/prizes";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";
import { getImageForMode } from "@/utils/promo/landing-image-resolver";
import { cn } from "@/utils/cn";

interface FeaturePanelProps {
  prize: PrizeCatalogEntry;
  className?: string;
}

/** Desktop-only left column for the prize specs modal: a tall feature panel.
 *  Uses the PORTRAIT (mobile) landing image since the column is narrow/tall —
 *  the landscape desktop hero would letterbox badly here. Falls back to the
 *  first gallery shot (preferring its mobile variant) when a prize has no
 *  configured landing hero (e.g. the cash prize). */
const pickPortraitImage = (prize: PrizeCatalogEntry): { src: string; alt: string } | null => {
  const paths = getLandingHeroImagePaths(prize.slug);
  if (paths) {
    return { src: getImageForMode(paths, "dark", "mobile"), alt: prize.heroHeading || prize.label };
  }
  const first = prize.gallery[0];
  return first ? { src: first.mobileSrc ?? first.src, alt: first.alt } : null;
};

const FeaturePanel: React.FC<FeaturePanelProps> = ({ prize, className }) => {
  const photo = pickPortraitImage(prize);

  return (
    <div
      className={cn(
        "relative flex-col gap-4 bg-gradient-to-b from-[#0a0a0a] via-[#141416] to-[#0a0a0a] p-6 text-white",
        className
      )}
    >
      {/* Eyebrow */}
      <div className="flex items-center gap-2 text-premium-gold">
        <Trophy size={14} strokeWidth={2.2} />
        <span className="font-extrabold text-[11px] tracking-[0.22em] uppercase">Featured prize</span>
      </div>

      {/* Portrait image */}
      {photo && (
        <div
          className="relative w-full overflow-hidden rounded-xl border border-white/10"
          style={{
            aspectRatio: "4 / 5",
            background:
              "radial-gradient(600px 240px at 50% 30%, rgba(238,0,0,0.10), transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.15))",
          }}
        >
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(max-width: 1024px) 0px, 360px"
            className="object-cover"
          />
        </div>
      )}

      {/* Title + summary */}
      <div className="space-y-2">
        <h3 className="font-['Poppins'] text-lg font-bold leading-tight tracking-tight text-white">
          {prize.heroHeading || prize.label}
        </h3>
        {prize.summary && (
          <p className="font-['Inter'] text-sm leading-relaxed text-white/65">{prize.summary}</p>
        )}
      </div>
    </div>
  );
};

export default FeaturePanel;
