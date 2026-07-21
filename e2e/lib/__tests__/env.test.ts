import assert from "node:assert";
import { dbNameOf, assertE2eSafety, resolveE2eEnv } from "../env";

let failed = 0;
function t(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  try {
    Object.assign(process.env, vars);
    fn();
  } finally {
    Object.assign(process.env, saved);
  }
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
t("guard ignores e2e in hostname", () =>
  assert.throws(() => assertE2eSafety("mongodb://x/main", "mongodb+srv://u@cluster-e2e.mongodb.net/production"), /does not contain 'e2e'/));

t("resolveE2eEnv refuses live Stripe key", () =>
  withEnv({ E2E_MONGODB_URI: "mongodb://x/tools-e2e", MONGODB_URI: "mongodb://x/main", STRIPE_SECRET_KEY: "sk_live_abc" }, () =>
    assert.throws(() => resolveE2eEnv(), /not a test-mode key/)));

t("resolveE2eEnv builds the overlay", () =>
  withEnv({ STRIPE_SECRET_KEY: "sk_test_abc", E2E_MONGODB_URI: "mongodb://x/tools-e2e", E2E_PORT: "" }, () => {
    const env = resolveE2eEnv();
    assert.equal(env.port, 3799);
    assert.equal(env.baseUrl, "http://localhost:3799");
    assert.equal(env.mongoUri, "mongodb://x/tools-e2e");
    assert.equal(env.overlay.MONGODB_URI, "mongodb://x/tools-e2e");
    assert.equal(env.overlay.PORT, "3799");
    assert.equal(env.overlay.NEXTAUTH_URL, env.baseUrl);
    assert.equal(env.overlay.NEXT_PUBLIC_API_URL, "http://localhost:3799");
  }));

t("resolveE2eEnv neuters third parties", () =>
  withEnv({ STRIPE_SECRET_KEY: "sk_test_abc", E2E_MONGODB_URI: "mongodb://x/tools-e2e", E2E_PORT: "" }, () => {
    const env = resolveE2eEnv();
    assert.equal(env.overlay.KLAVIYO_ENABLED, "false");
    assert.equal(env.overlay.SENDGRID_API_KEY, "");
    assert.equal(env.overlay.FACEBOOK_ACCESS_TOKEN, "");
    assert.equal(env.overlay.NEXT_PUBLIC_FACEBOOK_PIXEL_ID, "");
    assert.equal(env.overlay.TIKTOK_ACCESS_TOKEN, "");
    assert.equal(env.overlay.NEXT_PUBLIC_TIKTOK_PIXEL_ID, "");
    assert.equal(env.overlay.NEXT_PUBLIC_ENABLE_PIXEL_TESTING, "");
    assert.equal(env.overlay.NEXT_PUBLIC_KLAVIYO_COMPANY_ID, "");
  }));

t("resolveE2eEnv threads webhook secret", () =>
  withEnv({ STRIPE_SECRET_KEY: "sk_test_abc", E2E_MONGODB_URI: "mongodb://x/tools-e2e", E2E_PORT: "" }, () => {
    const env = resolveE2eEnv({ webhookSecret: "whsec_x" });
    assert.equal(env.overlay.STRIPE_WEBHOOK_SECRET, "whsec_x");
  }));

t("resolveE2eEnv enforces the guard", () =>
  withEnv({ STRIPE_SECRET_KEY: "sk_test_abc", E2E_MONGODB_URI: "mongodb://x/production", MONGODB_URI: "mongodb://x/main" }, () =>
    assert.throws(() => resolveE2eEnv(), /does not contain 'e2e'/)));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("env guard tests passed");
