/* eslint-disable react-hooks/rules-of-hooks -- Playwright's fixture continuation
   parameter is named `use`, which the React hooks rule reads as a hook called
   outside a component. Same directive, same reason, as purchase-decline.spec.ts. */
import { test as base, expect } from "@playwright/test";
import { createLoginableUser, disconnectE2eDb, MEMBER } from "../helpers/db";
import { makeDemo, type Demo } from "./demo";

/** Known-benign console noise (extend deliberately, never wildcard). */
const CONSOLE_ALLOWLIST: RegExp[] = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /third-party cookie/i,
  // The typed-code attach gave up waiting (client cap / dropped connection).
  // The server may well have written the code, so this is not evidence of a
  // failure — and a dev server's first-hit route compile can eat the budget on
  // its own. NARROW ON PURPOSE: the sibling line
  // "[typed-code] attach failed before confirm" means the server DEFINITELY
  // did not write it, and must keep failing the spec. Never widen this to
  // \[typed-code\].
  /\[typed-code\] attach outcome unknown/i,
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
    async ({ page, context, baseURL }, use, testInfo) => {
      // Klaviyo/GTM/GA/Hotjar are all neutered at the source: e2e/lib/env.ts blanks
      // NEXT_PUBLIC_KLAVIYO_COMPANY_ID, NEXT_PUBLIC_ENABLE_PIXEL_TESTING,
      // NEXT_PUBLIC_GTM_ID, NEXT_PUBLIC_GA_ID, NEXT_PUBLIC_ENABLE_GTM_TESTING, and
      // NEXT_PUBLIC_HOTJAR_ID in the server's env, so their loader components no-op for
      // every client (Playwright specs, e2e:env manual sessions, proof mode).
      // Contentsquare is gated the SAME way as of 2026-07-22: its <Script> in
      // src/app/layout.tsx is conditional on NEXT_PUBLIC_CONTENTSQUARE_ID, which
      // e2e/lib/env.ts also blanks, and ContentsquarePageTracker is mounted behind the
      // same check. (This comment previously claimed the tag was HARDCODED and that a
      // browser-edge block was the only available fix — that has been false since the
      // env gate landed; see docs/e2e/gotchas.md "Contentsquare has no env gate".)
      // So this third-party blocklist is now belt-and-suspenders for ALL of them —
      // it still earns its place because a stray .env.local with a real id set would
      // otherwise leak live third-party traffic into a test run. It is
      // context-scoped (not page-scoped) so it also covers popups/
      // page.context().newPage() opened from this same default context, fulfilled
      // empty-but-successful so a script tag or XHR "succeeds" silently rather than
      // erroring.
      await context.route(/klaviyo\.com|contentsquare\.net|hotjar\.(com|io)/, (route) =>
        route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
      );

      const problems: string[] = [];
      const externalCspBlocks: string[] = [];
      const external = process.env.E2E_EXTERNAL === "1";
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" && !CONSOLE_ALLOWLIST.some((rx) => rx.test(m.text()))) {
          const text = m.text();
          // EXTERNAL mode only: a deployed build runs its real tracking config, and some
          // third-party beacons are CSP-blocked BY DESIGN — csp.ts:55-58 documents the
          // *.on.aws/*.run.app Contentsquare-module collectors as deliberately NOT
          // allowlisted. A blocked third-party collector is a product/config signal about
          // the deployed site, not a failure of the page under test — record it as a
          // report annotation (visible per-test in the HTML report, never silently
          // dropped) instead of failing every page-loading spec. Same-origin CSP
          // violations still fail: our own script/asset being refused (e.g. a nonce
          // regression) is OUR bug, exactly what the watchdog exists to catch.
          if (
            external &&
            /Content Security Policy/i.test(text) &&
            !(baseURL && text.includes(new URL(baseURL).origin))
          ) {
            externalCspBlocks.push(text.slice(0, 300));
            return;
          }
          // Hydration errors get a longer cap: React 19's per-element diff (which names
          // the mismatching element) runs past 300 chars, so the default cap was cutting
          // it off before the culprit element ever showed up in failure output. Everything
          // else keeps the 300-char cap so failure output stays readable.
          const cap = /hydrat/i.test(text) ? 2000 : 300;
          problems.push(`console.error: ${text.slice(0, cap)}`);
        }
      });
      page.on("response", (r) => {
        if (baseURL && r.url().startsWith(baseURL) && r.status() >= 500) {
          problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
        }
      });
      await use();
      for (const block of [...new Set(externalCspBlocks)]) {
        testInfo.annotations.push({ type: "external-csp-block", description: block });
      }
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
