/**
 * Guards the PaymentEvent projection feeding the A/B metrics core.
 *
 * THE BUG THIS EXISTS FOR (shipped 2026-06-15, found 2026-07-29):
 * `ExperimentMetricsService` ran two PaymentEvent queries. The refund query selected
 * `eventType`; the purchases query did not. `toPaymentRow` then did `String(undefined)`,
 * so every purchase row arrived at the core as eventType `"undefined"`, the core's
 * `if (p.eventType !== "BenefitsGranted") continue` skipped all of them, and EVERY
 * experiment reported 0 converters and $0 revenue for six weeks. Nothing threw. The
 * admin card showed zeros, which reads as "no conversions yet" rather than "broken".
 *
 * A pure-core test cannot catch this: the core was always correct. The defect lived in
 * the Mongo projection, one layer up. So this test asserts the projection itself.
 */
import assert from "node:assert/strict";
import {
  PAYMENT_ROW_PROJECTION,
  toPaymentRow,
} from "../ExperimentMetricsService";

function run() {
  const fields = PAYMENT_ROW_PROJECTION.trim().split(/\s+/);

  // 1. Every field toPaymentRow reads must be in the projection. `eventType` is the one
  //    that actually broke, but list them all so dropping any other field also fails.
  for (const required of [
    "paymentIntentId",
    "userId",
    "variantId",
    "data",
    "isRenewal",
    "timestamp",
    "eventType",
  ]) {
    assert.ok(
      fields.includes(required),
      `PAYMENT_ROW_PROJECTION must select "${required}" — omitting it silently corrupts metrics`
    );
  }

  // 2. A well-formed row maps correctly, and eventType survives as itself (not "undefined").
  const ts = new Date("2026-07-28T22:09:50.844Z");
  const row = toPaymentRow({
    paymentIntentId: "invoice_in_1TyJAj",
    userId: "6a692856543fe38d58912602",
    variantId: null,
    data: { price: 40 },
    isRenewal: false,
    timestamp: ts,
    eventType: "BenefitsGranted",
  });
  assert.equal(row.eventType, "BenefitsGranted", "eventType must round-trip verbatim");
  assert.equal(row.priceDollars, 40, "price is read out of `data`");
  assert.equal(row.isRenewal, false);
  assert.equal(row.timestamp.getTime(), ts.getTime());
  assert.equal(row.paymentIntentId, "invoice_in_1TyJAj");

  // 3. Refund rows map too — they travel through the same mapper.
  const refund = toPaymentRow({
    paymentIntentId: "invoice_in_1TyJAj",
    userId: "6a692856543fe38d58912602",
    data: { refundAmount: 1500 },
    isRenewal: false,
    timestamp: ts,
    eventType: "RefundPartial",
  });
  assert.equal(refund.eventType, "RefundPartial");
  assert.equal(refund.refundAmountCents, 1500);

  // 4. THE REGRESSION: a row with no eventType must THROW, not quietly become "undefined".
  //    This is what turns a projection mistake into a visible failure instead of six weeks
  //    of zeros.
  assert.throws(
    () =>
      toPaymentRow({
        paymentIntentId: "invoice_in_1TyJAj",
        userId: "6a692856543fe38d58912602",
        data: { price: 40 },
        isRenewal: false,
        timestamp: ts,
        // eventType deliberately absent — exactly what the old projection produced
      }),
    /missing `eventType`/,
    "a row without eventType must throw rather than coerce to the string \"undefined\""
  );

  // 5. An empty-string eventType is equally useless — also throw.
  assert.throws(
    () => toPaymentRow({ paymentIntentId: "x", userId: "y", timestamp: ts, eventType: "" }),
    /missing `eventType`/,
    "an empty eventType must throw"
  );

  console.log("experimentMetricsProjection: all assertions passed");
}

run();
