/**
 * CSV ↔ generated drift guard (panel F-041). Run: `npm run test:partner-catalog-drift`.
 *
 * `build:partner-catalog` runs in `prebuild`/`predev`, so PRODUCTION always builds from
 * the CSV — but every local gate (type-check, every tsx suite, every reviewer) reads the
 * COMMITTED generated files. A commit that edits the CSV without regenerating therefore
 * passes everything locally while the constants that drive customer-facing counts go
 * stale. This test closes that window: it re-parses the CSV and asserts the committed
 * constants still agree with it.
 *
 * It deliberately re-derives the cumulative counts from the offers map rather than
 * trusting the preview file, so a hand-edit to either generated file also fails.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PARTNER_CATALOG_TOTAL,
  PARTNER_CATALOG_TIER_COUNTS,
} from "@/generated/partnerCatalogPreview";
import { PARTNER_CATALOG_OFFERS } from "@/generated/partnerCatalogOffers";
import { PARTNER_CATALOG_LADDER_PCTS } from "@/utils/partner-discounts/partner-catalog-visibility";

const CSV_PATH = path.join(process.cwd(), "src", "data", "partner-catalog", "offers-list-breakdown.csv");
const REGEN = "run `npm run build:partner-catalog` and commit the regenerated files";

/** Minimal RFC-4180 row splitter — the CSV has quoted fields containing commas AND newlines. */
function csvRowCount(text: string): number {
  let rows = 0;
  let inQuotes = false;
  let sawField = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawField = true;
    } else if (c === "\n") {
      if (sawField) rows++;
      sawField = false;
    } else if (c !== "\r") {
      sawField = true;
    }
  }
  if (sawField) rows++;
  return rows;
}

function testCsvRowCountMatchesTotal(): void {
  const raw = fs.readFileSync(CSV_PATH, "utf8").replace(/^﻿/, "");
  const dataRows = csvRowCount(raw) - 1; // minus the header
  assert.equal(
    dataRows,
    PARTNER_CATALOG_TOTAL,
    `CSV has ${dataRows} offers but PARTNER_CATALOG_TOTAL is ${PARTNER_CATALOG_TOTAL} — ${REGEN}`
  );
}

function testOffersMapMatchesTotal(): void {
  assert.equal(
    Object.keys(PARTNER_CATALOG_OFFERS).length,
    PARTNER_CATALOG_TOTAL,
    `the offers map and PARTNER_CATALOG_TOTAL disagree — ${REGEN}`
  );
}

function testEveryTierCumulativeMatchesTheOffersMap(): void {
  const ladder = [...PARTNER_CATALOG_LADDER_PCTS].sort((a, b) => a - b);
  const offers = Object.values(PARTNER_CATALOG_OFFERS);
  let running = 0;
  for (const pct of ladder) {
    running += offers.filter((o) => o.pct === pct).length;
    assert.equal(
      PARTNER_CATALOG_TIER_COUNTS[pct],
      running,
      `tier ${pct}% cumulative is ${PARTNER_CATALOG_TIER_COUNTS[pct]} but the offers map yields ${running} — ${REGEN}`
    );
  }
  assert.equal(running, PARTNER_CATALOG_TOTAL, `the tier counts do not sum to the total — ${REGEN}`);
}

function testEveryOfferPercentIsOnTheLadder(): void {
  for (const [id, offer] of Object.entries(PARTNER_CATALOG_OFFERS)) {
    assert.ok(
      PARTNER_CATALOG_LADDER_PCTS.has(offer.pct),
      `offer ${id} has an off-ladder percent (${offer.pct}) — ${REGEN}`
    );
  }
}

for (const t of [
  testCsvRowCountMatchesTotal,
  testOffersMapMatchesTotal,
  testEveryTierCumulativeMatchesTheOffersMap,
  testEveryOfferPercentIsOnTheLadder,
]) {
  t();
}
console.log("partner-catalog-drift (CSV ↔ committed generated files) tests passed");
