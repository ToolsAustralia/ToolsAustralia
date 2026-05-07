// e2e/global-setup.ts — runs once before any spec.
// Validates env, then invokes the seed script via tsx as a subprocess so
// we don't double-import models/Mongo connections in this process.

import { execSync } from "node:child_process";
import { FullConfig } from "@playwright/test";

const REQUIRED_VARS = [
  "MONGODB_URI",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "E2E_TEST_USER_PASSWORD",
  "STRIPE_PRICE_ID_TRADIE",
  "STRIPE_PRICE_ID_FOREMAN",
  "STRIPE_PRICE_ID_BOSS",
] as const;

export default async function globalSetup(_config: FullConfig) {
  // CI escape hatch: skip silently if Stripe price IDs are absent (PR from fork).
  if (process.env.CI === "true" && !process.env.STRIPE_PRICE_ID_TRADIE) {
    console.warn(
      "⚠️  CI=true and STRIPE_PRICE_ID_TRADIE absent — skipping seed (likely a fork PR).",
    );
    return;
  }

  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `❌ Missing required env vars for E2E:\n  - ${missing.join("\n  - ")}\n` +
        `Add them to .env.local. See .env.local.example.`,
    );
  }

  // Escape hatch: if E2E_KEEP_FIXTURES=true, skip the (slow) seed pass — assume
  // the caller has already seeded recently. globalTeardown also honours this
  // flag and skips cleanup; together they let you iterate on a single spec
  // without paying the 60-90s seed cost on every run.
  if (process.env.E2E_KEEP_FIXTURES === "true") {
    console.log("⏭  globalSetup: E2E_KEEP_FIXTURES=true — skipping seed");
    return;
  }

  console.log("🌱 globalSetup: seeding E2E fixtures (this can take ~10-15s)");
  execSync("npm run seed:e2e", { stdio: "inherit" });
}
