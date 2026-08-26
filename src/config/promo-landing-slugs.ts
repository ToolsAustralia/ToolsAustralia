/**
 * Toolset landing page configuration.
 * Maps toolset slugs (ryobi, milwaukee, dewalt, makita, hikoki) to prize slugs
 * and provides helpers for landing hero images.
 */

import type { PrizeSlug } from "./prizes";
import type { LandingHeroUrgency, ExtendedPromoImagePaths } from "@/utils/promo/promo-hero-types";
import {
  resolveLandingHeroImages,
  resolveLandingHeroImagesWithUrgency,
  resolveEvergreenHeroImages,
  resolveEvergreenHeroImagesWithUrgency,
  landingToolboxSuffixFromPrizeSlug,
} from "@/utils/promo/landing-image-resolver";
import { slugToBrandKey } from "@/config/brand-theme";

/**
 * Source of truth for the single-brand "toolset" promotion URLs (`/promotions/<slug>`).
 *
 * Adding a brand here flows through to everything that DERIVES from this list — including
 * the admin Overview "Prize performance" ROAS-by-brand card, the per-promotion analytics
 * funnel (PromoAnalyticsRepository), promo-slug validation, and Klaviyo brand attribution
 * (via `getAllBrandKeys`). When you add a brand, you also need: (1) its prize slugs in
 * `PrizeSlug`/`PRIZE_CATALOG` (./prizes.ts), (2) its `BrandKey` + theme (./brand-theme.ts),
 * (3) the `/images/brands/name/<slug>Text.svg` wordmark, and (4) its `/promotions/<slug>`
 * route. Full checklist in docs/config-and-data: "Adding a promotion brand".
 */
export const TOOLSET_LANDING_SLUGS = [
  "ryobi",
  "milwaukee",
  "dewalt",
  "makita",
  "hikoki",
  "stihl",
] as const;

export type ToolsetLandingSlug = (typeof TOOLSET_LANDING_SLUGS)[number];

/** Map toolset slug to its prize slugs: Sidchrome, Kincrome, Milwaukee, GearWrench (draw 9). */
const TOOLSET_TO_PRIZE_SLUGS: Record<ToolsetLandingSlug, [PrizeSlug, PrizeSlug, PrizeSlug, PrizeSlug]> = {
  ryobi: ["ryobi-sidchrome", "ryobi-kincrome", "ryobi-milwaukee", "ryobi-gearwrench"],
  milwaukee: ["milwaukee-sidchrome", "milwaukee-kincrome", "milwaukee-milwaukee", "milwaukee-gearwrench"],
  dewalt: ["dewalt-sidchrome", "dewalt-kincrome", "dewalt-milwaukee", "dewalt-gearwrench"],
  makita: ["makita-sidchrome", "makita-kincrome", "makita-milwaukee", "makita-gearwrench"],
  hikoki: ["hikoki-sidchrome", "hikoki-kincrome", "hikoki-milwaukee", "hikoki-gearwrench"],
  stihl: ["stihl-sidchrome", "stihl-kincrome", "stihl-milwaukee", "stihl-gearwrench"],
};

/**
 * Prize slug -> landing hero image paths with light/dark support.
 * Uses the new .webp assets with brand-specific folders.
 * null = use standard promo hero.
 */
