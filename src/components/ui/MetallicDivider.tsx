import React from "react";

type MetallicDividerProps = {
  /** Tailwind height utility (e.g. "h-px", "h-[2px]") */
  height?: string;
  /** Extra classes for positioning/layout (e.g. "absolute bottom-0 left-0 right-0") */
  className?: string;
};

/**
 * MetallicDivider renders a horizontal metallic gradient line.
 * Height is configurable via Tailwind class to match different contexts.
 */
export default function MetallicDivider({ height = "h-px", className = "" }: MetallicDividerProps) {
  return (
    <div className={`w-full bg-gradient-to-r from-transparent via-[#ee0000] to-transparent ${height} ${className}`} />
  );
}
