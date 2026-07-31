import assert from "node:assert/strict";
import {
  ALL_KNOWN_SOURCES,
  MEDIUM_SPLIT_SOURCES,
  SOURCE_ALIASES,
  channelKeyExpr,
  channelSourceValues,
  normalizeUtmToPlatform,
} from "../normalizePlatform";
import { CHANNEL_DISPLAY, CHANNEL_KEYS } from "@/config/attribution-channels";
import type { ConvertingPlatform } from "@/types/attribution";

assert.equal(normalizeUtmToPlatform("Facebook"), "meta");
assert.equal(normalizeUtmToPlatform("fb"), "meta");
assert.equal(normalizeUtmToPlatform("instagram"), "meta");
assert.equal(normalizeUtmToPlatform("ig"), "meta");
assert.equal(normalizeUtmToPlatform("meta"), "meta");
assert.equal(normalizeUtmToPlatform("TikTok"), "tiktok");
assert.equal(normalizeUtmToPlatform("snap"), "snapchat");
assert.equal(normalizeUtmToPlatform("google"), "google");
assert.equal(normalizeUtmToPlatform("adwords"), "google");
assert.equal(normalizeUtmToPlatform("Klaviyo", "email"), "klaviyo_email");
assert.equal(normalizeUtmToPlatform("klaviyo", "sms"), "klaviyo_sms");
assert.equal(normalizeUtmToPlatform("klaviyo", "whatsapp"), "other");
assert.equal(normalizeUtmToPlatform("klaviyo"), "other");
assert.equal(normalizeUtmToPlatform("newsletter"), "other");
assert.equal(normalizeUtmToPlatform(undefined), null);
assert.equal(normalizeUtmToPlatform(""), null);

// Domain/referrer forms real ad traffic carries (the facebook.com=7,300-row miss + variants)
assert.equal(normalizeUtmToPlatform("facebook.com"), "meta");
assert.equal(normalizeUtmToPlatform("FACEBOOK.COM"), "meta"); // case-insensitive
assert.equal(normalizeUtmToPlatform("m.facebook.com"), "meta");
assert.equal(normalizeUtmToPlatform("l.facebook.com"), "meta");
assert.equal(normalizeUtmToPlatform("fb.com"), "meta");
assert.equal(normalizeUtmToPlatform("instagram.com"), "meta");
assert.equal(normalizeUtmToPlatform("tiktok.com"), "tiktok");
assert.equal(normalizeUtmToPlatform("snapchat.com"), "snapchat");
assert.equal(normalizeUtmToPlatform("googleadservices.com"), "google");
// Organic google.com is deliberately NOT the paid Google channel
assert.equal(normalizeUtmToPlatform("google.com"), "other");
// A genuinely unknown domain still falls to "other"
assert.equal(normalizeUtmToPlatform("somerandomsite.com"), "other");

// Production dirty form: Meta appends its site-source-name on some placements.
assert.equal(normalizeUtmToPlatform("facebook.com-WebsiteKeyInfo"), "meta");
// Whitespace-only is absence, not a source.
assert.equal(normalizeUtmToPlatform("   "), null);

// ---------------------------------------------------------------------------
// Four-way equivalence. The JS normalizer, the Mongo `$switch` and the
// drill-down predicate are all generated from SOURCE_ALIASES + MEDIUM_SPLIT_SOURCES.
// If they can ever disagree, a channel's parent row and its drill-down show different
// numbers — which is exactly the class of bug this replaced (`Klaviyo` matched
// case-insensitively for visits and case-SENSITIVELY for signups, so 868 real signups
// rendered as 0). These assertions are the proof they cannot.
// ---------------------------------------------------------------------------

/**
 * Faithful evaluator for the `channelKeyExpr` $switch tree. Deliberately interprets the
 * emitted expression rather than re-deriving the answer, so a mistake in the GENERATOR
 * (wrong branch order, a missing $in) is caught — re-implementing the logic would only
 * test the test.
 */
function evalChannelKeyExpr(source: string | null, medium: string | null): string {
  const expr = channelKeyExpr("$utmSource", "$utmMedium") as {
    $let: { vars: Record<string, unknown>; in: { $switch: { branches: unknown[]; default: string } } };
  };
  const s = (source ?? "").toLowerCase().trim();
  const m = (medium ?? "").toLowerCase().trim();
  const resolve = (node: unknown): string => {
    if (typeof node === "string") return node;
    const sw = (node as { $switch?: { branches: unknown[]; default: string } }).$switch;
    if (!sw) throw new Error(`unexpected node: ${JSON.stringify(node)}`);
    for (const b of sw.branches as Array<{ case: Record<string, unknown[]>; then: unknown }>) {
      const [op, args] = Object.entries(b.case)[0] as [string, unknown[]];
      const lhs = args[0] === "$$s" ? s : args[0] === "$$m" ? m : args[0];
      const rhs = args[1];
      const hit = op === "$eq" ? lhs === rhs : op === "$in" ? (rhs as string[]).includes(lhs as string) : false;
      if (hit) return resolve(b.then);
    }
    return sw.default;
  };
  return resolve(expr.$let.in);
}

