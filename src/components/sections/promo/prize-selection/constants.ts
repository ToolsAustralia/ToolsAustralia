/**
 * Prize selection constants - toolbox and power toolset image paths and sizing.
 * Modify these to change images or dimensions without touching component logic.
 */
export const TOOLBOX_IMAGES = {
  milwaukee: "/images/majordraws/toolbox/milwaukeeTB.webp",
  sidchrome: "/images/majordraws/toolbox/sidchromeTB.webp",
} as const;

/** Add new toolsets here - slug format: "{toolset}-{toolbox}" (e.g. ryobi-milwaukee) */
export const POWERSET_IMAGES: Record<string, string> = {
  milwaukee: "/images/majordraws/milwaukee-set/MILWAUKEE.webp",
  dewalt: "/images/majordraws/dewalt-set/DEWALT.webp",
  makita: "/images/majordraws/makita-set/MAKITA.webp",
  ryobi: "/images/majordraws/ryobi-set/RYOBI.webp",
};

/** Brand name logo images - overlay on power toolset images */
export const POWERSET_BRAND_TEXT: Record<string, string> = {
  milwaukee: "/images/brands/name/milwaukeeText.webp",
  dewalt: "/images/brands/name/dewaltText.webp",
  makita: "/images/brands/name/makitaText.webp",
  ryobi: "/images/brands/name/ryobiText.webp",
};

/** Toolset display labels - short pc kit format for carousel badges (all caps). Add label when adding new toolset. */
export const POWERSET_LABELS: Record<string, string> = {
  makita: "MAKITA 15PC KIT",
  dewalt: "DEWALT 14PC KIT",
  milwaukee: "MILWAUKEE 13PC KIT",
  ryobi: "RYOBI 19PC KIT",
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

/**
 * Both toolboxes share one frame size so columns align and labels sit on one row (see ToolboxSelector layout).
 * Milwaukee source art is visually smaller — scale it up inside the same frame as Sidchrome.
 */
export const TOOLBOX_UNIFIED_FRAME = {
  mobile: { h: 200, maxW: 320 },
  desktop: { h: 280, maxW: 400 },
} as const;

/** Per-toolbox image scale inside TOOLBOX_UNIFIED_FRAME (same box for both). */
export const TOOLBOX_SIZES = {
  milwaukee: {
    imageScale: 1.8,
  },
  sidchrome: {
    imageScale: 0.75,
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
