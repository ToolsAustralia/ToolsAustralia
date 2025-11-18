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
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-28 sm:h-44" style={{ fill: color }}>
        <path d={getPath()} />
      </svg>
    </div>
  );
}
