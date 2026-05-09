"use client";

import React from "react";
import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { cn } from "@/utils/cn";
import { type PackageIconData } from "@/utils/images/package-icons";
import { type Tier } from "./Shell";
import styles from "./styles.module.css";

interface HeroProps {
  fromPackageName: string;
  toPackageName: string;
  fromTier: Tier;
  toTier: Tier;
  fromIcon: PackageIconData | null;
  toIcon: PackageIconData | null;
  toPackagePrice: number;
}

const Hero: React.FC<HeroProps> = ({
  fromPackageName,
  toPackageName,
  fromTier: _fromTier,
  toTier: _toTier,
  fromIcon,
  toIcon,
  toPackagePrice,
}) => {
  return (
    <div
      className={cn(
        "relative px-[18px] pt-4 pb-[14px] text-white overflow-hidden",
        styles.heroBg,
        styles.heroStripeOverlay
      )}
    >
      <div className="relative z-[2]">
        {/* Eyebrow pill */}
        <div
          className="inline-flex items-center gap-1.5 px-[10px] py-1 rounded-full text-[10px] font-extrabold tracking-[0.2em] uppercase border mb-2"
          style={{
            color: "var(--tier-color)",
            borderColor: "var(--tier-border)",
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <ArrowDown size={12} />
          <span>Schedule downgrade</span>
        </div>

        {/* Headline with tier-accented destination package name */}
        <h2
          id="dc-headline"
          className="relative font-['Anton','Inter',sans-serif] text-[26px] leading-none tracking-[0.005em] uppercase m-0 mb-1"
        >
          Switch to{" "}
          <span className="font-extrabold" style={{ color: "var(--tier-color)" }}>
            {toPackageName}
          </span>
        </h2>

        {/* Sub-copy */}
        <p
          className="relative text-xs leading-[1.45] mb-3 max-w-[360px]"
          style={{ color: "rgba(255,255,255,0.65)" }}
        >
          Pay less, drop a tier — keep every entry you&apos;ve already earned.
        </p>

        {/* Compare grid: FromCard | ArrowDown | ToCard */}
        <div className="relative grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
          {/* From card — opacity 0.6, visually inert for tier theming */}
          <div
            className="opacity-60 grid grid-cols-[44px_1fr] gap-2.5 items-center p-[10px] rounded-xl min-w-0"
            style={{
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              className="w-11 h-11 rounded-[9px] inline-flex items-center justify-center p-1 flex-none overflow-hidden"
              style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
            >
              {fromIcon ? (
                <Image
                  src={fromIcon}
                  alt={fromPackageName}
                  width={56}
                  height={56}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <div
                className="text-[9px] font-extrabold tracking-[0.16em] uppercase mb-px"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                Current
              </div>
              <div className="text-sm font-extrabold tracking-[0.01em] leading-[1.1] text-white truncate">
                {fromPackageName}
              </div>
            </div>
          </div>

          {/* Arrow bubble — tier-themed */}
          <div
            className="self-center w-[26px] h-[26px] rounded-full inline-flex items-center justify-center flex-none"
            style={{
              background: "var(--tier-cta-bg)",
              color: "var(--tier-cta-text)",
              boxShadow: "var(--tier-cta-shadow)",
            }}
            aria-hidden
          >
            <ArrowDown size={14} />
          </div>

          {/* To card — tier-themed bg + border */}
          <div
            className="grid grid-cols-[44px_1fr] gap-2.5 items-center p-[10px] rounded-xl min-w-0"
            style={{
              backgroundColor: "var(--tier-card-bg)",
              border: "1px solid var(--tier-border)",
            }}
          >
            <div
              className="w-11 h-11 rounded-[9px] inline-flex items-center justify-center p-1 flex-none overflow-hidden"
              style={{
                backgroundColor: "var(--tier-icon-bg)",
                border: "1px solid var(--tier-border)",
              }}
            >
              {toIcon ? (
                <Image
                  src={toIcon}
                  alt={toPackageName}
                  width={56}
                  height={56}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <div
                className="text-[9px] font-extrabold tracking-[0.16em] uppercase mb-px"
                style={{ color: "var(--tier-color)" }}
              >
                New
              </div>
              <div className="text-sm font-extrabold tracking-[0.01em] leading-[1.1] text-white truncate">
                {toPackageName}
              </div>
              <div
                className="mt-0.5 text-[11px] font-bold"
                style={{ color: "var(--tier-color)" }}
              >
                ${toPackagePrice}/mo
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;
