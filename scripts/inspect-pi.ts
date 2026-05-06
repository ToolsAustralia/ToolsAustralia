#!/usr/bin/env npx tsx

/**
 * One-off PaymentIntent inspector for diagnosing past-due failures.
 * Usage: npx tsx scripts/inspect-pi.ts pi_xxx
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const PI_ID = process.argv[2];
if (!PI_ID) {
  console.error("Usage: npx tsx scripts/inspect-pi.ts <pi_id>");
  process.exit(1);
}

import("stripe").then(async (m) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY missing from .env.local");
    process.exit(1);
  }
  const stripe = new m.default(process.env.STRIPE_SECRET_KEY);
  const pi = await stripe.paymentIntents.retrieve(PI_ID, {
    expand: ["latest_charge"],
  });
  console.log(
    JSON.stringify(
      {
        id: pi.id,
        status: pi.status,
        confirmation_method: pi.confirmation_method,
        last_payment_error: pi.last_payment_error,
        next_action: pi.next_action,
        cancellation_reason: pi.cancellation_reason,
        latest_charge: pi.latest_charge,
        created: new Date(pi.created * 1000).toISOString(),
        amount: pi.amount,
        currency: pi.currency,
      },
      null,
      2
    )
  );
});
