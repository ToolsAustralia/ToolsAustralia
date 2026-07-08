/**
 * knowledge-pack.test.ts
 *
 * Asserts that the generated chatKnowledgePack.ts is non-trivial, contains
 * canonical facts, stays within a sane token ceiling, and — critically — is
 * TIED TO THE SOURCE DATA: each active membership tier's real price (read from
 * @/data/membershipPackages) must appear in the generated text. A future
 * repricing that wasn't regenerated will therefore FAIL this test.
 *
 * Run: npm run test:chat-knowledge
 *
 * NOTE: The generated file (src/generated/chatKnowledgePack.ts) must exist
 * before running this test. It is created by:
 *   npm run build:chat-knowledge-pack
 * (called automatically by prebuild/predev).
 */

import { config } from "dotenv";
import path from "node:path";
import assert from "node:assert/strict";

// Data files may read Stripe price IDs from env at module load — load .env.local first.
config({ path: path.resolve(process.cwd(), ".env.local") });

import { getKnowledgePack } from "../knowledge/pack";
import { membershipPackages } from "@/data/membershipPackages";
import { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";

const pack = getKnowledgePack();
const { text, sources } = pack;

// ─── Canonical fact assertions ────────────────────────────────────────────────

// Subscription tier prices ($20, $40, $80)
assert.ok(text.includes("$20"), "text must contain $20 (Tradie tier price)");
assert.ok(text.includes("$40"), "text must contain $40 (Foreman tier price)");
assert.ok(text.includes("$80"), "text must contain $80 (Boss tier price)");

// Draw cadence — drawn on the 27th
assert.ok(text.includes("27th"), "text must contain '27th' (Major Draw cadence)");

// Winner selection via randomdraws.com.au
assert.ok(
  text.toLowerCase().includes("randomdraws"),
  "text must mention 'randomdraws' (winner selection service)"
);

// Refund policy — non-refundable
assert.ok(
  text.toLowerCase().includes("non-refundable"),
  "text must contain 'non-refundable' (refund policy)"
);

// Excluded states
assert.ok(text.includes("ACT"), "text must contain 'ACT' (excluded Australian Capital Territory)");
assert.ok(
  text.includes("South Australia") || text.includes(" SA"),
  "text must mention South Australia or SA (excluded state)"
);

// At least one partner brand name from partnerBrandOffers.ts
const partnerBrands = [
  "ZJWRAPS",
  "Super Bad",
  "Seal Motors",
  "Toolman Lane",
  "Multi Hub",
  "BAL Building Services",
  "All Round Trade Constructions",
];
const foundPartner = partnerBrands.some((brand) => text.includes(brand));
assert.ok(foundPartner, `text must contain at least one partner brand name (checked: ${partnerBrands.join(", ")})`);

// ─── Source-tie assertions (catch un-regenerated drift) ────────────────────────

// Every ACTIVE subscription tier's real price (from the data file) must appear in
// the pack. If someone reprices a tier in membershipPackages.ts but forgets to
// regenerate the pack, this fails. Skip inactive packages.
const activeSubs = membershipPackages.filter((p) => p.type === "subscription" && p.isActive);
assert.ok(activeSubs.length > 0, "expected at least one active subscription tier in source data");
for (const tier of activeSubs) {
  assert.ok(
    text.includes(`$${tier.price}/month`),
    `pack must include active tier "${tier.name}" real price "$${tier.price}/month" (regenerate the pack after a reprice)`
  );
  if (tier.entriesPerMonth != null) {
    assert.ok(
      text.includes(`${tier.entriesPerMonth} entries/month`),
      `pack must include active tier "${tier.name}" real entries "${tier.entriesPerMonth} entries/month"`
    );
  }
}

// Every ACTIVE one-time pack's real price must appear in the pack.
const activeOneTime = membershipPackages.filter((p) => p.type === "one-time" && p.isActive);
for (const p of activeOneTime) {
  assert.ok(
    text.includes(`$${p.price}`),
    `pack must include active one-time pack "${p.name}" real price "$${p.price}"`
  );
}

// The full partner-brand catalog (names, from the data file) must appear in the pack.
assert.ok(PARTNER_BRAND_OFFERS.length > 0, "expected partner brands in source data");
for (const brand of PARTNER_BRAND_OFFERS) {
  assert.ok(text.includes(brand.name), `pack must include partner brand name "${brand.name}" from partnerBrandOffers.ts`);
}

// ─── Size assertions ──────────────────────────────────────────────────────────

// Must be non-trivial (>1500 chars)
assert.ok(text.length > 1500, `text.length (${text.length}) must be > 1500 chars`);

// Must be under ~12,000 tokens (≈ 48,000 chars) so the cached prefix stays economical
const approxTokens = text.length / 4;
assert.ok(
  approxTokens < 12000,
  `Approx token count (${approxTokens.toFixed(0)}) must be < 12,000 (text.length=${text.length})`
);

// ─── Sources catalog assertions ───────────────────────────────────────────────

assert.ok(Array.isArray(sources), "sources must be an array");
assert.ok(sources.length > 0, "sources must be non-empty");

for (const src of sources) {
  assert.ok(
    typeof src.id === "string" && src.id.length > 0,
    `Each source must have a non-empty id (got: ${JSON.stringify(src)})`
  );
  assert.ok(
    typeof src.title === "string" && src.title.length > 0,
    `Each source must have a non-empty title (got: ${JSON.stringify(src)})`
  );
}

// Known section ids that must be present
const expectedIds = ["membership-tiers", "one-time-packs", "major-draw", "partner-discounts", "prizes", "key-pages", "faq"];
for (const id of expectedIds) {
  const found = sources.some((s) => s.id === id);
  assert.ok(found, `sources must contain section id "${id}"`);
}

// Key-pages section must contain the canonical internal links
assert.ok(text.includes("/my-account"), "key-pages section must include /my-account path");
assert.ok(text.includes("/draw-results"), "key-pages section must include /draw-results path");
assert.ok(text.includes("/contact"), "key-pages section must include /contact path");
assert.ok(text.includes("/faq"), "key-pages section must include /faq path");
assert.ok(text.includes("/winners"), "key-pages section must include /winners path");
assert.ok(text.includes("/partner"), "key-pages section must include /partner path");

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`PASS — knowledge-pack test`);
console.log(`  text length   : ${text.length.toLocaleString()} chars`);
console.log(`  approx tokens : ~${Math.round(approxTokens).toLocaleString()}`);
console.log(`  sections      : ${sources.length}`);
console.log(`  section ids   : ${sources.map((s) => s.id).join(", ")}`);
console.log(`  source-tie    : ${activeSubs.length} tiers, ${activeOneTime.length} one-time packs, ${PARTNER_BRAND_OFFERS.length} partner brands verified`);
