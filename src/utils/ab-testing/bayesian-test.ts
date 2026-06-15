/**
 * Bayesian "chance to win" statistics engine — PURE, deterministic, no RNG.
 *
 * Conversion is modelled per variant as a Beta-Binomial: with a Beta(α₀,β₀)
 * prior and `converters` successes out of `exposed` users, the posterior
 * conversion rate is Beta(α₀+converters, β₀+exposed−converters). "Chance to
 * win" = P(variant rate > control rate), computed by deterministic numerical
 * integration of the two Beta posteriors (so tests are reproducible — no
 * Monte-Carlo seed).
 *
 * Why Bayesian: it is valid under continuous peeking by construction (the number
 * means the same thing whenever you look), which suits an operator who checks the
 * dashboard ad hoc. See the remediation plan + research notes in the conversation
 * that produced docs/superpowers/plans/2026-06-12-ab-affiliate-remediation.md.
 *
 * Swappable: implement `StatsEngine` to add e.g. a sequential/always-valid
 * engine later without touching callers.
 */

export interface VariantArm {
  variantId: string;
  isControl: boolean;
  /** Distinct exposed users (denominator). */
  exposed: number;
  /** Distinct converting users (successes), 0 ≤ converters ≤ exposed. */
  converters: number;
}

export interface StatsEngineOptions {
  /** Chance-to-win threshold to call a winner. Default 0.95. */
  winThreshold?: number;
  /** Minimum converters per arm before any call is made (noise gate). Default 25. */
  minConvertersPerArm?: number;
  /** Beta prior. Default uniform Beta(1,1). */
  priorAlpha?: number;
  priorBeta?: number;
}

export interface VariantStatResult {
  variantId: string;
  isControl: boolean;
  exposed: number;
  converters: number;
  /** Posterior mean conversion rate. */
  conversionRate: number;
  /** P(this variant's rate > control's rate). null for the control itself. */
  chanceToBeatControl: number | null;
  /** 95% credible interval on the absolute conversion rate (normal approx of the Beta posterior). */
  credibleInterval: { lower: number; upper: number };
  /** Relative lift of the posterior mean vs control. null for the control. */
  relativeLift: number | null;
}

export type StatsRecommendation =
  | "ship_variant"
  | "keep_control"
  | "keep_running"
  | "inconclusive";

export interface ExperimentStatResult {
  engine: string;
  controlVariantId: string | null;
  variants: VariantStatResult[];
  recommendation: StatsRecommendation;
  recommendedVariantId: string | null;
  /** True once every arm has ≥ minConvertersPerArm converters. */
  minSampleMet: boolean;
  winThreshold: number;
}

export interface StatsEngine {
  readonly name: string;
  evaluate(arms: VariantArm[], options?: StatsEngineOptions): ExperimentStatResult;
}

// ── Numerics ────────────────────────────────────────────────────────────────

/** Natural log of the Gamma function (Lanczos approximation). */
export function gammaln(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function lnBeta(a: number, b: number): number {
  return gammaln(a) + gammaln(b) - gammaln(a + b);
}

/** Continued fraction for the incomplete beta (Numerical Recipes `betacf`). */
function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a,b) = Beta CDF at x. */
export function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta(a, b));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function betaPdf(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) return 0;
  if (x === 0) return a === 1 ? Math.exp(-lnBeta(a, b)) : 0;
  if (x === 1) return b === 1 ? Math.exp(-lnBeta(a, b)) : 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lnBeta(a, b));
}

/**
 * P(X_B > X_A) where X_A~Beta(aA,bA), X_B~Beta(aB,bB), via Simpson's rule on
 * ∫₀¹ f_B(x)·F_A(x) dx. Deterministic (N fixed). N=2000 gives ~1e-4 accuracy.
 */
export function chanceBExceedsA(aA: number, bA: number, aB: number, bB: number): number {
  const N = 2000; // even
  const h = 1 / N;
  let sum = 0;
  for (let i = 0; i <= N; i++) {
    const x = i * h;
    const val = betaPdf(x, aB, bB) * regularizedIncompleteBeta(aA, bA, x);
    const w = i === 0 || i === N ? 1 : i % 2 === 1 ? 4 : 2;
    sum += w * val;
  }
  const result = (h / 3) * sum;
  return Math.max(0, Math.min(1, result));
}

// ── Engine ──────────────────────────────────────────────────────────────────

function pickControl(arms: VariantArm[]): VariantArm | null {
  if (arms.length === 0) return null;
  return arms.find((a) => a.isControl) ?? arms[0]; // arms arrive control-first from the repo sort
}

export const bayesianStatsEngine: StatsEngine = {
  name: "bayesian-beta-binomial",
  evaluate(arms, options = {}) {
    const winThreshold = options.winThreshold ?? 0.95;
    const minConverters = options.minConvertersPerArm ?? 25;
    const a0 = options.priorAlpha ?? 1;
    const b0 = options.priorBeta ?? 1;

    const control = pickControl(arms);
    const controlPost = control
      ? { a: a0 + control.converters, b: b0 + (control.exposed - control.converters) }
      : null;
    const controlRate = control && control.exposed > 0 ? control.converters / control.exposed : 0;

    const variants: VariantStatResult[] = arms.map((arm) => {
      const a = a0 + arm.converters;
      const b = b0 + (arm.exposed - arm.converters);
      const mean = a / (a + b);
      const variance = (a * b) / ((a + b) * (a + b) * (a + b + 1));
      const sd = Math.sqrt(variance);
      const isControlArm = control != null && arm.variantId === control.variantId;
      const chance =
        controlPost && !isControlArm ? chanceBExceedsA(controlPost.a, controlPost.b, a, b) : null;
      return {
        variantId: arm.variantId,
        isControl: arm.isControl,
        exposed: arm.exposed,
        converters: arm.converters,
        conversionRate: mean,
        chanceToBeatControl: chance,
        credibleInterval: {
          lower: Math.max(0, mean - 1.96 * sd),
          upper: Math.min(1, mean + 1.96 * sd),
        },
        relativeLift: isControlArm || controlRate === 0 ? null : (mean - controlRate) / controlRate,
      };
    });

    const minSampleMet = arms.length > 0 && arms.every((a) => a.converters >= minConverters);

    // Recommendation: pick the challenger with the highest chance-to-win.
    let recommendation: StatsRecommendation = "inconclusive";
    let recommendedVariantId: string | null = null;
    const challengers = variants.filter((v) => v.chanceToBeatControl != null);
    if (control && challengers.length > 0) {
      const best = challengers.reduce((a, b) =>
        (b.chanceToBeatControl ?? 0) > (a.chanceToBeatControl ?? 0) ? b : a
      );
      if (!minSampleMet) {
        recommendation = "keep_running";
      } else if ((best.chanceToBeatControl ?? 0) >= winThreshold) {
        recommendation = "ship_variant";
        recommendedVariantId = best.variantId;
      } else if ((best.chanceToBeatControl ?? 0) <= 1 - winThreshold) {
        // Every challenger is very likely worse than control.
        recommendation = "keep_control";
        recommendedVariantId = control.variantId;
      } else {
        recommendation = "keep_running";
      }
    }

    return {
      engine: this.name,
      controlVariantId: control?.variantId ?? null,
      variants,
      recommendation,
      recommendedVariantId,
      minSampleMet,
      winThreshold,
    };
  },
};
