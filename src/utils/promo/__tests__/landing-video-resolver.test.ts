import assert from "node:assert";
import { getLandingHeroVideoPaths } from "../landing-video-resolver";

// webm precedes mp4 for every clip, drawn tier precedes base
const drawn = getLandingHeroVideoPaths("milwaukee-milwaukee", "drawn-tonight");
assert(drawn, "milwaukee resolves");
const types = drawn!.mobile.sources.map((s) => s.type);
assert.deepStrictEqual(types, ["video/webm", "video/mp4", "video/webm", "video/mp4"]);
assert(drawn!.mobile.sources[0].src.endsWith("-mobile-drawn-tonight.webm"));
assert(drawn!.mobile.sources[3].src.endsWith("-mobile.mp4"));

const base = getLandingHeroVideoPaths("milwaukee-milwaukee", null);
assert.deepStrictEqual(base!.desktop.sources.map((s) => s.type), ["video/webm", "video/mp4"]);

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

// GearWrench joined in draw 9 with clips for four toolsets — but never for Ryobi. Every
// source the resolver emits must exist on disk, so that page keeps the still hero instead
// of firing a 404 for each <source>.
const gwDewalt = getLandingHeroVideoPaths("dewalt-gearwrench", null, "dark");
assert(gwDewalt, "dewalt-gearwrench resolves");
assert(gwDewalt!.desktop.sources.every((s) => s.src.includes("gwTB")), "must resolve gwTB clips");
assert.strictEqual(
  getLandingHeroVideoPaths("ryobi-gearwrench", null),
  null,
  "ryobi x gearwrench has no clip in any mode — must return null so the caller keeps the image hero"
);

console.log("landing-video-resolver: all assertions passed");
