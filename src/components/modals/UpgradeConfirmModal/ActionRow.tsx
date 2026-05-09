"use client";

import React from "react";
import { cn } from "@/utils/cn";
import styles from "./styles.module.css";
import type { Tier } from "./Shell";

interface ActionRowProps {
  fromPackageName: string;
  toPackageName: string;
  /** Source tier — drives the "Keep X" outline button accent so it visually
   * represents the user's CURRENT package. */
  fromTier: Tier;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Outline accent per tier — mirrors the dark .tier-* gradient end stops but
 * tuned for a light/dark surface. Used to tint the "Keep <tier>" button. */
const KEEP_OUTLINE: Record<Tier, { color: string; border: string; bg: string; bgHover: string }> = {
  tradie:  { color: "#0b7e88", border: "#bae6fd", bg: "rgba(0,194,237,0.08)", bgHover: "rgba(0,194,237,0.16)" },
  foreman: { color: "#a17b00", border: "#fde68a", bg: "rgba(255,210,0,0.08)", bgHover: "rgba(255,210,0,0.16)" },
  boss:    { color: "#b91c1c", border: "#fecaca", bg: "rgba(238,0,0,0.08)",   bgHover: "rgba(238,0,0,0.16)" },
};

const ActionRow: React.FC<ActionRowProps> = ({
  fromPackageName,
  toPackageName,
  fromTier,
  isLoading,
  onClose,
  onConfirm,
}) => {
  const keep = KEEP_OUTLINE[fromTier];
  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: "1fr 1.4fr",
      }}
    >
      {/* Keep current — tier-tinted outline so it visually anchors to current package */}
      <button
        type="button"
        onClick={onClose}
        disabled={isLoading}
        className={cn(
          "inline-flex items-center justify-center px-3 py-2.5 rounded-[10px] font-black text-xs border disabled:opacity-60 disabled:cursor-not-allowed",
          "hover:[&:not(:disabled)]:brightness-105",
          styles.btn
        )}
        style={{
          color: keep.color,
          borderColor: keep.border,
          backgroundColor: keep.bg,
          borderWidth: "1.5px",
          letterSpacing: "0.02em",
          lineHeight: "1.2",
          ["--keep-bg-hover" as string]: keep.bgHover,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = keep.bgHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = keep.bg; }}
      >
        Keep {fromPackageName}
      </button>

      {/* Confirm button — tier-themed via CSS vars + hover-lift */}
      <button
        type="button"
        onClick={onConfirm}
        disabled={isLoading}
        className={cn(
          "inline-flex items-center justify-center px-3 py-2.5 rounded-[10px] font-black text-xs border disabled:opacity-60 disabled:cursor-not-allowed",
          styles.btn,
          styles.btnConfirm
        )}
        style={{
          background: "var(--tier-cta-bg)",
          color: "var(--tier-cta-text)",
          borderColor: "var(--tier-border)",
          borderWidth: "1.5px",
          boxShadow: "var(--tier-cta-shadow)",
          letterSpacing: "0.02em",
          lineHeight: "1.2",
        }}
      >
        {isLoading ? "Upgrading…" : `Upgrade to ${toPackageName}`}
      </button>
    </div>
  );
};

export default ActionRow;
