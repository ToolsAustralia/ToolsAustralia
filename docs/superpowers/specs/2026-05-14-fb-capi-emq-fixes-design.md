# Spec — Facebook CAPI EMQ Fixes (Audit Bug Sweep)

Status: **Approved (awaiting implementation plan)** · Owner: tracking · Created: 2026-05-14

This spec closes four confirmed bugs in the Facebook Pixel + Conversions API
integration found during a parameter-by-parameter audit on 2026-05-14. It also
removes one piece of dead code in the same area to keep the diff lean.

The audit checked whether `fbp`, `fbc`, `client_ip_address`, `client_user_agent`,
`st` (state) and `db` (birthdate) flow correctly from cookies / request headers /
User documents through to the Graph API request body, on both the legacy
`sendFacebookEvent` path and the canonical `facebookProvider.capiSend` path.

---

## 1. Goal

Restore the highest possible Event Match Quality (EMQ) on every Meta CAPI event
we currently send, without changing:

- Event names (`Purchase`, `Subscribe`, `Unsubscribe`, `CompleteRegistration`, …)
- Dedup keys (`event_id` continues to equal `paymentIntentId.trim()` for purchases)
- `custom_data` shape
- Any browser-side Pixel behavior beyond fixing one cookie-precedence bug

Lock the regressions with two focused test files so a future refactor can't
silently re-introduce the bugs.

---

## 2. Background — audit findings

Full audit report lives in conversation history (2026-05-14). Summary:

| Param | Verdict |
|---|---|
| `fbp` (browser ID) | ✅ Correct everywhere |
| `fbc` (click ID) | ⚠️ Browser helper bug (regenerates timestamp instead of reading `_fbc` cookie) |
| `client_ip_address` | ⚠️ Correct on Purchase canonical path; ❌ dropped in Subscribe-family helpers |
| `client_user_agent` | ⚠️ Correct on Purchase canonical path; ❌ dropped in Subscribe-family helpers |
| `st` (state) | ⚠️ Correctly hashed when sent; ❌ never loaded into Subscribe-family or register CAPI calls |
| `db` (birthdate) | ❌ Silently dropped by canonical provider; also never loaded into Subscribe-family or register CAPI calls |

Test coverage gap: `npm run test:facebook-capi` only asserts `em` and `country`
hashing on `lib/facebook.ts`. None of the bugs above would be caught.

---

## 3. Scope

Five items, presented as one logical change.

### 3.1 Bug 1 — Canonical provider drops `db`

**Where:** [`src/lib/tracking/providers/facebook.ts`](../../../src/lib/tracking/providers/facebook.ts) lines 108–126,
inside `facebookProvider.capiSend`'s `user_data` builder.

