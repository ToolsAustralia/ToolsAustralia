"use client";

import React from "react";

interface DiagonalPatternOverlayProps {
  className?: string;
  opacity?: number;
  size?: string;
  color?: string;
  strokeWidth?: number;
  dashArray?: string;
  rotation?: number;
  topOffset?: string;
}

export default function DiagonalPatternOverlay({
  className = "",
  opacity = 0.3,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size: _ = "cover", // Size parameter not currently used
  color = "#ffffff",
  strokeWidth = 2,
  dashArray = "10,10",
  rotation = -15,
  topOffset = "0",
}: DiagonalPatternOverlayProps) {
  // Create a custom diagonal pattern SVG
  const createDiagonalPattern = () => {
    const patternId = `diagonal-pattern-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <defs>
          <pattern id={patternId} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <path
              d="M0,10 L20,0 L40,10 L60,0 L80,10 L100,0 L100,20 L80,10 L60,20 L40,10 L20,20 L0,10 Z"
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              opacity={opacity}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    );
  };

  return (
    <div className={`absolute left-0 right-0 bottom-0 pointer-events-none ${className}`} style={{ top: topOffset }}>
      {createDiagonalPattern()}
    </div>
  );
}

// Alternative: CSS-based diagonal pattern component
export function CSSDiagonalPatternOverlay({
  className = "",
  opacity = 0.3,
  size = "200px 40px",
  color = "#ffffff",
  strokeWidth = 2,
  dashArray = "5,5",
  rotation = -15,
  topOffset = "0",
}: DiagonalPatternOverlayProps) {
  const patternStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='20' viewBox='0 0 100 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,10 L20,0 L40,10 L60,0 L80,10 L100,0 L100,20 L80,10 L60,20 L40,10 L20,20 L0,10 Z' fill='none' stroke='${encodeURIComponent(
      color
    )}' stroke-width='${strokeWidth}' stroke-dasharray='${dashArray}' opacity='${opacity}'/%3E%3C/svg%3E")`,
    backgroundSize: size,
    backgroundRepeat: "repeat",
    transform: `rotate(${rotation}deg)`,
    transformOrigin: "center",
    opacity: opacity,
  };

  return (
    <div
      className={`absolute left-0 right-0 bottom-0 pointer-events-none ${className}`}
      style={{ ...patternStyle, top: topOffset }}
    />
  );
}

// Custom jagged diagonal pattern (like the one you provided)
export function JaggedDiagonalPatternOverlay({
  className = "",
  opacity = 0.3,
  size = "cover",
  rotation = 0,
  topOffset = "0",
}: DiagonalPatternOverlayProps) {
  const jaggedPatternStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1306' height='629' viewBox='0 0 1306 629' fill='none'%3E%3Cpath d='M176.5 404L87 361.5L1 435V606C1 618.15 10.8497 628 23 628H1283C1295.15 628 1305 618.15 1305 606V0.5L1216.5 174.5L1106 79L986 232L836 155.5L740 272.5L585.5 162L367.5 392L269 321.5L176.5 404Z' fill='url(%23paint0_linear_70_935)' fill-opacity='0.28' stroke='url(%23paint1_linear_70_935)' stroke-dasharray='10 10'/%3E%3Cdefs%3E%3ClinearGradient id='paint0_linear_70_935' x1='954' y1='591' x2='670.5' y2='38.9999' gradientUnits='userSpaceOnUse'%3E%3Cstop/%3E%3Cstop offset='1' stop-opacity='0'/%3E%3C/linearGradient%3E%3ClinearGradient id='paint1_linear_70_935' x1='650.5' y1='-84.9999' x2='650.5' y2='628' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%235CBFEA'/%3E%3Cstop offset='1' stop-color='white' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3C/svg%3E")`,
    backgroundSize: size,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    opacity: opacity,
    transform: `rotate(${rotation}deg)`,
  };

  return (
    <div
      className={`absolute left-0 right-0 bottom-0 pointer-events-none ${className}`}
      style={{ ...jaggedPatternStyle, top: topOffset }}
    />
  );
}
