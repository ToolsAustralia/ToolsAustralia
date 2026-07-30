"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * Token-styled form primitives for the draws modals.
 *
 * These exist because the pre-revamp modals styled every input inline with
 * LIGHT-ONLY literals (`bg-white`, `border-gray-200`, `text-gray-500`) — no dark
 * variants, no shared height, drifting per modal. That is what made the set look
 * inconsistent.
 *
 * They are PRESENTATION ONLY and hold no submit logic, which is deliberate: the
 * draws forms differ in transport (multipart + self-submit vs JSON + delegate to
 * parent), so sharing markup is safe where sharing a form component is not.
 *
 * Every control takes `--m-field`, so all of them are 44px below the breakpoint.
 */

export function FieldLabel({
  icon: Icon,
  children,
  required,
  htmlFor,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-[6px] flex items-center gap-[6px] text-[11.5px] font-semibold text-[var(--text2)]">
      {Icon && <Icon className="h-[14px] w-[14px] text-[var(--text3)]" aria-hidden />}
      {children}
      {required && <span className="text-[var(--accent)]">*</span>}
    </label>
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-[5px] text-[11px] leading-[1.5] text-[var(--text3)]">{children}</p>;
}

export function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-[5px] text-[11.5px] font-medium text-[var(--accent)]">
      {children}
    </p>
  );
}

/** Shared input chrome. Invalid state gets the design's red border + soft ring. */
export const fieldClass = (invalid?: boolean) =>
  cn(
    "w-full rounded-[8px] border bg-[var(--input-bg)] px-[11px] text-[13px] text-[var(--text)]",
    "placeholder:text-[var(--text3)] outline-none transition-colors",
    "h-[var(--m-field)]",
    invalid
      ? "border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]"
      : "border-[var(--line)] focus:border-[var(--accent)]"
  );

export function TextField({
  id,
  value,
  defaultValue,
  onChange,
  placeholder,
  type = "text",
  invalid,
  disabled,
  min,
  inputMode,
}: {
  id?: string;
  /** Controlled. Pair with onChange — a `value` with no `onChange` is unusable. */
  value?: string | number;
  /** Uncontrolled prefill. Use this when the field opens with a value and the
   *  parent reads it on submit rather than tracking every keystroke. */
  defaultValue?: string | number;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: "text" | "url" | "number" | "datetime-local";
  invalid?: boolean;
  disabled?: boolean;
  min?: number | string;
  inputMode?: "text" | "numeric" | "url";
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      min={min}
      inputMode={inputMode}
      className={cn(fieldClass(invalid), disabled && "cursor-not-allowed opacity-60")}
    />
  );
}

export function SelectField({
  id,
  value,
  onChange,
  options,
  disabled,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(fieldClass(invalid), "cursor-pointer", disabled && "cursor-not-allowed opacity-60")}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A titled group of fields. Replaces the ad-hoc `space-y-6` blocks. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[var(--line)] pt-[14px] first:border-t-0 first:pt-0">
      <h3 className="font-poppins text-[13.5px] font-semibold text-[var(--text)]">{title}</h3>
      {description && <p className="mt-[3px] text-[11.5px] leading-[1.5] text-[var(--text3)]">{description}</p>}
      <div className="mt-[10px] flex flex-col gap-[12px]">{children}</div>
    </section>
  );
}

/** Two-up on desktop, stacked on mobile — the design's --m-cols2. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[var(--m-cols2)] gap-[12px]">{children}</div>;
}
