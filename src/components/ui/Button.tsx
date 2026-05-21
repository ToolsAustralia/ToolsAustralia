"use client";

import React, { type ButtonHTMLAttributes, forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const button = cva(
  "inline-flex items-center justify-center gap-1.5 font-bold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600/40",
  {
    variants: {
      variant: {
        primary: "border shadow-sm hover:[&:not(:disabled)]:-translate-y-px hover:[&:not(:disabled)]:brightness-105",
        outline: "bg-white border hover:[&:not(:disabled)]:bg-neutral-50",
        ghost: "bg-transparent border border-transparent hover:[&:not(:disabled)]:bg-neutral-100",
        link: "bg-transparent border-transparent underline-offset-4 hover:[&:not(:disabled)]:underline px-0 py-0",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
      tone: {
        red: "",
        "tier-tradie": "",
        "tier-foreman": "",
        "tier-boss": "",
        neutral: "",
      },
    },
    compoundVariants: [
      // Primary tones
      { variant: "primary", tone: "red", class: "bg-gradient-to-b from-red-600 to-red-800 text-white border-red-800 shadow-[0_4px_12px_rgba(238,0,0,0.25)]" },
      { variant: "primary", tone: "tier-tradie", class: "bg-gradient-to-br from-[#5ca9ec] to-[#00c2ed] text-white border-[#00c2ed] shadow-[0_4px_12px_rgba(0,194,237,0.3)]" },
      { variant: "primary", tone: "tier-foreman", class: "bg-gradient-to-br from-[#ffe066] to-[#ffd200] text-neutral-950 border-[#ffd200] shadow-[0_4px_12px_rgba(255,210,0,0.3)]" },
      { variant: "primary", tone: "tier-boss", class: "bg-gradient-to-br from-[#ff3333] to-red-600 text-white border-red-600 shadow-[0_4px_12px_rgba(238,0,0,0.3)]" },
      { variant: "primary", tone: "neutral", class: "bg-gradient-to-b from-neutral-700 to-neutral-900 text-white border-neutral-900 shadow-[0_4px_12px_rgba(0,0,0,0.2)]" },
      // Outline tones
      { variant: "outline", tone: "red", class: "text-red-700 border-red-300 hover:[&:not(:disabled)]:bg-red-50 hover:[&:not(:disabled)]:border-red-700" },
      { variant: "outline", tone: "tier-tradie", class: "text-[#0b7e88] border-[#bae6fd] hover:[&:not(:disabled)]:bg-[#e0f9ff]" },
      { variant: "outline", tone: "tier-foreman", class: "text-[#a17b00] border-[#fde68a] hover:[&:not(:disabled)]:bg-[#fffbe6]" },
      { variant: "outline", tone: "tier-boss", class: "text-red-700 border-red-300 hover:[&:not(:disabled)]:bg-red-50" },
      { variant: "outline", tone: "neutral", class: "text-neutral-700 border-neutral-300 hover:[&:not(:disabled)]:bg-neutral-50" },
      // Ghost tones
      { variant: "ghost", tone: "red", class: "text-red-700 hover:[&:not(:disabled)]:bg-red-50" },
      { variant: "ghost", tone: "tier-tradie", class: "text-[#0b7e88] hover:[&:not(:disabled)]:bg-[#e0f9ff]" },
      { variant: "ghost", tone: "tier-foreman", class: "text-[#a17b00] hover:[&:not(:disabled)]:bg-[#fffbe6]" },
      { variant: "ghost", tone: "tier-boss", class: "text-red-700 hover:[&:not(:disabled)]:bg-red-50" },
      { variant: "ghost", tone: "neutral", class: "text-neutral-700 hover:[&:not(:disabled)]:bg-neutral-100" },
      // Link tones
      { variant: "link", tone: "red", class: "text-red-700 hover:[&:not(:disabled)]:text-red-800" },
      { variant: "link", tone: "tier-tradie", class: "text-[#0b7e88] hover:[&:not(:disabled)]:text-[#075e66]" },
      { variant: "link", tone: "tier-foreman", class: "text-[#a17b00] hover:[&:not(:disabled)]:text-[#7d5e00]" },
      { variant: "link", tone: "tier-boss", class: "text-red-700 hover:[&:not(:disabled)]:text-red-800" },
      { variant: "link", tone: "neutral", class: "text-neutral-700 hover:[&:not(:disabled)]:text-neutral-900" },
    ],
    defaultVariants: { variant: "primary", size: "md", tone: "red" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** When true, renders as the child element via Radix Slot — pass an <a>/<Link> child to make a button-styled link. */
  asChild?: boolean;
  /** When true, shows a Loader2 spinner and disables interaction. */
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, tone, asChild = false, loading = false, disabled, children, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;
    const buttonOnlyProps = asChild ? {} : { type: type ?? "button", disabled: isDisabled };
    return (
      <Comp
        ref={ref}
        aria-busy={loading || undefined}
        aria-disabled={asChild && isDisabled ? true : undefined}
        className={cn(
          button({ variant, size, tone }),
          asChild && isDisabled && "opacity-60 cursor-not-allowed pointer-events-none",
          className
        )}
        {...buttonOnlyProps}
        {...props}
      >
        {asChild ? children : (
          <>
            {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            {children}
          </>
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export default Button;
export { button as buttonStyles };
