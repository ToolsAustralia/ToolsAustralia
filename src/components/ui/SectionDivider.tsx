"use client";

interface SectionDividerProps {
  type?: "wave" | "curve" | "diagonal" | "zigzag";
  color?: string;
  flip?: boolean;
  className?: string;
}

export default function SectionDivider({
  type = "wave",
  color = "#f9fafb",
  flip = false,
  className = "",
}: SectionDividerProps) {
  const getPath = () => {
    switch (type) {
      case "wave":
        return flip ? "M0,0 L0,100 Q50,50 100,100 L100,0 Z" : "M0,100 L0,0 Q50,50 100,0 L100,100 Z";
      case "curve":
        return flip ? "M0,0 L0,100 Q50,10 100,100 L100,0 Z" : "M0,100 L0,0 Q50,60 100,0 L100,100 Z";
      case "diagonal":
        return flip ? "M0,0 L100,100 L100,0 Z" : "M0,100 L100,0 L0,0 Z";
      case "zigzag":
        return flip
          ? "M0,0 L25,50 L50,0 L75,50 L100,0 L100,100 L0,100 Z"
          : "M0,100 L25,50 L50,100 L75,50 L100,100 L100,0 L0,0 Z";
      default:
        return "M0,0 L0,100 Q50,50 100,100 L100,0 Z";
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Height is controlled by Tailwind classes: h-16 = 64px (mobile), sm:h-24 = 96px (desktop) */}
      {/* To adjust: Change h-16 and sm:h-24 to your desired Tailwind height classes */}
      {/* Common options: h-12 (48px), h-16 (64px), h-20 (80px), h-24 (96px), h-28 (112px), h-32 (128px) */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-16 sm:h-24" fill={color}>
        <path d={getPath()} />
      </svg>
    </div>
  );
}
