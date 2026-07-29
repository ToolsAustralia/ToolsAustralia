import assert from "node:assert/strict";
import type { AdminDashboardStats } from "@/hooks/queries/useAdminQueries";
import {
  buildAdvertisingRows,
  buildDirectRow,
  computeBlendedRoas,
  computeTotalAttributedRevenue,
  computeAggregate,
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
  direct: {
    revenue: 5270,
    renewalRevenue: 800,
    conversions: 18,
    byConfidence: { click: 0, utm_only: 0, inferred_backfill: 5270 },
  },
} as unknown as AR;

function run() {
  const rows = buildAdvertisingRows(ar);
  assert.equal(rows.length, 5, "always renders 5 rows");
  assert.ok(!rows.some((r) => r.id === "direct"), "direct is NOT one of the 5 attributed channel rows");

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

  // Total attributed revenue sums the 5 channel rows ONLY — direct is excluded.
  assert.equal(
    computeTotalAttributedRevenue(ar),
    41200 + 6100 + 9300,
    "total attributed revenue excludes direct (unattributed)",
  );

  // Direct (unattributed) row: present with revenue/conversions, no spend/ROAS.
  const direct = buildDirectRow(ar)!;
  assert.ok(direct, "direct row built when direct bucket has revenue");
  assert.equal(direct.id, "direct");
  assert.equal(direct.revenue, 5270, "direct revenue from the direct bucket (acquisition only)");
  assert.equal(direct.conversions, 18);
  assert.deepEqual(direct.spend, { kind: "owned" }, "direct has no ad spend → renders —");
  assert.deepEqual(direct.roas, { kind: "na" }, "direct ROAS n/a → renders —");
  assert.equal(direct.confidenceTitle, undefined, "direct is unattributed → no confidence split");
  // Omitted / empty direct bucket → no row (card hides it).
  assert.equal(buildDirectRow({ meta: ar.meta } as unknown as AR), null, "no direct bucket → null");
  assert.equal(
    buildDirectRow({ direct: { revenue: 0, renewalRevenue: 0, conversions: 0, byConfidence: { click: 0, utm_only: 0, inferred_backfill: 0 } } } as unknown as AR),
    null,
    "zero direct → null (no empty row)",
  );

  // Confidence percentages.
  assert.equal(
    formatConfidenceTitle(ar.meta),
    "88% click-verified · 9% UTM-only · 3% backfilled",
    "confidence split rounds to 88/9/3",
  );
  assert.equal(formatConfidenceTitle(undefined), undefined, "no entry → undefined");

  // Aggregate (SHARED-3): paid basis for ROAS/contribution, all-channel for totals.
  const agg = computeAggregate(ar);
  assert.equal(agg.totalSpend, 12400, "total spend = meta only (sole paid-with-spend)");
  assert.equal(agg.paidAcquisitionRevenue, 41200, "paid revenue = meta (tiktok has no spend)");
  assert.equal(agg.totalAcquisitionRevenue, 41200 + 6100 + 9300, "total acq revenue across channels");
  assert.ok(agg.overallRoas != null && Math.abs(agg.overallRoas - 41200 / 12400) < 1e-9, "overall ROAS = paid rev/spend");
  assert.equal(agg.contributionAfterAdSpend, 41200 - 12400, "contribution = paid revenue − spend");
  assert.equal(agg.totalConversions, 142 + 20 + 31, "total conversions across channels");
  assert.equal(computeAggregate({ tiktok: ar.tiktok } as unknown as AR).overallRoas, null, "no spend → null overall ROAS");

  // ── Signups per platform + dual ROAS (2026-07-24) ──────────────────────────────
  const dual = buildAdvertisingRows({
    meta: {
      revenue: 41200, renewalRevenue: 0, conversions: 142, signups: 380,
      byConfidence: { click: 100, utm_only: 0, inferred_backfill: 0 },
      adSpend: 12400, trueRoas: 41200 / 12400,
      platformRevenue: 52000, platformRoas: 52000 / 12400,
    },
    // Spend, but the platform reported no conversion value back.
    tiktok: {
      revenue: 900, renewalRevenue: 0, conversions: 4, signups: 25,
      byConfidence: { click: 4, utm_only: 0, inferred_backfill: 0 },
      adSpend: 500, trueRoas: 900 / 500,
    },
    // Owned channel — no spend, so neither ROAS applies.
    klaviyo_email: {
      revenue: 6100, renewalRevenue: 0, conversions: 20, signups: 12,
      byConfidence: { click: 0, utm_only: 20, inferred_backfill: 0 },
    },
  } as unknown as AR);
  const metaRow = dual.find((r) => r.platformKey === "meta")!;
  const tiktokRow = dual.find((r) => r.platformKey === "tiktok")!;
  const klaviyoRow = dual.find((r) => r.platformKey === "klaviyo_email")!;

  assert.equal(metaRow.signups, 380, "signups surface on the row");
  assert.equal(tiktokRow.signups, 25, "signups surface for every paid channel");
  assert.equal(klaviyoRow.signups, 12, "owned channels carry signups too");

  assert.equal(metaRow.platformRoas.kind, "value", "platform-reported ROAS present when the platform sent value");
  if (metaRow.platformRoas.kind === "value") {
    assert.ok(Math.abs(metaRow.platformRoas.value - 52000 / 12400) < 1e-9, "platform ROAS = platform revenue / spend");
    assert.equal(metaRow.platformRoas.revenue, 52000, "platform revenue carried for the tooltip");
  }
  // The two ROAS figures are independent — server ROAS must NOT be overwritten by it.
  assert.equal(metaRow.roas.kind, "value", "server ROAS still present alongside platform ROAS");
  if (metaRow.roas.kind === "value") {
    assert.ok(Math.abs(metaRow.roas.value - 41200 / 12400) < 1e-9, "server ROAS uses OUR attributed revenue");
  }
  assert.equal(
    tiktokRow.platformRoas.kind,
    "noData",
    "spend but no platform-reported value → noData (distinct from 'not applicable')",
  );
  assert.equal(klaviyoRow.platformRoas.kind, "na", "owned channel → platform ROAS not applicable");

  // A platform with signups but zero revenue must still render — that's the whole point
  // of the signup column (a channel creating accounts that haven't converted yet).
  const signupsOnly = buildAdvertisingRows({
    tiktok: {
      revenue: 0, renewalRevenue: 0, conversions: 0, signups: 17,
      byConfidence: { click: 0, utm_only: 0, inferred_backfill: 0 },
    },
  } as unknown as AR);
  assert.equal(
    signupsOnly.find((r) => r.platformKey === "tiktok")!.signups,
    17,
    "signups-only platform still produces a row",
  );

  // Direct row appears on signups alone, not just revenue/conversions.
  const directSignups = buildDirectRow({
    direct: {
      revenue: 0, renewalRevenue: 0, conversions: 0, signups: 9,
      byConfidence: { click: 0, utm_only: 0, inferred_backfill: 0 },
    },
  } as unknown as AR);
  assert.equal(directSignups?.signups, 9, "direct row renders for signups-only traffic");

  console.log("advertisingCardModel helper tests passed");
}

run();
