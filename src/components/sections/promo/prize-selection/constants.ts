/**
 * Prize selection constants - toolbox and power toolset image paths and sizing.
 * Modify these to change images or dimensions without touching component logic.
 */
import { RYOBI_PRIZE_STRICT_NAME } from "@/config/prizes";

export const TOOLBOX_IMAGES = {
  milwaukee: "/images/majordraws/toolbox/milwaukeeTB.webp",
  sidchrome: "/images/majordraws/toolbox/sidchromeTB.png",
} as const;

/** Add new toolsets here - slug format: "{toolset}-{toolbox}" (e.g. ryobi-milwaukee) */
export const POWERSET_IMAGES: Record<string, string> = {
  milwaukee: "/images/brands/name/milwaukeeSet.png",
  dewalt: "/images/brands/name/dewaltSet.png",
  makita: "/images/brands/name/makitaSet.png",
  ryobi: "/images/brands/name/ryobiSet.png",
};

/** Brand name logo images - overlay on power toolset images */
export const POWERSET_BRAND_TEXT: Record<string, string> = {
  milwaukee: "/images/brands/name/milwaukeeText.png",
  dewalt: "/images/brands/name/dewaltText.png",
  makita: "/images/brands/name/makitaText.png",
  ryobi: "/images/brands/name/ryobiText.png",
};

/** Toolset display labels - shown as bottom overlay. Add label when adding new toolset. */
export const POWERSET_LABELS: Record<string, string> = {
  makita: "Makita 18V Brushless 15 Piece Combo Kit (DLX1514TX1)",
  dewalt: "DeWalt 18V XR 14 Piece Kit - 2X 5Ah & 2X FLEXVOLT® 9Ah",
  milwaukee: "Milwaukee M18 FUEL™ 13 Piece Power Pack 13B4",
  ryobi: RYOBI_PRIZE_STRICT_NAME,
};

/** Toolbox display labels - shown as bottom overlay */
export const TOOLBOX_LABELS: Record<string, string> = {
  milwaukee: "Milwaukee Toolbox",
  sidchrome: "Sidchrome Toolbox",
};

/** Toolbox type keys */
export type ToolboxType = "sidchrome" | "milwaukee" | "cash";

/** Power toolset brand keys */
export type ToolsetType = "milwaukee" | "dewalt" | "makita" | "ryobi";

/** Toolbox image size config - modify for responsive scaling */
export const TOOLBOX_SIZES = {
  milwaukee: {
    mobile: { w: 200, h: 140 },
    desktop: { w: 320, h: 220 },
    imageScale: 1.25, // Milwaukee image appears smaller in source, scale up
  },
  sidchrome: {
    mobile: { w: 180, h: 130 },
    desktop: { w: 280, h: 200 },
    imageScale: 1,
  },
} as const;

/** Power toolset carousel sizes */
export const POWERSET_SIZES = {
  center: {
    mobile: { w: 220, h: 155 },
    tablet: { w: 360, h: 250 },
    desktop: { w: 440, h: 305 },
  },
  side: {
    mobile: { w: 80, h: 96 },
    desktop: { w: 112, h: 134 },
  },
} as const;