const LANDING_HERO_MAP: Partial<Record<PrizeSlug, ExtendedPromoImagePaths>> = {
  /** Collage hero under `all-prizes/` (shared light/dark paths per viewport). */
  "cash-prize": resolveEvergreenHeroImages(),

  // Ryobi prizes — `sidTB` / `milTB` / `kinTB` resolved via `landingToolboxSuffixFromPrizeSlug`
  "ryobi-sidchrome": resolveLandingHeroImages("ryobi", "sidTB"),
  "ryobi-milwaukee": resolveLandingHeroImages("ryobi", "milTB"),

  // Milwaukee prizes
  "milwaukee-sidchrome": resolveLandingHeroImages("milwaukee", "sidTB"),
  "milwaukee-milwaukee": resolveLandingHeroImages("milwaukee", "milTB"),

  // DeWalt prizes
  "dewalt-sidchrome": resolveLandingHeroImages("dewalt", "sidTB"),
  "dewalt-milwaukee": resolveLandingHeroImages("dewalt", "milTB"),

  // Makita prizes
  "makita-sidchrome": resolveLandingHeroImages("makita", "sidTB"),
  "makita-milwaukee": resolveLandingHeroImages("makita", "milTB"),

  // HiKOKI prizes (landing art shipped 2026-06-23)
  "hikoki-sidchrome": resolveLandingHeroImages("hikoki", "sidTB"),
  "hikoki-milwaukee": resolveLandingHeroImages("hikoki", "milTB"),

  // GearWrench prizes — the fourth toolbox, landing art shipped with draw 9 (2026-07-27).
  // `ryobi-gearwrench` followed on 2026-07-28, completing the set; every toolset × toolbox
  // pairing now has a hero of its own rather than leaning on the resolver's fallback chain.
  "milwaukee-gearwrench": resolveLandingHeroImages("milwaukee", "gwTB"),
  "dewalt-gearwrench": resolveLandingHeroImages("dewalt", "gwTB"),
  "makita-gearwrench": resolveLandingHeroImages("makita", "gwTB"),
  "hikoki-gearwrench": resolveLandingHeroImages("hikoki", "gwTB"),
  "ryobi-gearwrench": resolveLandingHeroImages("ryobi", "gwTB"),

  // Kincrome — the toolbox that never had a hero of its own. Every brand fell through to the
  // resolver's evergreen fallback, so a visitor who configured a Kincrome combination saw the
  // generic collage instead of the prize they had just built. Its art shipped with the draw-10
  // drop (2026-08-26).
  "milwaukee-kincrome": resolveLandingHeroImages("milwaukee", "kinTB"),
  "dewalt-kincrome": resolveLandingHeroImages("dewalt", "kinTB"),
  "makita-kincrome": resolveLandingHeroImages("makita", "kinTB"),
  "hikoki-kincrome": resolveLandingHeroImages("hikoki", "kinTB"),
  "ryobi-kincrome": resolveLandingHeroImages("ryobi", "kinTB"),

  // STIHL — the sixth toolset (draw 10). Complete on arrival: all four toolboxes.
  "stihl-sidchrome": resolveLandingHeroImages("stihl", "sidTB"),
  "stihl-milwaukee": resolveLandingHeroImages("stihl", "milTB"),
  "stihl-kincrome": resolveLandingHeroImages("stihl", "kinTB"),
  "stihl-gearwrench": resolveLandingHeroImages("stihl", "gwTB"),
};

export function isToolsetLandingSlug(slug: string): slug is ToolsetLandingSlug {
  return TOOLSET_LANDING_SLUGS.includes(slug as ToolsetLandingSlug);
}

/**
 * Default prize slug for a toolset page.
 * Prefers Milwaukee toolbox first (Milwaukee stack + power toolset).
 */
export function getDefaultPrizeForToolsetSlug(slug: ToolsetLandingSlug): PrizeSlug {
  const [sidchrome, , milwaukee] = TOOLSET_TO_PRIZE_SLUGS[slug];
  const hasMilwaukeeHero = LANDING_HERO_MAP[milwaukee] != null;
  const hasSidchromeHero = LANDING_HERO_MAP[sidchrome] != null;
  if (hasMilwaukeeHero) return milwaukee;
  if (hasSidchromeHero) return sidchrome;
  return milwaukee;
}

