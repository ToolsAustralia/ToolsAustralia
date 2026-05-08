"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { getBrandGlowColor } from "@/utils/prize-brand-colors";
import { getPackageColorScheme, getToolsetBadgeStyle } from "@/utils/package-colors/packageColorScheme";
import { POWERSET_IMAGES, POWERSET_LABELS, POWERSET_BRAND_TEXT } from "./constants";
import type { PrizeSlug } from "@/config/prizes";

interface StaticToolsetHighlightProps {
  /** Toolset key: ryobi, milwaukee, dewalt, makita */
  toolset: string;
  /** Prize slug for brand glow color */
  prizeSlug: PrizeSlug;
  className?: string;
}

const getToolsetColorKey = (toolset: string) => {
  if (toolset === "milwaukee") return "milwaukee-red";
  if (toolset === "dewalt") return "dewalt-yellow";
  if (toolset === "makita") return "makita-teal";
  if (toolset === "ryobi") return "ryobi-green";
  return "milwaukee-red";
};

/**
 * Static toolset display for toolset landing pages - no carousel, no selection.
 */
export function StaticToolsetHighlight({
  toolset,
  prizeSlug,
  className = "",
}: StaticToolsetHighlightProps) {
  const imgSrc = POWERSET_IMAGES[toolset];
  const label = POWERSET_LABELS[toolset];
  const brandTextSrc = POWERSET_BRAND_TEXT[toolset];
  const scheme = getPackageColorScheme(getToolsetColorKey(toolset));
  const badgeStyle = getToolsetBadgeStyle(toolset);
  const glowColor = getBrandGlowColor(prizeSlug);

  if (!imgSrc) return null;

  return (
    <div className={`flex flex-col items-center gap-2 sm:gap-3 ${className}`}>
      {brandTextSrc && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={`relative ${
            toolset === "makita"
              ? "h-5 w-24 sm:h-6 sm:w-28 lg:h-7 lg:w-32"
              : "h-8 w-40 sm:h-10 sm:w-52 lg:h-12 lg:w-60"
          }`}
        >
          <Image
            src={brandTextSrc}
            alt={toolset}
            fill
            className="object-contain"
            sizes={toolset === "makita" ? "(max-width: 640px) 96px, (max-width: 1024px) 112px, 128px" : "(max-width: 640px) 160px, (max-width: 1024px) 208px, 240px"}
          />
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative flex flex-col items-center gap-3"
      >
        <div
          className="absolute inset-0 -m-8 rounded-3xl blur-3xl pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 80% 70% at 50% 50%, ${glowColor}, transparent 70%)`,
            opacity: 0.5,
          }}
        />
        <motion.div
          className="relative w-[220px] h-[155px] sm:w-[360px] sm:h-[250px] lg:w-[440px] lg:h-[305px]"
          animate={{ y: [0, -6, 0] }}
          transition={{
            y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
          }}
        >
          <div className="relative w-full h-full">
            <Image
              src={imgSrc}
              alt={label ?? toolset}
              fill
              className="object-contain drop-shadow-2xl"
              sizes="(max-width: 640px) 220px, (max-width: 1024px) 360px, 440px"
              priority
            />
          </div>
        </motion.div>
        {label && scheme && badgeStyle && (
          <div className="relative z-10 w-full max-w-[480px] sm:max-w-[560px] px-2">
            <div
              className="rounded-xl backdrop-blur-md px-3 py-2 sm:px-5 sm:py-2.5 shadow-xl"
              style={{
                background: badgeStyle.background,
                boxShadow: badgeStyle.boxShadow,
                border: badgeStyle.border,
              }}
            >
              <p
                className={`font-sans font-extrabold font-bold text-2xs sm:text-xs lg:text-sm leading-tight text-center ${scheme.buttonText}`}
              >
                {label} + $5000 CASH
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
