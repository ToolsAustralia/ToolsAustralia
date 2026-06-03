import assert from "node:assert/strict";
import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";
import {
  buildAdvertisingRows,
  computeBlendedRoas,
  computeTotalAttributedRevenue,
  formatConfidenceTitle,
} from "../advertisingCardModel";

type AR = NonNullable<AdminDashboardStats["attributedRevenue"]>;

// Covers all three presentation classes + a missing platform (snapchat / klaviyo-sms absent → zeros).
const ar = {
  meta: {
    revenue: 41200,
    renewalRevenue: 5000,
    conversions: 142,
    byConfidence: { click: 36256, utm_only: 3708, inferred_backfill: 1236 }, // ~88/9/3
    adSpend: 12400,
    trueRoas: 41200 / 12400,
  },
  tiktok: {
    revenue: 6100,
    renewalRevenue: 0,
    conversions: 20,
    byConfidence: { click: 6100, utm_only: 0, inferred_backfill: 0 },
    // no adSpend / trueRoas → paid channel awaiting spend
  },
  klaviyo_email: {
    revenue: 9300,
    renewalRevenue: 1200,
    conversions: 31,
    byConfidence: { click: 0, utm_only: 9300, inferred_backfill: 0 },
  },
} as unknown as AR;

function run() {
  const rows = buildAdvertisingRows(ar);
  assert.equal(rows.length, 5, "always renders 5 rows");

  const meta = rows.find((r) => r.id === "facebook")!;
  assert.deepEqual(meta.spend, { kind: "amount", value: 12400 }, "meta spend = ad-API amount");
  assert.equal(meta.roas.kind, "value");
  assert.ok(Math.abs((meta.roas as { value: number }).value - 41200 / 12400) < 1e-9, "meta true ROAS");
  assert.equal(meta.revenue, 41200);
  assert.equal(meta.conversions, 142);

  const tiktok = rows.find((r) => r.id === "tiktok")!;
  assert.deepEqual(tiktok.spend, { kind: "awaiting" }, "tiktok paid-but-no-spend → awaiting");
  assert.deepEqual(tiktok.roas, { kind: "needsSpend" }, "tiktok roas needs spend");
  assert.equal(tiktok.revenue, 6100);

  const snapchat = rows.find((r) => r.id === "snapchat")!;
  assert.equal(snapchat.revenue, 0, "missing platform → zero revenue");
  assert.deepEqual(snapchat.spend, { kind: "awaiting" });
  assert.equal(snapchat.confidenceTitle, undefined, "no revenue → no confidence tooltip");

  const kemail = rows.find((r) => r.id === "klaviyo-email")!;
  assert.deepEqual(kemail.spend, { kind: "owned" }, "klaviyo = owned channel");
  assert.deepEqual(kemail.roas, { kind: "na" }, "klaviyo roas n/a");
  assert.equal(kemail.revenue, 9300);

  // klaviyo-sms is absent from the fixture → exercises missing-key + owned-class together.
  const ksms = rows.find((r) => r.id === "klaviyo-sms")!;
  assert.deepEqual(ksms.spend, { kind: "owned" }, "absent owned platform → owned spend");
  assert.deepEqual(ksms.roas, { kind: "na" }, "absent owned platform → roas n/a");
  assert.equal(ksms.revenue, 0, "absent owned platform → zero revenue");
  assert.equal(ksms.confidenceTitle, undefined, "no revenue → no tooltip");

  // Blended ROAS counts ONLY paid channels with spend (meta today).
  const blended = computeBlendedRoas(ar);
  assert.ok(blended != null && Math.abs(blended - 41200 / 12400) < 1e-9, "blended = meta rev/spend");

  // No spend anywhere → null (render as "—").
  assert.equal(computeBlendedRoas({ tiktok: ar.tiktok } as unknown as AR), null, "no spend → null blended");

  // Total attributed revenue sums all displayed rows.
  assert.equal(
    computeTotalAttributedRevenue(ar),
    41200 + 6100 + 9300,
    "total attributed revenue across rows",
  );

  // Confidence percentages.
  assert.equal(
    formatConfidenceTitle(ar.meta),
    "88% click-verified · 9% UTM-only · 3% backfilled",
    "confidence split rounds to 88/9/3",
  );
  assert.equal(formatConfidenceTitle(undefined), undefined, "no entry → undefined");

  console.log("advertisingCardModel helper tests passed");
}

run();
