import assert from "node:assert";
import { toSrt, holdFor } from "../srt";

let failed = 0;
function t(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

t("toSrt formats a cue block", () => {
  const srt = toSrt([{ title: "Logging in as a member", startMs: 1500, endMs: 4200 }]);
  assert.equal(srt, "1\n00:00:01,500 --> 00:00:04,200\nLogging in as a member\n");
});
t("toSrt joins multiple cues with blank lines", () => {
  const srt = toSrt([
    { title: "A", startMs: 0, endMs: 1000 },
    { title: "B", startMs: 61_000, endMs: 62_500 },
  ]);
  assert.ok(srt.includes("2\n00:01:01,000 --> 00:01:02,500\nB\n"));
});
t("holdFor floors at 1800ms", () => assert.equal(holdFor("Hi"), 1800));
t("holdFor scales with word count", () => assert.ok(holdFor("one two three four five six seven eight") >= 2400));

if (failed) process.exit(1);
console.log("srt tests passed");
