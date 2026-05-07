// e2e/global-teardown.ts — runs once after all specs.

import { execSync } from "node:child_process";
import { FullConfig } from "@playwright/test";

export default async function globalTeardown(_config: FullConfig) {
  if (process.env.E2E_KEEP_FIXTURES === "true") {
    console.log("⏭  globalTeardown: E2E_KEEP_FIXTURES=true — skipping cleanup");
    return;
  }
  console.log("🧹 globalTeardown: cleaning up E2E fixtures");
  try {
    execSync("npm run cleanup:e2e", { stdio: "inherit" });
  } catch (err) {
    console.error(
      "⚠️  Cleanup failed; data may persist. Run `npm run cleanup:e2e` manually.",
      err,
    );
  }
}
