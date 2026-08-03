/**
 * Parses the curated partner-catalogue CSV at
 * src/data/partner-catalog/offers-list-breakdown.csv
 * (columns: ID,Category,Offer,Highlight,Product.terms_and_conditions,Supplier,AccessPercent)
 * and emits two generated files:
 *
 *  - src/generated/partnerCatalogOffers.ts  — SERVER-ONLY full offer map (id → name/category/pct).
 *  - src/generated/partnerCatalogPreview.ts — CLIENT-SAFE aggregates (total + cumulative tier counts).
 *
 * Run: npx tsx scripts/build-partner-catalog-preview.ts
 *
 * Wired into `prebuild`/`predev` (panel F-002) — deterministic + millisecond-fast, so it
 * runs on every build like the sibling generators. A CSV edit without regeneration fails
 * the next build via the pinned aggregates below; a LEGITIMATE catalogue update therefore
 * means consciously re-pinning EXPECTED_TOTAL / EXPECTED_CUMULATIVE in this file (the
 * double-entry check is the point — never delete the pins to make a build pass).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { PARTNER_CATALOG_LADDER_PCTS } from "@/utils/partner-discounts/partner-catalog-visibility";

const CSV_PATH = path.join(process.cwd(), "src", "data", "partner-catalog", "offers-list-breakdown.csv");
const OFFERS_OUT = path.join(process.cwd(), "src", "generated", "partnerCatalogOffers.ts");
const PREVIEW_OUT = path.join(process.cwd(), "src", "generated", "partnerCatalogPreview.ts");
const BROWSE_OUT = path.join(process.cwd(), "src", "generated", "partnerCatalogBrowse.ts");
const ARTWORK_PATH = path.join(process.cwd(), "src", "data", "partner-catalog", "offers-with-artwork.json");

const HEADER = ["ID", "Category", "Offer", "Highlight", "Product.terms_and_conditions", "Supplier", "AccessPercent"];
/** Ascending ladder, derived from the single source (panel F-016) — also the emit order
 *  for the generated cumulative-tier table. */
const ALLOWED_PERCENTS = [...PARTNER_CATALOG_LADDER_PCTS].sort((a, b) => a - b);

/** Expected aggregates — fail loud if the CSV drifts from the curated snapshot. */
const EXPECTED_TOTAL = 1833;
const EXPECTED_CUMULATIVE: Record<number, number> = { 25: 459, 50: 917, 100: 1833 };

const GENERATED_HEADER = "// GENERATED FILE — do not edit; run npm run build:partner-catalog";

interface CsvRow {
  id: string;
  category: string;
  offer: string;
  /** The CSV's `Highlight` column — the member-facing value line ("Get 4% Discount",
   *  "$250 off a wrap"). Present on 1,830 of 1,833 rows; "" when the vendor left it blank. */
  highlight: string;
  pct: number;
}

/** RFC-4180 CSV parser: quoted fields ("" escapes), embedded commas/newlines, CRLF + BOM. */
function parseCsv(raw: string): string[][] {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const records: string[][] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
      i += 1;
    } else if (ch === "\r" || ch === "\n") {
      fields.push(field);
      field = "";
      records.push(fields);
      fields = [];
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (field.length > 0 || fields.length > 0) {
    fields.push(field);
    records.push(fields);
  }
  // Drop fully-empty records (e.g. a trailing newline).
  return records.filter((r) => !(r.length === 1 && r[0] === ""));
}

function fail(message: string): never {
  console.error(`build-partner-catalog-preview: ${message}`);
  process.exit(1);
}

