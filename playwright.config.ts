import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

// Load .env.local so global-setup, fixtures, and specs see the same vars the
// dev server does. node --env-file works at the CLI but specs reach this
// config file directly when running `npx playwright test`, so we need an
// explicit load here too.
loadDotenv({ path: path.resolve(process.cwd(), ".env.local") });

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
    headless: true,
    launchOptions: {
      slowMo: process.env.PLAYWRIGHT_SLOW_MO
        ? Number(process.env.PLAYWRIGHT_SLOW_MO)
        : 0,
    },
  },
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 4,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    // Setup projects build storageState files. Run once; member projects depend on them.
    {
      name: "setup-shared",
      testMatch: /fixtures\/auth\.setup\.ts/,
    },
    {
      name: "setup-affiliate",
      testMatch: /fixtures\/affiliate-auth\.setup\.ts/,
    },

    // Guest project — anything under e2e/* that does NOT need auth.
    // NOTE: auth specs that REQUIRE authentication (logout, user-setup-modal) are
    // explicitly excluded here and matched by chromium-fresh instead.
    {
      name: "chromium-guest",
      testMatch: /(?:auth\/(?:login|forgot-password|reset-password|register|email-verification|existing-account)\.spec\.ts|affiliate\/login\.spec\.ts|(?:contact|consent|navigation|url-params|promo)\/[^/]+\.spec\.ts|banners-widgets\/(?:freeze-period-banner|floating-countdown-mode|floating-promo-page-aware)\.spec\.ts|partner\/application-form\.spec\.ts|referrals\/signup-with-ref\.spec\.ts|shop\/(?:guest-checkout|cart-persistence|out-of-stock|three-ds|cart-icon-badge|browse-filter|brand-page)\.spec\.ts|draws\/(?:major\/(?:view|countdown|countdown-banner|gate-closed|past|entry-guest|winners)|mini\/(?:list|stock))\.spec\.ts|global-ui\/(?:cart-drawer|search-overlay)\.spec\.ts)/,
      use: { ...devices["Desktop Chrome"] },
    },

    // Per-role authenticated projects. Each spec opts in via testMatch glob.
    {
      name: "chromium-fresh",
      testMatch: /(?:auth\/(?:logout|user-setup-modal)\.spec\.ts|(?:account|toasts|modal-queue|upsells)\/[^/]+\.spec\.ts|banners-widgets\/rewards-widget-spotlight\.spec\.ts|global-ui\/top-bar-dismiss\.spec\.ts|referrals\/(?:refer-modal|copy-code-link|refer-reward-modal)\.spec\.ts|membership\/(?:join|special-packages|benefits)\.spec\.ts|shop\/(?:member-checkout|my-account-orders|member-discount|order-detail)\.spec\.ts|rewards\/(?:widget-visibility|catalog|redeem-code|claim-redeemable|milestone-toast)\.spec\.ts|draws\/(?:major\/past-draws|mini\/(?:purchase|success|promo-applied))\.spec\.ts|partner\/eligibility\.spec\.ts)/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup-shared"],
    },
    {
      name: "chromium-tradie",
      testMatch: /(?:membership\/(upgrade|cancel|cancel-upsell-redeem|explainer-modal)\.spec\.ts|partner\/(discounts-view|discount-applied)\.spec\.ts|global-ui\/membership-badge\.spec\.ts)/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup-shared"],
    },
    {
      name: "chromium-foreman",
      testMatch: /membership\/downgrade\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup-shared"],
    },
    // chromium-boss removed: the only spec that previously matched it was
    // membership/downgrade.spec.ts, which calls resetUser("foreman") at line 19.
    // Running it as boss-w<N> meant the storage state was for boss but the
    // reset/UI assertions were for foreman — guaranteed mismatch. If a true
    // downgrade-from-boss spec is needed, add it as its own file and re-add
    // a chromium-boss project pointing at that file.
    {
      name: "chromium-cancelling",
      testMatch: /membership\/resume\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup-shared"],
    },
    {
      name: "chromium-pastdue",
      testMatch: /membership\/(renewal-failed|update-payment-method)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup-shared"],
    },
    {
      name: "chromium-affiliate",
      testMatch: /(?:affiliate\/(?!login\.spec\.ts$)[^/]+\.spec\.ts|global-ui\/affiliate-mode-header\.spec\.ts)/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup-affiliate"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: E2E_BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
