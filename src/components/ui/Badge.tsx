import React, { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const badge = cva(
  "inline-flex items-center justify-center gap-1 font-extrabold uppercase tracking-wider rounded-full whitespace-nowrap",
  {
    variants: {
      tone: {
        red: "bg-red-100 text-red-800 border border-red-200",
        gold: "bg-gradient-to-br from-[#f4cf6b] to-premium-gold text-neutral-950 border border-[#d4af37]",
        "tier-tradie": "bg-[#e0f9ff] text-[#0b7e88] border border-[#bae6fd]",
        "tier-foreman": "bg-[#fffbe6] text-[#a17b00] border border-[#fde68a]",
        "tier-boss": "bg-red-100 text-red-800 border border-red-200",
        neutral: "bg-neutral-100 text-neutral-700 border border-neutral-200",
        success: "bg-green-100 text-green-800 border border-green-200",
        warning: "bg-amber-100 text-amber-800 border border-amber-200",
        info: "bg-blue-100 text-blue-800 border border-blue-200",
      },
      size: {
        sm: "text-3xs px-1.5 py-0.5 leading-tight",
        md: "text-2xs px-2 py-0.5 leading-tight",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({ className, tone, size, children, ...props }, ref) => {
  return (
    <span ref={ref} className={cn(badge({ tone, size }), className)} {...props}>
      {children}
    </span>
  );
});
Badge.displayName = "Badge";

export default Badge;
export { badge as badgeStyles };
