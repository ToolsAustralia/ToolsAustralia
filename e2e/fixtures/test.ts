import { test as base, expect } from "@playwright/test";
import { createLoginableUser, disconnectE2eDb, MEMBER } from "../helpers/db";
import { makeDemo, type Demo } from "./demo";

/** Known-benign console noise (extend deliberately, never wildcard). */
const CONSOLE_ALLOWLIST: RegExp[] = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /third-party cookie/i,
];

type Fixtures = {
  watchdog: void;
  freshUser: () => Promise<{ id: string; email: string; password: string }>;
  demo: Demo;
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
    async ({ page, context, baseURL }, use) => {
      // Klaviyo/GTM/GA/Hotjar are all neutered at the source: e2e/lib/env.ts blanks
      // NEXT_PUBLIC_KLAVIYO_COMPANY_ID, NEXT_PUBLIC_ENABLE_PIXEL_TESTING,
      // NEXT_PUBLIC_GTM_ID, NEXT_PUBLIC_GA_ID, NEXT_PUBLIC_ENABLE_GTM_TESTING, and
      // NEXT_PUBLIC_HOTJAR_ID in the server's env, so their loader components no-op for
      // every client (Playwright specs, e2e:env manual sessions, proof mode).
      // Contentsquare has no such gate — its <Script> in src/app/layout.tsx:132-136 is
      // HARDCODED with a fixed src and no env-conditional `disabled` prop, so the env
      // overlay cannot neuter it; a browser-edge block is the only fix available at
      // e2e scope. This third-party blocklist is belt-and-suspenders for Klaviyo/GTM/GA
      // (already neutered upstream) and the ONLY fix for Contentsquare/Hotjar-by-
      // Contentsquare: context-scoped (not page-scoped) so it also covers popups/
      // page.context().newPage() opened from this same default context, fulfilled
      // empty-but-successful so a script tag or XHR "succeeds" silently rather than
      // erroring.
      await context.route(/klaviyo\.com|contentsquare\.net|hotjar\.(com|io)/, (route) =>
        route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
      );

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

  // Proof mode narration — plain `test.step` outside E2E_PROOF (zero overhead, see demo.ts).
  demo: async ({ page }, use, testInfo) => {
    const { demo, flush } = makeDemo(page, testInfo);
    await use(demo);
    flush();
  },
});

export { expect };
