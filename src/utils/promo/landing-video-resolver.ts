/**
 * Landing Hero Video Resolver
 *
 * Deterministic slug → hero video path resolution for promo landing pages,
 * the video twin of {@link ./landing-image-resolver}. Each prize slug maps to a
 * clip per viewport under `public/videos/landing/{brand}/`, named exactly
 * like its `.webp` hero (`{brand}-{milTB|sidTB|kinTB|gwTB}{-dark}{-mobile}{-drawn-tonight|-drawn-tomorrow}.{webm,mp4}`).
 *
 * **Light/dark, and a manifest, both arrived with draw 9 (2026-07-27).** Before it this
 * module said "there is no manifest and no light/dark fallback: the hero ships one clip pair
 * for both themes" — true at the time, because only one set of clips had ever existed. Draw 9
 * shipped a dark clip for every combination, so `mode` now selects real art instead of both
 * themes sharing one file.
 *
 * Every clip ships a WebM twin (VP9, ~40-60% smaller) alongside its MP4 — the browser tries
 * `<source>`s in order and plays the first it supports, so WebM-capable browsers never fetch
 * the MP4 at all.
 *
 * WHY A MANIFEST NOW. The old design deliberately listed clips that might not exist and let
 * the browser advance past each 404 — cheap, and it made a missing drawn clip fall back to
 * the base clip for free. That stops being acceptable once a combination is missing
 * ENTIRELY: GearWrench × Ryobi art was never produced, so that page would fire a 404 for
 * every `<source>` on every load. Consulting the manifest keeps the same fallback ORDER
 * (drawn → base, dark → light) while emitting only URLs that are really on disk.
 *
 * Slugs with no brand video (`cash-prize`, the evergreen `all-prizes` collage) return `null`
 * so the caller keeps the existing image hero — as does a combination with no clip at all.
 *
 * @module landing-video-resolver
 */

import { slugToBrandKey } from "@/config/brand-theme";
import { landingToolboxSuffixFromPrizeSlug } from "./landing-image-resolver";
import { LANDING_VIDEO_MANIFEST } from "@/generated/landingVideoManifest";
import type { LandingHeroUrgency } from "./promo-hero-types";

const LANDING_VIDEO_BASE = "/videos/landing";

/** One `<source>` candidate — WebM (preferred) or MP4 (universal fallback). */
export interface LandingVideoSource {
  src: string;
  type: "video/webm" | "video/mp4";
}

/** Ordered sources, highest priority first: for each clip tier, WebM (~40-60% smaller)
 *  then its MP4 twin; drawn-tier clips precede the base-clip fallback. */
export interface LandingVideoSources {
  sources: LandingVideoSource[];
}

/** Desktop + mobile hero clips for a prize slug. */
export interface LandingHeroVideoPaths {
  desktop: LandingVideoSources;
  mobile: LandingVideoSources;
}

/**
 * Resolve the hero video clips for a prize slug, or `null` when no clip exists (cash /
 * evergreen / unknown slug / a combination whose art was never produced) so the caller
 * falls back to the image hero.
 *
 * Preference order per viewport: requested mode + drawn tier, then the same mode's base clip,
 * then the opposite mode at each of those tiers. `final-hours` has no clip and reuses the base.
 */
export function getLandingHeroVideoPaths(
  prizeSlug: string,
  urgency: LandingHeroUrgency | null = null,
  mode: "light" | "dark" = "light"
): LandingHeroVideoPaths | null {
  const brand = slugToBrandKey(prizeSlug);
  if (!brand) return null;

  const toolbox = landingToolboxSuffixFromPrizeSlug(prizeSlug);
  const drawnSuffix = urgency === "drawn-tomorrow" || urgency === "drawn-tonight" ? `-${urgency}` : "";

  /**
   * Sources for one mode: the drawn clip (when asked for) then the base clip, each as
   * WebM before MP4, keeping only what is actually on disk.
   */
  const sourcesForMode = (viewport: "" | "-mobile", darkSuffix: "" | "-dark"): LandingVideoSource[] => {
    const tiers = drawnSuffix ? [drawnSuffix, ""] : [""];
    return tiers.flatMap((tier) => {
      const stem = `${LANDING_VIDEO_BASE}/${brand}/${brand}-${toolbox}${darkSuffix}${viewport}${tier}`;
      return (
        [
          { src: `${stem}.webm`, type: "video/webm" as const },
          { src: `${stem}.mp4`, type: "video/mp4" as const },
        ] satisfies LandingVideoSource[]
      ).filter((s) => LANDING_VIDEO_MANIFEST.has(s.src));
    });
  };

  /**
   * Cross-mode fallback only kicks in when the requested mode has NOTHING for this viewport.
   *
   * Listing the opposite mode unconditionally would emit four extra `<source>` elements the
   * browser can never reach (it stops at the first playable one) on every hero — pure markup
   * weight. Since draw 9 ships both modes for every combination that has art at all, the
   * fallback is a genuine safety net for a future partial drop rather than the normal path.
   */
  const buildSources = (viewport: "" | "-mobile"): LandingVideoSource[] => {
    const requested = mode === "dark" ? "-dark" : "";
    const primary = sourcesForMode(viewport, requested);
    if (primary.length > 0) return primary;
    return sourcesForMode(viewport, requested === "-dark" ? "" : "-dark");
  };

  const desktop = buildSources("");
  const mobile = buildSources("-mobile");

  // Nothing on disk for either viewport — let the caller keep the still hero.
  if (desktop.length === 0 && mobile.length === 0) return null;

  return {
    desktop: { sources: desktop },
    mobile: { sources: mobile },
  };
}
