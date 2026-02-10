import React from "react";

// Canonical section container classes for consistent width + gutters across all breakpoints
export const SECTION_CONTAINER_CLASSES =
  "w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8";

interface SectionContainerProps {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "main";
  variant?: "default" | "narrow" | "medium";
}

const variantClasses = {
  default: "max-w-7xl",
  narrow: "max-w-4xl",
  medium: "max-w-6xl",
};

export function SectionContainer({
  children,
  className = "",
  as: Component = "div",
  variant = "default",
}: SectionContainerProps) {
  // Build the className by replacing max-w-7xl with the variant if needed
  const baseClasses =
    variant === "default"
      ? SECTION_CONTAINER_CLASSES
      : SECTION_CONTAINER_CLASSES.replace("max-w-7xl", variantClasses[variant]);

  const finalClassName = `${baseClasses} ${className}`.trim();

  return <Component className={finalClassName}>{children}</Component>;
}
