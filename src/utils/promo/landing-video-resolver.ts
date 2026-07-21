/**
 * Landing Hero Video Resolver
 *
 * Deterministic slug → hero video path resolution for promo landing pages,
 * the video twin of {@link ./landing-image-resolver}. Each prize slug maps to a
 * single clip per viewport under `public/videos/landing/{brand}/`, named exactly
 * like its `.webp` hero (`{brand}-{milTB|sidTB|kinTB}{-mobile}{-drawn-tonight|-drawn-tomorrow}.{webm,mp4}`).
 *
 * There is **no manifest and no light/dark fallback**: the hero ships one clip pair for both
 * themes (light === dark). Every clip ships a WebM twin (VP9, ~40-60% smaller) alongside its
 * MP4 — the browser tries `<source>`s in order and plays the first it supports, so WebM-capable
 * browsers (Chrome/Firefox/Edge) never fetch the MP4 at all. On the drawn-tonight / drawn-tomorrow
 * tier the drawn clip is listed first with the **base clip appended as a fallback**, so a brand
 * that has no drawn art (e.g. HiKOKI) still animates via its base clip — the browser advances to
 * it natively when the drawn `<source>`s 404 — instead of dropping to the still. Slugs with no
 * brand video (`cash-prize`, the evergreen `all-prizes` collage) return `null` so the caller keeps
 * the existing image hero.
 *
 * @module landing-video-resolver
 */

import { slugToBrandKey } from "@/config/brand-theme";
import { landingToolboxSuffixFromPrizeSlug } from "./landing-image-resolver";
import type { LandingHeroUrgency } from "./promo-hero-types";

const LANDING_VIDEO_BASE = "/videos/landing";

/** One `<source>` candidate — WebM (preferred) or MP4 (universal fallback). */
export interface LandingVideoSource {
  src: string;
  type: "video/webm" | "video/mp4";
}

/** Ordered sources, highest priority first: for each clip tier, WebM (~40-60% smaller)
 *  then its MP4 twin; drawn-tier clips precede the base-clip fallback. Browsers advance
 *  past a 404 `<source>` natively — the same mechanism the drawn→base fallback already uses. */
export interface LandingVideoSources {
  sources: LandingVideoSource[];
}

/** Desktop + mobile hero clips for a prize slug. */
export interface LandingHeroVideoPaths {
  desktop: LandingVideoSources;
  mobile: LandingVideoSources;
}

/**
 * Resolve the hero video clips for a prize slug, or `null` when no brand video
 * exists (cash / evergreen / unknown slug) so the caller falls back to the image.
 *
 * On the `drawn-tomorrow` / `drawn-tonight` tier the drawn clip is the primary source with the
 * base clip appended as a fallback — so a brand missing drawn art animates the base clip rather
 * than dropping to the still. `final-hours` has no clip and reuses the base hero.
 */
export function getLandingHeroVideoPaths(
  prizeSlug: string,
  urgency: LandingHeroUrgency | null = null
): LandingHeroVideoPaths | null {
  const brand = slugToBrandKey(prizeSlug);
  if (!brand) return null;

  const toolbox = landingToolboxSuffixFromPrizeSlug(prizeSlug);
  const drawnSuffix = urgency === "drawn-tomorrow" || urgency === "drawn-tonight" ? `-${urgency}` : "";
  const base = `${LANDING_VIDEO_BASE}/${brand}/${brand}-${toolbox}`;

  /** Ordered sources for the viewport, highest priority first: for each clip tier (drawn clip
   *  before the base-clip fallback), WebM then its MP4 twin. */
  const buildSources = (viewport: "" | "-mobile"): LandingVideoSource[] => {
    const clips = drawnSuffix ? [`${base}${viewport}${drawnSuffix}`, `${base}${viewport}`] : [`${base}${viewport}`];
    return clips.flatMap((clip) => [
      { src: `${clip}.webm`, type: "video/webm" as const },
      { src: `${clip}.mp4`, type: "video/mp4" as const },
    ]);
  };

  return {
    desktop: { sources: buildSources("") },
    mobile: { sources: buildSources("-mobile") },
  };
}
