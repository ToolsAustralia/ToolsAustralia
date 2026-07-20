import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PRIZE_SUMMARIES,
  DEFAULT_PRIZE_SLUG,
  getPrizeSummaryBySlug,
  listPrizeSummaries,
  getPrizeLabel,
  type PrizeSummary,
} from "@/config/prize-summaries";
// Importing the heavy module is fine here: this test runs server-side via tsx,
// never in a browser bundle. It is the drift guard between the two catalogs.
import {
  PRIZE_CATALOG,
  DEFAULT_PRIZE_SLUG as FULL_DEFAULT_PRIZE_SLUG,
} from "@/config/prizes";

/** Every field a PrizeSummary carries — used both for equality and no-extra-keys checks. */
const SUMMARY_FIELDS = [
  "slug",
  "label",
  "heroHeading",
  "heroSubheading",
  "summary",
  "prizeValueLabel",
  "gallery",
  "highlights",
  "cardBackgroundImage",
] as const;

/** Deep fields that must NEVER leak into the client summaries module. */
const DEEP_ONLY_FIELDS = ["specSections", "detailedDescription"] as const;

const SUMMARIES_SOURCE_PATH = path.resolve(process.cwd(), "src/config/prize-summaries.ts");
const SOURCE_SIZE_BUDGET_BYTES = 40 * 1024;

/** Slug lists must match exactly — same entries, same ORDER (consumers rely on catalog order). */
function testSlugParity() {
  const summarySlugs = PRIZE_SUMMARIES.map((p) => p.slug);
  const catalogSlugs = PRIZE_CATALOG.map((p) => p.slug);
  assert.deepEqual(
    summarySlugs,
    catalogSlugs,
    "prize-summaries slugs must match PRIZE_CATALOG slugs in the same order"
  );
}

/** Every shared field must be value-identical between the two catalogs (drift guard). */
function testSharedFieldEquality() {
  for (const summary of PRIZE_SUMMARIES) {
    const full = PRIZE_CATALOG.find((p) => p.slug === summary.slug);
    assert.ok(full, `catalog entry missing for summary slug ${summary.slug}`);
    for (const field of SUMMARY_FIELDS) {
      assert.deepEqual(
        summary[field],
        full[field],
        `field "${field}" drifted for slug ${summary.slug} — edit prize data in BOTH src/config/prizes.ts and src/config/prize-summaries.ts`
      );
    }
  }
}

/** Summaries must not carry deep fields or unknown extras (keeps the module small). */
function testNoDeepFieldsLeak() {
  const allowed = new Set<string>(SUMMARY_FIELDS);
  for (const summary of PRIZE_SUMMARIES) {
    for (const key of Object.keys(summary)) {
      assert.ok(!DEEP_ONLY_FIELDS.includes(key as (typeof DEEP_ONLY_FIELDS)[number]), `deep field "${key}" leaked into summary ${summary.slug}`);
      assert.ok(allowed.has(key), `unexpected field "${key}" on summary ${summary.slug}`);
    }
  }
}

function testHelpersAndDefaultSlug() {
  assert.equal(DEFAULT_PRIZE_SLUG, FULL_DEFAULT_PRIZE_SLUG, "DEFAULT_PRIZE_SLUG must agree across modules");
  assert.ok(getPrizeSummaryBySlug(DEFAULT_PRIZE_SLUG), "default slug must resolve to a summary");
  assert.equal(getPrizeSummaryBySlug("not-a-real-slug"), undefined);
  assert.equal(listPrizeSummaries().length, PRIZE_CATALOG.length);
  // listPrizeSummaries returns a copy, not the live array
  const copy: PrizeSummary[] = listPrizeSummaries();
  copy.pop();
  assert.equal(listPrizeSummaries().length, PRIZE_CATALOG.length, "listPrizeSummaries must return a defensive copy");
  for (const p of PRIZE_CATALOG) {
    assert.ok(getPrizeLabel(p.slug), `getPrizeLabel must return a label for ${p.slug}`);
  }
  assert.equal(getPrizeLabel(undefined), undefined);
  assert.equal(getPrizeLabel("not-a-real-slug"), undefined);
}

/** The whole point of the split: the summaries module must stay small. */
function testSourceSizeBudget() {
  const source = readFileSync(SUMMARIES_SOURCE_PATH, "utf8");
  const bytes = Buffer.byteLength(source, "utf8");
  assert.ok(
    bytes <= SOURCE_SIZE_BUDGET_BYTES,
    `src/config/prize-summaries.ts is ${bytes} bytes — over the ${SOURCE_SIZE_BUDGET_BYTES} byte budget. Move heavy data to src/config/prizes.ts (deep half) instead.`
  );
}

/** The summaries module must never import the heavy catalog (would pull it into every client graph). */
function testNoHeavyImport() {
  const source = readFileSync(SUMMARIES_SOURCE_PATH, "utf8");
  // Strip comments first — the module's own doc comment warns about "./prizes" by name.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    !/from\s+["'](?:\.\/prizes|@\/config\/prizes)["']/.test(code) && !/import\(\s*["'](?:\.\/prizes|@\/config\/prizes)["']\s*\)/.test(code),
    "prize-summaries.ts must not import from ./prizes — that defeats the client/server split"
  );
}

function run() {
  testSlugParity();
  testSharedFieldEquality();
  testNoDeepFieldsLeak();
  testHelpersAndDefaultSlug();
  testSourceSizeBudget();
  testNoHeavyImport();
  console.log("prize-summaries tests passed");
}

run();
