import React, { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const badge = cva(
  "inline-flex items-center justify-center gap-1 font-extrabold uppercase tracking-wider rounded-full whitespace-nowrap",
  {
    variants: {
      /**
       * Every tone is a pastel surface + deep ink — correct on white, ~3:1 on a dark panel.
       * There were no `dark:` arms at all, which is the same defect `Card` and `Button` were
       * fixed for. Latent rather than live (Badge has no production consumers yet), but the
       * first `<Badge tone="tier-tradie">` dropped into a dark modal would have reproduced it.
       * `assertThemePaired` now fails the build if a tone is added without a pair.
       *
       * `gold` is deliberately unpaired: it is a filled gradient chip with its own dark ink,
       * so it reads on either surface — hence no themeable single-colour token to guard.
       */
      tone: {
        red: "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800/50",
        gold: "bg-gradient-to-br from-[#f4cf6b] to-premium-gold text-neutral-950 border border-[#d4af37]",
        "tier-tradie":
          "bg-[#e0f9ff] dark:bg-[#0b7e88]/20 text-[#0b7e88] dark:text-[#5cd6e8] border border-[#bae6fd] dark:border-[#0b7e88]",
        "tier-foreman":
          "bg-[#fffbe6] dark:bg-[#a17b00]/20 text-[#a17b00] dark:text-[#ffd200] border border-[#fde68a] dark:border-[#a17b00]",
        "tier-boss":
          "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800/50",
        neutral:
          "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700",
        success:
          "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800/50",
        warning:
          "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50",
        info: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50",
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
