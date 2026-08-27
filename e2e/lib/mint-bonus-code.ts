/**
 * The e2e harness's bonus-code MINT runner — a throwaway child process that
 * calls the REAL `POST /api/bonus-codes/v1/issue` handler against the e2e
 * database, and prints the outcome as one JSON line.
 *
 * WHY A SEPARATE PROCESS, AND NOT A SPEC-LEVEL IMPORT.
 * The mint is gated on `VERCEL_ENV === "production"` in two independent places
 * (`src/app/api/bonus-codes/v1/issue/route.ts` → 403 `not_production`, and
 * `src/services/redeemables/mintBonusCodeForTrigger.ts` → `not_applicable`).
 * That gate is LOAD-BEARING — it is what stops a preview deploy burning a real
 * customer's one-per-lifetime grant — so it is never weakened, never removed,
 * and never flipped on for the e2e SERVER either (`e2e/lib/env.ts` deliberately
 * does not set `VERCEL_ENV`; doing so would make every spec in the run share a
 * server that claims to be production). Instead, exactly one short-lived
 * process — this one — identifies as production, and every dangerous setting it
 * makes dies with it. Nothing it sets can leak into the Playwright worker, the
 * `next dev` server, or a sibling spec.
 *
 * This is the same technique the passing unit suite already uses
 * (`src/services/redeemables/__tests__/bonus-code-webhook.test.ts`): `require`
 * (not `await import` — under tsx a dynamic import goes through the ESM loader
 * and bypasses `require.cache`) the real handler AFTER seeding `require.cache`
 * with a Klaviyo stub, and refuse to run at all unless the stub is proven to
 * have taken.
 *
 * KLAVIYO CAN NEVER BE REACHED FROM HERE. `.env.local` on a developer machine
 * carries a REAL `pk_` Klaviyo private key and `KLAVIYO_ENABLED=true`, and
 * `klaviyo.trackEvent` has no mode gate — only `isConfigured()`. So this file
 * brakes three times: (1) `@/lib/klaviyo` is replaced in `require.cache` before
 * anything can load the real client, (2) the swap is VERIFIED BY OBJECT
 * IDENTITY before `VERCEL_ENV` is ever set, and (3) `KLAVIYO_ENABLED` is forced
 * to "false", which `isConfigured()` re-reads from `process.env` at call time.
 *
 * DATABASE SAFETY. The Mongo URI comes from `resolveE2eEnv()`, so
 * `assertE2eSafety()` re-runs here: this process refuses to start unless
 * `E2E_MONGODB_URI` is set, differs from `MONGODB_URI`, and names a database
 * containing "e2e". It never builds a connection string of its own.
 *
 * Usage (spawned by `e2e/helpers/bonus-code.ts`, never by hand in a run):
 *   npx tsx e2e/lib/mint-bonus-code.ts --email a@b.io --trigger checkout-start
 * Prints: `E2E_MINT_RESULT {"status":200,"outcome":"minted"}`
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { resolveE2eEnv } from "./env";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const email = flag("email");
  const trigger = flag("trigger");
  if (!email || !trigger) {
    throw new Error("usage: tsx e2e/lib/mint-bonus-code.ts --email <email> --trigger <trigger>");
  }

  // Loads .env.local and re-runs assertE2eSafety(). Must come before anything
  // touches the database: src/lib/mongodb.ts reads MONGODB_URI at CALL time, so
  // the override below is what keeps this process off the main database.
  const { mongoUri } = resolveE2eEnv();
  process.env.MONGODB_URI = mongoUri;

  // --- brake 1 + 2: the Klaviyo stub, installed before any app module loads ---
  const emits: unknown[] = [];
  const stubKlaviyo = {
    async trackEvent(event: unknown) {
      emits.push(event);
      return { success: true };
    },
  };
  const klaviyoModulePath = require.resolve(path.resolve(process.cwd(), "src/lib/klaviyo.ts"));
  require.cache[klaviyoModulePath] = {
    id: klaviyoModulePath,
    filename: klaviyoModulePath,
    loaded: true,
    children: [],
    paths: [],
    parent: undefined,
    exports: { klaviyo: stubKlaviyo },
  } as unknown as NodeModule;

  /* eslint-disable @typescript-eslint/no-require-imports */
  const loadedKlaviyo = require("@/lib/klaviyo") as typeof import("@/lib/klaviyo");
  if (loadedKlaviyo.klaviyo !== stubKlaviyo) {
    throw new Error(
      "REFUSING TO MINT: the @/lib/klaviyo stub did not take, so a production-mode call could hit the real Klaviyo API."
    );
  }
  // brake 3 — isConfigured() re-reads this from process.env on every call.
  process.env.KLAVIYO_ENABLED = "false";

  const { POST } = require("@/app/api/bonus-codes/v1/issue/route") as typeof import("@/app/api/bonus-codes/v1/issue/route");
  const { NextRequest } = require("next/server") as typeof import("next/server");
  const { BONUS_CODE_SECRET_HEADER } = require("@/lib/bonus-code-webhook/auth") as typeof import("@/lib/bonus-code-webhook/auth");
  const { hashIp } = require("@/lib/bonus-code-webhook/audit") as typeof import("@/lib/bonus-code-webhook/audit");
  const BonusCodeWebhookCall = (require("@/models/BonusCodeWebhookCall") as { default: typeof import("@/models/BonusCodeWebhookCall").default }).default;
  const connectDB = (require("@/lib/mongodb") as { default: typeof import("@/lib/mongodb").default }).default;
  const mongoose = require("mongoose") as typeof import("mongoose");
  /* eslint-enable @typescript-eslint/no-require-imports */

  // A secret only this process knows, over the 16-char floor the verifier
  // requires. `.env.local`'s BONUS_CODE_WEBHOOK_SECRET is empty on a developer
  // machine, and the route fails CLOSED (500 "misconfigured") on an empty
  // candidate list — so this is what makes the call reach the mint at all.
  const secret = `e2e-bonus-code-secret-${randomUUID()}`;
  process.env.BONUS_CODE_WEBHOOK_SECRET = secret;
  process.env.BONUS_CODE_DAILY_MINT_CAP = "1000000";
  delete process.env.BONUS_CODE_KILL_SWITCH;

  // LAST, and only now that the stub is proven. Scoped to this process; it dies
  // with it. Never set this anywhere Vercel reads.
  process.env.VERCEL_ENV = "production";

  // A per-call client IP, so the audit row this call writes is identifiable
  // without the route having to hand back its internal requestId.
  const clientIp = `203.0.113.7-e2e-mint-${randomUUID()}`;

  const request = new NextRequest("https://toolsaustralia.com.au/api/bonus-codes/v1/issue", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": clientIp,
      [BONUS_CODE_SECRET_HEADER]: secret,
    },
    body: JSON.stringify({ email, trigger }),
  });

  const response = await POST(request);
  const status = response.status;

  await connectDB();
  const audit = await BonusCodeWebhookCall.findOne({ ipHash: hashIp(clientIp) }).sort({ _id: -1 }).lean();

  console.log(
    `E2E_MINT_RESULT ${JSON.stringify({
      status,
      outcome: audit?.outcome ?? null,
      klaviyoEmits: emits.length,
    })}`
  );

  await mongoose.disconnect();
  // Explicit: the route's module graph leaves handles open (verified — the first
  // run's child printed its result, disconnected, and still never exited), and a
  // mint runner that outlives its answer is a hung test.
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
