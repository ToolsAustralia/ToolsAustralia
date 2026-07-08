#!/usr/bin/env npx tsx
/**
 * smoke-chat-provider.ts
 *
 * ONE live call to the Anthropic API to confirm the provider/model abstraction
 * works end-to-end (key loaded → SDK → real response).
 *
 * Usage:
 *   npm run smoke:chat-provider
 *   (or: npx tsx scripts/smoke-chat-provider.ts)
 *
 * Requirements:
 *   .env.local must contain ANTHROPIC_API_KEY
 *
 * Exit:
 *   0 = SMOKE OK (non-empty response received)
 *   1 = SMOKE FAIL (any error or empty response)
 *
 * @module scripts/smoke-chat-provider
 */

import { config } from "dotenv";
import path from "path";

// Load .env.local before importing anything that reads env vars
config({ path: path.resolve(process.cwd(), ".env.local") });

import { generateText } from "ai";
import { getChatModel } from "../src/lib/support-chat/provider";

async function run() {
  try {
    const model = getChatModel("primary");

    const result = await generateText({
      model,
      prompt: "Reply with only the word: ok",
      maxOutputTokens: 5,
    });

    const text = (result.text ?? "").trim();

    if (!text) {
      console.error("SMOKE FAIL: response text was empty");
      process.exit(1);
    }

    console.log(`SMOKE OK: ${text}`);
    process.exit(0);
  } catch (err) {
    // Never print the API key. Log the error message only.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`SMOKE FAIL: ${msg}`);
    process.exit(1);
  }
}

void run();
