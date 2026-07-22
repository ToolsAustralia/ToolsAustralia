import fs from "node:fs";
import { test as setup, expect } from "@playwright/test";
import { loginViaUi } from "../helpers/session";
import { MEMBER, ADMIN } from "../helpers/db";
import { AUTH_DIR, MEMBER_STATE, ADMIN_STATE } from "../lib/paths";

setup.setTimeout(180_000);

// Dedicated synthetic IP for the setup project's own bucket on the credentials
// sign-in rate limiter (5/min per IP — see e2e/fixtures/test.ts for the full
// rationale). Member + admin logins here total 2 requests, well under the cap.
setup.use({ extraHTTPHeaders: { "x-forwarded-for": "10.77.250.1" } });

setup.beforeAll(() => fs.mkdirSync(AUTH_DIR, { recursive: true }));

// Third-party blocklist — this setup project imports plain @playwright/test (not
// ../fixtures/test), so the `watchdog` fixture's context.route blocklist there never runs
// here. Without it, the 2 logins below plus the /admin warm-up would fetch live
// Contentsquare (hardcoded <Script>, not env-gated — see e2e/fixtures/test.ts's comment on
// its own `watchdog` fixture for the full rationale). Copied verbatim from
// e2e/fixtures/test.ts, which remains the source of truth — keep the two in sync.
setup.beforeEach(async ({ context }) => {
  await context.route(/klaviyo\.com|contentsquare\.net|hotjar\.(com|io)/, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
  );
});

setup("authenticate member", async ({ page }) => {
  await loginViaUi(page, MEMBER.email, MEMBER.password);
  await page.context().storageState({ path: MEMBER_STATE });
});

setup("authenticate admin", async ({ page }) => {
  // /admin is Turbopack-cold on the first hit of a fresh e2e run (server.log showed
  // a ~22s compile). The default 20s redirect wait can lose that race, so give the
  // admin sign-in redirect more room.
  await loginViaUi(page, ADMIN.email, ADMIN.password, { redirectTimeoutMs: 60_000 });
  // Explicitly warm /admin itself before saving storage state: later admin specs
  // (Task 8) hit /admin with a much tighter 20s expectation, which would lose the
  // same cold-compile race on a freshly booted server if /admin's first-ever
  // compile happened during their run instead of here.
  await page.goto("/admin", { timeout: 120_000 });
  await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });
  await page.context().storageState({ path: ADMIN_STATE });
});
