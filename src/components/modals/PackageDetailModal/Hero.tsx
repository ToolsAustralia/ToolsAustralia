"use client";

import React from "react";
import Image from "next/image";
import { CreditCard, Sparkles } from "lucide-react";
import { cn } from "@/utils/cn";
import { type PackageIconData } from "@/utils/images/package-icons";
import { type Tier } from "./Shell";
import styles from "./styles.module.css";

interface HeroProps {
  packageName: string;
  isSubscription: boolean;
  tier: Tier;
  icon: PackageIconData | null;
}

const Hero: React.FC<HeroProps> = ({ packageName, isSubscription, tier: _tier, icon }) => {
  const eyebrowLabel = isSubscription ? "Your membership" : "Your package";
  const EyebrowIcon = isSubscription ? CreditCard : Sparkles;
  return (
    <div
      className={cn(
        "relative px-[18px] pt-4 pb-[16px] text-white overflow-hidden",
        styles.heroBg,
        styles.heroStripeOverlay
      )}
    >
      <div className="relative z-[2]">
        {/* Eyebrow pill */}
        <div
          className="inline-flex items-center gap-1.5 px-[10px] py-1 rounded-full text-[10px] font-extrabold tracking-[0.2em] uppercase border mb-2.5"
          style={{
            color: "var(--tier-color)",
            borderColor: "var(--tier-border)",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <EyebrowIcon size={12} />
          <span>{eyebrowLabel}</span>
        </div>

        {/* Headline + sub-copy share a row to the right of the icon —
         * 2 tight rows: package name on top, sub-copy directly below.
         * Saves vertical space since the headline doesn't need its own row. */}
        <div className="flex items-center gap-3">
          {icon && (
            <div
              className="w-12 h-12 rounded-[12px] inline-flex items-center justify-center p-1 flex-none overflow-hidden max-xs:w-10 max-xs:h-10"
              style={{
                backgroundColor: "var(--tier-icon-bg)",
                border: "1.5px solid var(--tier-border)",
                boxShadow: "0 4px 14px var(--tier-glow-1)",
              }}
            >
              <Image
                src={icon}
                alt={packageName}
                width={56}
                height={56}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          )}
          <div className="min-w-0 flex flex-col gap-0.5">
            <h2
              id="pdm-headline"
              className="relative font-acumin text-[26px] leading-none tracking-[0.005em] uppercase m-0 max-xs:text-[22px]"
            >
              <span className="font-extrabold" style={{ color: "var(--tier-color)" }}>
                {packageName}
              </span>
            </h2>
            <p
              className="relative text-[11px] leading-[1.3] max-w-[360px] max-xs:text-[10px]"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              {isSubscription
                ? "Your monthly membership benefits and entries at a glance."
                : "Your one-time package details."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;
