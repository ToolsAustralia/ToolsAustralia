/**
 * TikTok match-signal regressions (2026-07-31).
 *
 * Every case here corresponds to a defect TikTok's Event Match Quality panel actually
 * reported — Click ID 0% on all four server events, External ID 0–1% on the guest-fired
 * ones, and a stray CUSTOM `PageView` event sitting beside the standard `Pageview`.
 * Zero network: nothing in this file sends anything.
 */
import assert from "node:assert/strict";
import { mapCanonicalToTikTokEvent } from "../../tiktok";
import {
  extractTikTokContext,
  extractTikTokCapturedAt,
  isPlausibleTtclid,
  TTCLID_MAX_LENGTH,
} from "@/utils/tracking/tiktok-helpers";
import type { CanonicalEvent, RequestContext } from "../types";

const realEnv = process.env;

/** Minimal NextRequest-like stand-in. Values are already percent-DECODED, as Next hands them over. */
function fakeRequest(cookies: Record<string, string>, url?: string) {
  return {
    ...(url !== undefined && { url }),
    cookies: {
      get: (name: string) => (name in cookies ? { value: cookies[name] } : undefined),
    },
  };
}

function event(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    eventName: "Purchase",
    eventId: "evt_1",
    eventTime: 1_750_000_000,
    ...overrides,
  };
}

