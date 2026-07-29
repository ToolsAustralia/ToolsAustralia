import assert from "node:assert/strict";
import { buildActiveExperimentQuery } from "../ExperimentRepository";

function run() {
  const now = new Date("2026-07-28T00:00:00.000Z");

  // Page-targeted lookups still match a wildcard experiment — existing behaviour.
  const page = buildActiveExperimentQuery("milwaukee-gearwrench", { allowWildcard: true }, now);
  assert.deepEqual(
    page.slugTargets,
    { $in: ["milwaukee-gearwrench", "*"] },
    "page lookup keeps wildcard matching",
  );

  // Sentinel lookups must NOT match "*", or a wildcard experiment hijacks the
  // sentinel: findOne would return it, and the theme gate would bake its id.
  const sentinel = buildActiveExperimentQuery("__promo-theme__", { allowWildcard: false }, now);
  assert.deepEqual(sentinel.slugTargets, "__promo-theme__", "sentinel lookup is exact match");
  assert.equal(
    JSON.stringify(sentinel).includes('"*"'),
    false,
    "sentinel query must contain no wildcard anywhere",
  );

  assert.equal(page.status, "active", "only active experiments match");
  assert.equal(sentinel.status, "active", "only active experiments match");

  console.log("experimentQuery: all assertions passed");
}

run();