**Root cause:** The builder reads `u.email`, `u.phone`, `u.firstName`,
`u.lastName`, `u.city`, `u.state`, `u.zipCode`, `u.country`, `u.externalId`,
`u.clientIpAddress`, `u.clientUserAgent`, `u.fbp`, `u.fbc` — but does **not**
read `u.birthdate`, despite `CanonicalEvent.userData.birthdate` being declared
at [`src/lib/tracking/types.ts:31`](../../../src/lib/tracking/types.ts#L31).

**Fix:** Add a single mapping line that runs the value through `toYYYYMMDD` (an
existing helper at [`src/utils/tracking/facebook-helpers.ts:96`](../../../src/utils/tracking/facebook-helpers.ts#L96))
and then through `hashPII`. Assign the result to `user_data.db`. Skip if the
value is empty or `toYYYYMMDD` returns `null`.

**Affected callers (transitive):** every `Purchase` flow listed in
[`SPEC_PIXEL_CAPI_PARITY.md` §2.1](../../tracking/SPEC_PIXEL_CAPI_PARITY.md) —
Membership, one-time package, Mini-draw, Upsell.

### 3.2 Bug 2 — Subscribe-family helpers ship sparse `user_data`

**Where:**
- [`src/utils/tracking/pixel-purchase-tracking.ts`](../../../src/utils/tracking/pixel-purchase-tracking.ts)
  - `trackPixelSubscriptionUpgrade` (lines 463–540)
  - `trackPixelSubscriptionDowngrade` (lines 555–632)
- [`src/app/api/stripe/upgrade-subscription-payment/route.ts:328`](../../../src/app/api/stripe/upgrade-subscription-payment/route.ts#L328)
- [`src/app/api/stripe/downgrade-subscription/route.ts:243`](../../../src/app/api/stripe/downgrade-subscription/route.ts#L243)

**Root cause:** Both helper functions currently build `user_data` from only
`email`, `country`, and `external_id`. They do not accept a `requestContext` so
they cannot include `client_ip_address` or `client_user_agent`. They do not
refetch the User to access `state`/`birthdate`/`firstName`/`lastName`/`phone`.

**Fix:**
1. Add an optional `requestContext?: RequestContext` parameter to each helper's
   `params` object (type already exported from `facebook-helpers.ts`).
2. Inside each helper, refetch the User document by `params.userId` if any of
   `state`/`birthdate`/`firstName`/`lastName`/`phone` are needed. The two routes
   already touch the DB so this is a marginal additional round-trip.
3. Pass the full set of available fields to `prepareUserData`. Existing
   null-safe guards mean any absent field is simply skipped.
4. After building `user_data`, attach `client_ip_address` and
   `client_user_agent` from `requestContext` (if provided).
5. In the two calling routes, call the existing `extractRequestContext(request)`
   helper from `facebook-helpers.ts` and pass the result through.

**Why inline (no Stripe metadata round-trip):** Both Upgrade and Downgrade fire
CAPI from the same request handler that receives the user action. There is no
async webhook-time fire for these events, unlike the Purchase flow.

### 3.3 Bug 2b — `trackPixelCancellation` is dead code

**Where:** [`src/utils/tracking/pixel-purchase-tracking.ts:645–696`](../../../src/utils/tracking/pixel-purchase-tracking.ts#L645)

**Root cause:** Function is exported but has zero callers in `src/`. Only
references are in past plan docs.

**Fix:** Delete the function entirely. Per CLAUDE.md rule #4, dead code is
maintenance cost with no benefit. If a cancellation event is wired up in the
future, the implementer will follow the same pattern as Upgrade/Downgrade after
this spec lands.

### 3.4 Bug 3 — Initial `trackPixelSubscription` omits `st` / `db`

**Where:** [`src/utils/tracking/pixel-purchase-tracking.ts:389–394`](../../../src/utils/tracking/pixel-purchase-tracking.ts#L389)
(the `prepareUserData` call inside `trackPixelSubscription`).

**Root cause:** Even though the full `user` object is in scope, the
`prepareUserData` call hardcodes only `email`, `phone`, `firstName`, `lastName`.

**Fix:** Extend the call to include `state`, `birthdate`, `zipCode` from the
user. `prepareUserData` already null-skips absent fields.

**Note:** `ip`/`ua`/`fbp`/`fbc` are *already* correctly wired in this function —
only the User-PII subset is the gap.

### 3.5 Bug 4 — `register/route.ts` omits `st` / `db` in all 4 branches

**Where:** [`src/app/api/auth/register/route.ts`](../../../src/app/api/auth/register/route.ts)
at lines 333, 455, 547, 710 — the four `prepareUserData` calls that build the
`CompleteRegistration` CAPI event.

**Root cause:** Each call hardcodes a subset of user fields. The three
"account update" branches have an existing user object in scope (with `state`
and `birthdate` likely populated); the "new account" branch has a fresh user
where these fields are `undefined`.

**Fix:** At each of the four call sites, add `state` and `birthdate` from the
in-scope user document. The new-account branch's `undefined` values are
null-safe via `prepareUserData`'s existing guards, so we apply the fix
uniformly across all four for consistency.

### 3.6 Bug 5 — Browser `getFBCFromURL` regenerates timestamp instead of reading `_fbc` cookie

**Where:** [`src/utils/tracking/facebook-helpers.ts:22–51`](../../../src/utils/tracking/facebook-helpers.ts#L22)

**Root cause:** The browser helper inspects `window.location.search` for
`fbclid` and constructs `fb.1.{Date.now()}.{fbclid}` on every call. It never
checks `document.cookie` for an existing `_fbc` value that the Meta Pixel SDK
set at click time.

The cookie-time timestamp is the correct value per Meta spec. Regenerating it
on every call:
1. Produces a different `fbc` value than the browser Pixel itself uses (which
   reads the cookie via `fbq`'s internal logic), causing pixel↔CAPI mismatch.
2. Makes the `fbc` value non-deterministic across retries (already documented
   as a known issue at [`docs/tracking/gotchas.md:41–47`](../../tracking/gotchas.md#server-side-fbc-reads-_fbc-cookie-first-url-fallback-uses-datenow),
   but for the server-side fallback path — the browser helper has the same
   bug and the doc didn't cover it).

**Fix:**
1. Add a `_fbc` cookie read step **before** the URL fallback. If the cookie is
   set, return its value verbatim (Meta SDK already stores it in the canonical
   `fb.1.{timestamp}.{fbclid}` format; do not re-format).
2. Decode the cookie value via `decodeURIComponent` if URL-encoded
   (verify during implementation — likely not encoded by the SDK, but cheap to
   normalize defensively).
3. Only when the cookie is absent does the existing URL fallback run.

This mirrors the priority order already used server-side in
`extractFBCFromRequest`.

---

## 4. Test plan

Two focused test files, each wired to its own `test:*` script per the repo
convention.

### 4.1 Extend `src/lib/__tests__/facebook.test.ts` (`npm run test:facebook-capi`)

Add cases asserting:

1. **Canonical provider maps `birthdate` to hashed `db`.** Build a stub
   `CanonicalEvent` with `userData.birthdate = "1990-06-15"` (or a `Date`),
   invoke `facebookProvider.capiSend` against a `fetch` stub, assert the
   captured request body contains `user_data.db = hashData("19900615")`.
2. **Canonical provider skips `db` when `birthdate` is absent or unparseable.**
   No `db` key present on the outbound payload.

### 4.2 New `src/utils/tracking/__tests__/facebook-emq.test.ts` (`npm run test:facebook-emq`)

Stub `sendFacebookEvent` (and any other external call) and assert the
`user_data` payload shape for each of these scenarios:

1. **`trackPixelSubscriptionUpgrade`** with a fully populated user + a non-empty
   `requestContext` → resulting `user_data` includes hashed `em`, `st`, `db`,
   raw `client_ip_address`, `client_user_agent`, `external_id`.
2. **`trackPixelSubscriptionDowngrade`** — same assertions.
3. **`trackPixelSubscription`** (Subscribe path) with a user that has
   `state`/`birthdate` populated → `user_data.st` and `user_data.db` present
   and correctly hashed.
4. **`register/route.ts` `CompleteRegistration` builder** — invoke the
   register route handler directly with a mocked DB user that has populated
   `state` and `birthdate`, stub `sendFacebookEvent`, and assert the captured
   `user_data` argument includes hashed `st` and `db`. Repeat for each of the
   four branches by varying the request payload to hit each branch. No
   refactor of route internals is required — testing at the
   `sendFacebookEvent` boundary captures the payload before it leaves the
   process.
5. **Browser `getFBCFromURL` reads `_fbc` cookie first.** Mock
   `document.cookie` with a value like `_fbc=fb.1.1700000000000.abc` and assert
   the helper returns that exact string regardless of `window.location.search`.
   Then clear the cookie and re-test the URL fallback path still works.

Wire `test:facebook-emq` into `package.json`. Verify both scripts run green via
`npm run test:facebook-capi && npm run test:facebook-emq`.

---

## 5. Gotchas

1. **`db` format is `YYYYMMDD`, not ISO.** Hashing `1990-06-15` gives a
   different value than hashing `19900615`. Meta wants the latter. The
   `toYYYYMMDD` helper at `facebook-helpers.ts:96` already handles `Date`
   objects, ISO strings, and pre-formatted strings.
2. **`fbp`, `fbc`, `client_ip_address`, `client_user_agent` are sent RAW.**
   Never hash them. The codebase already gets this right but it's a common
   regression vector.
3. **State is the 2-letter code, lowercase-hashed.** `User.state` stores
   uppercase 2-letter codes (`"NSW"`); `hashPII` lowercases internally before
   SHA-256. Do not double-transform — passing already-lowercased values is
   fine, but do not call `.toLowerCase()` yourself first because the helper
   already does.
4. **Subscribe-family fires inline; no Stripe metadata round-trip needed.**
   This differs from Purchase, where ip/ua are stashed in PaymentIntent
   metadata at request time and reconstructed by
   `extractRequestContextFromMetadata` at webhook time. For Upgrade/Downgrade,
   just call `extractRequestContext(request)` in the route handler and pass it
   to the helper.
5. **`prepareUserData` is null-safe.** Every field has an `if (userData.X)`
   guard. Passing `state: undefined` is a no-op. This is what allows the
   uniform fix in `register/route.ts` across the new-account branch.
6. **Dedup is unaffected.** None of these fixes change `event_id`,
   `event_name`, or `custom_data`. Pixel↔CAPI dedup remains intact via the
   existing `paymentIntentId.trim()` strategy.
7. **`_fbc` cookie value may or may not be URL-encoded.** Verify during
   implementation; defensively `decodeURIComponent` only if the raw value
   contains `%`.
8. **`document.cookie` access in SSR.** The existing helper already guards
   with `typeof window === "undefined"`. The cookie-first fix must preserve
   that guard.

---

## 6. Docs to update (per CLAUDE.md doc-sync rule)

- [`docs/tracking/gotchas.md`](../../tracking/gotchas.md) — update the existing
  "Server-side fbc reads `_fbc` cookie first; URL fallback uses `Date.now()`"
  entry to note the browser-side now does the same. Add new gotcha entries for
  birthdate format and "raw vs hashed" matrix.
- [`docs/tracking/backend.md`](../../tracking/backend.md) — document that
  Upgrade/Downgrade route handlers thread `requestContext` into the tracking
  helpers.
- [`docs/tracking/api.md`](../../tracking/api.md) — update the user_data field
  matrix to reflect the new coverage.
- [`docs/tracking/testing.md`](../../tracking/testing.md) — register the new
  `test:facebook-emq` script and describe what it covers.
- [`docs/tracking/SPEC_PIXEL_CAPI_PARITY.md`](../../tracking/SPEC_PIXEL_CAPI_PARITY.md) —
  cross-link to this spec from §2.2 ("What's broken") and mark the Subscribe-
  family parity items as resolved once implementation lands.

The `tracking` domain manifest entry already covers all source paths touched
by this change; no manifest edit required.

---

## 7. Risks

1. **Mongo refetch in Upgrade/Downgrade.** Adds one round-trip per CAPI fire.
   Both routes already touch the DB so this is marginal. Acceptable.
2. **`_fbc` cookie URL encoding.** Will verify during implementation; trivial
   to handle.
3. **Test file location.** `src/utils/tracking/__tests__/` does not exist
   yet. The `tracking` domain manifest entry already includes
   `src/utils/tracking/**`, so the doc-sync hook will be satisfied.
4. **Build-cache invalidation on `package.json` edit.** Adding a new
   `test:facebook-emq` script triggers Turbopack cache invalidation on next
   `npm run dev`. Cosmetic.

---

## 8. Out of scope

Per CLAUDE.md rule #4 (don't overengineer):

- No refactor of `prepareUserData` signature.
- No new feature flags.
- No new abstractions or dispatch layers.
- No backfill of historical events.
- No fixes to other providers (TikTok, Snapchat).
- The Shop checkout CAPI gap noted in `SPEC_PIXEL_CAPI_PARITY.md:65` —
  separate known gap, untouched here.
- No changes to `event_id` strategy, dedup, or `custom_data`.

---

## 9. Definition of done

- All four bug fixes landed; `trackPixelCancellation` deleted.
- `npm run test:facebook-capi` green with the new canonical-provider `db` case.
- `npm run test:facebook-emq` green covering Subscribe-family, register, and
  browser fbc cases.
- `npm run lint` and `npm run type-check` green.
- All five docs in §6 updated; doc-sync Stop hook passes.
- Spec self-review checklist in §10 cleared.

---

## 10. Spec self-review checklist

- [x] No placeholders (no TBD, TODO, "fix later").
- [x] Internal consistency — every bug in §2 has a matching fix in §3 and a
      matching test in §4.
- [x] Scope is single-PR-sized (4 bug fixes + 1 deletion + 2 test files + 5
      doc edits).
- [x] No ambiguous requirements — each fix names the exact file, line range,
      and outcome.
- [x] Risks are concrete and bounded.
- [x] Out-of-scope is explicit.
