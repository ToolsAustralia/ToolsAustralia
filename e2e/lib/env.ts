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
    TIKTOK_ACCESS_TOKEN: "",
    NEXT_PUBLIC_TIKTOK_PIXEL_ID: "",
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
  };
  if (opts.webhookSecret) overlay.STRIPE_WEBHOOK_SECRET = opts.webhookSecret;
  return { port, baseUrl, mongoUri: e2eUri!, overlay };
}
