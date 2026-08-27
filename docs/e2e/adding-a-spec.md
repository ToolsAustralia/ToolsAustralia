# E2E — Adding a spec

## Where it goes

`e2e/specs/<area>/<name>.spec.ts`, grouped by area to match the existing layout: `marketing/`,
`membership/`, `auth/`, `account/`, `admin/`, `quality/`. Add a new area folder only if the spec
genuinely doesn't belong in an existing one.

## Fixtures import — always from `../../fixtures/test`

```ts
import { test, expect } from "../../fixtures/test"; // NOT "@playwright/test"
```

Importing from the extended `test` (not the bare `@playwright/test`) is what gives every spec:
the auto QA `watchdog` fixture (console/pageerror/5xx failure + third-party request blocking),
per-worker `x-forwarded-for` (rate-limiter bucketing), and access to the `freshUser`/`demo`
fixtures. A spec that imports directly from `@playwright/test` silently loses all of this — there
is no lint rule catching it today, so check the import line in review.

## Tags

Tags are plain substrings appended to the `test.describe`/`test` title, matched via Playwright's
`--grep`. Combine as many as apply, space-separated:

- **`@smoke`** — fast, non-mutating (or safely-mutating-and-cheap, e.g. one registration). Should
  be safe to run constantly during development.
- **`@demo`** — narrated for proof mode (see proof-mode.md). Add this only to specs whose flow is
  worth showing a non-technical stakeholder; use `demo.step(...)` inside them.
- **`@purchase`** — drives a real Stripe TEST-mode payment through the real UI + real webhook.
  Use `purchaseIdentity()` (below), not `freshUser`. These specs are the slowest and most
  environment-sensitive in the suite — see architecture.md's per-project sequencing note before
  adding one.
- **`@a11y`** / **`@visual`** — reserved for the quality lenses (`e2e/specs/quality/`); don't tag
  an ordinary functional spec with these just because it happens to check something visual.
- **`@admin`** — admin-boundary specs (uses `ADMIN_STATE`/`MEMBER_STATE` storage states directly
  rather than logging in interactively).

Example: `test.describe("my-account @smoke @demo", () => { ... })`.

## Worker-safe identities

Never hardcode a literal email/mobile in a spec that registers a new user — `User.mobile` is
unique-indexed, and a shared literal 400s the instant two specs (or two workers) register
concurrently against the same database. Two helpers exist, pick the one that matches the spec:

- **`freshUser()`** (the `freshUser` fixture, `e2e/fixtures/test.ts`) — for a simple mutating spec
  that just needs a fresh loginable user. Builds `e2e+w<workerIndex>-<runId>-<n>@e2e.local` and
  creates the user directly via `createLoginableUser` (bypasses the register API, which creates
  passwordless users). Disconnects the DB connection on fixture teardown automatically.
- **`purchaseIdentity(tag, testInfo)`** (`e2e/helpers/payment.ts`) — for `@purchase` specs that
  register through the **real** `/api/auth/register` UI flow. Folds `testInfo.project.name` and
  `testInfo.retry` into the email so a mixed multi-project run and a Playwright retry on the same
  worker both get distinct, deterministic identities (`uniqueMobile(email)` derives the matching
  mobile via a deterministic hash, always 8 digits after the `04` prefix). **Must** go through
  the real register endpoint's email regex (`src/models/User.ts` — hyphen separators + a 2-3 char
  TLD only; `+` and `.local` both fail validation), which is why the format is
  `e2e-<tag>-<runId>-<project>-r<retry>@e2e.io`, not the `freshUser`-style `@e2e.local` address.

If a spec needs a user with a *specific* pre-existing state (active subscription, admin role,
etc.) rather than a fresh blank account, use the seeded `MEMBER`/`ADMIN` constants (`e2e/helpers/db.ts`)
and their storage states (`MEMBER_STATE`/`ADMIN_STATE`, `e2e/lib/paths.ts`) via
`test.use({ storageState: ... })` at the describe level — see `my-account.spec.ts` /
`admin-gate.spec.ts` for the pattern, including the empty-storageState trick
(`{ cookies: [], origins: [] }`) for a guest-gate test that still needs full fixture coverage.

