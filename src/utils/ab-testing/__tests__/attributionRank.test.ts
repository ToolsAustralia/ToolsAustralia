import assert from "node:assert/strict";
import { attributionRank, NON_CONVERSION_SENTINEL_SLUGS } from "../get-user-experiment-assignment";

function run() {
  assert.equal(attributionRank(["milwaukee-gearwrench"]), 0, "page-targeted ranks highest");
  assert.equal(attributionRank(["*"]), 1, "wildcard ranks below page-targeted");
  assert.equal(attributionRank(["__membership-theme__"]), 2, "known sentinel is excluded");

  // Without this, the theme test outranks real promo experiments and steals the
  // single purchase stamp — the co-running slug experiment's legacy conversion
  // and revenue panels silently read zero.
  assert.equal(attributionRank(["__promo-theme__"]), 2, "promo theme sentinel is excluded");
  assert.ok(
    NON_CONVERSION_SENTINEL_SLUGS.has("__promo-theme__"),
    "promo theme sentinel is registered",
  );

  console.log("attributionRank: all assertions passed");
}

run();
