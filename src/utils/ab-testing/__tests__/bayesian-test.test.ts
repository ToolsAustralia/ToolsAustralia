import assert from "node:assert/strict";
import {
  bayesianStatsEngine,
  chanceBExceedsA,
  gammaln,
  regularizedIncompleteBeta,
  type VariantArm,
} from "../bayesian-test";

const approx = (a: number, b: number, tol: number, msg: string) =>
  assert.ok(Math.abs(a - b) < tol, `${msg}: expected ~${b}, got ${a}`);

const variantById = (r: ReturnType<typeof bayesianStatsEngine.evaluate>, id: string) =>
  r.variants.find((v) => v.variantId === id)!;

function run() {
  // ── Numerics sanity ─────────────────────────────────────────────────────
  approx(gammaln(1), 0, 1e-9, "gammaln(1)=ln(0!)=0");
  approx(gammaln(5), Math.log(24), 1e-6, "gammaln(5)=ln(4!)");
  approx(regularizedIncompleteBeta(2, 2, 0.5), 0.5, 1e-6, "symmetric Beta(2,2) CDF at 0.5");
  // chance is complementary: P(B>A) + P(A>B) ≈ 1
  const ab = chanceBExceedsA(10, 90, 20, 80);
  const ba = chanceBExceedsA(20, 80, 10, 90);
  approx(ab + ba, 1, 1e-3, "complementary chances sum to 1");

  // ── Equal arms → 50/50 ──────────────────────────────────────────────────
  {
    const arms: VariantArm[] = [
      { variantId: "C", isControl: true, exposed: 1000, converters: 100 },
      { variantId: "T", isControl: false, exposed: 1000, converters: 100 },
    ];
    const r = bayesianStatsEngine.evaluate(arms, { minConvertersPerArm: 25 });
    approx(variantById(r, "T").chanceToBeatControl!, 0.5, 0.02, "equal arms ≈ 50% chance to win");
    assert.equal(variantById(r, "C").chanceToBeatControl, null, "control has no chance-to-beat-itself");
    assert.equal(r.controlVariantId, "C", "control chosen by isControl flag");
  }

  // ── Clearly better challenger → ship ────────────────────────────────────
  {
    const arms: VariantArm[] = [
      { variantId: "C", isControl: true, exposed: 1000, converters: 50 }, // 5%
      { variantId: "T", isControl: false, exposed: 1000, converters: 150 }, // 15%
    ];
    const r = bayesianStatsEngine.evaluate(arms, { minConvertersPerArm: 25, winThreshold: 0.95 });
    assert.ok(variantById(r, "T").chanceToBeatControl! > 0.999, "strong winner ≈ 1.0 chance");
    assert.equal(r.recommendation, "ship_variant", "recommends shipping the winner");
    assert.equal(r.recommendedVariantId, "T", "recommended variant is T");
    assert.ok(variantById(r, "T").relativeLift! > 1.5, "≈ +200% relative lift");
  }

  // ── Clearly worse challenger → keep control ─────────────────────────────
  {
    const arms: VariantArm[] = [
      { variantId: "C", isControl: true, exposed: 1000, converters: 200 }, // 20%
      { variantId: "T", isControl: false, exposed: 1000, converters: 50 }, // 5%
    ];
    const r = bayesianStatsEngine.evaluate(arms, { minConvertersPerArm: 25 });
    assert.ok(variantById(r, "T").chanceToBeatControl! < 0.001, "loser ≈ 0 chance");
    assert.equal(r.recommendation, "keep_control", "recommends keeping control");
  }

  // ── Below min-sample → keep running (no call yet) ───────────────────────
  {
    const arms: VariantArm[] = [
      { variantId: "C", isControl: true, exposed: 100, converters: 5 },
      { variantId: "T", isControl: false, exposed: 100, converters: 20 },
    ];
    const r = bayesianStatsEngine.evaluate(arms, { minConvertersPerArm: 25 });
    assert.equal(r.minSampleMet, false, "min sample not met (control has 5 < 25)");
    assert.equal(r.recommendation, "keep_running", "no call below the noise gate");
    assert.equal(r.recommendedVariantId, null, "no recommendation below the gate");
  }

  // ── 3 variants: each challenger compared to the designated control ──────
  {
    const arms: VariantArm[] = [
      { variantId: "B", isControl: false, exposed: 1000, converters: 120 },
      { variantId: "A", isControl: true, exposed: 1000, converters: 100 },
      { variantId: "C", isControl: false, exposed: 1000, converters: 90 },
    ];
    const r = bayesianStatsEngine.evaluate(arms, { minConvertersPerArm: 25 });
    assert.equal(r.controlVariantId, "A", "control is the isControl one regardless of order");
    assert.ok(variantById(r, "B").chanceToBeatControl! > 0.5, "B (better) > 50%");
    assert.ok(variantById(r, "C").chanceToBeatControl! < 0.5, "C (worse) < 50%");
    assert.equal(variantById(r, "A").chanceToBeatControl, null, "control not compared to itself");
  }

  console.log("bayesian-test: all assertions passed");
}

run();
