// e2e/fixtures/auth.setup.ts
//
// Generates one storageState file per (role, worker) pair so that each
// Playwright worker authenticates as ITS OWN seeded user. Without this,
// every worker would share `<role>-w0`'s storage and resetUser(role) — which
// resolves the worker's own user — would target the wrong document.
//
// The seed script must have created users for all (role, worker) pairs (it
// does — see scripts/seed-e2e-fixtures.ts which loops `for w in 0..workerCount()`).
import { test as setup } from "@playwright/test";
import path from "path";
import fs from "fs";
import {
  emailFor,
  E2E_USER_PASSWORD,
  workerCount,
  type Role,
} from "./test-users";

const AUTH_DIR = path.join(__dirname, "../.auth");
const ROLES: Exclude<Role, "guest" | "affiliate">[] = [
  "fresh",
  "tradie",
  "foreman",
  "boss",
  "cancelling",
  "pastdue",
];

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const WORKERS = workerCount();

for (const role of ROLES) {
  for (let w = 0; w < WORKERS; w++) {
    setup(`authenticate ${role} w${w}`, async ({ page, context }) => {
      if (!E2E_USER_PASSWORD) {
        setup.skip(true, "E2E_TEST_USER_PASSWORD not set — skipping authenticated specs");
        return;
      }
      const email = emailFor(role, w);
      await page.goto("/login");
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', E2E_USER_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL("/my-account");
      await context.storageState({
        path: path.join(AUTH_DIR, `${role}-w${w}.json`),
      });
    });
  }
}