async function main() {
  const raw = await fs.readFile(CSV_PATH, "utf8");
  const records = parseCsv(raw);
  if (records.length === 0) fail("CSV is empty");

  const header = records[0];
  if (header.length !== HEADER.length || HEADER.some((h, idx) => header[idx] !== h)) {
    fail(`unexpected CSV header: ${JSON.stringify(header)} (expected ${JSON.stringify(HEADER)})`);
  }

  const rows: CsvRow[] = [];
  const seenIds = new Set<string>();
  for (let n = 1; n < records.length; n++) {
    const rec = records[n];
    if (rec.length !== HEADER.length) {
      fail(`record ${n + 1} has ${rec.length} fields, expected ${HEADER.length}: ${JSON.stringify(rec)}`);
    }
    const [id, category, offer, highlight, , , pctRaw] = rec;
    if (!/^\d+$/.test(id)) fail(`record ${n + 1} has a non-numeric ID: ${JSON.stringify(id)}`);
    if (seenIds.has(id)) fail(`duplicate offer ID ${id} (record ${n + 1})`);
    seenIds.add(id);
    const pct = Number(pctRaw);
    if (!ALLOWED_PERCENTS.includes(pct)) {
      fail(`record ${n + 1} (ID ${id}) has AccessPercent ${JSON.stringify(pctRaw)}, expected one of {${ALLOWED_PERCENTS.join(",")}}`);
    }
    rows.push({ id, category, offer, highlight: highlight.trim(), pct });
  }

  // Vendor names become OUR customer-facing headline verbatim ("{offer} unlocks at N%
  // access."), and the CSV is refreshed by a third party — so the rule-11 vocabulary has
  // to be checked at build time, not hoped about (panel F-039). A refreshed CSV that
  // introduces a Sportsbet/Lottoland/TAB/Keno merchant would otherwise ship a hard-banned
  // word into customer copy with nothing failing.
  const HARD_BANNED = /\b(odds|lotter(y|ies)|lotto|raffles?|sweepstakes?|gambl(e|ing)|bets?|betting|wager|keno|pokies)\b/i;
  const SOFT_FLAGGED = /\b(lucky|casino|jackpot)\b/i;
  const hardHits = rows.filter((r) => HARD_BANNED.test(r.offer));
  if (hardHits.length > 0) {
    fail(
      `${hardHits.length} offer name(s) contain rule-11 banned vocabulary and would render in ` +
        `customer copy:\n` +
        hardHits.map((r) => `  ${r.id}  ${r.offer}`).join("\n") +
        `\nIf a name is a legitimate merchant, add it to a reviewed allowlist in this script ` +
        `deliberately — do NOT weaken the regex (CLAUDE.md rule 11 is a legal line).`
    );
  }
  const softHits = rows.filter((r) => SOFT_FLAGGED.test(r.offer));
  if (softHits.length > 0) {
    console.log(
      `⚠ ${softHits.length} offer name(s) carry gambling-adjacent words (allowed — proper nouns, ` +
        `but review if marketing objects): ${softHits.map((r) => r.offer.replace(/\s{2,}/g, ", ")).join(" · ")}`
    );
  }

  // Deterministic output order regardless of CSV row order.
  rows.sort((a, b) => Number(a.id) - Number(b.id));

  const total = rows.length;
  const perTier = new Map<number, number>(ALLOWED_PERCENTS.map((p) => [p, 0]));
  for (const row of rows) perTier.set(row.pct, (perTier.get(row.pct) ?? 0) + 1);

  let running = 0;
  const cumulative = new Map<number, number>();
  for (const p of ALLOWED_PERCENTS) {
    running += perTier.get(p) ?? 0;
    cumulative.set(p, running);
  }

  if (total !== EXPECTED_TOTAL) fail(`expected ${EXPECTED_TOTAL} offers, parsed ${total}`);
  for (const [level, expected] of Object.entries(EXPECTED_CUMULATIVE)) {
    const actual = cumulative.get(Number(level));
    if (actual !== expected) fail(`expected ${expected} offers unlocked at ${level}%, got ${actual}`);
  }

  const offerEntries = rows
    .map((r) => `  ${JSON.stringify(r.id)}: { name: ${JSON.stringify(r.offer)}, category: ${JSON.stringify(r.category)}, pct: ${r.pct} },`)
    .join("\n");
  const offersFile = `${GENERATED_HEADER}

/**
 * Server-only — ${rows.length} rows; never import from a "use client" file (bundle size).
 * Enforced by the eslint rule \`local/no-models-in-client\` (message \`serverOnlyData\`);
 * client code imports the aggregates from \`@/generated/partnerCatalogPreview\` instead,
 * and a server page injects this map (see resolvePortalReturn).
 * The curated Offers List Breakdown is the DISPLAY ALLOWLIST — the vendor feed
 * contains offers outside it.
 */
export interface PartnerCatalogOffer {
  name: string;
  category: string;
  pct: number;
}

export const PARTNER_CATALOG_OFFERS: Readonly<Record<string, PartnerCatalogOffer>> = {
${offerEntries}
};
`;

  const tierEntries = ALLOWED_PERCENTS.map((p) => `  ${p}: ${cumulative.get(p)},`).join("\n");
  const previewFile = `${GENERATED_HEADER}

/** Total offers in the curated partner catalogue. */
export const PARTNER_CATALOG_TOTAL: number = ${total};

/**
 * Cumulative offers unlocked at each access-percent level
 * (count of offers with pct <= level). Client-safe — aggregates only.
 */
export const PARTNER_CATALOG_TIER_COUNTS: Readonly<Record<number, number>> = {
${tierEntries}
};
`;

  // ── CLIENT-SAFE BROWSE CATALOGUE ────────────────────────────────────────────
  // Powers /my-account/rewards/catalogue: the member-facing answer to "what does my
  // tier actually open?", which the vendor's portal structurally cannot give (it
  // renders locked and unlocked offers identically and never states the tier).
  //
  // SEPARATE FILE, deliberately. It cannot live in partnerCatalogPreview.ts: that
  // module holds the tiny aggregates the Rewards CARD imports, so folding ~72 KB of
  // rows into it would drag the whole catalogue into the bundle of every surface that
  // just wants a tier count. Only the catalogue route imports this one.
  //
  // Names are stored category-INDEXED (an index into `categories`) rather than
  // repeating 11 category strings across 1,833 rows — 96 KB naive → ~72 KB raw,
  // ~24 KB over the wire.
  const categories = [...new Set(rows.map((r) => r.category))].sort();
  const catIndex = new Map(categories.map((c, i) => [c, i]));
  // id → image extension, from the committed probe (scripts/probe-partner-catalog-images.ts).
  // 949 of 1,833 offers have artwork and the extension varies per offer, so the row carries
  // the extension rather than a boolean: the page cannot guess it, and asking for the wrong
  // one 403s through our own image optimiser. Absent file ⇒ no artwork anywhere, a safe
  // degrade to the letter tile.
  let artworkExt: Readonly<Record<string, string>> = {};
  try {
    const raw = await fs.readFile(ARTWORK_PATH, "utf8");
    artworkExt = JSON.parse(raw) as Record<string, string>;
  } catch {
    console.warn(
      `⚠ no ${path.basename(ARTWORK_PATH)} — every offer will render without artwork. ` +
        `Run \`npm run probe:partner-catalog-images\` to generate it.`
    );
  }

  const browseRows = rows
    .map(
      (r) =>
        `  [${JSON.stringify(r.offer)},${catIndex.get(r.category)},${r.pct},${JSON.stringify(r.id)},${JSON.stringify(r.highlight)},${JSON.stringify(artworkExt[r.id] ?? "")}],`
    )
    .join("\n");
  const browseFile = `${GENERATED_HEADER}

/**
 * CLIENT-SAFE browse catalogue — every offer as \`[name, categoryIndex, pct, id]\`.
 *
 * Import ONLY from the catalogue route; it is ~88 KB. For a tier count use
 * \`PARTNER_CATALOG_TIER_COUNTS\` from \`@/generated/partnerCatalogPreview\` instead.
 * The full id → offer map (\`partnerCatalogOffers\`) stays server-only.
 *
 * \`pct\` is the access level that OPENS the offer, so an offer is available to a member
 * when \`pct <= their partner access percent\`.
 *
 * \`id\` is the VENDOR's offer id, and it deep-links: the portal serves every offer at
 * \`{portal}/products/view_smart/{id}\` (a stable path — \`view_smart\` does not vary).
 * It requires a live portal session, which an SSO'd member has.
 */
export type PartnerCatalogBrowseRow = readonly [
  name: string,
  categoryIndex: number,
  pct: number,
  id: string,
  /** Member-facing value line, from the vendor's Highlight column — e.g. "Get 4% Discount".
   *  Empty string when the vendor left it blank (3 of 1,833 rows). */
  highlight: string,
  /** File extension of this offer's artwork ("png" | "jpg" | …), or "" when it has none.
   *  949 of 1,833 have one and the extension varies per offer — see
   *  scripts/probe-partner-catalog-images.ts. Callers must build an image URL ONLY from this
   *  value; guessing the extension 403s through our own image optimiser. */
  imageExt: string,
];

export const PARTNER_CATALOG_BROWSE_CATEGORIES: readonly string[] = ${JSON.stringify(categories)};

export const PARTNER_CATALOG_BROWSE: readonly PartnerCatalogBrowseRow[] = [
${browseRows}
];
`;

  await fs.mkdir(path.dirname(OFFERS_OUT), { recursive: true });
  await fs.writeFile(OFFERS_OUT, offersFile, "utf8");
  await fs.writeFile(PREVIEW_OUT, previewFile, "utf8");
  await fs.writeFile(BROWSE_OUT, browseFile, "utf8");

  const tierSummary = ALLOWED_PERCENTS.map((p) => `${p}%→${cumulative.get(p)}`).join(" · ");
  console.log(`Wrote ${total} offers to ${path.relative(process.cwd(), OFFERS_OUT)} and aggregates to ${path.relative(process.cwd(), PREVIEW_OUT)}`);
  console.log(`Cumulative tier counts: ${tierSummary}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
