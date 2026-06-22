#!/usr/bin/env npx tsx
/**
 * iGoDirect / MyRewards SSO CONNECTIVITY PROBE — proves we can mint a valid
 * MyRewards SSO token and round-trip it. This is a dev probe, NOT the live flow:
 * it is wired to no user-facing route and touches no real member.
 *
 * SAFETY — production tenant, no test tenant, permanent records, no delete:
 * MyRewards' /generatetoken auto-creates whatever member_id we send and there is
 * no documented way to delete it. So this probe ONLY ever sends iGoDirect's OWN
 * emailed sample identity (member_id "tools_reward_user"), which already exists on
 * their side — re-sending it returns "User found" and pollutes nothing.
 *
 * What it does:
 *   1. OFFLINE secret proof — recompute the HMAC over iGoDirect's emailed sample
 *      token and confirm it reproduces their signature. Confirms our secret is
 *      correct (and reveals their exact signing-input encoding) before any
 *      network call.
 *   2. Mint a token with our production signer (jose, standard base64url) and
 *      POST it to the live /generatetoken.
 *   3. If the standard token is rejected, retry with an exact replica of their
 *      sample encoding (payload base64 WITH padding) to learn what their verifier
 *      requires.
 *   4. (Read-only) GET /verifytoken/{token} with manual redirect handling to
 *      confirm the verify endpoint answers with a 302 into the portal.
 *
 * Usage:
 *   npm run test:igodirect-sso          (or: npx tsx scripts/test-igodirect-sso.ts)
 *   --no-network   Run only the offline secret proof; make no calls to MyRewards.
 *
 * Exit: 0 = secret proof passed AND (network skipped OR endpoint reachable);
 *       1 = secret proof failed or a fatal error; 2 = endpoint rejected both encodings.
 * Env: .env.local must have IGODIRECT_SSO_SECRET.
 * @module scripts/test-igodirect-sso
 */
import { config } from "dotenv";
import path from "path";
import crypto from "crypto";

config({ path: path.resolve(process.cwd(), ".env.local") });

import { signPartnerDiscountSsoToken } from "../src/lib/partner-discount-sso";

const NO_NETWORK = process.argv.includes("--no-network");

// iGoDirect's emailed PRODUCTION sample (the `data` JWT) + the identity inside it.
// We reuse this exact identity so the probe never creates a new permanent record.
const SAMPLE_DATA_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtZW1iZXJfaWQiOiJ0b29sc19yZXdhcmRfdXNlciIsImZpcnN0bmFtZSI6IlRvb2xzIiwibGFzdG5hbWUiOiJBdXN0cmFsaWEiLCJlbWFpbCI6InRvb2xzcmV3YXJkQGdtYWlsLmNvbSIsImRvbWFpbl91cmwiOiJteXJld2FyZHMudG9vbHNhdXN0cmFsaWEuY29tLmF1IiwiZG9tYWluX2NvZGUiOiJUb29sc0F1c3RyYWxpYSIsImNsaWVudF9pZCI6MjQxMn0=.TVEXE19WId-xFQo_WN2Dvjk6w6sdneqOaZdV3foK2yg";

const SAMPLE_IDENTITY = {
  memberId: "tools_reward_user",
  firstname: "Tools",
  lastname: "Australia",
  email: "toolsreward@gmail.com",
  domainUrl: "myrewards.toolsaustralia.com.au",
  domainCode: "ToolsAustralia",
  clientId: 2412,
} as const;

const GENERATE_URL = `https://${SAMPLE_IDENTITY.domainUrl}/generatetoken`;
const VERIFY_URL = (token: string) => `https://${SAMPLE_IDENTITY.domainUrl}/verifytoken/${token}`;

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hmacSha256(secret: string, input: string): Buffer {
  return crypto.createHmac("sha256", secret).update(input).digest();
}

/**
 * Step 1 — prove the secret offline against iGoDirect's emailed sample token.
 * Tries two candidate signing-inputs so the output also tells us which encoding
 * their server signs over (padding kept vs stripped).
 */
function proveSecret(secret: string): boolean {
  const [header, payload, sig] = SAMPLE_DATA_TOKEN.split(".");
  const sigPaddingKept = toBase64Url(hmacSha256(secret, `${header}.${payload}`));
  const payloadNoPad = payload.replace(/=+$/, "");
  const sigPaddingStripped = toBase64Url(hmacSha256(secret, `${header}.${payloadNoPad}`));

  console.log("STEP 1 — offline secret proof (no network)");
  console.log(`  their signature : ${sig}`);
  console.log(`  ours (payload padding KEPT)    : ${sigPaddingKept}  ${sigPaddingKept === sig ? "✅ MATCH" : "—"}`);
  console.log(`  ours (payload padding STRIPPED): ${sigPaddingStripped}  ${sigPaddingStripped === sig ? "✅ MATCH" : "—"}`);

  const ok = sigPaddingKept === sig || sigPaddingStripped === sig;
  if (ok) {
    console.log(
      `  => Secret is CORRECT. Their signing input keeps payload padding: ${sigPaddingKept === sig ? "YES" : "NO"}.`
    );
  } else {
    console.log("  => ❌ Secret does NOT reproduce their signature. Wrong secret, or a different signing scheme.");
  }
  return ok;
}

