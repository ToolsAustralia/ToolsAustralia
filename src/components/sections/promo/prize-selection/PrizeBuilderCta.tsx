"use client";

import { cn } from "@/utils/cn";
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

      <SecureCheckoutBar />
    </div>
  );
}

/**
 * Payment-provider proof row. Marks are inline SVG (no network request, no
 * layout shift) and theme-aware: the ink that would disappear on the opposite
 * surface swaps via CSS variables, while fixed brand colours (the Mastercard
 * discs, the Google "G") stay put.
 */
function SecureCheckoutBar() {
  return (
    <div className="mt-3.5 border-t border-[var(--pbc-pay-rule)] pt-3.5">
      <div className="mb-3 flex items-center justify-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-[var(--pbc-rule)]" />
        <span className="whitespace-nowrap font-poppins text-[9.5px] font-bold leading-none tracking-[0.13em] text-[var(--pbc-heading)]">
          INSTANT AND SECURE CHECKOUT WITH
        </span>
        <span aria-hidden className="h-px flex-1 bg-[var(--pbc-rule)]" />
      </div>
      <div className="flex flex-nowrap items-center justify-center gap-3 overflow-hidden sm:gap-[22px]">
        <VisaMark />
        <GooglePayMark />
        <MastercardMark />
        <StripeMark />
        <ApplePayMark />
      </div>
    </div>
  );
}

function VisaMark() {
  return (
    <svg viewBox="0 0 64 20" height="17" role="img" aria-label="Visa" className="shrink-0">
      <text
        x="32"
        y="16"
        textAnchor="middle"
        fontFamily="Arial,Helvetica,sans-serif"
        fontSize="18"
        fontWeight="800"
        fontStyle="italic"
        letterSpacing="1"
        fill="var(--pbc-visa)"
      >
        VISA
      </text>
    </svg>
  );
}

function GooglePayMark() {
  return (
    <svg viewBox="0 0 60 24" height="19" role="img" aria-label="Google Pay" className="shrink-0">
      <g transform="translate(0.5,2.2) scale(0.92)">
        <path
          d="M11.5 12.05c0-.5-.04-.98-.13-1.44H6v2.72h3.09a2.64 2.64 0 0 1-1.15 1.73v1.44h1.85c1.08-1 1.71-2.47 1.71-4.45z"
          fill="#4285F4"
        />
        <path
          d="M6 17.5c1.55 0 2.86-.51 3.81-1.39l-1.85-1.44c-.51.35-1.17.55-1.96.55-1.5 0-2.78-1.01-3.24-2.38H.86v1.49A5.75 5.75 0 0 0 6 17.5z"
          fill="#34A853"
        />
        <path d="M2.76 12.44a3.45 3.45 0 0 1 0-2.2V8.75H.86a5.76 5.76 0 0 0 0 5.18l1.9-1.49z" fill="#FBBC04" />
        <path
          d="M6 7.86c.85 0 1.6.29 2.2.86l1.64-1.64A5.53 5.53 0 0 0 6 5.5 5.75 5.75 0 0 0 .86 8.75l1.9 1.49C3.22 8.87 4.5 7.86 6 7.86z"
          fill="#EA4335"
        />
      </g>
      <text x="11" y="17" fontFamily="Arial,Helvetica,sans-serif" fontSize="17" fontWeight="600" fill="var(--pbc-gpay)">
        Pay
      </text>
    </svg>
  );
}

function MastercardMark() {
  return (
    <svg viewBox="0 0 46 30" height="25" role="img" aria-label="Mastercard" className="shrink-0">
      <circle cx="18" cy="15" r="11" fill="#EB001B" />
      <circle cx="28" cy="15" r="11" fill="#F79E1B" />
      <path d="M23 6.6a11 11 0 0 1 0 16.8 11 11 0 0 1 0-16.8z" fill="#FF5F00" />
    </svg>
  );
}

function StripeMark() {
  return (
    <svg viewBox="0 0 58 20" height="16" role="img" aria-label="Stripe" className="shrink-0">
      <text
        x="0"
        y="16"
        fontFamily="Arial,Helvetica,sans-serif"
        fontSize="17"
        fontWeight="800"
        letterSpacing="-0.5"
        fill="var(--pbc-stripe)"
      >
        stripe
      </text>
    </svg>
  );
}

function ApplePayMark() {
  return (
    <svg viewBox="0 0 60 24" height="19" role="img" aria-label="Apple Pay" className="shrink-0">
      <path
        d="M13.9 7.98c.53-.66.89-1.55.79-2.46-.77.04-1.71.51-2.26 1.17-.49.57-.93 1.5-.81 2.38.86.07 1.74-.44 2.28-1.09zm.78 1.24c-1.25-.07-2.31.71-2.91.71-.6 0-1.51-.67-2.49-.66-1.28.02-2.46.74-3.12 1.9-1.33 2.31-.35 5.73.95 7.61.63.92 1.39 1.95 2.38 1.91.95-.04 1.31-.61 2.46-.61 1.15 0 1.47.61 2.48.59 1.02-.02 1.67-.93 2.3-1.86.72-1.07 1.02-2.1 1.03-2.16-.02-.01-1.98-.76-2-3.02-.02-1.89 1.54-2.79 1.61-2.84-.88-1.3-2.25-1.44-2.73-1.47z"
        fill="var(--pbc-ink-strong)"
      />
      <text x="22" y="17" fontFamily="Arial,Helvetica,sans-serif" fontSize="17" fontWeight="600" fill="var(--pbc-ink-strong)">
        Pay
      </text>
    </svg>
  );
}
