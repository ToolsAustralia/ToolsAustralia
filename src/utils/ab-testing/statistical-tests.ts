/**
 * Statistical Tests for A/B Testing
 * Implements chi-square test, p-value calculation, confidence intervals, and lift calculation
 * 
 * Based on industry-standard statistical methods used by Klaviyo, Facebook, and Google Optimize
 */

/**
 * Chi-Square Test for Conversion Rates
 * Tests if there's a statistically significant difference between two variants
 * 
 * @param controlVisitors - Number of visitors in control variant
 * @param controlConversions - Number of conversions in control variant
 * @param variantVisitors - Number of visitors in test variant
 * @param variantConversions - Number of conversions in test variant
 * @returns Chi-square statistic and p-value
 */
export function chiSquareTest(
  controlVisitors: number,
  controlConversions: number,
  variantVisitors: number,
  variantConversions: number
): { chiSquare: number; pValue: number; degreesOfFreedom: number } {
  // Validate inputs
  if (controlVisitors <= 0 || variantVisitors <= 0) {
    return { chiSquare: 0, pValue: 1, degreesOfFreedom: 1 };
  }

  // Calculate conversion rates
  const controlRate = controlConversions / controlVisitors;
  const variantRate = variantConversions / variantVisitors;

  // Calculate pooled conversion rate (null hypothesis: rates are equal)
  const totalVisitors = controlVisitors + variantVisitors;
  const totalConversions = controlConversions + variantConversions;
  const pooledRate = totalConversions / totalVisitors;

  // Expected values under null hypothesis
  const expectedControlConversions = controlVisitors * pooledRate;
  const expectedControlNonConversions = controlVisitors * (1 - pooledRate);
  const expectedVariantConversions = variantVisitors * pooledRate;
  const expectedVariantNonConversions = variantVisitors * (1 - pooledRate);

  // Observed values
  const observedControlConversions = controlConversions;
  const observedControlNonConversions = controlVisitors - controlConversions;
  const observedVariantConversions = variantConversions;
  const observedVariantNonConversions = variantVisitors - variantConversions;

  // Chi-square statistic: Σ((observed - expected)² / expected)
  const chiSquare =
    Math.pow(observedControlConversions - expectedControlConversions, 2) /
      expectedControlConversions +
    Math.pow(observedControlNonConversions - expectedControlNonConversions, 2) /
      expectedControlNonConversions +
    Math.pow(observedVariantConversions - expectedVariantConversions, 2) /
      expectedVariantConversions +
    Math.pow(observedVariantNonConversions - expectedVariantNonConversions, 2) /
      expectedVariantNonConversions;

  // Degrees of freedom for 2x2 contingency table = (rows - 1) * (columns - 1) = 1
  const degreesOfFreedom = 1;

  // Calculate p-value using chi-square distribution approximation
  // For df=1, we use a simplified approximation
  const pValue = calculatePValue(chiSquare, degreesOfFreedom);

  return {
    chiSquare,
    pValue,
    degreesOfFreedom,
  };
}

/**
 * Calculate p-value from chi-square statistic
 * Uses approximation for chi-square distribution with df=1
 * 
 * @param chiSquare - Chi-square statistic
 * @param degreesOfFreedom - Degrees of freedom (typically 1 for A/B tests)
 * @returns P-value (0 to 1)
 */
function calculatePValue(chiSquare: number, degreesOfFreedom: number): number {
  if (degreesOfFreedom !== 1) {
    // For df != 1, use more complex calculation
    // Simplified: use normal approximation for large chi-square values
    if (chiSquare > 10) {
      return 0.001; // Very significant
    }
    // Linear interpolation approximation
    return Math.max(0, Math.min(1, 1 - chiSquare / 10));
  }

  // For df=1, use standard chi-square distribution
  // Approximation: p-value ≈ 2 * (1 - Φ(√χ²))
  // Where Φ is the standard normal CDF
  
  // Simplified approximation for chi-square with df=1
  // More accurate than linear interpolation
  const z = Math.sqrt(chiSquare);
  
  // Standard normal CDF approximation (error function)
  const pValue = 2 * (1 - normalCDF(z));
  
  return Math.max(0, Math.min(1, pValue));
}

/**
 * Standard Normal Cumulative Distribution Function (CDF)
 * Approximation using error function
 * 
 * @param z - Z-score
 * @returns Cumulative probability
 */
