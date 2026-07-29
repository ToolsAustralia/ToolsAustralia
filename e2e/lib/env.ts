import path from "node:path";
import { config as loadDotenv } from "dotenv";

export interface E2eEnv {
  port: number;
  baseUrl: string;
  mongoUri: string;
  overlay: NodeJS.ProcessEnv;
}

export function dbNameOf(uri: string): string {
  const m = uri.match(/^[a-z+]+:\/\/[^/]+\/([^?]*)/i);
  return m?.[1] ?? "";
}

export function assertE2eSafety(mainUri: string | undefined, e2eUri: string | undefined): void {
  if (!e2eUri) {
    throw new Error(
      "E2E_MONGODB_URI is not set — refusing to run. Add it to .env.local (a dedicated database whose name contains 'e2e')."
    );
  }
  if (mainUri && e2eUri === mainUri) {
    throw new Error("E2E_MONGODB_URI equals MONGODB_URI — refusing to run against the main database.");
  }
  const db = dbNameOf(e2eUri);
  if (!db.toLowerCase().includes("e2e")) {
    throw new Error(
      `E2E database name "${db}" does not contain 'e2e' — refusing. This suite WIPES its database on every run.`
    );
  }
}

export function resolveE2eEnv(opts: { webhookSecret?: string } = {}): E2eEnv {
  loadDotenv({ path: path.resolve(process.cwd(), ".env.local") });
  const mainUri = process.env.MONGODB_URI;
  const e2eUri = process.env.E2E_MONGODB_URI;
  assertE2eSafety(mainUri, e2eUri);

  const sk = process.env.STRIPE_SECRET_KEY || "";
  if (!sk.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY is not a test-mode key (sk_test_...) — refusing to run e2e.");
  }

  const port = Number(process.env.E2E_PORT || 3799);
  const baseUrl = `http://localhost:${port}`;
  const overlay: NodeJS.ProcessEnv = {
    ...process.env,
    MONGODB_URI: e2eUri!,
    PORT: String(port),
    NEXTAUTH_URL: baseUrl,
    // Client-side apiGet base (src/lib/queries.ts) — .env.local points it at the dev port, must follow the e2e port.
    NEXT_PUBLIC_API_URL: baseUrl,
    // Third parties — all verified to no-op when disabled/blank:
    KLAVIYO_ENABLED: "false",
    SENDGRID_API_KEY: "",
    FACEBOOK_ACCESS_TOKEN: "",
    NEXT_PUBLIC_FACEBOOK_PIXEL_ID: "",
    // Facebook/Meta MARKETING API creds — distinct from FACEBOOK_ACCESS_TOKEN above (that
    // one is the client-facing Conversions API token). These are read SERVER-SIDE by the
    // admin dashboard's live "today" stats path (DashboardStatsSnapshotReader ->
    // AD_CHANNEL_PROVIDERS -> adChannelProviders.ts's facebookAdChannelProvider ->
    // fetchFacebookInsights) whenever an admin views a date range that includes today.
    // A browser-side route blocklist (e2e/fixtures/test.ts) cannot intercept this — it's a
    // server-to-server fetch to graph.facebook.com that never touches the Playwright
    // browser context. Blanking the creds makes adChannelProviders.ts's own
    // `if (!adAccountId || !accessToken)` guard (adChannelProviders.ts:55) short-circuit to
    // status "error" (preserve-prior-value) before any network call is attempted.
    FACEBOOK_MARKETING_ACCESS_TOKEN: "",
    FACEBOOK_AD_ACCOUNT_ID: "",
    // TikTok Marketing API sibling of the pair above — same server-side-only exposure.
    // Read by src/services/admin/tiktok/tiktokHourlySpend.ts (hourly ad-spend used by
    // src/services/admin/hourlyRevenueByPlatform.ts, behind
    // /api/admin/analytics/hourly-revenue) and tiktokAdInsights.ts (behind
    // /api/admin/tiktok-ads/insights). Both no-op on a blank advertiser id / token
    // (tiktokHourlySpend.ts:36: `if (!advertiserId || !token) return null`).
    TIKTOK_ACCESS_TOKEN: "",
    NEXT_PUBLIC_TIKTOK_PIXEL_ID: "",
    TIKTOK_MARKETING_ACCESS_TOKEN: "",
    TIKTOK_ADVERTISER_ID: "",
    // Client-side pixels: .env.local sets NEXT_PUBLIC_ENABLE_PIXEL_TESTING=true for
    // manual local pixel testing, which force-enables KlaviyoScriptLoader AND
    // ConversionPixels in dev (src/app/layout.tsx:147,151: `disabled={NODE_ENV ===
    // "development" && !NEXT_PUBLIC_ENABLE_PIXEL_TESTING}`). Blank it here so e2e gets
    // the normal dev-disabled behavior, and blank the Klaviyo company id too (belt and
    // suspenders — KlaviyoScriptLoader also no-ops without a companyId).
    NEXT_PUBLIC_ENABLE_PIXEL_TESTING: "",
    NEXT_PUBLIC_KLAVIYO_COMPANY_ID: "",
    // GTM: same shape as the Klaviyo pair above — .env.local sets
    // NEXT_PUBLIC_ENABLE_GTM_TESTING=true for manual local testing, which force-enables
    // GoogleTagManager in dev (src/app/layout.tsx:143: `disabled={NODE_ENV ===
    // "development" && !NEXT_PUBLIC_ENABLE_GTM_TESTING}`), and a real NEXT_PUBLIC_GTM_ID
    // then loads the real GTM container — firing real GA hits and sandboxed tag iframes
    // into every e2e browser. GoogleTagManager also no-ops without a gtmId
    // (src/components/GoogleTagManager.tsx:38: `if (disabled || !gtmId) return null`), so
    // blanking the id alone is sufficient; blank all three (belt and suspenders).
    NEXT_PUBLIC_ENABLE_GTM_TESTING: "",
    NEXT_PUBLIC_GTM_ID: "",
    NEXT_PUBLIC_GA_ID: "",
    // Hotjar: no component in src/ currently reads this var directly (grepped — the only
    // Hotjar surface is a dead GTM custom-HTML tag, already neutralized via the
    // 'gtm.blocklist' in src/utils/security/inline-snippets.ts:48-56, and moot once GTM
    // itself is blanked above). Blanked here anyway as registry hygiene — a session
    // recorder must never run against e2e traffic if a loader is added later.
    NEXT_PUBLIC_HOTJAR_ID: "",
    // Contentsquare: now env-gated at the source (src/app/layout.tsx no-ops on a blank
    // NEXT_PUBLIC_CONTENTSQUARE_ID, same pattern as GoogleTagManager). Blanked here too —
    // belt-and-suspenders with the source gate, same as every other pair above — even
    // though the browser-edge blocklist (e2e/fixtures/test.ts, e2e/setup/auth.setup.ts)
    // already blocks its requests independently; see docs/e2e/gotchas.md.
    NEXT_PUBLIC_CONTENTSQUARE_ID: "",
    // Membership Streak surfaces (LoyaltyStreak card, EntryWallet gold bucket,
    // RewardsMilestones track) ship DARK behind DASHBOARD_FEATURES.loyaltyStreak /
    // .milestoneProgress, which read this var (src/config/dashboardFeatures.ts).
    // The streak-journey @demo spec is entirely blank without it.
    NEXT_PUBLIC_DASHBOARD_STREAK_PREVIEW: "true",
  };
  if (opts.webhookSecret) overlay.STRIPE_WEBHOOK_SECRET = opts.webhookSecret;
  return { port, baseUrl, mongoUri: e2eUri!, overlay };
}
