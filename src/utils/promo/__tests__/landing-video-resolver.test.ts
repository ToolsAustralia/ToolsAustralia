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
console.log("landing-video-resolver: all assertions passed");