/** Exact replica of iGoDirect's sample encoding: payload base64 WITH '=' padding. */
function signReplicaToken(secret: string): string {
  const header = toBase64Url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payloadObj: Record<string, string | number> = {
    member_id: SAMPLE_IDENTITY.memberId,
    firstname: SAMPLE_IDENTITY.firstname,
    lastname: SAMPLE_IDENTITY.lastname,
    email: SAMPLE_IDENTITY.email,
    domain_url: SAMPLE_IDENTITY.domainUrl,
    domain_code: SAMPLE_IDENTITY.domainCode,
    client_id: SAMPLE_IDENTITY.clientId,
  };
  // base64 (standard, padding kept) then url-safe chars — mirrors their sample.
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
  const signingInput = `${header}.${payload}`;
  const sig = toBase64Url(hmacSha256(secret, signingInput));
  return `${signingInput}.${sig}`;
}

interface GenerateResult {
  ok: boolean;
  status: number;
  portalToken?: string;
  body: string;
}

async function postGenerate(label: string, dataToken: string): Promise<GenerateResult> {
  console.log(`\n  -> POST ${GENERATE_URL}  [${label}]`);
  const res = await fetch(GENERATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ data: dataToken }),
  });
  const body = await res.text();
  console.log(`     HTTP ${res.status}`);
  console.log(`     body: ${body.slice(0, 600)}`);
  let portalToken: string | undefined;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.token === "string") portalToken = parsed.token;
    if (parsed?.response) console.log(`     response: "${parsed.response}"`);
  } catch {
    /* non-JSON body — already printed */
  }
  return { ok: res.ok, status: res.status, portalToken, body };
}

async function checkVerify(portalToken: string): Promise<void> {
  const url = VERIFY_URL(portalToken);
  console.log(`\nSTEP 4 — verify endpoint (read-only)\n  -> GET ${url}`);
  const res = await fetch(url, { method: "GET", redirect: "manual" });
  const location = res.headers.get("location");
  console.log(`     HTTP ${res.status}${location ? `  Location: ${location}` : ""}`);
  if (res.status >= 300 && res.status < 400 && location) {
    console.log("     => ✅ Verify endpoint issues a redirect into the portal (login handshake reachable).");
  } else {
    console.log("     => Verify endpoint responded; inspect status/body above.");
  }
}

async function main(): Promise<number> {
  const secret = process.env.IGODIRECT_SSO_SECRET;
  if (!secret) {
    console.error("FATAL: IGODIRECT_SSO_SECRET is not set in .env.local.");
    return 1;
  }

  const secretOk = proveSecret(secret);
  if (!secretOk) {
    console.error("\nStopping: the secret could not be verified against iGoDirect's sample. Fix the secret first.");
    return 1;
  }

  if (NO_NETWORK) {
    console.log("\n--no-network set: skipping live calls. Offline secret proof PASSED. ✅");
    return 0;
  }

  // STEP 2 — mint with our production signer (jose, standard encoding) and POST.
  console.log("\nSTEP 2 — mint with our production signer (jose) and POST to /generatetoken");
  const joseToken = await signPartnerDiscountSsoToken(SAMPLE_IDENTITY);
  let result = await postGenerate("jose / standard base64url", joseToken);

  // STEP 3 — if rejected, retry with an exact replica of their sample encoding.
  if (!result.ok) {
    console.log("\nSTEP 3 — standard token rejected; retrying with exact-replica encoding (padded payload)");
    result = await postGenerate("replica / padded payload", signReplicaToken(secret));
    if (result.ok) {
      console.log("\n  NOTE: their endpoint requires the PADDED-payload encoding — update the production signer to match.");
    }
  }

  if (!result.ok) {
    console.error(`\n❌ Both encodings were rejected (last HTTP ${result.status}). Connectivity not confirmed.`);
    return 2;
  }

  console.log("\n✅ /generatetoken accepted our token — connectivity confirmed.");
  if (result.portalToken) await checkVerify(result.portalToken);

  console.log("\nDONE: secret verified, token accepted, round-trip reachable. (Feature is NOT wired live.)");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("FATAL:", err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  });
