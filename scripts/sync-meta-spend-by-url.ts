#!/usr/bin/env npx tsx
/**
 * Backfill or refresh Meta ad insights + destination URLs + landing page aggregates.
 *
 * Usage:
 *   npx tsx scripts/sync-meta-spend-by-url.ts
 *   npx tsx scripts/sync-meta-spend-by-url.ts --since=2025-03-01 --until=2025-03-24
 *
 * Requires: MONGODB_URI, FACEBOOK_MARKETING_ACCESS_TOKEN, FACEBOOK_AD_ACCOUNT_ID
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";
import { subDays } from "date-fns";

config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import { runMetaSpendByUrlSync } from "@/services/meta/runMetaSpendByUrlSync";
import { formatDateForFacebook } from "@/lib/facebook-marketing";

function parseArgs(): { since: string; until: string } {
  const argv = process.argv.slice(2);
  let since: string | undefined;
  let until: string | undefined;
  for (const a of argv) {
    if (a.startsWith("--since=")) since = a.slice("--since=".length);
    if (a.startsWith("--until=")) until = a.slice("--until=".length);
  }
  const end = new Date();
  const start = subDays(end, 7);
  return {
    since: since ?? formatDateForFacebook(start),
    until: until ?? formatDateForFacebook(end),
  };
}

async function main() {
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
  if (!adAccountId || !accessToken) {
    console.error("Missing FACEBOOK_AD_ACCOUNT_ID or FACEBOOK_MARKETING_ACCESS_TOKEN");
    process.exit(1);
  }

  await connectDB();
  const { since, until } = parseArgs();
  if (since > until) {
    console.error("since must be <= until");
    process.exit(1);
  }

  console.log("Syncing Meta spend by URL", { adAccountId, since, until });
  const result = await runMetaSpendByUrlSync(adAccountId, accessToken, { since, until });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
