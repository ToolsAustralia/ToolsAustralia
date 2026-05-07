// e2e/fixtures/affiliate-auth.setup.ts
//
// Creates one storageState per worker for the affiliate role. The form uses
// input[name="username"] (NOT email); username is auto-lowercased server-side;
// seed creates "affiliate-e2e-w<N>" lowercase per worker.
import { test as setup } from "@playwright/test";
import path from "path";
import fs from "fs";
import { E2E_USER_PASSWORD, workerCount } from "./test-users";

const AUTH_DIR = path.join(__dirname, "../.auth");
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const WORKERS = workerCount();

for (let w = 0; w < WORKERS; w++) {
  setup(`authenticate affiliate w${w}`, async ({ page, context }) => {
    if (!E2E_USER_PASSWORD) {
      setup.skip(true, "E2E_TEST_USER_PASSWORD not set — skipping affiliate specs");
      return;
    }
    const username = `affiliate-e2e-w${w}`; // matches seedAffiliate() in scripts/seed-e2e-fixtures.ts
    await page.goto("/affiliate/login");
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', E2E_USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/affiliate");
    await context.storageState({
      path: path.join(AUTH_DIR, `affiliate-w${w}.json`),
    });
  });
}