## The selector-refinement rule

**Never guess a selector from a component's prop names, brief prose, or "what a similar page
does" — verify it against the real, live DOM before writing the assertion.** Every selector
deviation documented in this codebase's specs (`git grep -n "DEVIATION" e2e/specs`) was found by
one of:

1. **`npm run e2e:env` + Playwright MCP or `npx playwright codegen`** (see how-to-run.md) — the
   preferred path when authoring a new spec.
2. **A failed run's `error-context.md` or trace snapshot** (`e2e-artifacts/test-results/<test>/`)
   — the real DOM at the moment of failure, when a first-guess selector didn't match.

Concrete precedents worth knowing before you guess again:
- The landing page's membership CTA renders **"Enter Now"** for a guest, not "Choose Tradie" —
  only `/membership` itself renders `"Choose {tier}"` labels (different component,
  `useMembershipCardCta`).
- The guest checkout submit button is exactly **`"PURCHASE"`** (`getByRole("button", { name: /^purchase$/i })`),
  not `/pay|subscribe|complete|confirm/i`.
- Stripe's decline error text renders **inside the `PaymentElement` iframe** as an inline field
  error, not as this app's own toast — assert through the same `frameLocator` `fillPaymentElement`
  uses, never `page.getByText()` (main-frame only).
- `/admin`'s content root has no `<main>`/`role="main"` — the real stable signal is the exact tab
  heading (`getByRole("heading", { name: "overview", exact: true })`); a loose name match also
  catches an unrelated "Revenue overview" `<h3>` elsewhere on the dashboard.

When you deviate from a brief/plan's literal selector, **document it inline** with a short
comment: what was assumed, what's actually true, and how you verified it (live DOM snapshot,
trace, or a cited task report). This is what makes the next person's refinement pass faster
instead of re-discovering the same thing.

## Shadowing the watchdog for known-benign noise

