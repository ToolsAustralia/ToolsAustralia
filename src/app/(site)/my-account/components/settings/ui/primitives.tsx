// Shared UI primitives for the settings redesign.
// All Tailwind, light + dark variants, accessible.
// Pure presentational — no hooks, no fetch, no business logic.

import React from "react";
import { Lock, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/utils/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AccentColor = "red" | "amber" | "emerald" | "sky";
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outlineRed" | "dark";
type ButtonSize = "sm" | "md" | "lg";
type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "dark";
type IconComponent = React.ComponentType<{ className?: string; strokeWidth?: number }>;

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface CardProps {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
  [key: string]: unknown;
}

export const Card = ({ children, className, as: As = "div", ...rest }: CardProps) => (
  <As
    className={cn("rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900", className)}
    {...rest}
  >
    {children}
  </As>
);

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: IconComponent;
  accent?: AccentColor;
}

const accentGradients: Record<AccentColor, string> = {
  red:     "from-red-500 to-red-700",
  amber:   "from-amber-400 to-orange-500",
  emerald: "from-emerald-400 to-emerald-600",
  sky:     "from-sky-400 to-sky-600",
};

export const SectionHeader = ({ title, description, icon: IconCmp, accent = "red" }: SectionHeaderProps) => (
  <div className="flex items-start gap-3 pb-4 mb-5 border-b border-neutral-200 dark:border-neutral-800">
    <div className={`w-1 self-stretch min-h-[1.5rem] rounded-full bg-gradient-to-b ${accentGradients[accent]}`} />
    <div className="flex-1 min-w-0">
      <h3 className="font-poppins font-bold text-base sm:text-lg text-neutral-900 dark:text-white flex items-center gap-2">
        {IconCmp && <IconCmp className="w-5 h-5 text-neutral-500 dark:text-neutral-400" strokeWidth={2} />}
        {title}
      </h3>
      {description && (
        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">{description}</p>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  htmlFor?: string;
  locked?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export const Field = ({ label, htmlFor, locked, hint, error, children }: FieldProps) => (
  <div className="space-y-1.5">
    <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
      {locked && <Lock className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" strokeWidth={2} />}
      {label}
    </label>
    {children}
    {hint && !error && (
      <p className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5" /> {hint}
      </p>
    )}
    {error && (
      <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> {error}
      </p>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// SettingsInput
// ---------------------------------------------------------------------------

const inputBase =
  "w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 " +
  "text-neutral-900 dark:text-white px-3.5 py-3 text-sm placeholder-neutral-400 dark:placeholder-neutral-500 " +
  "focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 transition";

export const SettingsInput = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn(inputBase, className)} {...props} />
);

// ---------------------------------------------------------------------------
// LockedField
// ---------------------------------------------------------------------------

interface LockedFieldProps {
  value: React.ReactNode;
}

export const LockedField = ({ value }: LockedFieldProps) => (
  <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60 px-3.5 py-3 text-sm text-neutral-600 dark:text-neutral-400">
    {value}
  </div>
);

// ---------------------------------------------------------------------------
// SettingsButton
// ---------------------------------------------------------------------------

interface SettingsButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconComponent;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-red-600 hover:bg-red-675 text-white shadow-sm shadow-red-600/20",
  secondary:
    "border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200",
  ghost:
    "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800",
  danger:
    "border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50",
  outlineRed:
    "border border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30",
  dark:
    "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-sm",
};

export const SettingsButton = ({
  variant = "primary",
  size = "md",
  icon: IconCmp,
  children,
  className,
  type = "button",
  ...props
}: SettingsButtonProps) => (
  <button
    type={type}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600/40",
      buttonVariants[variant],
      buttonSizes[size],
      className,
    )}
    {...props}
  >
    {IconCmp && <IconCmp className="w-4 h-4" strokeWidth={2.25} />}
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// SettingsBadge
// ---------------------------------------------------------------------------

interface SettingsBadgeProps {
  tone?: BadgeTone;
  icon?: IconComponent;
  children: React.ReactNode;
  className?: string;
}

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700",
  success: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60",
  warning: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60",
  danger:  "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60",
  info:    "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900/60",
  dark:    "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-transparent",
};

export const SettingsBadge = ({ tone = "neutral", icon: IconCmp, children, className }: SettingsBadgeProps) => (
  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-5", badgeTones[tone], className)}>
    {IconCmp && <IconCmp className="w-3 h-3" strokeWidth={2.5} />}
    {children}
  </span>
);
