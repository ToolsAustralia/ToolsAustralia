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