If a spec legitimately triggers non-app console noise the shared `watchdog` correctly can't
distinguish from a real bug (e.g. Stripe.js's own `console.error` on a declined card, or a
pre-existing unrelated product bug's failed asset request), shadow the fixture **inside that one
spec file only** — never edit `e2e/fixtures/test.ts` to special-case one spec:

```ts
const test = base.extend({
  watchdog: async ({ page, context, baseURL }, use) => {
    // same body as fixtures/test.ts, plus one narrow, evidenced allowlist line
  },
});
```

Keep the added allowlist entry as narrow as possible (a specific message substring/status code,
never a wildcard) and comment the evidence for why it's benign — see
`purchase-decline.spec.ts` and `webhook-replay.spec.ts` for the two existing precedents.

## The legal-copy rule for captions and assertions (CLAUDE.md §11)

Tools Australia is a game-of-chance trade promotion, not gambling, and entries are a **free**
inclusion — never sold. This applies to spec code too, not just app copy:

- **`demo.step()` titles are user-facing** — they're burned into proof-mode mp4 captions shown to
  non-technical stakeholders (see proof-mode.md). Write them in free-entry framing, same as any
  other customer-facing string; never "chance to win", "odds", "buy entries", etc.
- **Assertions against real page copy** must never assert *for* banned language — if you're
  writing a spec that touches marketing copy, check it against
  `e2e/specs/marketing/legal-copy.spec.ts`'s `BANNED_COPY` list first. If you add a new
  marketing-style page, consider adding it to that spec's `PAGES` array rather than duplicating
  the check.
- A genuine hit in `legal-copy.spec.ts` is a real legal-exposure finding — never weaken the
  regexes, drop a page from `PAGES`, or skip the test to make it pass. Escalate instead.

## The a11y baseline signoff rule

`e2e/specs/quality/a11y.spec.ts` pins a `KNOWN_VIOLATIONS` baseline (see a11y-baseline.md) —
it is a burn-down list of real, currently-unfixed product bugs, **not** a suppression list you
can extend to make a new failure pass.

- **Never add a new entry to silence a fresh violation the suite just surfaced.** A new
  serious/critical axe violation must be triaged and either fixed in `src/` or explicitly signed
  off by the controller/user before it's added to the baseline.
- If you do add a signed-off entry: match the axe target selector **exactly** via the `exact()`/
  `exactAny()` helpers (regex-escaped, anchored `^...$`) — a loose utility-class fragment can
  silently absorb a future, different violation. Only the rotating-promo-banner entries get the
  broader `exactAny()` treatment, and each carries a `DOCUMENTED EXCEPTION` comment explaining
  why (cycling text content, but a stable CSS target).
- **Remove an entry once the underlying `src/` fix lands** — the suite goes stricter
  automatically; do not leave a dead baseline entry around "just in case".

## Proof-mode narration (`@demo` specs only)

Wrap the meaningful steps of a `@demo`-tagged spec in `demo.step(title, fn)` instead of plain
inline code — see proof-mode.md for the full mechanics. `demo.step` is a zero-overhead passthrough
to plain `test.step` outside `E2E_PROOF=1`, so adding it never affects `@smoke`/`@purchase` runs.
When a caption talks about a specific element, call `demo.highlight(locator, note?)` (also in
`e2e/fixtures/demo.ts`, also a no-op outside proof mode) right before acting on it — a caption
naming a button nobody can spot on screen fails video-review.md's Judge H.

Registration coverage note (2026-07-22): `e2e/specs/auth/registration.spec.ts` includes a plus-addressed-email regression test (old User regex rejected `+`; guards the permissive-validation fix).

Showcase entry point (2026-07-22): `e2e/specs/membership/purchase-via-showcase.spec.ts` drives the
same subscription purchase as `purchase-subscription.spec.ts`, entered via the homepage's
"Build your prize" configurator instead of `/membership` — see its inline comment for the
verified event-dispatch chain (`useMajorDrawEntryCta.openEntryFlow` → `openMembershipModal`
window event → `MembershipSection`'s listener).

Assert the LOADING state, not just the settled one (2026-07-28, panel F-043): `not.toHaveAttribute`
passes when the attribute is **absent**, so a settle-gate like `bannerSettled` stays green even if the
skeleton it waits on disappears entirely — which is the anti-layout-shift fix regressing. If a
component has a deliberate loading shell, one test should navigate with `waitUntil: "commit"` and
assert the marker is **present** before asserting it clears. See
`portal-return-banner.spec.ts` ("banner reserves its space…"), which must run signed-in because guests
deliberately skip that shell.

A scan spec must prove it scanned something (2026-07-28, panel F-037): `legal-copy.spec.ts` reads
`body.innerText()` after `networkidle`, but param-gated copy that arrives with a client query may not
exist yet — the scan then passes having covered nothing and never goes red. Where a PAGES entry exists
for such copy, gate the read on the copy being present (`aria-busy` cleared + an explicit headline
assertion), so an empty scan fails loudly.

Flag-gated UI belongs in the `@purchase` spec too (2026-07-28): `purchase-one-time.spec.ts` now asserts
the `/purchase-success` partner-portal CTA after the benefits-granted check — visible when
`NEXT_PUBLIC_PARTNER_DISCOUNT_SSO_ENABLED === "true"`, `toHaveCount(0)` otherwise. **Asserting the
ABSENCE is the point** while a feature is dark: it pins today's production behaviour so an early flag
flip or a `status.processed` shape drift fails loudly. Never CLICK that CTA in a spec — the SSO route
POSTs the real iGoDirect production tenant.

⚠ **Verify the server is YOURS before trusting any e2e measurement** (2026-07-28): if another worktree
holds port 3799, `next dev` dies with `EADDRINUSE` but the wrapper survives, so the orchestrator still
prints "server ready" and your run silently targets a foreign app. This produced a full set of
plausible-but-fictional measurements during a panel review. Until the harness guards it (panel F-034),
run `grep -c EADDRINUSE e2e-artifacts/logs/server.log` — anything but `0` means your results are void.

Cold-server compile budget (2026-07-28): a spec asserting client-state-dependent UI on a HEAVY
route (`/membership` is the worst case — modal + every section) must warm that route with a real
**browser** navigation in `beforeAll`, not just `request.get()`. An HTML fetch compiles the server
route but not the client chunks, and it is those Turbopack compiles on the first browser hit —
until they land, client-gated UI sits in its loading state. Measured under identical fixture
conditions: warm ≈ 3-8s to settle, cold ≫ 60s. Precedent + the full note:
`e2e/specs/membership/portal-return-banner.spec.ts`. Prefer waiting on a deterministic settle
signal (e.g. `aria-busy` clearing) over inflating timeouts.

Rewards-return demo (2026-07-24): `e2e/specs/membership/portal-return-demo.spec.ts` is the
narrated `@demo` walkthrough of the partner-portal rewards-return banner (blocked offer →
recommendation → covered state → dashboard chip). **Never click "Open partner portal" in a
spec** — the SSO route POSTs to the real iGoDirect production tenant and auto-creates a
permanent MyRewards record for the seeded fake member; highlight only. The assertion-focused
`@smoke` coverage for this surface is tracked as panel-review finding F-023
(`docs/tech-debt/panel-review-feature-igodirect-rewards-return.md`).

A timed burst must be a real burst — clicks are not (2026-07-28, panel F-008): if a spec asserts
that debounced behaviour COALESCES several interactions into one, driving it with several
`click()`s measures the harness, not the product. Each Playwright click re-runs actionability
checks, and on a dev server under three-project load the gap between clicks exceeded the 1000ms
debounce in `usePrizeBuildTracking` — so three separate writes were *correct* and the assertion
failed on all three projects. Drive the burst through the component's keyboard path instead
(`e2e/specs/marketing/prize-build-url-params.spec.ts` steps an ARIA radiogroup with `ArrowRight`),
which carries no per-step overhead. Same file, same lesson in reverse: **do not cross widgets
mid-burst.** `SelectorReel.selectAndFocus` moves focus inside a `requestAnimationFrame`, which on
WebKit landed *after* an explicit `focus()` on the second lane and stole the next key press back —
the burst then reported `toolboxSwitches: 3, toolsetSwitches: 0` instead of 2/1. Assert
cross-widget accumulation somewhere timing cannot interfere (cumulative counters only grow, so the
LAST beacon carries the totals however many were sent).

Scroll the element you are about to CLICK into view, not just its container (2026-07-28): a card
at the viewport edge is clickable, but the native focus that a click brings scrolls it fully into
view, which a scroll-delta assertion reads as page movement. Observed as an 82px drift on
mobile-safari in a test whose whole point was "selecting a prize must not move the page".

Bonus-code journey (2026-08-27) — `e2e/specs/membership/bonus-code-journey.spec.ts`. Three things
worth carrying into the next spec that has to prove a grant:

1. **Wait on the LEDGER, not on `entries > 0`.** `waitForOneTimeEntries` / `waitForActiveMembership`
   return the instant the customer has any entries at all, and the package's OWN entries land in the
   draw strictly BEFORE the campaign redemption runs — so reading a combined total on their signal is
   a guaranteed race. `waitForCampaignGrant()` (`e2e/helpers/bonus-code.ts`) is the right signal.
   **But wait on the LAST write, not the first.** The campaign receipt is three separate,
   non-atomic awaits inside the `checkAndRedeemCampaign` block of `payment-processing.ts`:
   `incLedgerGrants({ campaignEntries })` → `setLedgerCampaign({ code, … })` →
   `pushDrawGrant({ sourceKey: "bonus-entry-promo" })`. This helper's docblock used to claim
   `campaignEntries` was "written LAST" — it is written **first**, so a poll that returned on it
   handed the spec a doc whose `grants.campaign` was still in flight, and the spec went red at
   random with nothing wrong in the product. It now returns only once all three have landed, and its
   timeout message names which of the three is still missing.
2. **`entriesForUser` cannot tell a campaign grant from a package grant** — it sums `totalEntries`
   across every source. Use `drawEntryBucketsFor()` and assert `entriesBySource` per key
   (`membership` vs `bonus-entry-promo`), or the assertion passes on the wrong grant entirely.
3. **Never compute the expected value with the implementation's own expression.**
   `expect(granted).toBe(campaign.entriesAmount)` re-reads the same document the code read and
   passes even if the amount was dropped, doubled, or taken from the wrong row. The fixture picks
   `100`; the spec asserts the bare literals `100` / `15` / `115` with a comment naming each source.

4. **Setup that a parallel sibling can survive.** `beforeAll`/`afterAll` run **once per worker**, and
   `playwright.config.ts` is `fullyParallel` — so a shared fixture's teardown fires while another leg
   is still mid-run. This spec's original `afterAll` deleted the campaign **and every issuance against
   it** at roughly t+100s, right inside the other leg's 180s wait for the grant it was about to
   assert. Setup is now an idempotent `updateOne(..., { upsert: true })` with no issuance deletion,
   and there is **no fixture teardown at all**: `run.ts` → `wipeAndSeed` → `dropDatabase()` already
   guarantees a clean database per run.
5. **Never wait on `waitForActiveMembership` for an anchored purchase.** It requires
   `subscription.status === "active"`, and under anchor-24 (AEST 25/26/27) these subscriptions REST at
   `trialing` — `active` only ever exists as a transient. It burns its full budget and then fails a
   spec that is otherwise green. Wait on the grant ledger instead.
6. **Absence needs an observed edge, not a sleep.** The negative leg used to `waitForTimeout(20_000)`
   and call silence a pass — on a slower machine a campaign grant landing at 25s turns a BROKEN
   visibility rule green, which is the dangerous direction. It now polls `waitForGrantLedger()` (the
   `BenefitsGranted` doc appearing proves the webhook ran) and adds a short 5s tail for the campaign
   block, which is written last.

✅ **Fixed 2026-08-27 — but read this before trusting a green pack leg.** The positive legs were red
against a real product defect: `MembershipModal` pre-warms the checkout object the moment the
billing step mounts, and the coupon row lives on that same step, so the object that got charged
carried no `campaignCode`. The fix stamps it at the PURCHASE click, before `confirmPayment`
([payment/gotchas.md](../payment/gotchas.md#the-applied-discount-code-was-thrown-away-at-checkout-fixed-2026-08-27)).
The **membership** leg measured a deterministic bug. The **one-time pack** leg measured a RACE —
`create-one-time-purchase` did send the code, but patched the PaymentIntent after the browser
confirmed it, racing the webhook's own fresh retrieve — and a race can pass against unfixed code on a
fast machine. Reverting the fix left that leg green two runs in three.

**That is now fixed by asserting the mechanism, not the outcome.** The pack leg asserts, directly:
exactly **one** `POST /api/stripe/create-payment-intent` produced an object for the whole checkout
(`trackPaymentIntentCreations`, installed before the first navigation because the call it must see
is the pre-warm); the `BenefitsGranted` id equals that object's id, so the object charged is the
object the browser minted; and the object's own Stripe metadata carries a real `userId`/`userEmail`
plus the `campaignCode` — never the `"guest"` placeholder `create-payment-intent` stamps when a
call arrives without `userEmail`. None of those depend on who wins a race, so the leg fails on
**every** run when the duplicate-PaymentIntent mutex is dropped.

Scope worth knowing: this leg pays with a good card, so it never enters the
`PAYMENT_INTENT_CANCELED_RETRY` recovery branches. It therefore cannot catch a mutex regression in
*those* — provoking them needs the PaymentIntent cancelled between the pre-warm and the click, and a
retry there also remounts the Elements provider, so the card fields are empty and the automatic
retry cannot complete a charge on its own. Know that before writing a leg that expects one.

`ta_anon_id` IS assertable on page routes — since 2026-07-28 (superseded note, corrected
2026-07-29): this note previously said the opposite, and that was true when written. The cookie's
only writer used to be `/api/ab-testing/assign`, so a visitor who never triggered an experiment
reached a promo page with no identity at all — 38.2% of real promo visits in the 30 days to
2026-07-28 (panel finding F-014). Main's `c5a360c1` fixed it: `src/middleware.ts` now mints the
cookie for every matched page route via the edge-safe `src/lib/ab-testing/anon-id-cookie.ts`.
So a spec MAY now assert `ta_anon_id` is present, `anon_`-prefixed and stable across navigations —
`prize-build-url-params.spec.ts` does, deliberately, because that assertion is what stops the
regression coming back. Still never SEED the cookie to make a spec pass: that hides exactly the
failure the assertion exists to catch.

## A leg whose assertion is an ABSENT interaction

`e2e/specs/membership/bonus-code-journey.spec.ts` carries a leg — *"minted code TYPED BUT NEVER
APPLIED"* — that is a near-clone of the leg above it with **one line removed**: the
`getByRole("button", { name: "Apply", exact: true }).click()`.

That absence is the assertion. It reproduces the customer journey the owner hit on the first real
run (type the code, press PURCHASE, get charged with nothing attached), and it is the **only**
executable proof in this repo that the purchase-time code resolve reaches the charge — the
Apply-first path was never broken, so it stays green either way, and there is no DOM test runner
here to catch the difference.

When you write a leg like this, say so loudly in the spec's own comment, or the next person will
"tidy" the two legs into one. It is registered under the existing `npm run e2e:bonus-code` grep.

## A leg whose assertion is a SENTENCE THAT MUST NOT APPEAR (2026-08-28)

The same spec's negative leg — *"no minted code: the same code at checkout grants nothing, and the
receipt does not claim it applied"* — now also reads the receipt. That customer was never minted the
code, `/api/codes/validate` clears it anyway (a guest has no session), and the **attach** is the only
thing that knows better. The success screen printed *"Campaign code LOCKIN100 applied"* anyway,
because `handlePaymentSuccess` used an `appendCodeBenefits` overload that fell back to browser state.

Two patterns worth copying:

- **Anchor a negative assertion on a positive one.** The success screen is transient (it auto-closes
  and redirects), so the leg waits for `getByText("Successful!")` to be visible *first*, then asserts
  `getByText(/code\s+LOCKIN100\s+applied/i)` has count 0. A bare absence check would also pass if the
  screen never appeared at all — which is a green test proving nothing.
- **Put it before the long wait.** The receipt check runs immediately after the purchase click, ahead
  of the 180 s ledger wait, or the screen is long gone by the time it runs.

This leg is also what makes the `attach answered 200 with no slot` allowlist entry load-bearing (see
[gotchas.md](./gotchas.md)), and it is the only executable proof of the receipt fix — there is no DOM
runner in this repo, so no unit test can reach it.
## Shop catalogue spec (2026-08-17) — two harness traps it hit

[`e2e/specs/admin/shop-catalogue.spec.ts`](../../e2e/specs/admin/shop-catalogue.spec.ts) covers
Phase 1 of the shop catalogue: admin create-with-variants, permission denial, and the
storefront variant picker reaching the cart. Two things cost a debugging cycle each.

**1. Do not `page.goto("/admin")` unless the dashboard is the thing under test.** Loading it
fires `GET /api/admin/analytics/spend-by-url`, which **500s in the seeded e2e environment**, and
the QA watchdog fixture fails any test that observes a 500 — including one whose own assertions
all passed. The catalogue contract is asserted through `request` only, so it never renders the
dashboard. There is consequently **no UI test for the Products tab**; restore one when that
route is fixed.

**2. Never assert a transient UI state.** The first version waited for the "Added to Cart!"
label, which `ProductInteractions` resets after 2 seconds on a `setTimeout`. Chromium won the
race; mobile WebKit did not. Assert the **durable** outcome instead — here, polling
`GET /api/cart` until the variant `sku` appears, which is also the thing that actually matters
(without it the printer cannot be told which size to make).

The interactive click-through is scoped to `chromium-desktop`, consistent with
[a11y-baseline.md](a11y-baseline.md#L44); mobile-WebKit clicks against the shared `next dev`
server are a known flake here (see `prize-build-url-params.spec.ts:141`). The API-level
assertions still run on every project.
