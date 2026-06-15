import assert from "node:assert/strict";
import type Stripe from "stripe";
import { getSubscriptionPeriodEnd, getSubscriptionPeriodStart } from "../subscription-period";

// Minimal Stripe.Subscription shapes — the helpers only read current_period_* and items.data.
const sub = (s: unknown) => s as unknown as Stripe.Subscription;

function run() {
  // --- getSubscriptionPeriodEnd ---

  // Legacy (pre-Basil) root field still works.
  assert.equal(getSubscriptionPeriodEnd(sub({ current_period_end: 1000 })), 1000, "legacy root end");

  // Basil: root is undefined → read item-level, EARLIEST across items.
  assert.equal(
    getSubscriptionPeriodEnd(
      sub({ items: { data: [{ current_period_end: 2000 }, { current_period_end: 1500 }] } })
    ),
    1500,
    "Basil item-level end (earliest across items)"
  );

  // Root present takes precedence over items (legacy accounts).
  assert.equal(
    getSubscriptionPeriodEnd(sub({ current_period_end: 999, items: { data: [{ current_period_end: 1 }] } })),
    999,
    "root end wins when present"
  );

  // THE BUG SHAPE: Basil subscription with neither root nor item value → undefined (caller must fall back).
  assert.equal(getSubscriptionPeriodEnd(sub({ items: { data: [{}] } })), undefined, "no end anywhere → undefined");
  assert.equal(getSubscriptionPeriodEnd(sub({ items: { data: [] } })), undefined, "no items → undefined");
  assert.equal(getSubscriptionPeriodEnd(sub({})), undefined, "empty subscription → undefined");

  // --- getSubscriptionPeriodStart ---

  assert.equal(getSubscriptionPeriodStart(sub({ current_period_start: 500 })), 500, "legacy root start");
  assert.equal(
    getSubscriptionPeriodStart(
      sub({ items: { data: [{ current_period_start: 800 }, { current_period_start: 600 }] } })
    ),
    600,
    "Basil item-level start (earliest across items)"
  );
  assert.equal(getSubscriptionPeriodStart(sub({ items: { data: [{}] } })), undefined, "no start anywhere → undefined");
  assert.equal(getSubscriptionPeriodStart(sub({})), undefined, "empty subscription → undefined");

  console.log("subscription-period tests passed");
}

run();