const EQUIVALENCE_CASES: Array<[string | null, string | null]> = [
  ...Object.keys(SOURCE_ALIASES).map((s) => [s, null] as [string, null]),
  ...Object.keys(SOURCE_ALIASES).map((s) => [s.toUpperCase(), "cpc"] as [string, string]),
  ["klaviyo", "email"], ["Klaviyo", "email"], ["KLAVIYO", "sms"],
  ["klaviyo", "whatsapp"], ["klaviyo", null], ["klaviyo", ""],
  ["TIKTOK", "paid"], ["ig", "social"], ["facebook.com", "cpc"],
  ["chatgpt.com", null], ["somerandomsite.com", "referral"],
  ["", null], [null, null], ["   ", "cpc"],
];

for (const [src, med] of EQUIVALENCE_CASES) {
  // `normalizeUtmToPlatform` returns null for absence; the pipeline calls that "direct",
  // because a visit row with no utm_source IS direct traffic.
  const js = normalizeUtmToPlatform(src, med) ?? "direct";
  const mongo = evalChannelKeyExpr(src, med);
  assert.equal(
    mongo,
    js,
    `channelKeyExpr disagrees with normalizeUtmToPlatform for source=${JSON.stringify(src)} medium=${JSON.stringify(med)}: ${mongo} vs ${js}`
  );
}

// `channelSourceValues` must be the exact pre-image of the grouping key: every source it
// claims for a channel must actually normalize to that channel. This is what the drill-down
// `$match` uses, so a mismatch means the modal queries a different population than the row.
for (const key of CHANNEL_KEYS) {
  for (const src of channelSourceValues(key)) {
    const medium = Object.keys(MEDIUM_SPLIT_SOURCES).includes(src)
      ? Object.entries(MEDIUM_SPLIT_SOURCES[src]).find(([, ch]) => ch === key)?.[0] ?? null
      : null;
    assert.equal(
      normalizeUtmToPlatform(src, medium) ?? "direct",
      key,
      `channelSourceValues("${key}") claims "${src}", which does not normalize to "${key}"`
    );
  }
}

// Partition proof. The unit of partition is a (source, medium) PAIR, not a bare source:
// `klaviyo` legitimately belongs to two channels depending on utm_medium. That is precisely
// why the drill-down predicate cannot be a plain `{ utmSource: { $in: [...] } }` for the
// Klaviyo channels — it must also constrain the medium, or Email and SMS each swallow the
// other's traffic.
const claimed = new Map<string, ConvertingPlatform[]>();
for (const key of CHANNEL_KEYS) {
  for (const src of channelSourceValues(key)) {
    claimed.set(src, [...(claimed.get(src) ?? []), key]);
  }
}
for (const [src, keys] of claimed) {
  if (Object.keys(MEDIUM_SPLIT_SOURCES).includes(src)) {
    // A split source may claim several channels — but exactly the ones its medium table names,
    // and each medium must resolve to a distinct channel.
    const expected = Object.values(MEDIUM_SPLIT_SOURCES[src]);
    assert.deepEqual(
      [...keys].sort(),
      [...new Set(expected)].sort(),
      `split source "${src}" claims ${keys.join(", ")} but its medium table names ${expected.join(", ")}`
    );
    assert.equal(
      new Set(expected).size,
      expected.length,
      `two mediums of "${src}" resolve to the same channel — the split is not a partition`
    );
    continue;
  }
  assert.equal(keys.length, 1, `source "${src}" is claimed by ${keys.length} channels: ${keys.join(", ")}`);
}
assert.deepEqual(channelSourceValues("direct"), [], "direct is defined by ABSENCE of a source");
assert.deepEqual(channelSourceValues("other"), [], "other is defined by COMPLEMENT, not a source list");
for (const src of ALL_KNOWN_SOURCES) {
  assert.ok(claimed.has(src), `ALL_KNOWN_SOURCES lists "${src}" but no channel claims it`);
}

// CHANNEL_DISPLAY must cover every ConvertingPlatform exactly once, and CHANNEL_KEYS must be a
// non-empty tuple (it feeds z.enum in the drill-down routes).
const displayKeys = Object.keys(CHANNEL_DISPLAY).sort();
assert.deepEqual(
  [...CHANNEL_KEYS].sort(),
  displayKeys,
  "CHANNEL_KEYS and CHANNEL_DISPLAY have drifted"
);
assert.ok(CHANNEL_KEYS.length > 0, "CHANNEL_KEYS must be a non-empty tuple for z.enum");
for (const [key, meta] of Object.entries(CHANNEL_DISPLAY)) {
  assert.equal(meta.key, key, `CHANNEL_DISPLAY["${key}"].key is "${meta.key}"`);
  assert.ok(meta.label.trim().length > 0, `CHANNEL_DISPLAY["${key}"] has an empty label`);
}
assert.equal(
  new Set(Object.values(CHANNEL_DISPLAY).map((c) => c.order)).size,
  CHANNEL_KEYS.length,
  "CHANNEL_DISPLAY.order values must be unique or table sorting is non-deterministic"
);

console.log("normalizePlatform: all assertions passed");
