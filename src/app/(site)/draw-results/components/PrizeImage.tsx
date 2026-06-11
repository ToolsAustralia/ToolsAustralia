import { Trophy } from "lucide-react";
import type { CSSProperties } from "react";

interface PrizeImageProps {
  src?: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders a prize/winner image, or a neutral trophy fallback when no artwork is
 * available. The plinth gradient background lives on the parent container.
 */
export default function PrizeImage({ src, alt, className, style }: PrizeImageProps) {
  if (!src) {
    return (
      <Trophy
        aria-hidden="true"
        style={{ width: 56, height: 56, color: "var(--ink-3)", opacity: 0.5 }}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary art; matches existing winner cards
  return <img src={src} alt={alt} loading="lazy" className={className} style={style} />;
}
