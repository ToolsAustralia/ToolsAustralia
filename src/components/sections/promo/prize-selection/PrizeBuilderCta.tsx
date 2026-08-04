"use client";

import { cn } from "@/utils/cn";
import SecureCheckoutBar from "@/components/ui/SecureCheckoutBar";
import { darken } from "./prize-builder-model";

interface PrizeBuilderCtaProps {
  /** Accent of the current selection — CTA gradient + glow. */
  accent: string;
  /** True when the winner has switched to the $10,000 cash option. */
  isCash: boolean;
  onEnterNow: () => void;
  onChooseBundle: () => void;
  onChooseCash: () => void;
  className?: string;
}

/**
 * Commit block: the primary entry CTA, the bundle ⇄ cash switch, and the
 * secure-checkout proof bar.
 *
 * COPY RULE (CLAUDE.md §11): the winner enters a free prize draw — the button
 * says "Enter now", never anything that prices or sells entries.
 */
export function PrizeBuilderCta({
  accent,
  isCash,
  onEnterNow,
  onChooseBundle,
  onChooseCash,
  className,
}: PrizeBuilderCtaProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={onEnterNow}
        className="w-full cursor-pointer rounded-xl p-3.5 text-center font-poppins text-sm font-extrabold uppercase tracking-[0.02em] text-white transition-transform duration-150 hover:brightness-105 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pbc-panel)]"
        style={{
          background: `linear-gradient(180deg, ${accent}, ${darken(accent)})`,
          boxShadow: `0 14px 34px -14px ${accent}`,
        }}
      >
        Enter now →
      </button>

      <div className="mt-2 flex gap-2" role="group" aria-label="Choose how you take the prize">
        <button
          type="button"
          onClick={onChooseBundle}
          aria-pressed={!isCash}
          className="flex-1 cursor-pointer rounded-[10px] border p-2.5 text-center font-poppins text-[9.5px] font-bold uppercase leading-tight tracking-[0.08em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)]"
          style={{
            borderColor: isCash ? "var(--pbc-border)" : accent,
            background: isCash ? "transparent" : "var(--pbc-toggle-active-bg)",
            color: isCash ? "var(--pbc-sub)" : "var(--pbc-text)",
            boxShadow: isCash ? "none" : `inset 0 -2px 0 ${accent}`,
          }}
        >
          Toolbox bundle
        </button>
        <button
          type="button"
          onClick={onChooseCash}
          aria-pressed={isCash}
          className="flex-1 cursor-pointer rounded-[10px] border p-2.5 text-center font-poppins text-[9.5px] font-bold uppercase leading-tight tracking-[0.08em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)]"
          style={{
            borderColor: isCash ? "var(--pbc-cash)" : "var(--pbc-border)",
            background: isCash ? "linear-gradient(180deg,var(--pbc-cash),var(--pbc-cash-dark))" : "transparent",
            color: isCash ? "#ffffff" : "var(--pbc-sub)",
            boxShadow: isCash ? "0 12px 30px -14px #18a94d" : "none",
          }}
        >
          Take $10,000 cash
        </button>
      </div>

      <SecureCheckoutBar className="mt-3.5" />
    </div>
  );
}
