"use client";

import React from "react";
import type { PackageColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getCardBorderStyle } from "@/utils/package-colors/packageColorScheme";
import { cn } from "@/utils/cn";

export type CornerRibbonPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface CornerRibbonBadgeProps {
  position?: CornerRibbonPosition;
  children: React.ReactNode;
  size?: "small" | "medium" | "large";
  badgeStyle?: { background: string; boxShadow: string; border: string };
  colorScheme?: PackageColorScheme;
  className?: string;
}

const DEFAULT_STYLE = {
  background: "linear-gradient(135deg, #C8102E 0%, #E02D42 50%, #C8102E 100%)",
  boxShadow: "0 5px 10px rgba(0,0,0,.1)",
  border: "none",
};

/** Black / VIP cards use a near-black badgeStyle — ribbon fill would match the card. Use a gold strip so the folded ribbon reads clearly. */
const PREMIUM_BLACK_CARD_RIBBON_STYLE = {
  background:
    "linear-gradient(135deg, #7a5c12 0%, #b8860b 22%, #d4af37 50%, #b8860b 78%, #5c4510 100%)",
  boxShadow: "0 5px 14px rgba(0,0,0,0.35), 0 0 1px rgba(212,175,55,0.75)",
  border: "none",
} as const;

function getFoldColor(bg: string): string {
  const hex = bg.match(/#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/);
  if (hex) {
    const d = (v: string) => Math.floor(parseInt(v, 16) * 0.35);
    return `rgb(${d(hex[1])}, ${d(hex[2])}, ${d(hex[3])})`;
  }
  const rgb = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    const d = (v: string) => Math.floor(+v * 0.35);
    return `rgb(${d(rgb[1])}, ${d(rgb[2])}, ${d(rgb[3])})`;
  }
  return "rgba(0,0,0,0.5)";
}

/**
 * All dimensions derived from the proven CodePen ribbon (reference: box=150px).
 * Container offset is ~0.067×box so the fold triangles sit clearly OUTSIDE the card.
 * Parent card must have overflow:visible for the folds to show.
 */
const BOX = { small: 75, medium: 100, large: 130 } as const;
const FONT = { small: "9px", medium: "11px", large: "13px" } as const;

const CornerRibbonBadge: React.FC<CornerRibbonBadgeProps> = ({
  position = "top-left",
  children,
  size = "medium",
  badgeStyle,
  colorScheme,
  className = "",
}) => {
  const box = BOX[size];
  const base = badgeStyle ?? DEFAULT_STYLE;
  const usePremiumBlackRibbon = colorScheme?.text === "text-premium-gold";
  const ribbonFill = usePremiumBlackRibbon ? PREMIUM_BLACK_CARD_RIBBON_STYLE : base;
  const foldColor = getFoldColor(ribbonFill.background);

  const stripW = Math.round(box * 1.5);
  const containerOff = Math.round(box * -0.1);
  const pad = Math.round(box * 0.1);
  const edgeOff = Math.round(box * -0.167);
  const inset = Math.round(box * 0.2);
  const fb = Math.max(5, Math.round(box * 0.09));

  const ribbonBg =
    usePremiumBlackRibbon
      ? { background: ribbonFill.background, boxShadow: ribbonFill.boxShadow }
      : colorScheme?.cardBorderGradient && badgeStyle
        ? { ...getCardBorderStyle(colorScheme, badgeStyle.background), boxShadow: base.boxShadow }
        : { background: base.background, boxShadow: base.boxShadow };

  // Wrapper: NO z-index so it doesn't create a stacking context.
  // This lets z-index:-1 on folds push them behind the CARD, not just behind the wrapper.
  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    width: box,
    height: box,
    overflow: "visible",
    pointerEvents: "none",
    ...(position === "top-left" && { top: containerOff, left: containerOff }),
    ...(position === "top-right" && { top: containerOff, right: containerOff }),
    ...(position === "bottom-left" && { bottom: containerOff, left: containerOff }),
    ...(position === "bottom-right" && { bottom: containerOff, right: containerOff }),
  };

  // Clip box: overflow hidden clips the wide strip into the diagonal ribbon shape.
  // Has its own z-index so the strip renders above the card.
  const clipStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    zIndex: 10,
  };

  // Strip: wider than the box, rotated, clipped by the clip box
  const stripStyle: React.CSSProperties = {
    position: "absolute",
    display: "block",
    width: stripW,
    padding: `${pad}px 0`,
    textAlign: "center",
    fontWeight: 800,
    fontSize: FONT[size],
    lineHeight: 1,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    ...(usePremiumBlackRibbon
      ? {
          color: "#141414",
          textShadow: "0 1px 0 rgba(255,255,255,0.35)",
        }
      : {
          color: "#fff",
          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        }),
    ...ribbonBg,
    boxShadow: "0 5px 10px rgba(0,0,0,.2)",
  };

  if (position === "top-left") {
    stripStyle.right = edgeOff;
    stripStyle.top = inset;
    stripStyle.transform = "rotate(-45deg)";
  } else if (position === "top-right") {
    stripStyle.left = edgeOff;
    stripStyle.top = inset;
    stripStyle.transform = "rotate(45deg)";
  } else if (position === "bottom-left") {
    stripStyle.right = edgeOff;
    stripStyle.bottom = inset;
    stripStyle.transform = "rotate(225deg)";
  } else {
    stripStyle.left = edgeOff;
    stripStyle.bottom = inset;
    stripStyle.transform = "rotate(-225deg)";
  }

  // Fold triangles: z-index -1 pushes them BEHIND the card (since wrapper has no z-index / no stacking context).
  // They poke out at the two points where the ribbon exits the card edge.
  const foldShared: React.CSSProperties = {
    position: "absolute",
    zIndex: -1,
    display: "block",
    border: `${fb}px solid ${foldColor}`,
  };

  let foldA: React.CSSProperties;
  let foldB: React.CSSProperties;

  if (position === "top-left") {
    foldA = { ...foldShared, top: 0, right: 0, borderTopColor: "transparent", borderLeftColor: "transparent" };
    foldB = { ...foldShared, bottom: 0, left: 0, borderTopColor: "transparent", borderLeftColor: "transparent" };
  } else if (position === "top-right") {
    foldA = { ...foldShared, top: 0, left: 0, borderTopColor: "transparent", borderRightColor: "transparent" };
    foldB = { ...foldShared, bottom: 0, right: 0, borderTopColor: "transparent", borderRightColor: "transparent" };
  } else if (position === "bottom-left") {
    foldA = { ...foldShared, bottom: 0, right: 0, borderBottomColor: "transparent", borderLeftColor: "transparent" };
    foldB = { ...foldShared, top: 0, left: 0, borderBottomColor: "transparent", borderLeftColor: "transparent" };
  } else {
    foldA = { ...foldShared, bottom: 0, left: 0, borderBottomColor: "transparent", borderRightColor: "transparent" };
    foldB = { ...foldShared, top: 0, right: 0, borderBottomColor: "transparent", borderRightColor: "transparent" };
  }

  const label = typeof children === "string" ? children : undefined;

  return (
    <div
      className={cn("corner-ribbon", className)}
      style={wrapperStyle}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {/* Folds: outside clip box so they extend beyond the card */}
      <div style={foldA} />
      <div style={foldB} />
      {/* Clip box: overflow hidden creates the diagonal ribbon shape */}
      <div style={clipStyle}>
        <div style={stripStyle}>
          <span className="font-black whitespace-nowrap">{children}</span>
        </div>
      </div>
    </div>
  );
};

export default CornerRibbonBadge;
