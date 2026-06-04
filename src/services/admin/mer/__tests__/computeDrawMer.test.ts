import assert from "node:assert/strict";
import { computeDrawMerRow, type ComputeDrawMerInput } from "../computeDrawMer";
import { ATTRIBUTED_PLATFORM_KEYS, type AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

let failures = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
};

const DRAW = {
  drawId: "d1",
  drawName: "April Draw",
  periodStart: "2026-04-27T14:00:00.000Z",
  periodEnd: "2026-05-27T10:00:00.000Z",
  inProgress: false,
};

/** Build a full attributedRevenue record, zero-filling unspecified platforms. */
function ar(values: Partial<Record<AttributedPlatformKey, number>>) {
  const out = {} as Record<AttributedPlatformKey, { newRevenue: number }>;
  for (const p of ATTRIBUTED_PLATFORM_KEYS) out[p] = { newRevenue: values[p] ?? 0 };
  return out;
}

function input(over: Partial<ComputeDrawMerInput>): ComputeDrawMerInput {
  return {
    draw: DRAW,
    adChannels: {},
    attributedRevenue: ar({}),
    ...over,
  };
}

test("blended New Revenue sums acquisition revenue across ALL platforms incl. direct", () => {
  const row = computeDrawMerRow(
    input({
      attributedRevenue: ar({ meta: 1000, tiktok: 200, direct: 300, klaviyo_email: 50 }),
    })
  );
  assert.equal(row.newRevenue, 1550);
});

test("blended Ad Spend sums all ad-channel spend; blended MER = revenue / spend", () => {
  const row = computeDrawMerRow(
    input({
      adChannels: { facebook: { spend: 500 } },
      attributedRevenue: ar({ meta: 1500, direct: 500 }),
    })
  );
  assert.equal(row.adSpend, 500);
  assert.equal(row.mer, 2000 / 500); // 4x — note numerator includes unattributed "direct"
});

test("blended MER is null when there is no ad spend", () => {
  const row = computeDrawMerRow(input({ attributedRevenue: ar({ direct: 800 }) }));
  assert.equal(row.adSpend, 0);
  assert.equal(row.mer, null);
});

test("Meta breakdown: facebook spend → amount + real MER", () => {
  const row = computeDrawMerRow(
    input({ adChannels: { facebook: { spend: 250 } }, attributedRevenue: ar({ meta: 1000 }) })
  );
  const meta = row.platforms.find((p) => p.platform === "meta")!;
  assert.equal(meta.spendStatus, "amount");
  assert.equal(meta.adSpend, 250);
  assert.equal(meta.mer, 4);
});

test("TikTok breakdown: no spend channel synced → awaiting, MER null (the client's gap)", () => {
  const row = computeDrawMerRow(
    input({ adChannels: { facebook: { spend: 250 } }, attributedRevenue: ar({ tiktok: 900 }) })
  );
  const tiktok = row.platforms.find((p) => p.platform === "tiktok")!;
  assert.equal(tiktok.spendStatus, "awaiting");
  assert.equal(tiktok.adSpend, null);
  assert.equal(tiktok.mer, null);
  assert.equal(tiktok.newRevenue, 900); // revenue still attributed, only the denominator is missing
});

test("owned channels (Klaviyo, Direct) → owned spend status, no MER", () => {
  const row = computeDrawMerRow(
    input({ attributedRevenue: ar({ klaviyo_email: 120, direct: 400 }) })
  );
  const klaviyo = row.platforms.find((p) => p.platform === "klaviyo_email")!;
  const direct = row.platforms.find((p) => p.platform === "direct")!;
  assert.equal(klaviyo.spendStatus, "owned");
  assert.equal(klaviyo.mer, null);
  assert.equal(direct.spendStatus, "owned");
  assert.equal(direct.mer, null);
});

test("draw metadata passes through unchanged", () => {
  const row = computeDrawMerRow(input({ draw: { ...DRAW, inProgress: true } }));
  assert.equal(row.drawId, "d1");
  assert.equal(row.periodStart, DRAW.periodStart);
  assert.equal(row.periodEnd, DRAW.periodEnd);
  assert.equal(row.inProgress, true);
});

test("non-finite / missing values coerce to 0, never NaN or Infinity", () => {
  const row = computeDrawMerRow(
    input({
      adChannels: { facebook: { spend: Number.NaN as number } },
      attributedRevenue: ar({ meta: 100 }),
    })
  );
  assert.equal(row.adSpend, 0);
  assert.equal(row.mer, null);
  assert.equal(row.newRevenue, 100);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll computeDrawMer tests passed");
