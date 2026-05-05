#!/usr/bin/env npx tsx

/**
 * Read-only diagnostic: print every Radar value list visible to our API
 * key, with id / alias / name / item count. Use to debug
 * `getAllowCardFingerprintListId()` lookup failures.
 *
 * Usage:
 *   npx tsx scripts/find-radar-value-lists.ts
 *
 * Env: .env.local must have STRIPE_SECRET_KEY.
 *
 * @module scripts/find-radar-value-lists
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set. Set it in .env.local and try again.");
    process.exit(1);
  }

  const { stripe } = await import("../src/lib/stripe");
  const lists = await stripe.radar.valueLists.list({ limit: 50 });

  console.log(`\nFound ${lists.data.length} Radar value list(s) visible to this API key:\n`);
  if (lists.data.length === 0) {
    console.log("  (none — Radar likely not enabled, or API key lacks Radar scope)");
  }
  for (const l of lists.data) {
    // Cast for `item_count` — present on newer Stripe API responses but
    // not in the SDK type for older versions.
    const itemCount = (l as unknown as { item_count?: number }).item_count;
    console.log(`  id:    ${l.id}`);
    console.log(`  name:  ${l.name}`);
    console.log(`  alias: ${l.alias ?? "(no alias set)"}`);
    if (itemCount !== undefined) console.log(`  items: ${itemCount}`);
    console.log("");
  }

  console.log("Looking for the card-fingerprint allow list specifically...");
  const EXPECTED_ALIAS = "card_fingerprint_allowlist";
  const candidate =
    lists.data.find((l) => l.alias === EXPECTED_ALIAS) ??
    lists.data.find((l) => l.alias === "allow_card_fingerprint") ?? // legacy spec name
    lists.data.find((l) => /card.*fingerprint.*allow/i.test(l.name));
  if (candidate) {
    console.log(
      `  ✓ Found: id=${candidate.id} alias=${candidate.alias ?? "(none)"} name="${candidate.name}"`
    );
    if (candidate.alias !== EXPECTED_ALIAS) {
      console.log(
        `  ⚠ Alias differs from expected "${EXPECTED_ALIAS}" — update src/services/allowlist/stripeListResolver.ts to use "${candidate.alias ?? candidate.id}"`
      );
    }
  } else {
    console.log("  ✗ No matching list found by alias or name. Check Radar activation.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
