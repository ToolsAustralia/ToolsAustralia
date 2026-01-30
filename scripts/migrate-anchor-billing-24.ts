/**
 * Migration Script: Anchor existing 25th–27th renewers to the 24th
 *
 * We use trial_end set to the next 24th + proration_behavior: "none" to avoid
 * charging existing customers mid-cycle. They are not charged until the 24th,
 * then renew on the 24th going forward.
 *
 * Usage:
 *   npx tsx scripts/migrate-anchor-billing-24.ts [--dry-run] [--limit=N]
 *
 * Options:
 *   --dry-run    Log what would be done without calling Stripe (default: false)
 *   --limit=N    Max number of subscriptions to update (default: 50)
 *
 * Safety:
 * - Skips subscriptions that already renew on the 24th.
 * - Skips subscriptions with cancel_at_period_end === true (customer chose to cancel at current
 *   period end; we must not change billing or trial_end or we could charge them / extend access).
 * - Rate-limit safety: delay between each Stripe update + retry on 429 (Too Many Requests).
 * - Only lists active and past_due; trialing subscriptions are not migrated (would override trial_end).
 * Logs { subId, customerEmail, oldAnchorDay, newAnchorDay, action } for every processed or skipped subscription.
 *
 * @module scripts/migrate-anchor-billing-24
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1] || "50", 10) : 50;

/** Delay in ms between each Stripe subscription update to avoid rate limits. */
const DELAY_BETWEEN_UPDATES_MS = 400;
/** Max retries when Stripe returns 429 Too Many Requests. */
const MAX_RETRIES_429 = 3;
/** Default wait (ms) when Stripe 429 does not provide Retry-After. */
const RETRY_AFTER_DEFAULT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns delay in ms from Retry-After header or exponential backoff (attempt 0→5s, 1→10s, 2→20s). */
function getRetryAfterMs(err: unknown, attempt: number): number {
  const raw = err && typeof err === "object" && "raw" in err ? (err as { raw?: { headers?: Record<string, string> } }).raw : undefined;
  const retryAfter = raw?.headers?.["retry-after"];
  if (retryAfter != null) {
    const sec = parseInt(retryAfter, 10);
    if (!Number.isNaN(sec)) return Math.min(sec * 1000, 60_000);
  }
  return RETRY_AFTER_DEFAULT_MS * Math.pow(2, attempt);
}

