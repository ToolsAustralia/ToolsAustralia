/**
 * Landing Hero Video Resolver
 *
 * Deterministic slug → hero video path resolution for promo landing pages,
 * the video twin of {@link ./landing-image-resolver}. Each prize slug maps to a
 * single MP4 clip per viewport under `public/videos/landing/{brand}/`, named exactly
 * like its `.webp` hero (`{brand}-{milTB|sidTB|kinTB}{-mobile}{-drawn-tonight|-drawn-tomorrow}.mp4`).
 *
 * There is **no manifest and no light/dark fallback**: the hero ships one MP4 for both themes
 * (light === dark) and H.264 plays in every supported browser, so a single source per clip
 * suffices (no WebM tier). On the drawn-tonight / drawn-tomorrow tier the drawn clip is listed
 * first with the **base clip appended as a fallback**, so a brand that has no drawn art (e.g.
 * HiKOKI) still animates via its base clip — the browser advances to it natively when the drawn
 * `<source>` 404s — instead of dropping to the still. Slugs with no brand video (`cash-prize`,
 * the evergreen `all-prizes` collage) return `null` so the caller keeps the existing image hero.
 *
 * @module landing-video-resolver
 */

import { slugToBrandKey } from "@/config/brand-theme";
import { landingToolboxSuffixFromPrizeSlug } from "./landing-image-resolver";
import type { LandingHeroUrgency } from "./promo-hero-types";

const LANDING_VIDEO_BASE = "/videos/landing";

/**
 * Ordered MP4 source URLs for one viewport, highest priority first. On a drawn tier the drawn
 * clip is first and the base clip is appended as a fallback (so brands without drawn art still
 * animate via the base clip).
 */
export interface LandingVideoSources {
  srcs: string[];
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

  /** Base clip for the viewport, preceded by the drawn clip when a drawn tier is requested. */
  const buildSrcs = (viewport: "" | "-mobile"): string[] => {
    const baseClip = `${base}${viewport}.mp4`;
    return drawnSuffix ? [`${base}${viewport}${drawnSuffix}.mp4`, baseClip] : [baseClip];
  };

  return {
    desktop: { srcs: buildSrcs("") },
    mobile: { srcs: buildSrcs("-mobile") },
  };
}