const tests: [string, () => void | Promise<void>][] = [
  // ---------------------------------------------------------------- ttclid/ttp plumbing
  [
    "ttclid/ttp are read from RequestContext when userData does not carry them",
    () => {
      // THE Click-ID-0% bug: payment routes spread `extractTikTokContext` onto their
      // requestContext object, but the mapper only ever looked at event.userData — so the
      // click id was silently discarded on every server event. tsc could not see it.
      const ctx: RequestContext = { ttclid: "TT_FROM_CTX", ttp: "TTP_FROM_CTX" };
      const out = mapCanonicalToTikTokEvent(event(), ctx);
      assert.equal(out.user.ttclid, "TT_FROM_CTX");
      assert.equal(out.user.ttp, "TTP_FROM_CTX");
    },
  ],
  [
    "userData ttclid/ttp still win over RequestContext",
    () => {
      const ctx: RequestContext = { ttclid: "FROM_CTX", ttp: "TTP_CTX" };
      const out = mapCanonicalToTikTokEvent(
        event({ userData: { ttclid: "FROM_USERDATA", ttp: "TTP_USERDATA" } }),
        ctx,
      );
      assert.equal(out.user.ttclid, "FROM_USERDATA");
      assert.equal(out.user.ttp, "TTP_USERDATA");
    },
  ],
  [
    "no ttclid anywhere means the key is omitted, never sent empty",
    () => {
      const out = mapCanonicalToTikTokEvent(event(), {});
      assert.equal("ttclid" in out.user, false);
      assert.equal("ttp" in out.user, false);
    },
  ],

  // ---------------------------------------------------------------- cookie resolution order
  [
    "extractTikTokContext prefers our ta_ttclid cookie",
    () => {
      const ctx = extractTikTokContext(
        fakeRequest({ ta_ttclid: "OURS", ttclid: "SDK_OR_LEGACY" }, "https://x.test/?ttclid=FROM_URL"),
      );
      assert.equal(ctx.ttclid, "OURS");
    },
  ],
  [
    "falls back to the legacy/SDK ttclid cookie when ours is absent",
    () => {
      // Covers both an in-flight pre-rename cookie and TikTok's own host-scoped cookie.
      const ctx = extractTikTokContext(fakeRequest({ ttclid: "LEGACY" }, "https://x.test/?ttclid=FROM_URL"));
      assert.equal(ctx.ttclid, "LEGACY");
    },
  ],
  [
    "falls back to ?ttclid= on the request URL when no cookie exists",
    () => {
      // The landing request itself: middleware mints the cookie on this response, so the
      // cookie is not readable until the NEXT request. Meta has had this fallback for ages.
      const ctx = extractTikTokContext(fakeRequest({}, "https://x.test/promotions/a?ttclid=FROM_URL"));
      assert.equal(ctx.ttclid, "FROM_URL");
    },
  ],
  [
    "no cookie and no url yields no ttclid rather than throwing",
    () => {
      assert.deepEqual(extractTikTokContext(fakeRequest({})), {});
    },
  ],
  [
    "_ttp is read independently of ttclid",
    () => {
      const ctx = extractTikTokContext(fakeRequest({ _ttp: "TTP1" }));
      assert.equal(ctx.ttp, "TTP1");
      assert.equal(ctx.ttclid, undefined);
    },
  ],

  // ---------------------------------------------------------------- encoding
  [
    "a ttclid containing a literal % is NOT double-decoded",
    () => {
      // Next's RequestCookies already percent-decodes on parse, so a second decode here
      // would corrupt the value (or throw on a malformed sequence).
      const ctx = extractTikTokContext(fakeRequest({ ta_ttclid: "abc%20def" }));
      assert.equal(ctx.ttclid, "abc%20def");
    },
  ],

  // ---------------------------------------------------------------- length guard
  [
    "an over-long ttclid is rejected (Stripe fails the whole call above 500 chars)",
    () => {
      const tooLong = "x".repeat(TTCLID_MAX_LENGTH + 1);
      assert.equal(isPlausibleTtclid(tooLong), false);
      assert.equal(extractTikTokContext(fakeRequest({ ta_ttclid: tooLong })).ttclid, undefined);
      assert.equal(
        extractTikTokContext(fakeRequest({}, `https://x.test/?ttclid=${tooLong}`)).ttclid,
        undefined,
      );
    },
  ],
  [
    "a normal-length ttclid passes the guard",
    () => {
      assert.equal(isPlausibleTtclid("E.C.P.1234567890abcdef"), true);
      assert.equal(isPlausibleTtclid(""), false);
      assert.equal(isPlausibleTtclid("x".repeat(TTCLID_MAX_LENGTH)), true);
    },
  ],

  // ---------------------------------------------------------------- capture timestamp
  [
    "extractTikTokCapturedAt reads ta_ttclid_ts, falling back to the legacy name",
    () => {
      assert.equal(extractTikTokCapturedAt(fakeRequest({ ta_ttclid_ts: "1750000000000" })), 1_750_000_000_000);
      assert.equal(extractTikTokCapturedAt(fakeRequest({ ttclid_ts: "1740000000000" })), 1_740_000_000_000);
      assert.equal(extractTikTokCapturedAt(fakeRequest({})), null);
      // A non-numeric value must not become NaN — the resolver treats null as "no click time".
      assert.equal(extractTikTokCapturedAt(fakeRequest({ ta_ttclid_ts: "not-a-number" })), null);
    },
  ],

  // ---------------------------------------------------------------- external_id
  [
    "an anonymous external_id is hashed exactly like a User._id",
    () => {
      // Server and browser must produce the IDENTICAL hash for the same raw anon id, or the
      // pixel and Events API copies do not match. The browser passes it raw to ttq.identify,
      // which hashes in-browser; here we assert the server hashes rather than passing through.
      const out = mapCanonicalToTikTokEvent(
        event({ userData: { externalId: "anon_11111111-2222-3333-4444-555555555555" } }),
        {},
      );
      assert.ok(out.user.external_id, "external_id must be present");
      assert.equal(out.user.external_id!.length, 64, "external_id must be a SHA-256 hex digest");
      assert.notEqual(out.user.external_id, "anon_11111111-2222-3333-4444-555555555555");
    },
  ],

  // ---------------------------------------------------------------- page.referrer
  [
    "page.referrer is emitted from RequestContext, and omitted when absent",
    () => {
      const withRef = mapCanonicalToTikTokEvent(event(), {
        eventSourceUrl: "https://x.test/a",
        referrer: "https://x.test/from",
      });
      assert.equal(withRef.page?.referrer, "https://x.test/from");

      const withoutRef = mapCanonicalToTikTokEvent(event(), { eventSourceUrl: "https://x.test/a" });
      assert.equal(withoutRef.page?.referrer, undefined);
      // Never fabricate a referrer from the page url.
      assert.equal(withoutRef.page?.url, "https://x.test/a");
    },
  ],
];

async function run() {
  console.log("tiktok-match-signals");
  for (const [name, fn] of tests) {
    await fn();
    console.log(`  ✓ ${name}`);
  }
}

run()
  .then(() => {
    process.env = realEnv;
    console.log("✓ all tiktok-match-signals tests passed");
    process.exit(0);
  })
  .catch((e) => {
    process.env = realEnv;
    console.error("✗ tiktok-match-signals FAILED:", e);
    process.exit(1);
  });
