/**
 * Sync Klaviyo full profiles for users in subscription payment recovery (past_due / unpaid).
 *
 * Usage:
 *   npx tsx scripts/sync-klaviyo-past-due-profiles.ts [--dry-run] [--limit=N] [--skip=N] [--delay-ms=N]
 *
 * @module scripts/sync-klaviyo-past-due-profiles
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "../src/lib/mongodb";
import User, { type IUser } from "../src/models/User";
import { syncUserProfileToKlaviyo } from "../src/utils/integrations/klaviyo/klaviyo-profile-sync";
import { getRenewalEntriesPreviewForProfile } from "../src/utils/integrations/klaviyo/klaviyo-renewal-entries-preview";

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");

function argNumber(name: string, fallback: number): number {
  const raw = argv.find((a) => a.startsWith(`${name}=`));
  if (!raw) return fallback;
  const n = parseInt(raw.split("=")[1] || "", 10);
  return Number.isFinite(n) ? n : fallback;
}

const LIMIT = argNumber("--limit", 0);
const SKIP = argNumber("--skip", 0);
const DELAY_MS = argNumber("--delay-ms", 300);

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const start = Date.now();
  console.log("\n[past-due-sync] Klaviyo past_due / unpaid profile sync");
  console.log(`   KLAVIYO_PRIVATE_API_KEY: ${process.env.KLAVIYO_PRIVATE_API_KEY ? "set" : "NOT SET"}`);
  console.log(`   KLAVIYO_ENABLED: ${process.env.KLAVIYO_ENABLED ?? "undefined"}`);
  console.log(`   dry-run: ${DRY_RUN}  limit: ${LIMIT || "none"}  skip: ${SKIP}  delay-ms: ${DELAY_MS}\n`);

  if (process.env.KLAVIYO_ENABLED === "false") {
    console.error("[past-due-sync] Abort: KLAVIYO_ENABLED=false");
    process.exit(1);
  }
  if (!process.env.KLAVIYO_PRIVATE_API_KEY?.trim()) {
    console.error("[past-due-sync] Abort: KLAVIYO_PRIVATE_API_KEY missing");
    process.exit(1);
  }

  await connectDB();

  const filter = { "subscription.status": { $in: ["past_due", "unpaid"] } };
  const total = await User.countDocuments(filter);
  console.log(`[past-due-sync] Matching users: ${total}`);

  let query = User.find(filter).sort({ _id: 1 });
  if (SKIP > 0) query = query.skip(SKIP);
  if (LIMIT > 0) query = query.limit(LIMIT);
  const users = await query.exec();

  let ok = 0;
  let fail = 0;
  const totalBatch = users.length;

  for (let i = 0; i < users.length; i++) {
    const user = users[i] as IUser;
    const idx = i + 1;
    const preview = getRenewalEntriesPreviewForProfile(user);

    if (DRY_RUN) {
      console.log(
        `[past-due-sync] ${idx}/${totalBatch} DRY email=${user.email} status=${user.subscription?.status} past_due_renewal_entries=${preview ?? "n/a"}`
      );
      ok++;
      continue;
    }

    try {
      await syncUserProfileToKlaviyo(user);
      ok++;
      if (idx % 25 === 0 || idx === totalBatch) {
        console.log(`[past-due-sync] ${idx}/${totalBatch} ok=${ok} fail=${fail}`);
      }
    } catch (e) {
      fail++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[past-due-sync] FAIL ${idx}/${totalBatch} userId=${user._id} email=${user.email}: ${msg}`);
    }

    if (DELAY_MS > 0 && i < users.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const sec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[past-due-sync] Done in ${sec}s — ok=${ok} fail=${fail} (batch ${totalBatch})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[past-due-sync] Fatal:", e);
  process.exit(1);
});
