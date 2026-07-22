/**
 * Prize-selection data registries — the single source of truth for the two
 * independent "lanes" the prize builder ("Build your prize") turns:
 *
 *   lane 1  TOOLBOXES  — the workshop tool storage the winner picks
 *   lane 2  TOOLSETS   — the power toolset (kit + its own brand storage)
 *
 * Every combination resolves to a prize slug `{toolset}-{toolbox}` in
 * `@/config/prize-summaries`, so **adding a brand is one entry here** (plus its
 * catalog entries) and never a layout change — that is the whole point of the
 * reel-based picker. Anything a card, chip, hero caption or details modal needs
 * to render a brand lives on these two records.
 *
 * Ordering of each array IS the reel order.
 */

/** Toolbox brand keys that can actually be won this draw (`cash` is the opt-out, not a toolbox). */
export type ToolboxBrand = "milwaukee" | "kincrome" | "sidchrome";

/** Toolbox type keys — the brands plus the cash opt-out. Used by slug/query helpers. */
export type ToolboxType = ToolboxBrand | "cash";

/** Power toolset brand keys */
export type ToolsetType = "milwaukee" | "dewalt" | "makita" | "ryobi" | "hikoki";

/**
 * A toolbox the winner can pick (reel 1).
 *
 * `markImage` is an **SVG** wordmark rendered as a CSS mask and painted with
 * `markColor`, so one asset stays legible on the light card (`#f6f5f2`) and the
 * dark one — a plain `<img>` of a fixed-colour wordmark cannot do that. A mask
 * reads only the source's ALPHA, so the SVG's own `fill` is irrelevant here.
 *
 * All three live beside the toolset wordmarks in `brands/name/`. Milwaukee reuses
 * `milwaukeeText.svg` — the very file the Milwaukee TOOLSET card renders — so the
 * two lanes can never show different art, and it costs no extra download.
 * `kincromeText.svg` / `sidchromeText.svg` were traced from the white silhouettes
 * in `brands/{kincrome,sidchrome}.webp` (which stay put for the partner strips
 * that display them at full size). Vector means the plate stays crisp at any
 * card size, and each file is ~6 KB — no bigger than the bitmaps it replaced.
 */
export interface ToolboxOption {
  id: ToolboxBrand;
  /** Full display name, e.g. shown in the hero caption. */
  name: string;
  /** Bare brand, e.g. "Kincrome" — the `<toolset> × <toolbox>` gallery title and stat tiles. */
  brandName: string;
  /** Short form for chips, e.g. "Kincrome box". */
  shortName: string;
  /** Small caps line above the brand mark on the card, e.g. "470 PIECE". */
  eyebrow: string;
  /** Brand accent (focus ring + card glow). */
  accent: string;
  /** Product render shown on the reel card. */
  image: string;
  /** White silhouette wordmark used as a CSS mask (see interface note). */
  markImage: string;
  /** Mask paint colour per theme so the wordmark reads on both card surfaces. */
  markColor: { light: string; dark: string };
  /**
   * Per-brand size of the mask box inside the mark plate, tuned so the three marks read
   * at the same **letter** size — NOT the same box size.
   *
   * Milwaukee is a 2.23:1 stacked lockup (script over a lightning bolt); Kincrome is 5.76:1
   * and Sidchrome 4.38:1 single-line wordmarks. Sized to a common box height, Milwaukee's
   * letters render about half the size of the others — which is exactly what "Milwaukee looks
   * unfairly small" was. Milwaukee therefore takes the full plate (1.0) and the two wide
   * wordmarks are scaled back to match its letter height. Levelling DOWN keeps every mark
   * inside the plate: bringing Milwaukee up instead would need ~1.4x, overflowing into the
   * piece-count eyebrow above it.
   */
  markScale: number;
  /** Renders the red "New" badge — first draw this toolbox appears in. */
  isNew?: boolean;
}

