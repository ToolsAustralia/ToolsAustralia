/**
 * Guards the sentinel registry that BOTH the attribution logic and the admin UI read.
 *
 * Two things must stay true or the admin dashboard lies:
 *   1. `isNonConversionSentinelExperiment` mirrors `attributionRank`'s `.every(...)` test.
 *      If the UI's idea of "sentinel" ever diverges from attribution's, the dashboard
 *      either hides panels for an experiment that DOES earn conversions, or shows a
 *      guaranteed-zero chi-square for one that does not.
 *   2. A MIXED target list is NOT a sentinel. Such an experiment still earns real
 *      attribution, so it must keep its legacy panels.
 *
 * Context: `__promo-theme__` was the first sentinel-targeted experiment ever run in
 * production (all 16 prior ones used a wildcard or real slugs). Its legacy conversion
 * panel read 0 with a NaN chi-square, rendering a red "0.00% Decline vs control" directly
 * beneath a Bayesian card reporting a 97% chance to win. See docs/ab-testing/gotchas.md.
 */
import assert from "node:assert/strict";
import {
  NON_CONVERSION_SENTINEL_SLUGS,
  isNonConversionSentinelExperiment,
} from "../non-conversion-sentinels";
import { PROMO_THEME_SLUG } from "../promo-theme-slug";

function run() {
  // 1. Both known sentinels are registered.
  assert.ok(NON_CONVERSION_SENTINEL_SLUGS.has("__membership-theme__"), "membership sentinel registered");
  assert.ok(NON_CONVERSION_SENTINEL_SLUGS.has(PROMO_THEME_SLUG), "promo theme sentinel registered");
  assert.equal(PROMO_THEME_SLUG, "__promo-theme__", "sentinel literal must not drift");

  // 2. A pure sentinel target list IS a sentinel experiment.
  assert.equal(isNonConversionSentinelExperiment([PROMO_THEME_SLUG]), true);
  assert.equal(isNonConversionSentinelExperiment(["__membership-theme__"]), true);
  assert.equal(
    isNonConversionSentinelExperiment(["__membership-theme__", PROMO_THEME_SLUG]),
    true,
    "all-sentinel list is still a sentinel experiment"
  );

  // 3. Real slugs are NOT — these earn attribution and keep their legacy panels.
  assert.equal(isNonConversionSentinelExperiment(["milwaukee-gearwrench"]), false);
  assert.equal(isNonConversionSentinelExperiment(["*"]), false, "wildcard is not a sentinel");

  // 4. THE IMPORTANT ONE: a MIXED list is not a sentinel. `attributionRank` uses
  //    `.every(...)`, so a mixed list ranks 0 and DOES take the purchase stamp — hiding
  //    its panels would hide real data.
  assert.equal(
    isNonConversionSentinelExperiment([PROMO_THEME_SLUG, "milwaukee-gearwrench"]),
    false,
    "mixed target list must NOT be treated as a sentinel"
  );

  // 5. Degenerate inputs never claim sentinel status.
  assert.equal(isNonConversionSentinelExperiment([]), false, "empty list is not a sentinel");
  assert.equal(isNonConversionSentinelExperiment(undefined), false, "undefined is not a sentinel");

  console.log("nonConversionSentinels: all assertions passed");
}

run();
