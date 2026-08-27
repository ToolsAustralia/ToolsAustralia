import assert from "node:assert";
import { getLandingHeroVideoPaths } from "../landing-video-resolver";
import { LANDING_VIDEO_MANIFEST } from "@/generated/landingVideoManifest";

/**
 * Landing hero CLIPS — currently withdrawn.
 *
 * Draw 10 (2026-08-26): every landing clip was removed. All 480 of them (240 mp4 + their webm
 * twins) baked `& $5K CASH` into the headline — including the BASE clips, which play outside any
 * countdown window, so the claim was live on every landing page. Draw 10 removed that bonus, so
 * the art was advertising a prize we no longer give.
 *
 * `getLandingHeroVideoPaths` returns null when nothing is on disk and `PromoHero` then keeps the
 * still hero ("The still also renders when there is no clip") — which is now the correct draw-10
 * art. So the withdrawal degrades cleanly rather than breaking the hero.
 *
 * THIS TEST RE-ARMS ITSELF. While the manifest is empty it asserts the withdrawal contract; the
 * moment replacement clips are ingested it runs the full structural suite again. That is
 * deliberate — a suite deleted "until the art comes back" is a suite nobody restores.
 */
const CLIPS_SHIPPED = LANDING_VIDEO_MANIFEST.size > 0;

if (!CLIPS_SHIPPED) {
  // ── Withdrawn state ────────────────────────────────────────────────────────
  // Every brand must return null so the caller keeps the still. A non-null here would mean the
  // resolver is emitting <source> URLs for files that do not exist — a 404 per source on a real
  // customer page, which is exactly what the manifest was introduced to prevent.
  for (const slug of [
    "milwaukee-milwaukee",
    "dewalt-gearwrench",
    "ryobi-gearwrench",
    "makita-kincrome",
    "hikoki-sidchrome",
    "stihl-gearwrench",
    "stihl-sidchrome",
  ]) {
    for (const mode of ["light", "dark"] as const) {
      for (const urgency of [null, "drawn-tonight", "drawn-tomorrow"] as const) {
        assert.strictEqual(
          getLandingHeroVideoPaths(slug, urgency, mode),
          null,
          `${slug} (${mode}, ${urgency ?? "base"}) must return null while clips are withdrawn, so the still hero renders`
        );
      }
    }
  }

  assert.strictEqual(getLandingHeroVideoPaths("cash-prize", null), null, "cash-prize never has clips");

  console.log("landing-video-resolver: clips withdrawn — null-everywhere contract holds");
} else {
  // ── Clips shipped ─────────────────────────────────────────────────────────
  // Draw 10 ships BASE clips only; the drawn tiers are still outstanding. Detect rather than
  // assume, so this same block covers both states and re-arms when the tier art lands.
  const TIERS_SHIPPED = [...LANDING_VIDEO_MANIFEST].some((s) => s.includes("-drawn-"));

  // webm precedes mp4 for every clip.
  const base = getLandingHeroVideoPaths("milwaukee-milwaukee", null);
  assert(base, "milwaukee base resolves");
  assert.deepStrictEqual(base!.desktop.sources.map((s) => s.type), ["video/webm", "video/mp4"]);

  const drawn = getLandingHeroVideoPaths("milwaukee-milwaukee", "drawn-tonight");
  assert(drawn, "milwaukee resolves");
  const types = drawn!.mobile.sources.map((s) => s.type);

  if (TIERS_SHIPPED) {
    // Drawn tier precedes base, so the caller gets tier art first and the base clip as fallback.
    assert.deepStrictEqual(types, ["video/webm", "video/mp4", "video/webm", "video/mp4"]);
    assert(drawn!.mobile.sources[0].src.endsWith("-mobile-drawn-tonight.webm"));
    assert(drawn!.mobile.sources[3].src.endsWith("-mobile.mp4"));
  } else {
    // No tier art: the request must collapse to the base pair rather than emitting URLs for
    // files that do not exist (which would be a 404 per <source> on a live page).
    assert.deepStrictEqual(types, ["video/webm", "video/mp4"]);
    assert(drawn!.mobile.sources.every((s) => !s.src.includes("-drawn-")), "must not emit unshipped tier URLs");
  }

  const none = getLandingHeroVideoPaths("cash-prize", null);
  assert.strictEqual(none, null);

  // Draw 9 gave the clips a light/dark dimension. A dark request must reach genuinely dark
  // art rather than silently serving the light clip as it did before 2026-07-27.
  const dark = getLandingHeroVideoPaths("milwaukee-milwaukee", null, "dark");
  assert(dark, "dark milwaukee resolves");
  assert(
    dark!.desktop.sources[0].src.includes("-dark"),
    `dark mode must prefer the dark clip, got ${dark!.desktop.sources[0].src}`
  );
  assert(
    !getLandingHeroVideoPaths("milwaukee-milwaukee", null, "light")!.desktop.sources[0].src.includes("-dark"),
    "light mode must not pick up the dark clip"
  );

  // Every source the resolver emits must exist on disk, or the page fires a 404 for each
  // <source> instead of playing.
  const gwDewalt = getLandingHeroVideoPaths("dewalt-gearwrench", null, "dark");
  assert(gwDewalt, "dewalt-gearwrench resolves");
  assert(gwDewalt!.desktop.sources.every((s) => s.src.includes("gwTB")), "must resolve gwTB clips");

  for (const mode of ["light", "dark"] as const) {
    const gwRyobi = getLandingHeroVideoPaths("ryobi-gearwrench", null, mode);
    assert(gwRyobi, `ryobi-gearwrench resolves in ${mode} mode`);
    assert(
      gwRyobi!.desktop.sources.every((s) => s.src.includes("gwTB")),
      `ryobi-gearwrench must resolve gwTB clips in ${mode} mode`
    );
    assert(
      gwRyobi!.mobile.sources.every((s) => s.src.includes("gwTB")),
      `ryobi-gearwrench mobile must resolve gwTB clips in ${mode} mode`
    );
  }

  // STIHL joined as the sixth toolset in draw 10. Once clips ship at all, they must ship for it
  // too — otherwise its landing page is the only one silently falling back to a still.
  for (const mode of ["light", "dark"] as const) {
    const stihl = getLandingHeroVideoPaths("stihl-gearwrench", null, mode);
    assert(stihl, `stihl-gearwrench resolves in ${mode} mode — STIHL clips must ship with the rest`);
  }

  // Every emitted source must be manifest-backed, for every brand and tier.
  for (const slug of ["milwaukee-milwaukee", "dewalt-gearwrench", "stihl-sidchrome", "makita-kincrome"]) {
    for (const urgency of [null, "drawn-tonight", "drawn-tomorrow"] as const) {
      const paths = getLandingHeroVideoPaths(slug, urgency, "light");
      if (!paths) continue;
      for (const v of [...paths.desktop.sources, ...paths.mobile.sources]) {
        assert(LANDING_VIDEO_MANIFEST.has(v.src), `${v.src} is emitted but not in the manifest`);
      }
    }
  }

  console.log("landing-video-resolver: all assertions passed");
}