/**
 * The toolbox lane of each prize slug, in the fixed order `TOOLSET_TO_PRIZE_SLUGS` declares.
 *
 * Derived from that registry rather than re-listed, so adding a brand stays a one-line change
 * and the two can never fork. Server-safe by design: the equivalent client helper
 * (`fromPrizeSlug` in components/sections/promo/prize-selection) lives under `src/components`,
 * which the repository layer must not import.
 *
 * `cash-prize` is deliberately absent — it has no toolbox lane, so it is excluded from
 * toolbox rollups rather than bucketed somewhere misleading.
 */
export const TOOLBOX_LANE_ORDER = ["sidchrome", "kincrome", "milwaukee", "gearwrench"] as const;
export type ToolboxLaneId = (typeof TOOLBOX_LANE_ORDER)[number];

/**
 * Display label + wordmark for every brand lane, both axes.
 *
 * Lives here beside the registries it describes rather than inside a single admin component,
 * which is where the toolset half used to live — a fork that covered only 5 of the 9 lanes and
 * had already gone stale once (HiKOKI was missing from the ROAS table for its whole first run).
 *
 * The `Record<…>` types are load-bearing: adding a brand to `TOOLSET_LANDING_SLUGS` or
 * `TOOLBOX_LANE_ORDER` fails compilation here until its label and wordmark are supplied, so a
 * new brand cannot silently appear as an unlabelled row.
 *
 * ⚠️ Milwaukee appears in BOTH maps with the same label and wordmark — it is genuinely both a
 * power-toolset brand and a toolbox brand. Any UI showing these must make the active lane
 * obvious, because the artwork alone cannot distinguish the two rows.
 */
export interface BrandLaneDisplay {
  label: string;
  /** Wordmark under /public/images/brands/name/. */
  logoPath: string;
  /**
   * Light-mode variant, when the wordmark is multi-colour and therefore cannot be recoloured
   * by a CSS mask. Only GearWrench needs one — see `TOOLBOX_LANE_DISPLAY`.
   */
  logoPathLight?: string;
  /**
   * The brand ink to paint a single-colour wordmark, per theme.
   *
   * The raw SVGs are flat black, so rendered as plain `<img>` every brand looks identical and
   * Kincrome loses the blue it has everywhere else on the site. Consumers paint it with a CSS
   * mask, which is the same technique the /promotions prize selector uses — these values are
   * deliberately the SAME ones as `TOOLBOXES` in
   * `src/components/sections/promo/prize-selection/constants.ts`, so the admin table and the
   * customer-facing selector cannot drift apart.
   *
   * Omitted where the mark carries its own colour (GearWrench) or is genuinely black.
   */
  markColor?: { light: string; dark: string };
}

const wordmark = (slug: string) => `/images/brands/name/${slug}Text.svg`;

export const TOOLSET_LANE_DISPLAY: Record<ToolsetLandingSlug, BrandLaneDisplay> = {
  ryobi: { label: "Ryobi", logoPath: wordmark("ryobi") },
  milwaukee: { label: "Milwaukee", logoPath: wordmark("milwaukee") },
  dewalt: { label: "Dewalt", logoPath: wordmark("dewalt") },
  makita: { label: "Makita", logoPath: wordmark("makita") },
  hikoki: { label: "HiKOKI", logoPath: wordmark("hikoki") },
  stihl: { label: "STIHL", logoPath: wordmark("stihl") },
};

/**
 * Colours mirror `TOOLBOXES` in the /promotions prize selector so a brand reads the same on both
 * screens. Each value is copied WITH its reason; do not "tidy" one without the other.
 */
