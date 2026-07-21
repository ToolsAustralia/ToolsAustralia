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
  };
  if (opts.webhookSecret) overlay.STRIPE_WEBHOOK_SECRET = opts.webhookSecret;
  return { port, baseUrl, mongoUri: e2eUri!, overlay };
}
