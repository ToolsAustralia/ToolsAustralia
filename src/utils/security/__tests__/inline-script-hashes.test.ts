// Hash-drift guard for the inline-script snippet constants.
//
// The four constants in ../inline-snippets.ts are rendered verbatim as inline
// <script> text, and their base64 sha256 tokens are allowlisted in the NONCE
// variant of buildContentSecurityPolicy (../csp.ts). If a constant changes
// without recomputing its hash, the script is silently BLOCKED on every
// nonce-class route in production — invisible to tsc. This test recomputes each
// hash and asserts:
//   1. the exact 'sha256-…' token appears in the nonce-variant CSP, and
//   2. the no-nonce fallback variant keeps 'unsafe-inline' and contains NONE of
//      the four hashes (hashes alongside 'unsafe-inline' make browsers ignore
//      'unsafe-inline', which would break every other inline script there).
//
// Run: npm run test:csp-inline-hashes

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  THEME_BOOTSTRAP_SNIPPET,
  DEVICE_TIER_SNIPPET,
  GTM_INIT_SNIPPET,
  KLAVIYO_QUEUE_SNIPPET,
} from "../inline-snippets";
import { buildContentSecurityPolicy } from "../csp";

const SNIPPETS: Array<[name: string, snippet: string]> = [
  ["THEME_BOOTSTRAP_SNIPPET", THEME_BOOTSTRAP_SNIPPET],
  ["DEVICE_TIER_SNIPPET", DEVICE_TIER_SNIPPET],
  ["GTM_INIT_SNIPPET", GTM_INIT_SNIPPET],
  ["KLAVIYO_QUEUE_SNIPPET", KLAVIYO_QUEUE_SNIPPET],
];

/** CSP source token for an inline script's exact text: 'sha256-<base64>' */
function sha256Token(snippet: string): string {
  return `'sha256-${createHash("sha256").update(snippet, "utf8").digest("base64")}'`;
}

function testNonceVariantContainsEveryHash() {
  const nonceCsp = buildContentSecurityPolicy("dummy-nonce");
  for (const [name, snippet] of SNIPPETS) {
    const token = sha256Token(snippet);
    assert.ok(
      nonceCsp.includes(token),
      `${name} drifted: recomputed ${token} is missing from the nonce-variant script-src. ` +
        `Update the hash (and its mapping comment) in src/utils/security/csp.ts.`
    );
  }
}

function testFallbackVariantKeepsUnsafeInlineAndNoHashes() {
  const fallbackCsp = buildContentSecurityPolicy();
  assert.ok(
    fallbackCsp.includes("'unsafe-inline'"),
    "no-nonce fallback CSP must keep 'unsafe-inline' in script-src"
  );
  for (const [name, snippet] of SNIPPETS) {
    const token = sha256Token(snippet);
    assert.ok(
      !fallbackCsp.includes(token),
      `${name}'s hash leaked into the no-nonce fallback variant — hashes there make ` +
        `browsers ignore 'unsafe-inline', breaking every other inline script.`
    );
  }
}

function run() {
  testNonceVariantContainsEveryHash();
  testFallbackVariantKeepsUnsafeInlineAndNoHashes();
  console.log("inline-script CSP hash tests passed");
}

try {
  run();
} catch (e) {
  console.error(e);
  process.exit(1);
}
