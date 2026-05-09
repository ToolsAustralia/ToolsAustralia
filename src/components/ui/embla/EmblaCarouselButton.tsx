"use client";
import { type ButtonHTMLAttributes } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";

interface EmblaCarouselButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  direction: "prev" | "next";
}

export function EmblaCarouselButton({
  direction,
  className,
  disabled,
  ...props
}: EmblaCarouselButtonProps) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={direction === "prev" ? "Previous" : "Next"}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center",
        "rounded-full border-2 bg-black/70 text-white transition hover:bg-black/85",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
    </button>
  );
}
