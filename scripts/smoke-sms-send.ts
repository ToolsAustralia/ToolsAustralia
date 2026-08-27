#!/usr/bin/env npx tsx

/**
 * Send a REAL SMS through the configured gateway — smoke test + bake-off tool.
 *
 * This SPENDS CREDITS. One credit per message, per the `max_parts: 1` pin in
 * `src/lib/sms.ts`. It is the only way to prove delivery actually works, and the
 * measurement half of the provider bake-off (delivery time is the thing that
 * decides the provider, not headline price).
 *
 * Usage:
 *   npm run smoke:sms-send -- 0412345678
 *   npm run smoke:sms-send -- 0412345678 --count 5 --gap 10
 *   npm run smoke:sms-send -- 0412345678 --message "custom body"
 *
 * Options:
 *   --count <n>    Messages to send (default 1). Each costs a credit.
 *   --gap <sec>    Seconds between sends (default 5). Keep ≥1: the gateway caps
 *                  concurrent requests at 5 and 429s beyond that.
 *   --message <s>  Override the body. Default is a realistic OTP-shaped message
 *                  so segment count and sender presentation match production.
 *   --yes          Skip the 5-second abort window.
 *
 * Safety:
 *   Refuses to run unless SMS_ENABLED=true, so it cannot fire by accident.
 *   Sends only to the ONE number you pass. Never reads the user database.
 *
 * Env: SMS_ENABLED, MOBILE_MESSAGE_API_USERNAME, MOBILE_MESSAGE_API_PASSWORD,
 *      MOBILE_MESSAGE_SENDER
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import { sendSms, normaliseAuMobile, isSmsEnabled, buildSendPayload } from "../src/lib/sms";
import { generateOtpCode, OTP_EXPIRY_MINUTES } from "../src/utils/auth/mobile-otp";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const target = process.argv[2];
  if (!target || target.startsWith("--")) {
    console.error("❌ Usage: npm run smoke:sms-send -- <mobile> [--count n] [--gap sec]");
    process.exit(1);
  }

  const e164 = normaliseAuMobile(target);
  if (!e164) {
    console.error(`❌ "${target}" is not a valid Australian mobile number.`);
    process.exit(1);
  }

  // --dry-run prints the exact wire payload without calling the gateway. Useful
  // when you have no Australian handset to receive on (the gateway is AU-only, so
  // an overseas number cannot be tested at all), and for debugging config later.
  if (process.argv.includes("--dry-run")) {
    const sender = process.env.MOBILE_MESSAGE_SENDER;
    const code = generateOtpCode();
    const body =
      arg("--message") ??
      `${code} is your Tools Australia verification code. It expires in ${OTP_EXPIRY_MINUTES} minutes.`;

    const cred = (v: string | undefined) => (v ? `set (${v.length} chars)` : "❌ MISSING");
    console.log("─".repeat(64));
    console.log("  DRY RUN — nothing sent, no credit spent\n");
    console.log(`  SMS_ENABLED ……………………… ${isSmsEnabled() ? "true" : `"${process.env.SMS_ENABLED ?? ""}" (would refuse)`}`);
    console.log(`  API username ………………… ${cred(process.env.MOBILE_MESSAGE_API_USERNAME)}`);
    console.log(`  API password ………………… ${cred(process.env.MOBILE_MESSAGE_API_PASSWORD)}`);
    console.log(`  sender ……………………………… ${sender ?? "❌ MISSING"}`);
    console.log(`\n  input "${target}" → normalised ${e164} → wire ${e164.replace(/^\+/, "")}`);
    console.log(`  body is ${body.length} chars (1 credit while ≤160)\n`);
    console.log("  POST https://api.mobilemessage.com.au/v1/messages");
    console.log("  Authorization: Basic <redacted>");
    console.log("  Idempotency-Key: <uuid per send>");
    console.log(JSON.stringify(buildSendPayload(e164, body, sender ?? "<MOBILE_MESSAGE_SENDER unset>"), null, 2)
      .split("\n").map((l) => `  ${l}`).join("\n"));
    console.log("─".repeat(64));
    process.exit(sender && process.env.MOBILE_MESSAGE_API_PASSWORD ? 0 : 1);
  }

  if (!isSmsEnabled()) {
    console.error("❌ SMS_ENABLED is not \"true\" in .env.local — refusing to send.");
    console.error("   Set SMS_ENABLED=true to run this test, then set it back if you like.");
    console.error("   (Or pass --dry-run to preview the request without sending.)");
    process.exit(1);
  }

  const count = Math.max(1, Number(arg("--count") ?? 1));
  const gapSeconds = Math.max(1, Number(arg("--gap") ?? 5));
  const customBody = arg("--message");

  console.log("─".repeat(64));
  console.log(`  target ……… ${e164}`);
  console.log(`  sender ……… ${process.env.MOBILE_MESSAGE_SENDER}`);
  console.log(`  messages …… ${count}  (≈${count} credit${count === 1 ? "" : "s"})`);
  console.log(`  gap ………… ${gapSeconds}s`);
  console.log("─".repeat(64));

  if (!process.argv.includes("--yes")) {
    console.log("Sending in 5s — Ctrl-C to abort.");
    await new Promise((r) => setTimeout(r, 5000));
  }

  const timings: number[] = [];
  let succeeded = 0;

  for (let i = 1; i <= count; i++) {
    const code = generateOtpCode();
    const body =
      customBody ?? `${code} is your Tools Australia verification code. It expires in ${OTP_EXPIRY_MINUTES} minutes.`;

    const startedAt = Date.now();
    const result = await sendSms(e164, body, { reference: `smoke-${i}` });
    const elapsedMs = Date.now() - startedAt;
    timings.push(elapsedMs);

    if (result.success) {
      succeeded++;
      console.log(
        `  ${String(i).padStart(2)}/${count} ✅ accepted in ${elapsedMs}ms · ` +
          `code ${code} · ${result.costCredits ?? "?"} credit · id ${result.messageId ?? "?"}`
      );
    } else {
      console.log(`  ${String(i).padStart(2)}/${count} ❌ ${result.error}`);
    }

    if (i < count) await new Promise((r) => setTimeout(r, gapSeconds * 1000));
  }

  const avg = Math.round(timings.reduce((a, b) => a + b, 0) / timings.length);
  console.log("─".repeat(64));
  console.log(`  accepted ${succeeded}/${count} · API round-trip avg ${avg}ms ` + `(min ${Math.min(...timings)} / max ${Math.max(...timings)})`);
  console.log("");
  console.log("  NOTE: the timings above are API ACCEPTANCE, not handset delivery.");
  console.log("  For the bake-off, note the wall-clock time each message actually");
  console.log("  arrives on the phone — that is the number that picks the provider.");
  console.log("─".repeat(64));

  process.exit(succeeded === count ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ smoke-sms-send failed:", err);
  process.exit(1);
});
