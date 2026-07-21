import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3799);
const PROOF = process.env.E2E_PROOF === "1";

export default defineConfig({
  testDir: "./e2e/specs",
  outputDir: "./e2e-artifacts/test-results",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: true,
  retries: PROOF ? 0 : 1,
  workers: PROOF ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./e2e-artifacts/report", open: "never" }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: PROOF ? "on" : "retain-on-failure",
    launchOptions: PROOF ? { slowMo: 200 } : {},
  },
  projects: [
    { name: "setup", testDir: "./e2e/setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
      dependencies: ["setup"],
    },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] }, dependencies: ["setup"] },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] }, dependencies: ["setup"] },
  ],
});
