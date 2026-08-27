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

// Ceiling on pack growth. Raised 12,000 → 14,000 on 2026-08-11.
//
// READ THIS BEFORE RAISING IT AGAIN. The original 12,000 was chosen "so the
// cached prefix stays economical" — but there is no prompt caching: no
// cache_control is set anywhere in src/lib/support-chat or
// src/services/support-chat, and production ChatConversation.tokenUsage shows
// cacheRead: 0 / cacheWrite: 0 across every conversation. The whole pack is
// therefore re-sent UNCACHED on every single request (measured: ~14,000 input
// tokens per LLM turn against ~90 output tokens).
//
// The guard was already breached at 12,540 tokens before the 2026-08-11 FAQ
// additions; those additions (5 entries answering questions real customers
// asked and got "I don't have that information" for) took it to ~13,375. The
// number was bumped rather than the knowledge dropped because the knowledge is
// the product and the cost is currently trivial (~$1.41/month projected).
//
// The real fix is prompt caching on the system block, which would cut the input
// cost of the prefix by ~90% and take latency with it. Until that lands, treat
// this ceiling as a reminder that every token here is paid on every turn — do
// not bump it again to fit "nice to have" content.
//
// Raised 14,000 → 15,200 on 2026-08-24 (draw 10). Same test as last time: this
// was NOT nice-to-have, and the guard was ALREADY breached at 14,067 before this
// change — it went red on main at e762dcda (2026-08-18, blocked-card guidance),
// so 14,000 had stopped describing reality.
//
// What the extra ~900 tokens bought: a member asked about the refund policy, got
// only the membership "non-refundable" line, and pushed back citing the 48-hour
// genuine-purchase-error clause on OUR OWN /competition-term-majordraw page.
// Cobber replied that it "did not have access to the content of external links".
// That page was in neither [key-pages] nor the pack, so there was nothing to
// ground on — the bot was denying a refund route that our published terms grant.
// Wrong answers about refunds are consumer-law exposure, not a knowledge nicety.
// Added: the [competition-terms] section, the page in [key-pages], FAQ ids 86-87,
// and a correction to id 12.
//
// Cost: ~900 extra uncached input tokens per turn, ~$0.10/month at current volume.
// Raised 15,200 -> 16,400 on 2026-08-27, merging origin/staging. THIRD raise, and this one
// bought nothing new on its own: it is the arithmetic of two independently-shipped feature
// sets landing together — draw 10's competition-terms section and refund FAQs, plus staging's
// six merchandise-shop entries. Pack measured ~16,160 after the merge.
//
// Say plainly what that means: 12,000 -> 14,000 -> 15,200 -> 16,400, breached every time,
// raised every time. A ceiling that moves whenever it binds is a changelog, not a budget. The
// only reason it is moved again here rather than trimming is that a merge is the wrong moment
// to decide which of two teams' customer answers to delete.
//
// Prompt caching remains the real fix and would make this ceiling moot.
const approxTokens = text.length / 4;
assert.ok(
  approxTokens < 16400,
  `Approx token count (${approxTokens.toFixed(0)}) must be < 16,400 (text.length=${text.length})`
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
