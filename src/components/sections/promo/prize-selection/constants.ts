/**
 * Prize selection constants - toolbox and power toolset image paths and sizing.
 * Modify these to change images or dimensions without touching component logic.
 */
export const TOOLBOX_IMAGES = {
  milwaukee: "/images/majordraws/toolbox/milwaukeeTB.webp",
  kincrome: "/images/majordraws/toolbox/kincromeTB.webp",
  sidchrome: "/images/majordraws/toolbox/sidchromeTB.webp",
} as const;

/** Add new toolsets here - slug format: "{toolset}-{toolbox}" (e.g. ryobi-milwaukee) */
export const POWERSET_IMAGES: Record<string, string> = {
  milwaukee: "/images/majordraws/milwaukee-set/MILWAUKEE.webp",
  dewalt: "/images/majordraws/dewalt-set/DEWALT.webp",
  makita: "/images/majordraws/makita-set/MAKITA.webp",
  ryobi: "/images/majordraws/ryobi-set/RYOBI.webp",
  hikoki: "/images/majordraws/hikoki-set/HIKOKI.webp",
};

/** Brand name logo images - overlay on power toolset images.
 *  Brand-colour SVG wordmarks (crisp at any size), each viewBox tightened to the artwork
 *  so they centre and scale like the webps they replaced. Rendered via `<Image unoptimized>`
 *  so Next serves the SVG as-is. The HiKOKI entry is ready for when its toolset prize is
 *  wired (kit art + spec content pending). */
export const POWERSET_BRAND_TEXT: Record<string, string> = {
  milwaukee: "/images/brands/name/milwaukeeText.svg",
  dewalt: "/images/brands/name/dewaltText.svg",
  makita: "/images/brands/name/makitaText.svg",
  ryobi: "/images/brands/name/ryobiText.svg",
  hikoki: "/images/brands/name/hikokiText.svg",
};

/** Toolset display labels - descriptive kit + storage-system format for carousel badges (all caps).
 *  Add label when adding new toolset. Each kit ships with its brand storage system, spelled out here
 *  so the badge reads "{kit} AND {storage} + $5000 CASH" (the "+ $5000 CASH" suffix is added by the
 *  rendering components). Milwaukee PACKOUT is 8pc, Makita MAKTRAK is 7pc; DeWalt ToughSystem and
 *  Ryobi LINK have no fixed piece count surfaced. */
export const POWERSET_LABELS: Record<string, string> = {
  makita: "MAKITA 15PC KIT AND 7PC MAKTRAK SYSTEM",
  dewalt: "DEWALT 14PC KIT AND TOUGHSYSTEM STORAGE",
  milwaukee: "MILWAUKEE 13PC KIT AND 8PC PACKOUT SYSTEM",
  ryobi: "RYOBI 19PC KIT AND LINK STORAGE",
  hikoki: "HIKOKI 15PC KIT AND MULTI CRUISER STORAGE",
};

/** Toolbox display labels - shown as bottom overlay (all caps to match the toolset badges) */
export const TOOLBOX_LABELS: Record<string, string> = {
  milwaukee: "MONSTER MILWAUKEE TOOLBOX",
  kincrome: "470 PIECE KINCROME TOOLBOX",
  sidchrome: "356 PIECE SIDCHROME TOOLBOX",
};

/** Toolbox type keys */
export type ToolboxType = "sidchrome" | "milwaukee" | "kincrome" | "cash";

/** Power toolset brand keys */
export type ToolsetType = "milwaukee" | "dewalt" | "makita" | "ryobi" | "hikoki";

/**
 * Both toolboxes share one frame size so columns align and labels sit on one row (see ToolboxSelector layout).
 * Per-artwork scale inside the unified frame (Milwaukee asset reads large at equal numeric scale — keep lower).
 */
export const TOOLBOX_UNIFIED_FRAME = {
  mobile: { h: 200, maxW: 320 },
  desktop: { h: 280, maxW: 400 },
} as const;

/**
 * Per-asset scale applied the same way in ToolboxSelector (CSS transform on `<Image />`).
 * Values are tuned per artwork so each reads well inside TOOLBOX_UNIFIED_FRAME.
 */
export const TOOLBOX_SIZES = {
  milwaukee: {
    imageScale: 1.0,
  },
  kincrome: {
    imageScale: 1.15,
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
