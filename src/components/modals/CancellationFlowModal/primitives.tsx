"use client";

/**
 * Shared presentational primitives for the CancellationFlowModal.
 * No business logic, no API calls — pure theme-token-driven UI used by every
 * step so all screens stay visually consistent. Brand red #ee0000 +
 * premium-gold accent; light/dark via Tailwind `dark:` variants.
 */

import React from "react";
import Image from "next/image";
import { X, ShieldCheck, Award, Lock } from "lucide-react";
import { cn } from "@/utils/cn";

const TrustFooter: React.FC = () => (
  <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:border-neutral-700 dark:text-neutral-500 max-xs:px-4">
    <span className="inline-flex items-center gap-1.5">
      <ShieldCheck size={12} /> SSL secure
    </span>
    <span className="inline-flex items-center gap-1.5">
      <Award size={12} /> NTP/16264
    </span>
    <span className="inline-flex items-center gap-1.5">
      <Lock size={12} /> Cancel anytime
    </span>
  </div>
);

/** Branded header + body + optional flush trust footer. No progress indicator. */
export const FlowFrame: React.FC<{
  onClose: () => void;
  children: React.ReactNode;
  trust?: boolean;
}> = ({ onClose, children, trust = true }) => (
  <div className="flex flex-col">
    <div className="flex items-center justify-between px-5 pt-4 pb-1 max-xs:px-4">
      <div className="flex items-center gap-2 text-xs font-extrabold tracking-tight text-neutral-600 dark:text-neutral-300">
        <Image
          src="/images/Tools Australia Logo/Social Media Profile_Primary.webp"
          alt="Tools Australia"
          width={22}
          height={22}
          className="block rounded-[7px] dark:hidden"
        />
        <Image
          src="/images/Tools Australia Logo/Social Media Profile_Black Background.webp"
          alt="Tools Australia"
          width={22}
          height={22}
          className="hidden rounded-[7px] dark:block"
        />
        Tools Australia
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-neutral-100 text-neutral-400 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
    <div className="px-5 pb-5 pt-3 max-xs:px-4">{children}</div>
    {trust && <TrustFooter />}
  </div>
);

export const IconChip: React.FC<{ children: React.ReactNode; tone?: "red" | "gold" }> = ({
  children,
  tone = "red",
}) => (
  <div
    className={cn(
      "flex h-[46px] w-[46px] items-center justify-center rounded-[14px]",
      tone === "red"
        ? "bg-gradient-to-b from-red-50 to-red-100 text-red-600 dark:from-red-950/40 dark:to-red-900/30 dark:text-red-400"
        : "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
    )}
  >
    {children}
  </div>
);

export const ValueCard: React.FC<{
  children: React.ReactNode;
  glow?: boolean;
  className?: string;
}> = ({ children, glow = false, className }) => (
  <div
    className={cn(
      "relative mt-4 rounded-[20px] border border-neutral-200 bg-gradient-to-b from-white to-neutral-50 p-[18px] shadow-[0_12px_30px_-14px_rgba(0,0,0,.18)] dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-900/60",
      /* gold 1px border-gradient: gradient overlay masked so only the inset ring shows */
      glow &&
        "before:pointer-events-none before:absolute before:inset-[-1px] before:rounded-[21px] before:bg-[linear-gradient(135deg,rgba(245,182,20,.7),transparent_45%)] before:[-webkit-mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:p-px",
      className
    )}
  >
    {children}
  </div>
);

export const FeatureRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-2.5 flex items-center gap-2.5 text-[12.5px] leading-tight text-neutral-700 dark:text-neutral-300">
    <span className="flex h-[21px] w-[21px] flex-shrink-0 items-center justify-center rounded-[7px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
      <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
    <span>{children}</span>
  </div>
);

export const PrimaryCta: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ children, className, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={cn(
      "cf-cta-shine relative w-full overflow-hidden rounded-[15px] bg-gradient-to-b from-red-600 to-red-800 px-4 py-4 text-[14.5px] font-extrabold tracking-tight text-white",
      "shadow-[0_12px_26px_-8px_rgba(238,0,0,.5),inset_0_1px_0_rgba(255,255,255,.25)]",
      "transition-all duration-150 hover:[&:not(:disabled)]:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
  >
    <span className="relative z-[1] inline-flex items-center justify-center gap-2">{children}</span>
  </button>
);

export const TextDecline: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ children, className, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={cn(
      "mt-3 block w-full text-center text-[12.5px] font-semibold text-neutral-500 underline underline-offset-[3px] transition-colors hover:text-neutral-700 disabled:opacity-60 dark:text-neutral-400 dark:hover:text-neutral-200",
      className
    )}
  >
    {children}
  </button>
);

/** The single tasteful gold persuasion strip (confirm + bonus-rung loss line). */
export const UrgencyStrip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-3.5 flex items-center gap-2.5 rounded-[11px] border border-amber-200 bg-gradient-to-b from-amber-50 to-amber-100/60 px-3.5 py-3 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-amber-950/10">
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" className="flex-shrink-0 text-amber-500 dark:text-amber-300">
      <path d="m12 2 2.4 7.4H22l-6 4.3 2.3 7.3-6.3-4.6L5.7 21 8 13.7 2 9.4h7.6z" />
    </svg>
    <span className="text-[11px] font-semibold leading-snug text-amber-800 dark:text-amber-300">
      {children}
    </span>
  </div>
);

export const Headline: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <h2 className={cn("mt-3.5 text-[23px] font-extrabold leading-[1.28] tracking-[-0.025em] text-neutral-900 dark:text-white", className)}>
    {children}
  </h2>
);

export const SubCopy: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cn("mt-2 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400", className)}>
    {children}
  </p>
);

export const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn("mt-1 text-[10.5px] font-extrabold uppercase tracking-[0.13em] text-red-600 dark:text-red-400", className)}>
    {children}
  </div>
);
