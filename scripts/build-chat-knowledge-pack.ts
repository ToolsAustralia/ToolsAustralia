/**
 * Generates src/generated/chatKnowledgePack.ts from CANONICAL source files.
 *
 * The structured facts (tier prices/entries, pack ladders, partner brands, prize
 * options) are DERIVED from the real data/config exports — there are NO hardcoded
 * price/entry/brand numbers for anything that lives in those files. A repricing in
 * the data file therefore propagates to the bot on the next build, with zero drift.
 *
 * Sources (imported via @/ aliases):
 *  - @/data/membershipPackages   → subscription tiers, one-time packs, additional packs
 *  - @/data/miniDrawPackages     → mini-pack ladder
 *  - @/data/partnerBrandOffers   → partner brand names + offers
 *  - @/config/prizes             → prize catalog (slugs + short labels)
 *  - @/data/faqs (getFaqEntries) → curated customer-facing Q&As
 *
 * Prose facts that genuinely aren't in importable data (freeze/draw times,
 * ACT/SA exclusion, anchor-day-24, randomdraws.com.au) are mostly carried by the
 * imported FAQ entries; the few that aren't are tagged `[from BUSINESS.md]`.
 *
 * Env is loaded up-front because the data files may read Stripe price IDs from env
 * at module load. On Vercel the build env is already present; locally we need .env.local.
 *
 * Run: npm run build:chat-knowledge-pack
 * Called automatically by: prebuild / predev
 */

