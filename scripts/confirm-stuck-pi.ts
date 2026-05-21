#!/usr/bin/env npx tsx

/**
 * Manually confirm a PaymentIntent that's stuck in `requires_confirmation`.
 *
 * Stripe's `invoices.pay()` sometimes leaves the PI in this state instead of
 * auto-confirming — particularly when the invoice already had a PI from a
 * prior finalization attempt. This script bridges the gap by explicitly
 * calling `paymentIntents.confirm({ off_session: true })`.
 *
 * After this script runs:
 *   - PI succeeds → invoice transitions to `paid` → webhook fires renewal pipeline
 *   - PI requires_action → 3DS needed; customer must complete via dashboard
 *   - PI fails (card_declined etc.) → real card issue; needs card-update flow
 *
 * Usage:
 *   npx tsx scripts/confirm-stuck-pi.ts pi_xxx
 *   npx tsx scripts/confirm-stuck-pi.ts pi_xxx --dry-run  (just inspects, doesn't confirm)
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const args = process.argv.slice(2);
const PI_ID = args.find((a) => !a.startsWith("--"));
const DRY_RUN = args.includes("--dry-run");

if (!PI_ID) {
  console.error("Usage: npx tsx scripts/confirm-stuck-pi.ts <pi_id> [--dry-run]");
  process.exit(1);
}

// PI_ID is guaranteed to be a string by the guard above, but TypeScript needs assertion
const piId = PI_ID as string;

async function main(): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY missing from .env.local");
    process.exit(1);
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  console.log(`\n=== Inspecting ${piId} ===`);

  let pi = await stripe.paymentIntents.retrieve(piId, {
    expand: ["latest_charge"],
  });

  console.log(`  status:       ${pi.status}`);
  console.log(`  amount:       ${pi.currency.toUpperCase()} ${(pi.amount / 100).toFixed(2)}`);
  console.log(`  customer:     ${typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? "(none)"}`);
  console.log(`  payment_method: ${typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id ?? "(none)"}`);
  console.log(`  latest_charge:  ${pi.latest_charge ? "present" : "null"}`);
  console.log(`  last_error:     ${pi.last_payment_error?.code ?? "none"}`);

  if (pi.status === "succeeded") {
    console.log("\nAlready succeeded. Nothing to do.");
    return;
  }

  if (pi.status !== "requires_confirmation") {
    console.log(`\nPI is in "${pi.status}" — this script only confirms requires_confirmation PIs.`);
    console.log("Other states need different handling:");
    console.log("  requires_action      → customer must complete 3DS via dashboard/hosted invoice URL");
    console.log("  requires_payment_method → customer must update card");
    console.log("  canceled             → PI was canceled, can't be revived");
    return;
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: would call stripe.paymentIntents.confirm() with off_session: true.");
    console.log("Run without --dry-run to actually confirm.");
    return;
  }

  console.log("\n=== Confirming with off_session: true ===");
  try {
    pi = await stripe.paymentIntents.confirm(piId, { off_session: true });
    console.log(`  new status: ${pi.status}`);

    if (pi.status === "succeeded") {
      console.log("\n✓ PI succeeded. Invoice should now be paid.");
      console.log("  The webhook will fire the renewal pipeline (status flip, entries, Klaviyo, etc.).");
    } else if (pi.status === "requires_action") {
      console.log("\n⚠ PI requires customer authentication (3DS).");
      console.log("  Send the customer to the hosted invoice URL or dashboard payment flow.");
    } else if (pi.status === "requires_payment_method") {
      console.log("\n✗ Card was declined. Customer needs to update their card.");
      console.log(`  last error: ${pi.last_payment_error?.code} — ${pi.last_payment_error?.message}`);
    } else {
      console.log(`\nFinal status: ${pi.status}`);
    }
  } catch (err) {
    const stripeErr = err as { code?: string; message?: string; raw?: { code?: string; message?: string } };
    console.error("\n✗ Confirm threw an error:");
    console.error(`  code:    ${stripeErr.code ?? stripeErr.raw?.code ?? "(unknown)"}`);
    console.error(`  message: ${stripeErr.message ?? stripeErr.raw?.message ?? "(unknown)"}`);
    if (stripeErr.code === "authentication_required" || stripeErr.raw?.code === "authentication_required") {
      console.error("\n  → Customer needs to authenticate via 3DS. Off-session can't bypass.");
      console.error("    Send hosted invoice URL or direct to dashboard payment flow.");
    } else if (stripeErr.code === "card_declined" || stripeErr.raw?.code === "card_declined") {
      console.error("\n  → Card declined. Customer needs to update their card.");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