function getCustomerEmail(sub: import("stripe").Stripe.Subscription): string | null {
  const c = sub.customer;
  if (typeof c === "string") return null;
  if (!c || !("email" in c)) return null;
  const email = (c as { email?: string | null }).email;
  return typeof email === "string" ? email : null;
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("❌ STRIPE_SECRET_KEY is not set. Set it in .env.local and try again.");
    process.exit(1);
  }

  const { stripe } = await import("../src/lib/stripe");
  const {
    getCalendarDayInAEST,
    getNextAnchorTimestamp,
    ANCHOR_DAY_OF_MONTH,
    ANCHOR_JOIN_DAYS,
  } = await import("../src/utils/billing/anchor-billing");
  const { getSubscriptionPeriodEnd } = await import("../src/utils/payment/stripe/subscription-period");
  const { formatInTimeZone } = await import("date-fns-tz");

  const AEST = "Australia/Sydney";

  console.log("\n📅 Migrate anchor billing: 25th–27th renewers → 24th");
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no Stripe updates)" : "LIVE"}`);
  console.log(`   Limit: ${LIMIT}`);
  console.log("");

  type LogRow = { subId: string; customerEmail: string | null; oldAnchorDay: number; newAnchorDay: number; action: string };
  const log: LogRow[] = [];
  let processed = 0;
  let skippedCancelAtPeriodEnd = 0;
  let skippedAlreadyAnchored = 0;
  let skippedNot2527 = 0;
  let skippedNoPeriodEnd = 0;
  let updated = 0;
  let errors = 0;
  let totalSeen = 0;

  const nowSec = Math.floor(Date.now() / 1000);
  const next24Timestamp = getNextAnchorTimestamp(new Date());
  if (next24Timestamp <= nowSec + 60) {
    console.error(
      "❌ getNextAnchorTimestamp returned a date in the past or within 1 minute. Refusing to set trial_end. Check timezone/clock."
    );
    process.exit(1);
  }
  const next24Date = new Date(next24Timestamp * 1000);
  console.log(`   Next 24th (AEST) used for trial_end: ${next24Date.toISOString()} (${formatInTimeZone(next24Date, AEST, "yyyy-MM-dd HH:mm zzz")})`);
  console.log("");

  const seenIds = new Set<string>();

  for (const status of ["active", "past_due"] as const) {
    if (processed >= LIMIT) break;
    console.log(`   🔍 Listing subscriptions from Stripe (status=${status})...`);
    let countThisStatus = 0;
    try {
      for await (const sub of stripe.subscriptions.list({
        status,
        limit: 100,
        expand: ["data.customer"],
      })) {
        countThisStatus++;
        if (seenIds.has(sub.id)) {
          console.log(`      [DUP] ${sub.id} (already seen from other status)`);
          continue;
        }
        seenIds.add(sub.id);
        totalSeen++;

        const subId = sub.id;
        const customerEmail = getCustomerEmail(sub);

        // Safety: do not touch subscriptions scheduled to cancel. Customer expects to stop at
        // current period end; changing trial_end/billing could charge them or extend access.
        if (sub.cancel_at_period_end) {
          const periodEnd = getSubscriptionPeriodEnd(sub);
          const oldAnchorDay = periodEnd != null ? getCalendarDayInAEST(new Date(periodEnd * 1000)) : 0;
          log.push({ subId, customerEmail, oldAnchorDay, newAnchorDay: 0, action: "skip_cancel_at_period_end" });
          skippedCancelAtPeriodEnd++;
          const renewalStr = periodEnd != null ? formatInTimeZone(new Date(periodEnd * 1000), AEST, "yyyy-MM-dd") : "n/a";
          console.log(`      [SKIP] ${subId} ${customerEmail ?? "(no email)"} cancel_at_period_end=true (ends ${renewalStr}) → skip_cancel_at_period_end`);
          continue;
        }

        // getSubscriptionPeriodEnd: legacy (sub.current_period_end) or Basil (earliest of items[].current_period_end). Null if neither present (e.g. multi-item list without expand); we skip.
        const periodEnd = getSubscriptionPeriodEnd(sub);

        if (periodEnd == null) {
          skippedNoPeriodEnd++;
          log.push({ subId, customerEmail, oldAnchorDay: 0, newAnchorDay: 0, action: "skip_no_period_end" });
          console.log(`      [SKIP] ${subId} ${customerEmail ?? "(no email)"} renewalDate=n/a (no current_period_end on sub or items) → skip_no_period_end`);
          continue;
        }

        const periodEndDate = new Date(periodEnd * 1000);
        const renewalDateAEST = formatInTimeZone(periodEndDate, AEST, "yyyy-MM-dd");
        const oldAnchorDay = getCalendarDayInAEST(periodEndDate);

        // Already anchored: by period-end day (24) or by billing_cycle_anchor_config (older subs may not have this field; we rely on oldAnchorDay).
        const already24 =
          oldAnchorDay === ANCHOR_DAY_OF_MONTH ||
          (sub as { billing_cycle_anchor_config?: { day_of_month?: number } }).billing_cycle_anchor_config?.day_of_month ===
            ANCHOR_DAY_OF_MONTH;

        if (already24) {
          log.push({ subId, customerEmail, oldAnchorDay, newAnchorDay: 24, action: "skip_already_anchored" });
          skippedAlreadyAnchored++;
          console.log(`      [SKIP] ${subId} ${customerEmail ?? "(no email)"} renewalDate=${renewalDateAEST} (AEST) day=${oldAnchorDay} → already_anchored (24th)`);
          continue;
        }

        // Only migrate 25th, 26th, 27th renewers
        if (!(ANCHOR_JOIN_DAYS as readonly number[]).includes(oldAnchorDay)) {
          log.push({ subId, customerEmail, oldAnchorDay, newAnchorDay: oldAnchorDay, action: "skip_not_25_27" });
          skippedNot2527++;
          console.log(`      [SKIP] ${subId} ${customerEmail ?? "(no email)"} renewalDate=${renewalDateAEST} (AEST) day=${oldAnchorDay} → not_25_27 (only 25/26/27 are migrated)`);
          continue;
        }

        // processed counts subscriptions considered for update (capped by LIMIT), not total scanned.
        processed++;
        log.push({ subId, customerEmail, oldAnchorDay, newAnchorDay: 24, action: DRY_RUN ? "would_update" : "updated" });

        if (DRY_RUN) {
          console.log(
            `      [DRY] ${subId} ${customerEmail ?? "(no email)"} renewalDate=${renewalDateAEST} day=${oldAnchorDay} → WOULD UPDATE trial_end=${next24Timestamp} proration_behavior=none`
          );
          updated++;
          continue;
        }

        try {
          const existingMetadata = (sub.metadata || {}) as Record<string, string>;
          // Overwriting billing_anchor_rule is intentional (idempotent re-run).
          const updateParams = {
            trial_end: next24Timestamp,
            proration_behavior: "none" as const,
            metadata: { ...existingMetadata, billing_anchor_rule: "join_25_27_to_24" },
          };
          let lastErr: unknown;
          for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt++) {
            try {
              await stripe.subscriptions.update(subId, updateParams);
              lastErr = undefined;
              break;
            } catch (e) {
              lastErr = e;
              const statusCode = e && typeof e === "object" && "statusCode" in e ? (e as { statusCode?: number }).statusCode : undefined;
              if (statusCode === 429 && attempt < MAX_RETRIES_429) {
                const waitMs = getRetryAfterMs(e, attempt);
                console.log(`      [429] ${subId} rate limited, waiting ${waitMs}ms then retry (${attempt + 1}/${MAX_RETRIES_429})`);
                await sleep(waitMs);
                continue;
              }
              throw e;
            }
          }
          if (lastErr) throw lastErr;
          console.log(`      [OK]  ${subId} ${customerEmail ?? "(no email)"} renewalDate=${renewalDateAEST} day=${oldAnchorDay} → updated to 24th`);
          updated++;
          await sleep(DELAY_BETWEEN_UPDATES_MS);
        } catch (err) {
          errors++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`      [ERR] ${subId} ${customerEmail ?? "(no email)"} day=${oldAnchorDay} → ${msg}`);
          log.push({ subId, customerEmail, oldAnchorDay, newAnchorDay: 24, action: `error: ${msg}` });
        }
      }
      console.log(`   ✓ status=${status}: ${countThisStatus} subscription(s) listed.\n`);
    } catch (listErr) {
      console.error(`   [ERR] listing status=${status}:`, listErr);
      errors++;
    }
  }

  console.log("--- Log (for audit) ---");
  log.forEach((row) => console.log("   ", JSON.stringify(row)));
  console.log("");

  const updatedRows = log.filter(
    (row) => row.action === "would_update" || row.action === "updated" || row.action.startsWith("error:")
  );
  if (updatedRows.length > 0) {
    console.log(`--- Users ${DRY_RUN ? "to be " : ""}updated (${updatedRows.length}) ---`);
    updatedRows.forEach((row) => {
      const email = row.customerEmail ?? "(no email)";
      const actionLabel = row.action.startsWith("error:") ? row.action : `day ${row.oldAnchorDay} → 24`;
      console.log(`   ${row.subId}  ${email}  ${actionLabel}`);
    });
    console.log("");
  }

  console.log("--- Summary ---");
  console.log(`   Total subscriptions seen (active + past_due, deduped): ${totalSeen}`);
  console.log(`   Will be updated / Updated: ${updated}${DRY_RUN ? " (dry run)" : ""}`);
  console.log(`   Skipped (not 25th–27th): ${skippedNot2527}`);
  console.log(`   Skipped (already cancelled, cancel_at_period_end): ${skippedCancelAtPeriodEnd}`);
  console.log(`   Skipped (already 24th): ${skippedAlreadyAnchored}`);
  if (skippedNoPeriodEnd > 0) {
    console.log(`   Skipped (no current_period_end): ${skippedNoPeriodEnd}`);
  }
  console.log(`   Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
