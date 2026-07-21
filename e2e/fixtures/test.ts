import { test as base, expect } from "@playwright/test";
import { createLoginableUser, disconnectE2eDb, MEMBER } from "../helpers/db";

/** Known-benign console noise (extend deliberately, never wildcard). */
const CONSOLE_ALLOWLIST: RegExp[] = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /third-party cookie/i,
];

type Fixtures = {
  watchdog: void;
  freshUser: () => Promise<{ id: string; email: string; password: string }>;
};

export const test = base.extend<Fixtures>({
  // Each Playwright worker gets its own synthetic client IP so the credentials
  // sign-in rate limiter (src/app/api/auth/[...nextauth]/route.ts: 5/min per IP,
  // identifier from x-real-ip / x-forwarded-for — src/utils/security/rateLimiter.ts
  // getClientIdentifier) buckets each worker independently instead of every
  // worker colliding on the shared loopback IP. The limiter itself stays fully
  // active (no src change); this only fans it out across workers.
  extraHTTPHeaders: async ({}, use, testInfo) => {
    await use({
      "x-forwarded-for": `10.77.${testInfo.workerIndex % 250}.${(testInfo.parallelIndex ?? 0) % 250 + 1}`,
    });
  },

  // QA watchdog — the automatic expert eye on console + network (spec §10).
  watchdog: [
    async ({ page, baseURL }, use) => {
      // NEXT_PUBLIC_ENABLE_PIXEL_TESTING=true in .env.local keeps Klaviyo's
      // client script live even in dev (deliberate, for manual pixel testing —
      // see src/app/layout.tsx:149-152), so it fires real XHRs to a.klaviyo.com
      // in this environment and throws real CORS/pageerror noise. Neutralize the
      // leak at the network layer (fulfill with an empty, successful response so
      // window.klaviyo/_klOnsite never initialize and no downstream code path
      // calls out) rather than allowlisting the resulting console/pageerror text
      // — the watchdog is right to treat an unhandled leak as a real problem.
      await page.route(/klaviyo\.com/, (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "" }));

      const problems: string[] = [];
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" && !CONSOLE_ALLOWLIST.some((rx) => rx.test(m.text()))) {
          problems.push(`console.error: ${m.text().slice(0, 300)}`);
        }
      });
      page.on("response", (r) => {
        if (baseURL && r.url().startsWith(baseURL) && r.status() >= 500) {
          problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
        }
      });
      await use();
      if (problems.length) {
        throw new Error(`QA watchdog caught ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
      }
    },
    { auto: true },
  ],

  // Worker-safe factory for mutating specs (spec §5): unique per worker + run.
  freshUser: async ({}, use, testInfo) => {
    let n = 0;
    const runId = process.env.E2E_RUN_ID || "dev";
    await use(async () => {
      n++;
      const email = `e2e+w${testInfo.workerIndex}-${runId}-${n}@e2e.local`;
      const created = await createLoginableUser({ email, password: MEMBER.password });
      return { ...created, password: MEMBER.password };
    });
    await disconnectE2eDb();
  },
});

export { expect };