/**
 * A power toolset the winner can pick (reel 2).
 *
 * The SELECTED TOOLSET's `accent` is the card's accent colour (not the
 * toolbox's) — it drives the CTA, focus ring, glows, chips and modal tabs.
 */
export interface ToolsetOption {
  id: ToolsetType;
  /** Brand display name, e.g. "Makita". */
  name: string;
  /** Kit descriptor, e.g. "15pc LXT kit". */
  kitLabel: string;
  /** Brand storage descriptor, e.g. "MAKTRAK™ 7pc". */
  storageLabel: string;
  /** Two-part label under the reel card, e.g. "15pc Kit + 7pc MAKTRAK™". */
  cardLabel: string;
  /** Number of power tools in the kit — drives the "N power tools" chip + tab badge. */
  toolCount: number;
  /** Brand accent — the card accent when this toolset is selected. */
  accent: string;
  /** Kit photo shown on the reel card. */
  image: string;
  /** Brand-coloured wordmark SVG. */
  wordmark: string;
  /** Per-brand vertical scale so wordmarks of different aspect read equally. */
  wordmarkScale: number;
  /** Renders the red "New" badge — first draw this toolset appears in. */
  isNew?: boolean;
}

/**
 * Reel 1 — toolboxes, in reel order.
 *
 * GearWrench is deliberately ABSENT: it is slated for draw 9 and has no product
 * render, composite art or catalog entry yet. Adding it later is one record here
 * plus its `{toolset}-gearwrench` catalog entries — `isNew: true` lights the
 * badge the design specifies.
 */
export const TOOLBOXES: readonly ToolboxOption[] = [
  {
    id: "milwaukee",
    name: "Monster Milwaukee Toolbox",
    brandName: "Milwaukee",
    shortName: "Milwaukee box",
    eyebrow: "MONSTER",
    accent: "#ee0000",
    image: "/images/majordraws/toolbox/milwaukeeTB.webp",
    markImage: "/images/brands/name/milwaukeeText.svg",
    // EXACTLY the fill of `brands/name/milwaukeeText.svg`, which the Milwaukee toolset
    // card renders directly below this one — same brand, same screen, so they must be
    // the same red. (The handoff's washed `#ff5a5a` dark variant read salmon next to it.)
    markColor: { light: "#c92a28", dark: "#c92a28" },
    markScale: 1,
  },
  {
    id: "kincrome",
    name: "470 Piece Kincrome Toolbox",
    brandName: "Kincrome",
    shortName: "Kincrome box",
    eyebrow: "470 PIECE",
    accent: "#0a63c2",
    image: "/images/majordraws/toolbox/kincromeTB.webp",
    markImage: "/images/brands/name/kincromeText.svg",
    // The site's canonical `kincrome-blue` ramp (`LANDING_PAGE_BRAND` in
    // packageColorScheme.ts): `primaryDark` on the near-white card, `primaryLight` on the
    // dark one. Kincrome is the one brand that genuinely needs a per-theme pair — blue is
    // perceptually much darker than the two reds, so the deep official blue disappears
    // against `#191b21`.
    markColor: { light: "#0047BB", dark: "#4A7ED4" },
    markScale: 0.62,
  },
  {
    id: "sidchrome",
    name: "356 Piece Sidchrome Toolbox",
    brandName: "Sidchrome",
    shortName: "Sidchrome box",
    eyebrow: "356 PIECE",
    accent: "#d21f2a",
    image: "/images/majordraws/toolbox/sidchromeTB.webp",
    markImage: "/images/brands/name/sidchromeText.svg",
    // Sidchrome's own brand accent (above) rather than the handoff's `#c41230`, which
    // carries a magenta cast, or its `#ff6058` dark variant, which read pink. This is a
    // true red at the same perceived weight as the Milwaukee mark, so the two red brands
    // sit consistently beside each other, and the card's ring/glow/wordmark all agree.
    markColor: { light: "#d21f2a", dark: "#d21f2a" },
    markScale: 0.72,
  },
] as const;

