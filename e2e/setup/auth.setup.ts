import fs from "node:fs";
import { test as setup } from "@playwright/test";
import { loginViaUi } from "../helpers/session";
import { MEMBER, ADMIN } from "../helpers/db";
import { AUTH_DIR, MEMBER_STATE, ADMIN_STATE } from "../lib/paths";

setup.setTimeout(120_000);

// Dedicated synthetic IP for the setup project's own bucket on the credentials
// sign-in rate limiter (5/min per IP — see e2e/fixtures/test.ts for the full
// rationale). Member + admin logins here total 2 requests, well under the cap.
setup.use({ extraHTTPHeaders: { "x-forwarded-for": "10.77.250.1" } });

setup.beforeAll(() => fs.mkdirSync(AUTH_DIR, { recursive: true }));

setup("authenticate member", async ({ page }) => {
  await loginViaUi(page, MEMBER.email, MEMBER.password);
  await page.context().storageState({ path: MEMBER_STATE });
});

setup("authenticate admin", async ({ page }) => {
  // /admin is Turbopack-cold on the first hit of a fresh e2e run (server.log showed
  // a ~22s compile). The default 20s redirect wait can lose that race, so give the
  // admin sign-in redirect more room.
  await loginViaUi(page, ADMIN.email, ADMIN.password, { redirectTimeoutMs: 60_000 });
  await page.context().storageState({ path: ADMIN_STATE });
});
