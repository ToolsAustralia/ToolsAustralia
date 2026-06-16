import assert from "node:assert/strict";
import { describeFetchError, resilientFetch } from "../outbound";

/** Build a `TypeError: fetch failed` the way undici does, with a `.cause`. */
function fetchFailed(code: string, message = "other side closed"): Error {
  const err = new TypeError("fetch failed");
  (err as Error & { cause?: unknown }).cause = { code, message };
  return err;
}

const okResponse = () => new Response("{}", { status: 200 });
const errResponse = (status: number) => new Response("{}", { status });

async function run() {
  // --- describeFetchError ---
  const d = describeFetchError(fetchFailed("UND_ERR_SOCKET"));
  assert.equal(d.message, "fetch failed", "surfaces top-level message");
  assert.equal(d.code, "UND_ERR_SOCKET", "surfaces error.cause.code");
  assert.equal(d.causeMessage, "other side closed", "surfaces error.cause.message");
  assert.equal(describeFetchError("boom").code, undefined, "non-Error input → no code, no throw");

  const realFetch = globalThis.fetch;
  try {
    // --- retry on transient socket error, succeed on 2nd attempt ---
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) throw fetchFailed("UND_ERR_SOCKET");
      return okResponse();
    }) as typeof fetch;
    let res = await resilientFetch("https://x.test", {}, { retries: 2, baseDelayMs: 1 });
    assert.equal(res.status, 200, "recovers after a stale-socket retry");
    assert.equal(calls, 2, "retried exactly once");

    // --- retry on 503, then 200 ---
    calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return calls === 1 ? errResponse(503) : okResponse();
    }) as typeof fetch;
    res = await resilientFetch("https://x.test", {}, { retries: 2, baseDelayMs: 1 });
    assert.equal(res.status, 200, "retries 5xx then succeeds");
    assert.equal(calls, 2, "5xx retried once");

    // --- NEVER retry a 4xx; hand the response back ---
    calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return errResponse(400);
    }) as typeof fetch;
    res = await resilientFetch("https://x.test", {}, { retries: 2, baseDelayMs: 1 });
    assert.equal(res.status, 400, "returns 4xx response unchanged");
    assert.equal(calls, 1, "4xx not retried");

    // --- exhaust retries on a persistent network error → throws ---
    calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw fetchFailed("ECONNRESET");
    }) as typeof fetch;
    await assert.rejects(
      resilientFetch("https://x.test", {}, { retries: 2, baseDelayMs: 1 }),
      /fetch failed/,
      "throws after exhausting retries"
    );
    assert.equal(calls, 3, "tried initial + 2 retries");

    // --- per-attempt timeout aborts a hanging request ---
    calls = 0;
    globalThis.fetch = ((_url: string, init: RequestInit = {}) =>
      new Promise((_resolve, reject) => {
        calls++;
        init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as typeof fetch;
    await assert.rejects(
      resilientFetch("https://x.test", {}, { retries: 0, timeoutMs: 10, baseDelayMs: 1 }),
      /aborted/,
      "aborts a hanging request via per-attempt timeout"
    );
    assert.equal(calls, 1, "single attempt with retries:0");
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("outbound (resilient fetch) tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
