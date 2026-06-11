/**
 * Landing Hero Video Resolver
 *
 * Deterministic slug → hero video path resolution for promo landing pages,
 * the video twin of {@link ./landing-image-resolver}. Each prize slug maps to a
 * single clip per viewport under `public/videos/landing/{brand}/`, named exactly
 * like its `.webp` hero (`{brand}-{milTB|sidTB|kinTB}{-mobile}.{webm,mp4}`).
 *
 * Unlike the image resolver there is **no manifest and no light/dark fallback**:
 * the A/B-won hero ships one clip for both themes (light === dark), every
 * brand × toolbox combo has a clip on disk, and the `<source>` ordering (WebM
 * then MP4) handles per-browser codec fallback. Slugs with no brand video
 * (`cash-prize`, the evergreen `all-prizes` collage) return `null` so the caller
 * keeps the existing image hero.
 *
 * @module landing-video-resolver
 */

import { slugToBrandKey } from "@/config/brand-theme";
import { landingToolboxSuffixFromPrizeSlug } from "./landing-image-resolver";

const LANDING_VIDEO_BASE = "/videos/landing";

/** WebM (preferred) + MP4 (universal fallback) source URLs for one viewport. */
export interface LandingVideoSources {
  webm: string;
  mp4: string;
}

/** Desktop + mobile hero clips for a prize slug. */
export interface LandingHeroVideoPaths {
  desktop: LandingVideoSources;
  mobile: LandingVideoSources;
}

/**
 * Resolve the hero video clips for a prize slug, or `null` when no brand video
 * exists (cash / evergreen / unknown slug) so the caller falls back to the image.
 */
export function getLandingHeroVideoPaths(prizeSlug: string): LandingHeroVideoPaths | null {
  const brand = slugToBrandKey(prizeSlug);
  if (!brand) return null;

  const toolbox = landingToolboxSuffixFromPrizeSlug(prizeSlug);
  const base = `${LANDING_VIDEO_BASE}/${brand}/${brand}-${toolbox}`;

  return {
    desktop: { webm: `${base}.webm`, mp4: `${base}.mp4` },
    mobile: { webm: `${base}-mobile.webm`, mp4: `${base}-mobile.mp4` },
  };
}