export const TOOLBOX_LANE_DISPLAY: Record<ToolboxLaneId, BrandLaneDisplay> = {
  sidchrome: {
    label: "Sidchrome",
    logoPath: wordmark("sidchrome"),
    // Sidchrome's own accent, not the handoff's magenta-cast #c41230 — a true red at the same
    // perceived weight as Milwaukee, so the two red brands sit consistently side by side.
    markColor: { light: "#d21f2a", dark: "#d21f2a" },
  },
  kincrome: {
    label: "Kincrome",
    logoPath: wordmark("kincrome"),
    // The site's canonical `kincrome-blue` ramp (`LANDING_PAGE_BRAND`, packageColorScheme.ts):
    // `primaryDark` on light, `primaryLight` on dark. Kincrome is the one brand that genuinely
    // needs a per-theme pair — blue is perceptually much darker than the two reds, so the deep
    // official blue disappears on a dark surface.
    markColor: { light: "#0047BB", dark: "#4A7ED4" },
  },
  milwaukee: {
    label: "Milwaukee",
    logoPath: wordmark("milwaukee"),
    // EXACTLY the fill of milwaukeeText.svg, so the toolbox row and the toolset row of the same
    // brand are the same red on the same screen.
    markColor: { light: "#c92a28", dark: "#c92a28" },
  },
  gearwrench: {
    label: "GearWrench",
    logoPath: wordmark("gearwrench"),
    // The ONLY two-tone mark: "GEAR" in theme ink, "WRENCH" in Molten Orange, plus an orange
    // gear badge. A CSS mask paints one flat colour and physically cannot render that, so this
    // pair ships two files and NO markColor — consumers must use the image path directly.
    logoPathLight: "/images/brands/name/gearwrenchText-light.svg",
  },
};

/** Label + wordmark for a lane id, or a titlecased fallback for an id the registries don't know. */
export function getBrandLaneDisplay(laneId: string, lane: "toolset" | "toolbox"): BrandLaneDisplay {
  const map = lane === "toolset" ? TOOLSET_LANE_DISPLAY : TOOLBOX_LANE_DISPLAY;
  return (
    (map as Record<string, BrandLaneDisplay | undefined>)[laneId] ?? {
      label: laneId.charAt(0).toUpperCase() + laneId.slice(1),
      logoPath: "",
    }
  );
}

export const PRIZE_LANE_SLUGS: ReadonlyArray<{
  slug: PrizeSlug;
  toolset: ToolsetLandingSlug;
  toolbox: ToolboxLaneId;
}> = Object.entries(TOOLSET_TO_PRIZE_SLUGS).flatMap(([toolset, slugs]) =>
  slugs.map((slug, i) => ({
    slug,
    toolset: toolset as ToolsetLandingSlug,
    toolbox: TOOLBOX_LANE_ORDER[i],
  }))
);

/**
 * The combination a landing page shows on FIRST PAINT, before the visitor touches anything.
 *
 * Toolset landing pages resolve through `getDefaultPrizeForToolsetSlug`; an evergreen page's own
 * slug already IS the prize slug. `PrizeShowcase` seeds its state from exactly this value, so
 * this is the real on-screen default, not an approximation of it.
 *
 * Lives here rather than in the admin component because the server needs it too — the per-page
 * build breakdown marks the default row and must agree with what visitors actually saw.
 */
export function getPageDefaultPrizeSlug(slug: string): string {
  return isToolsetLandingSlug(slug) ? getDefaultPrizeForToolsetSlug(slug) : slug;
}

const CASH_PRIZE_SLUG = "cash-prize";

/**
 * Returns landing hero image paths for a prize slug, or null to use standard promo hero.
 * When `urgency` is set, paths include `-final-hours` / `-drawn-tomorrow` / `-drawn-tonight` suffixes.
 */
export function getLandingHeroImagePaths(
  prizeSlug: string,
  urgency: LandingHeroUrgency | null = null
): ExtendedPromoImagePaths | null {
  if (prizeSlug === CASH_PRIZE_SLUG) {
    return resolveEvergreenHeroImagesWithUrgency(urgency);
  }

  const brand = slugToBrandKey(prizeSlug);
  if (!brand) return null;

  return resolveLandingHeroImagesWithUrgency(brand, landingToolboxSuffixFromPrizeSlug(prizeSlug), urgency);
}

export type { LandingHeroUrgency } from "@/utils/promo/promo-hero-types";
