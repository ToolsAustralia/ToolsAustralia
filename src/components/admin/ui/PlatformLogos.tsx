"use client";

/**
 * Inline-SVG brand logos for the admin Advertising card.
 *
 * These are hand-rolled inline SVGs so the dashboard ships with recognizable
 * brand marks without needing image assets in the repo. Each mark uses the
 * platform's official brand colors and iconic glyph. If/when official logo
 * files (svg/png) are added, swap the inner markup for an <img>/<Image> — the
 * `PlatformLogo` wrapper API (the `platform` prop + ~w-5 h-5 sizing) can stay.
 */

export type PlatformLogoName =
  | "facebook"
  | "tiktok"
  | "snapchat"
  | "klaviyo";

const BASE_CLASS = "w-5 h-5 shrink-0 rounded-[5px]";

function FacebookLogo({ className }: { className?: string }) {
  // White "f" on the Facebook blue (#1877F2) rounded square.
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? BASE_CLASS}
      role="img"
      aria-label="Facebook"
    >
      <rect width="24" height="24" rx="6" fill="#1877F2" />
      <path
        fill="#FFFFFF"
        d="M15.4 12.7l.4-2.6h-2.5V8.4c0-.7.35-1.4 1.5-1.4h1.13V4.8s-1.02-.18-2-.18c-2.04 0-3.37 1.24-3.37 3.47v1.96H8.3v2.6h2.26V19h2.78v-6.3h2.06z"
      />
    </svg>
  );
}

function TikTokLogo({ className }: { className?: string }) {
  // Note glyph on black, with the offset cyan (#25F4EE) + red (#FE2C55) shadows.
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? BASE_CLASS}
      role="img"
      aria-label="TikTok"
    >
      <rect width="24" height="24" rx="6" fill="#000000" />
      {/* cyan offset */}
      <path
        fill="#25F4EE"
        d="M12.1 6h1.9c.13.95.55 1.8 1.18 2.45-.7-.2-1.34-.55-1.88-1.02v5.6a3.85 3.85 0 11-3.85-3.85c.18 0 .35.01.52.04v2.04a1.85 1.85 0 101.3 1.77V6z"
      />
      {/* red offset */}
      <path
        fill="#FE2C55"
        d="M13.1 5h1.9c.13.95.55 1.8 1.18 2.45-.7-.2-1.34-.55-1.88-1.02v5.6a3.85 3.85 0 11-3.85-3.85c.18 0 .35.01.52.04v2.04a1.85 1.85 0 101.3 1.77V5z"
      />
      {/* white note */}
      <path
        fill="#FFFFFF"
        d="M12.6 5.5h1.9c.13.95.55 1.8 1.18 2.45-.7-.2-1.34-.55-1.88-1.02v5.6a3.85 3.85 0 11-3.85-3.85c.18 0 .35.01.52.04v2.04a1.85 1.85 0 101.3 1.77V5.5z"
      />
    </svg>
  );
}

function SnapchatLogo({ className }: { className?: string }) {
  // White ghost on Snapchat yellow (#FFFC00) rounded square.
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? BASE_CLASS}
      role="img"
      aria-label="Snapchat"
    >
      <rect width="24" height="24" rx="6" fill="#FFFC00" />
      <path
        fill="#FFFFFF"
        stroke="#000000"
        strokeWidth="0.4"
        d="M12 4.6c1.96 0 3.18 1.48 3.28 3.32.03.45.01.9.01 1.35.27.13.6.05.86-.07.43-.2.95.34.62.73-.3.36-.86.5-1.28.69-.16.07-.16.2-.1.36.45 1.18 1.5 2.06 2.7 2.4.34.1.3.5.02.66-.5.27-1.1.32-1.62.55-.1.32.04.78-.34.93-.45.18-.93-.13-1.4-.07-.6.07-1 .68-1.56.9-.86.36-1.92.36-2.78 0-.56-.22-.96-.83-1.56-.9-.47-.06-.95.25-1.4.07-.38-.15-.24-.61-.34-.93-.52-.23-1.12-.28-1.62-.55-.28-.16-.32-.56.02-.66 1.2-.34 2.25-1.22 2.7-2.4.06-.16.06-.29-.1-.36-.42-.19-.98-.33-1.28-.69-.33-.39.19-.93.62-.73.26.12.59.2.86.07 0-.45-.02-.9.01-1.35C8.82 6.08 10.04 4.6 12 4.6z"
      />
    </svg>
  );
}

function KlaviyoLogo({ className }: { className?: string }) {
  // Klaviyo "K"-style angular monogram in Klaviyo green (#0FA958) on dark (#232426).
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? BASE_CLASS}
      role="img"
      aria-label="Klaviyo"
    >
      <rect width="24" height="24" rx="6" fill="#232426" />
      <path
        fill="#0FA958"
        d="M6.5 6.2h2.4v4.55l4.2-4.55h3.1l-4.85 5.2 4.95 6.4h-3.1l-3.55-4.7-.75.78V17.8H6.5z"
      />
    </svg>
  );
}

export function PlatformLogo({
  platform,
  className,
}: {
  platform: PlatformLogoName;
  className?: string;
}) {
  switch (platform) {
    case "facebook":
      return <FacebookLogo className={className} />;
    case "tiktok":
      return <TikTokLogo className={className} />;
    case "snapchat":
      return <SnapchatLogo className={className} />;
    case "klaviyo":
      return <KlaviyoLogo className={className} />;
    default:
      return null;
  }
}