function normalCDF(z: number): number {
  // Approximation using error function: Φ(z) = 0.5 * (1 + erf(z/√2))
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

/**
 * Error function approximation
 * Uses Abramowitz and Stegun approximation
 * 
 * @param x - Input value
 * @returns Error function value
 */
function erf(x: number): number {
  // Abramowitz and Stegun approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const polynomial = (((a5 * t + a4) * t + a3) * t + a2) * t + a1;
  const y = 1.0 - polynomial * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * Calculate confidence interval for conversion rate
 * Uses Wilson score interval (more accurate than normal approximation for small samples)
 * 
 * @param conversions - Number of conversions
 * @param visitors - Number of visitors
 * @param confidenceLevel - Confidence level (e.g., 0.95 for 95%)
 * @returns Confidence interval
 */
export function calculateConfidenceInterval(
  conversions: number,
  visitors: number,
  confidenceLevel: number = 0.95
): { lower: number; upper: number; rate: number } {
  if (visitors === 0) {
    return { lower: 0, upper: 0, rate: 0 };
  }

  const rate = conversions / visitors;
  const z = getZScore(confidenceLevel);
  const n = visitors;

  // Wilson score interval
  const denominator = 1 + (z * z) / n;
  const center = (rate + (z * z) / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((rate * (1 - rate) + z * z / (4 * n)) / n)) / denominator;

  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    rate,
  };
}

/**
 * Get Z-score for confidence level
 * 
 * @param confidenceLevel - Confidence level (0.80, 0.90, 0.95, 0.99)
 * @returns Z-score
 */
function getZScore(confidenceLevel: number): number {
  // Common Z-scores for confidence levels
  const zScores: Record<number, number> = {
    0.80: 1.282,
    0.90: 1.645,
    0.95: 1.96,
    0.99: 2.576,
  };

  return zScores[confidenceLevel] || 1.96; // Default to 95%
}

/**
 * Calculate lift percentage
 * Lift = ((Variant Rate - Control Rate) / Control Rate) * 100
 * 
 * @param controlRate - Control variant conversion rate
 * @param variantRate - Test variant conversion rate
 * @returns Lift percentage (can be negative)
 */
export function calculateLift(controlRate: number, variantRate: number): number {
  if (controlRate === 0) {
    return variantRate > 0 ? Infinity : 0;
  }

  return ((variantRate - controlRate) / controlRate) * 100;
}

/**
 * Calculate statistical significance result
 * Combines chi-square test, confidence intervals, and lift
 * 
 * @param controlVisitors - Control variant visitors
 * @param controlConversions - Control variant conversions
 * @param variantVisitors - Test variant visitors
 * @param variantConversions - Test variant conversions
 * @param confidenceThreshold - Minimum confidence level (default: 95%)
 * @returns Complete statistical analysis
 */
export function calculateStatisticalSignificance(
  controlVisitors: number,
  controlConversions: number,
  variantVisitors: number,
  variantConversions: number,
  confidenceThreshold: number = 95
): {
  significant: boolean;
  pValue: number;
  confidence: number;
  lift: number;
  controlRate: number;
  variantRate: number;
  controlInterval: { lower: number; upper: number };
  variantInterval: { lower: number; upper: number };
  chiSquare: number;
} {
  // Calculate conversion rates
  const controlRate = controlVisitors > 0 ? controlConversions / controlVisitors : 0;
  const variantRate = variantVisitors > 0 ? variantConversions / variantVisitors : 0;

  // Chi-square test
  const { chiSquare, pValue } = chiSquareTest(
    controlVisitors,
    controlConversions,
    variantVisitors,
    variantConversions
  );

  // Confidence level = (1 - p-value) * 100
  const confidence = (1 - pValue) * 100;

  // Calculate lift
  const lift = calculateLift(controlRate, variantRate);

  // Confidence intervals (95%)
  const controlInterval = calculateConfidenceInterval(controlConversions, controlVisitors, 0.95);
  const variantInterval = calculateConfidenceInterval(variantConversions, variantVisitors, 0.95);

  // Determine if results are significant
  const significant = confidence >= confidenceThreshold && pValue <= (1 - confidenceThreshold / 100);

  return {
    significant,
    pValue,
    confidence,
    lift,
    controlRate,
    variantRate,
    controlInterval: {
      lower: controlInterval.lower,
      upper: controlInterval.upper,
    },
    variantInterval: {
      lower: variantInterval.lower,
      upper: variantInterval.upper,
    },
    chiSquare,
  };
}

/**
 * Determine winner based on statistical significance and lift
 * 
 * @param controlVisitors - Control variant visitors
 * @param controlConversions - Control variant conversions
 * @param variantVisitors - Test variant visitors
 * @param variantConversions - Test variant conversions
 * @param confidenceThreshold - Minimum confidence level (default: 95%)
 * @returns Winner determination result
 */
export function determineWinner(
  controlVisitors: number,
  controlConversions: number,
  variantVisitors: number,
  variantConversions: number,
  confidenceThreshold: number = 95
): {
  winner: "control" | "variant" | "inconclusive";
  reason: string;
  significance: ReturnType<typeof calculateStatisticalSignificance>;
} {
  const significance = calculateStatisticalSignificance(
    controlVisitors,
    controlConversions,
    variantVisitors,
    variantConversions,
    confidenceThreshold
  );

  // If not statistically significant, result is inconclusive
  if (!significance.significant) {
    return {
      winner: "inconclusive",
      reason: `Results are not statistically significant (confidence: ${significance.confidence.toFixed(2)}% < ${confidenceThreshold}%)`,
      significance,
    };
  }

  // If significant, determine winner based on lift
  if (significance.lift > 0) {
    return {
      winner: "variant",
      reason: `Variant is the winner with ${significance.lift.toFixed(2)}% lift (confidence: ${significance.confidence.toFixed(2)}%)`,
      significance,
    };
  } else if (significance.lift < 0) {
    return {
      winner: "control",
      reason: `Control is the winner (variant has ${Math.abs(significance.lift).toFixed(2)}% negative lift)`,
      significance,
    };
  } else {
    return {
      winner: "inconclusive",
      reason: "No significant difference between variants",
      significance,
    };
  }
}

