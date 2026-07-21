import assert from "node:assert";
import { dbNameOf, assertE2eSafety } from "../env";

let failed = 0;
function t(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

t("dbNameOf parses standard uri", () =>
  assert.equal(dbNameOf("mongodb://localhost:27017/tools-e2e?retryWrites=true"), "tools-e2e"));
t("dbNameOf parses srv uri", () =>
  assert.equal(dbNameOf("mongodb+srv://u:p@cluster.mongodb.net/toolsaustralia-e2e?w=majority"), "toolsaustralia-e2e"));
t("dbNameOf handles missing db", () =>
  assert.equal(dbNameOf("mongodb://localhost:27017"), ""));

t("guard: rejects unset e2e uri", () =>
  assert.throws(() => assertE2eSafety("mongodb://x/main", undefined), /E2E_MONGODB_URI is not set/));
t("guard: rejects equal uris", () =>
  assert.throws(() => assertE2eSafety("mongodb://x/db-e2e", "mongodb://x/db-e2e"), /equals MONGODB_URI/));
t("guard: rejects db name without e2e", () =>
  assert.throws(() => assertE2eSafety("mongodb://x/main", "mongodb://x/production"), /does not contain 'e2e'/));
t("guard: accepts valid separate e2e db", () =>
  assert.doesNotThrow(() => assertE2eSafety("mongodb://x/main", "mongodb://x/tools-e2e")));
t("guard: accepts E2E uppercase in name", () =>
  assert.doesNotThrow(() => assertE2eSafety("mongodb://x/main", "mongodb://x/Tools-E2E")));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("env guard tests passed");