/** Reel 2 — power toolsets, in reel order. */
export const TOOLSETS: readonly ToolsetOption[] = [
  {
    id: "milwaukee",
    name: "Milwaukee",
    kitLabel: "13pc FUEL™ kit",
    storageLabel: "PACKOUT™ 8pc",
    cardLabel: "13pc Kit + 8pc PACKOUT™",
    toolCount: 13,
    accent: "#ee0000",
    image: "/images/majordraws/milwaukee-set/MILWAUKEE.webp",
    wordmark: "/images/brands/name/milwaukeeText.svg",
    wordmarkScale: 1.32,
  },
  {
    id: "dewalt",
    name: "DeWalt",
    kitLabel: "14pc XR kit",
    storageLabel: "ToughSystem",
    cardLabel: "14pc Kit + ToughSystem",
    toolCount: 14,
    accent: "#febd17",
    image: "/images/majordraws/dewalt-set/DEWALT.webp",
    wordmark: "/images/brands/name/dewaltText.svg",
    wordmarkScale: 0.92,
  },
  {
    id: "makita",
    name: "Makita",
    kitLabel: "15pc LXT kit",
    storageLabel: "MAKTRAK™ 7pc",
    cardLabel: "15pc Kit + 7pc MAKTRAK™",
    toolCount: 15,
    accent: "#00b8c2",
    image: "/images/majordraws/makita-set/MAKITA.webp",
    wordmark: "/images/brands/name/makitaText.svg",
    wordmarkScale: 1.05,
  },
  {
    id: "ryobi",
    name: "Ryobi",
    kitLabel: "19pc ONE+ kit",
    storageLabel: "LINK",
    cardLabel: "19pc Kit + LINK",
    toolCount: 19,
    accent: "#8aa300",
    image: "/images/majordraws/ryobi-set/RYOBI.webp",
    wordmark: "/images/brands/name/ryobiText.svg",
    wordmarkScale: 1.12,
  },
  {
    id: "hikoki",
    name: "HiKOKI",
    kitLabel: "15pc MultiVolt kit",
    storageLabel: "Multi Cruiser 3pc",
    cardLabel: "15pc Kit + Multi Cruiser",
    toolCount: 15,
    accent: "#0aa06e",
    image: "/images/majordraws/hikoki-set/HIKOKI.webp",
    wordmark: "/images/brands/name/hikokiText.svg",
    wordmarkScale: 0.9,
    isNew: true,
  },
] as const;

/** Cash opt-out — the "skip the gear" path. Not a toolbox or a toolset. */
export const CASH_OPTION = {
  /** Prize slug the cash path maps to. */
  slug: "cash-prize",
  /** Semantic green used everywhere cash is the active choice. */
  accent: "#18a94d",
  image: "/images/majordraws/cash-prize/cash-prize-10000.webp",
  title: "$10,000 tax-free cash",
  sub: "No tools, no hassle — straight to your bank account",
} as const;

/*
 * The two maps below exist only for the login page's decorative toolset rotator, which
 * predates the registries and still reads flat brand→value lookups. They are DERIVED so they can
 * never fork from `TOOLSETS`; don't hand-write entries. The toolbox equivalents were
 * deleted with the old `ToolboxSelector` — read `TOOLBOXES` directly instead.
 */

/** Toolset kit photos, keyed by brand (derived — do not fork). */
export const POWERSET_IMAGES: Record<string, string> = Object.fromEntries(
  TOOLSETS.map((s) => [s.id, s.image])
);

/** Toolset brand wordmark SVGs, keyed by brand (derived — do not fork). */
export const POWERSET_BRAND_TEXT: Record<string, string> = Object.fromEntries(
  TOOLSETS.map((s) => [s.id, s.wordmark])
);

/** Lookup helpers — return `undefined` for unknown ids so callers can fall back. */
export const getToolbox = (id: string | null | undefined): ToolboxOption | undefined =>
  TOOLBOXES.find((b) => b.id === id);

export const getToolset = (id: string | null | undefined): ToolsetOption | undefined =>
  TOOLSETS.find((s) => s.id === id);