import { config } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import { membershipPackages, type StaticMembershipPackage } from "@/data/membershipPackages";
import { miniDrawPackages, type MiniDrawPackage } from "@/data/miniDrawPackages";
import { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";
import { PRIZE_CATALOG, getPrizeLabel } from "@/config/prizes";
import { getSupportChatFaqEntries } from "@/data/supportChatFaqs";

// ─── Paths ────────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const OUT = path.join(ROOT, "src", "generated", "chatKnowledgePack.ts");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the partner-catalog % from a package feature line, e.g. "50% Access to Partner Discounts". */
function partnerPercentFromFeatures(features: string[]): string | null {
  for (const f of features) {
    const m = f.match(/(\d+)%/);
    if (m) return `${m[1]}%`;
  }
  return null;
}

/** Extract partner-access window days from a feature line, e.g. "2 Days Access to Partner Discounts". */
function partnerDaysFromFeatures(features: string[]): string | null {
  for (const f of features) {
    const m = f.match(/(\d+)\s+Days?\s+Access/i);
    if (m) return `${m[1]} day${m[1] === "1" ? "" : "s"}`;
  }
  return null;
}

// ─── Section builders (all derive from imported data) ──────────────────────────

function buildMembershipSection(): string {
  const subs = membershipPackages.filter(
    (p: StaticMembershipPackage) => p.type === "subscription" && p.isActive
  );

  const rows = subs
    .map((t) => {
      const partnerPct = partnerPercentFromFeatures(t.features) ?? "—";
      const shop = t.shopDiscountPercent != null ? `${t.shopDiscountPercent}%` : "—";
      return `| ${t.name} | $${t.price}/month | ${t.entriesPerMonth} entries/month | ${partnerPct} of catalogue | ${shop} |`;
    })
    .join("\n");

  return `## [membership-tiers] Membership Tiers

Subscription entries **accumulate and carry forward** each month while the subscription stays active.
Partner access is **lifecycle-gated** — active for the full duration of an active subscription; it re-enables immediately when a paused or past-due subscription returns to good standing. [from BUSINESS.md]

| Tier | Price | Entries/month | Partner catalogue access | Shop discount |
|---|---|---|---|---|
${rows}

Most subscriptions renew **monthly on the member's own billing date** (the day of the month they first subscribed). **Members who join on the 25th, 26th, or 27th are anchored to renew on the 24th** so their payment settles 3+ days before the 27th Major Draw. (A past-due subscription that later recovers is also reanchored, clamped to the 24th.) Members can see their exact next billing date on their My Account → Membership page. [from BUSINESS.md]`;
}

function buildOneTimePacksSection(): string {
  const oneTime = membershipPackages.filter(
    (p: StaticMembershipPackage) => p.type === "one-time" && p.isActive && !p.isAdditional
  );
  const additional = membershipPackages.filter(
    (p: StaticMembershipPackage) => p.type === "one-time" && p.isActive && p.isAdditional
  );

  const rows = oneTime
    .map((p) => {
      const partnerPct = partnerPercentFromFeatures(p.features) ?? "—";
      const days =
        partnerDaysFromFeatures(p.features) ??
        (p.partnerDiscountDays != null ? `${p.partnerDiscountDays} day(s)` : "—");
      return `| ${p.name} | $${p.price} | ${p.totalEntries} entries | ${partnerPct} for ${days} |`;
    })
    .join("\n");

  const addRows = additional
    .map((p) => `| ${p.name} | $${p.price} | ${p.totalEntries} entries |`)
    .join("\n");

  return `## [one-time-packs] One-Time Tool Packs

One-time packs can be purchased by anyone. They grant a fixed number of entries for the current draw cycle and a time-limited partner-discount window.

| Pack | Price | Entries | Partner access |
|---|---|---|---|
${rows}

**Important:** one-time pack entries are valid for the current cycle only and do **not** carry forward to future draws.

### Additional Packs (discounted — for engaged users)

Users with an active subscription **or** entries in the current Major Draw unlock Additional packs at a reduced price. Same entry counts, lower price.

| Pack | Price | Entries |
|---|---|---|
${addRows}`;
}

function buildMiniDrawSection(): string {
  const active = miniDrawPackages.filter((p: MiniDrawPackage) => p.isActive);
  const guest = active.filter((p) => p.isAdditional !== true);
  const member = active.filter((p) => p.isAdditional === true);

  const guestRows = guest
    .map((p) => `| ${p.displayName ?? p.name} | $${p.price} | ${p.entries} entries |`)
    .join("\n");
  const memberRows = member
    .map((p) => `| ${p.displayName ?? p.name} | $${p.price} | ${p.entries} entries |`)
    .join("\n");

  return `## [mini-draws] Mini Draws

Mini Draws are **separate from the Major Draw**. Buying a Mini Draw pack gives you **zero** Major Draw entries — the two are completely separate pools.

- **No fixed schedule.** Each mini draw triggers when its entry threshold is reached. [from BUSINESS.md]

### Guest packs (open to all)
| Pack | Price | Entries |
|---|---|---|
${guestRows}

### Member/engaged-user packs (requires active subscription OR current Major Draw entries)
| Pack | Price | Entries |
|---|---|---|
${memberRows}`;
}

function buildPartnerDiscountsSection(): string {
  // Derive the per-tier visibility % from the active subscription packages' feature lines.
  const subs = membershipPackages.filter(
    (p: StaticMembershipPackage) => p.type === "subscription" && p.isActive
  );
  const tierLines = subs
    .map((t) => {
      const pct = partnerPercentFromFeatures(t.features) ?? "—";
      return `- **${t.name}:** ${pct} of the partner catalogue`;
    })
    .join("\n");

  const brandList = PARTNER_BRAND_OFFERS.map((b) => `- **${b.name}:** ${b.discountMessage}`).join("\n");

  return `## [partner-discounts] Partner Discounts

Active subscribers unlock exclusive discounts with our partner brands. How much of the catalogue you see depends on your subscription tier:

${tierLines}

One-time pack buyers receive a time-limited partner access window depending on the pack purchased.

**To redeem:** simply mention "Tools Australia" when dealing with the partner brand. There is no code to enter.

### Current partner brands (${PARTNER_BRAND_OFFERS.length} active)
${brandList}

*The catalogue is planned to expand to 1,000+ brands once the partner API launches.* [from BUSINESS.md]`;
}

function buildPrizesSection(): string {
  // Derive prize options from the real PRIZE_CATALOG: each entry's short label.
  const toolPrizes = PRIZE_CATALOG.filter((p) => p.slug !== "cash-prize");
  const cashPrize = PRIZE_CATALOG.find((p) => p.slug === "cash-prize");

  const toolList = toolPrizes.map((p) => `- ${getPrizeLabel(p.slug) ?? p.label}`).join("\n");

  const cashLabel = cashPrize ? getPrizeLabel(cashPrize.slug) ?? cashPrize.label : "$10,000 Cash";

  return `## [prizes] Prize Options

Each month's Grand Winner can customise their prize. They choose **one** of: [from BUSINESS.md]

**Option A — a power-tool + workshop-storage combination, each bundled with a $5,000 cash bonus.** The available combinations are:
${toolList}

**Option B — cash instead of tools: ${cashLabel}** — no tools, no hassle, just cash straight to your bank account.

The winner is contacted after the live draw and works with our team to finalise their prize choice. Tools Australia handles all operational logistics outside the platform. [from BUSINESS.md]`;
}

function buildDrawMechanicsSection(): string {
  // Curated prose facts not in importable data — tagged [from BUSINESS.md].
  return `## [major-draw] Major Draw — How It Works [from BUSINESS.md]

- **Cadence:** monthly, drawn on the **27th** of each month.
- **Entries freeze at 8:00 PM AEST/AEDT** on the 27th. No new Major Draw purchases from 8:00 PM until midnight.
- **Draw runs live on Facebook at 8:30 PM** on the 27th.
- **Winner selection:** Tools Australia does **not** pick the winner. The locked entry list is exported and uploaded to **randomdraws.com.au** — an independent, government-certified Australian random-draw service. randomdraws.com.au runs the selection; the result is broadcast live and a verification URL is published on our Draw Results page.
- **Eligibility:** must be **18 or older** and a **legal Australian resident**. **Residents of the ACT and South Australia (SA) are currently excluded** due to competition permit restrictions.
- **Carry-forward:** subscription entries accumulate while the subscription is active. One-time pack entries are scoped to the cycle they were purchased in.
- **Cancellation mid-cycle:** entries already earned in the current cycle remain valid and stay in the pool. Membership fees are **non-refundable** once purchased; there is no refund for the unused portion of a cancelled period (your rights under Australian Consumer Law are preserved).
- **Referrals:** when a referred friend makes their first purchase, **both parties receive 100 bonus entries** into the current Major Draw.
- **Rewards** points are temporarily paused. The **member shop** is live at /shop: members get their tier's shop discount at checkout, shipping is free on orders of $100 or more and a $10 flat rate below that, and an account is required to check out.
- Why the 24th? Renewing on the 24th leaves a few days before the 27th draw, so a failed renewal payment can be fixed in time for your entries to count. [from BUSINESS.md]`;
}

function buildKeyPagesSection(): string {
  // Curated list of canonical internal paths the bot may link to.
  // Keep in sync with the site's real routes.
  const pages = [
    { label: "My Account (dashboard)",           path: "/my-account" },
    { label: "Membership (manage plan, billing, tier)", path: "/my-account/membership" },
    { label: "Login",                             path: "/login" },
    { label: "Reset / forgot password",           path: "/reset-password" },
    { label: "FAQ page",                          path: "/faq" },
    { label: "Draw Results",                      path: "/draw-results" },
    { label: "Winners",                           path: "/winners" },
    { label: "Contact / support",                 path: "/contact" },
    { label: "Partner discounts",                 path: "/partner" },
    { label: "Terms and conditions",              path: "/terms" },
    { label: "Major Draw",                        path: "/major-draw" },
    { label: "Mini Draws",                        path: "/mini-draws" },
  ];

  const list = pages.map((p) => `- **${p.label}:** \`${p.path}\``).join("\n");

  return `## [key-pages] Key Pages — Canonical Internal Links

Use these paths when directing members to a page. Only use paths from this list — do not invent paths.

${list}

**Usage:** when referencing a page in a response, link it with markdown: e.g. \`[My Account](/my-account)\`, \`[Membership](/my-account/membership)\`, \`[contact us](/contact)\`.`;
}

function buildFaqSection(): string {
  // Use the REAL FAQ entries — do not re-type them.
  const entries = getSupportChatFaqEntries()
    .map((e, i) => `### Q${i + 1}: ${e.question}\n${e.answer}`)
    .join("\n\n");

  return `## [faq] Frequently Asked Questions

${entries}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Section {
  id: string;
  title: string;
  content: string;
}

async function main() {
  console.log("Building chat knowledge pack…");

  const sections: Section[] = [
    { id: "membership-tiers",  title: "Membership Tiers",           content: buildMembershipSection()       },
    { id: "one-time-packs",    title: "One-Time Tool Packs",        content: buildOneTimePacksSection()     },
    { id: "mini-draws",        title: "Mini Draws",                 content: buildMiniDrawSection()         },
    { id: "major-draw",        title: "Major Draw",                 content: buildDrawMechanicsSection()    },
    { id: "partner-discounts", title: "Partner Discounts",          content: buildPartnerDiscountsSection() },
    { id: "prizes",            title: "Prize Options",              content: buildPrizesSection()           },
    { id: "key-pages",         title: "Key Pages",                  content: buildKeyPagesSection()         },
    { id: "faq",               title: "Frequently Asked Questions", content: buildFaqSection()              },
  ];

  const packText = [
    "# Tools Australia — Support Knowledge Pack",
    "",
    "This document is the grounding context for the Tools Australia AI support chatbot.",
    "Every structured fact below is derived from canonical data files; prose facts are tagged [from BUSINESS.md].",
    "Do not paraphrase numbers. Source sections are tagged with [section-id] in the heading for citation.",
    "",
    ...sections.map((s) => s.content),
  ].join("\n\n");

  const sourcesJson = JSON.stringify(
    sections.map((s) => ({ id: s.id, title: s.title })),
    null,
    2
  );

  const charCount = packText.length;
  const approxTokens = Math.round(charCount / 4);

  const tsContent = `// GENERATED by scripts/build-chat-knowledge-pack.ts — do not edit by hand.
// Regenerate: npm run build:chat-knowledge-pack
// Structured facts are DERIVED from canonical sources:
//   src/data/membershipPackages.ts, src/data/miniDrawPackages.ts,
//   src/data/partnerBrandOffers.ts, src/config/prizes.ts, src/data/faqs.ts
// Prose facts are tagged [from BUSINESS.md].

export const CHAT_KNOWLEDGE_PACK: string = ${JSON.stringify(packText)};

export const CHAT_KNOWLEDGE_SOURCES: { id: string; title: string }[] = ${sourcesJson};
`;

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, tsContent, "utf8");

  console.log(
    `✓ Wrote ${sections.length} sections · ~${approxTokens.toLocaleString()} tokens (${charCount.toLocaleString()} chars) → ${path.relative(ROOT, OUT)}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
