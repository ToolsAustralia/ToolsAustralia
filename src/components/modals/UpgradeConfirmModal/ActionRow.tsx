"use client";

import React from "react";
import { cn } from "@/utils/cn";
import { useHtmlDarkForUi } from "@/hooks/useHtmlDarkForUi";
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

interface KeepOutline { color: string; border: string; bg: string; bgHover: string }

/**
 * Outline accent per tier for the "Keep <tier>" button.
 *
 * TWO maps, because this is an INLINE style and Tailwind's `dark:` cannot reach it. The light
 * palette pairs a deep ink with a pastel border (sky-200 / amber-200 / red-200) — correct on
 * white, wrong on the `dark:bg-neutral-950` frame this modal actually uses by default, where
 * the pastel ring reads as a light-mode pill dropped into a dark panel and the boss ink lands
 * around 3:1 against the background. The dark map uses the bright tier stops already defined
 * in styles.module.css (`--tier-color`), so the two themes agree with the rest of the modal.
 */
const KEEP_OUTLINE: Record<Tier, KeepOutline> = {
  tradie:  { color: "#0b7e88", border: "#bae6fd", bg: "rgba(0,194,237,0.08)", bgHover: "rgba(0,194,237,0.16)" },
  foreman: { color: "#a17b00", border: "#fde68a", bg: "rgba(255,210,0,0.08)", bgHover: "rgba(255,210,0,0.16)" },
  boss:    { color: "#b91c1c", border: "#fecaca", bg: "rgba(238,0,0,0.08)",   bgHover: "rgba(238,0,0,0.16)" },
};

const KEEP_OUTLINE_DARK: Record<Tier, KeepOutline> = {
  tradie:  { color: "#5ce0ff", border: "rgba(0,194,237,0.45)", bg: "rgba(0,194,237,0.10)", bgHover: "rgba(0,194,237,0.20)" },
  foreman: { color: "#ffe066", border: "rgba(255,210,0,0.45)", bg: "rgba(255,210,0,0.10)", bgHover: "rgba(255,210,0,0.20)" },
  boss:    { color: "#ff6b6b", border: "rgba(238,0,0,0.45)",   bg: "rgba(238,0,0,0.10)",   bgHover: "rgba(238,0,0,0.20)" },
};

const ActionRow: React.FC<ActionRowProps> = ({
  fromPackageName,
  toPackageName,
  fromTier,
  isLoading,
  onClose,
  onConfirm,
}) => {
  // The DOM class, not the store: this is portaled UI, and `useHtmlDarkForUi` is the repo's
  // answer for exactly that case.
  const isDark = useHtmlDarkForUi();
  const keep = (isDark ? KEEP_OUTLINE_DARK : KEEP_OUTLINE)[fromTier];
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
