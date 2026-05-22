import { strict as assert } from "node:assert";
import { createHmac, createHash, randomBytes } from "node:crypto";
import {
  buildSigningString,
  verifyNormRequest,
  NormAuthVerdict,
} from "@/lib/internal-norm/auth";

const BEARER = "test-bearer";
const SECRET = "test-signing-secret";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function sign(method: string, path: string, query: string, body: string, ts: string, nonce: string) {
  const signingString = [method, path, query, sha256(body), ts, nonce].join("\n");
  return createHmac("sha256", SECRET).update(signingString).digest("hex");
}

async function run() {
  process.env.NORM_BEARER_TOKEN = BEARER;
  process.env.NORM_SIGNING_SECRET = SECRET;

  // Sanity: buildSigningString matches our local sign function input
  const _ss = buildSigningString("GET", "/x", "", "", "0", "n");
  assert.ok(_ss.includes("GET"));

  const path = "/api/internal/norm/v1/health";
  const ts = String(Date.now());
  const nonce = randomBytes(16).toString("hex");
  const sig = sign("GET", path, "", "", ts, nonce);

  // Happy path
  const ok = await verifyNormRequest({
    method: "GET",
    path,
    query: "",
    rawBody: "",
    bearer: BEARER,
    timestamp: ts,
    nonce,
    signature: sig,
  });
  assert.equal(ok.ok, true, `expected ok, got: ${(ok as { reason?: string }).reason}`);

  // Bad bearer
  const badBearer = await verifyNormRequest({
    method: "GET",
    path,
    query: "",
    rawBody: "",
    bearer: "WRONG",
    timestamp: ts,
    nonce: randomBytes(16).toString("hex"),
    signature: sig,
  });
  assert.equal(badBearer.ok, false);
  assert.equal((badBearer as { reason: string }).reason, "bad-bearer");

  // Missing headers
  const missingHeaders = await verifyNormRequest({
    method: "GET",
    path,
    query: "",
    rawBody: "",
    bearer: BEARER,
    timestamp: null,
    nonce: null,
    signature: null,
  });
  assert.equal(missingHeaders.ok, false);
  assert.equal((missingHeaders as { reason: string }).reason, "missing-headers");

  // Stale timestamp
  const oldTs = String(Date.now() - 60_000);
  const oldNonce = randomBytes(16).toString("hex");
  const oldSig = sign("GET", path, "", "", oldTs, oldNonce);
  const stale = await verifyNormRequest({
    method: "GET",
    path,
    query: "",
    rawBody: "",
    bearer: BEARER,
    timestamp: oldTs,
    nonce: oldNonce,
    signature: oldSig,
  });
  assert.equal(stale.ok, false);
  assert.equal((stale as { reason: string }).reason, "stale-timestamp");

  // Replay (same nonce twice within window)
  const replayTs = String(Date.now());
  const replayNonce = randomBytes(16).toString("hex");
  const replaySig = sign("GET", path, "", "", replayTs, replayNonce);
  const first = await verifyNormRequest({
    method: "GET",
    path,
    query: "",
    rawBody: "",
    bearer: BEARER,
    timestamp: replayTs,
    nonce: replayNonce,
    signature: replaySig,
  });
  assert.equal(first.ok, true);
  const second = await verifyNormRequest({
    method: "GET",
    path,
    query: "",
    rawBody: "",
    bearer: BEARER,
    timestamp: replayTs,
    nonce: replayNonce,
    signature: replaySig,
  });
  assert.equal(second.ok, false);
  assert.equal((second as { reason: string }).reason, "replay");

  // Bad signature
  const tsB = String(Date.now());
  const nonceB = randomBytes(16).toString("hex");
  const bad = await verifyNormRequest({
    method: "GET",
    path,
    query: "",
    rawBody: "",
    bearer: BEARER,
    timestamp: tsB,
    nonce: nonceB,
    signature: "deadbeef",
  });
  assert.equal(bad.ok, false);
  assert.equal((bad as { reason: string }).reason, "bad-signature");

  // Future-skewed timestamp (the abs guard covers both directions)
  const futureTs = String(Date.now() + 60_000);
  const futureNonce = randomBytes(16).toString("hex");
  const futureSig = sign("GET", path, "", "", futureTs, futureNonce);
  const future = await verifyNormRequest({
    method: "GET", path, query: "", rawBody: "",
    bearer: BEARER, timestamp: futureTs, nonce: futureNonce, signature: futureSig,
  });
  assert.equal(future.ok, false);
  assert.equal((future as { reason: string }).reason, "stale-timestamp");

  // Malformed hex signature (odd length, non-hex chars) — must not throw
  const malformedTs = String(Date.now());
  const malformedNonce = randomBytes(16).toString("hex");
  const malformed = await verifyNormRequest({
    method: "GET", path, query: "", rawBody: "",
    bearer: BEARER, timestamp: malformedTs, nonce: malformedNonce, signature: "ZZZ-not-hex",
  });
  assert.equal(malformed.ok, false);
  assert.equal((malformed as { reason: string }).reason, "bad-signature");

  // Misconfigured: env vars unset (clear, call, then restore)
  const savedBearer = process.env.NORM_BEARER_TOKEN;
  const savedSecret = process.env.NORM_SIGNING_SECRET;
  delete process.env.NORM_BEARER_TOKEN;
  delete process.env.NORM_SIGNING_SECRET;
  const misconfTs = String(Date.now());
  const misconfNonce = randomBytes(16).toString("hex");
  const misconfigured = await verifyNormRequest({
    method: "GET", path, query: "", rawBody: "",
    bearer: BEARER, timestamp: misconfTs, nonce: misconfNonce, signature: "0".repeat(64),
  });
  assert.equal(misconfigured.ok, false);
  assert.equal((misconfigured as { reason: string }).reason, "misconfigured");
  assert.equal((misconfigured as { status: number }).status, 500);
  process.env.NORM_BEARER_TOKEN = savedBearer;
  process.env.NORM_SIGNING_SECRET = savedSecret;

  const _typeCheck: NormAuthVerdict = ok;
  void _typeCheck;
  console.log("✓ verifyNormRequest covers happy + 7 failure modes");
}
void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
