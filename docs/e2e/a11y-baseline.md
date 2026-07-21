# E2E — Accessibility baseline (burn-down list)

`e2e/specs/quality/a11y.spec.ts` runs `AxeBuilder` (`wcag2a`/`wcag2aa`) + the `uiAudit` lens
(`e2e/fixtures/ui-audit.ts` — horizontal overflow, broken images) against `/`, `/login`,
`/membership`, filtered to `serious`/`critical` violations only.

## This is a burn-down list, not a suppression list

Rather than asserting zero violations outright (which would be red today), the spec pins a
`KNOWN_VIOLATIONS` baseline keyed by page path (`ruleId` + `targetPattern` regex + a one-line
`bug` description). Every serious/critical violation node is checked against the baseline for its
page:

- **A matched node** is surfaced as a `known-a11y-bug` test annotation (visible in the HTML/JSON
  report) instead of failing — the real defect stays tracked and visible without blocking the
  suite.
- **Any node that does NOT match an existing baseline entry fails the test as a genuine
  regression.**

**Burn-down rule:** remove an entry once the underlying `src/` fix lands — the suite goes
stricter automatically. **Never add a new entry to silence a fresh failure the suite surfaces** —
a new violation must be triaged and either fixed or explicitly signed off by the
controller/user before it's added to `KNOWN_VIOLATIONS`. See adding-a-spec.md's "a11y baseline
signoff rule" for the mechanical rule.

## Selector discipline

Baseline `targetPattern`s use `exact()`/`exactAny()` (`e2e/specs/quality/a11y.spec.ts`) —
regex-escaped, anchored (`^...$`) matches against the literal axe `target` selector string, not a
bare substring test. Stable-DOM entries match the full target selector. Only the rotating
promo-banner entries use the broader `exactAny()` (multiple known literal selectors), each
carrying a `DOCUMENTED EXCEPTION` comment — this is because the banner's **visible text/href
cycles**, but the CSS selector axe generates for it is one of a small, stable, enumerated set
across every capture. Loose utility-class fragments are never acceptable — they can silently
absorb a future, unrelated violation on the same page.

## Known baseline gap — chromium-desktop-only, discovered by Task 13's full-suite gate

`KNOWN_VIOLATIONS` was authored and verified (Task 9, and every later task that touched
`a11y.spec.ts`) exclusively via `--project chromium-desktop` — no prior task ever ran `@a11y`
across all three browser projects. Task 13's success-criteria gate (`npm run e2e`, unscoped, all
projects) was the first time this happened, and it surfaced real, unbaselined violations on
`mobile-chrome`/`mobile-safari` that chromium-desktop's baseline doesn't cover. **Confirmed
deterministic across two independent full-suite runs** (both back-to-back `npm run e2e`
executions in the same session hit the identical violations, on both attempt and retry, on both
mobile projects) — this is a structural coverage gap, not a flake. Captured verbatim:

- **`/` on mobile-chrome and mobile-safari** — two `color-contrast` nodes, neither matching the
  existing chromium-desktop baseline selectors:
  - `.max-w-md > .sm\:pt-12.px-1.pt-8:nth-child(2) > ... > .corner-ribbon[role="img"][aria-label="MOST POPULAR"] > div:nth-child(3) > div > .whitespace-nowrap.font-black`
    — almost certainly the **same** "MOST POPULAR" ribbon bug already baselined for desktop, but
    the ancestor selector axe generates differs at the mobile breakpoint (`.max-w-md` vs
    `.md\:grid-cols-3`), so the anchored `exact()` pattern correctly does NOT match it — this is
    a selector-fingerprint difference, not evidence of a second bug.
  - `.max-w-md > .sm\:pt-12.px-1.pt-8:nth-child(3) > ... [aria-label="Select Boss for $80"] > .leading-none.flex-col.items-center > .sm\:text-\[20px\].leading-none.text-\[16px\]`
    — a **different** card ("Boss" tier, $80) and a different sub-element (the price text, not
    the ribbon) — this one has not been visually triaged against the desktop baseline and may be
    a genuinely separate contrast bug only reachable at mobile widths.
- **`/membership` on mobile-chrome and mobile-safari** — `scrollable-region-focusable @ .gap-\[22px\]`
  (a rule not present in the desktop baseline at all — a scrollable region without a keyboard-
  focusable ancestor; reproduced identically in both full-suite runs, on both projects, on both
  attempt and retry). One run's mobile-safari retry additionally showed a one-off
  `aria-roles @ .bar` that did not reproduce on the second full run — likely a genuine
  intermittent (possibly tied to the same `/membership` timing race documented in gotchas.md),
  not yet re-confirmed.

**None of these have been added to `KNOWN_VIOLATIONS`** — per the signoff rule (adding-a-spec.md),
a newly-surfaced violation needs triage and controller/user signoff first, not a same-session
addition to make the suite green. Until triaged, `npm run e2e` (unscoped, all projects) will show
these as failures on `mobile-chrome`/`mobile-safari`; `npm run e2e:smoke` and any
`--project chromium-desktop`-scoped `@a11y` run are unaffected. See the Task 13 report
(`.superpowers/sdd/task-13-report.md`) for the full verbatim capture.

## Current baseline — every entry is a real, open product bug

### `/` (home)

| Rule | Bug | Likely fix location |
|---|---|---|
| `color-contrast` | "MOST POPULAR" ribbon badge on the home membership card is white-on-gold (~2.19:1, needs 4.5:1) | `src/components/sections/membership/ElectricPackageCard.tsx` |
| `color-contrast` | Rotating promo-banner text/link is near-white-on-red (~4.36:1, needs 4.5:1) | `src/components/promo` or `src/components/banners` |

### `/login`

| Rule | Bug | Likely fix location |
|---|---|---|
| `button-name` | Password show/hide toggle button has no accessible name (no text, `aria-label`, or `title`) | login form component |
| `label` | Email input has an empty placeholder and no `<label>`/`aria-label` | login form component |
| `label` | Remember-me checkbox has no `<label>`/`aria-label` | login form component |

### `/membership`

| Rule | Bug | Likely fix location |
|---|---|---|
| `color-contrast` | Rotating promo-banner text/link is near-red-on-red (~1.05:1, needs 4.5:1) | `src/components/promo` or `src/components/banners` |

## Fixing one of these

1. Land the `src/` fix.
2. Run `npm run e2e -- --grep @a11y` (or the specific page's test) — confirm the previously-known
   violation node no longer appears (the test still passes either way, but the annotation for
   that entry disappears from the report).
3. Remove the now-dead entry from `KNOWN_VIOLATIONS` in `a11y.spec.ts`.
4. Re-run once more to confirm no *other* violation was hiding behind it on the same page/rule.

## Related product-bug pointers found by other lenses (not in the axe baseline)

These are real product issues surfaced during e2e development that aren't axe/a11y violations
but are worth tracking alongside this list:

- **`/my-account` referral-code lazy-create throws on the seeded email.**
  `src/lib/referral.ts`'s `getOrCreateReferralProfile()` does a full-document `user.save()` to
  lazily create a referral code, which re-runs Mongoose schema validation on every field —
  including the email regex, which rejects a `.local`-TLD address. Only surfaces for a `.local`
  email that never goes through `.save()` at creation time (the e2e seed inserts directly, so it
  never hits this until something calls `.save()` on the fetched document — e.g. `/my-account`'s
  own dashboard load). Confirmed by direct reproduction outside the HTTP layer.
- **`/my-account` dashboard fetches `/api/stripe/payment-methods` unconditionally on every
  load**, not only when a payment-management flow is opened — for a seeded/fake
  `stripeCustomerId` this 500s in Stripe test mode. Both are stubbed at the network layer in
  `visual.spec.ts` (test-side only) rather than fixed in `src/`, since they're outside this
  domain's scope — see `stubMyAccountFlakyReads` there for the full detail and citations.
- **Upsell fallback image 400s.** `GET /_next/image?url=%2Fimages%2Fupsells%2F_fallback.webp...`
  returns 400 — reproducible any time the post-purchase upsell modal's fallback image path is hit
  and given enough time on the page to actually fire the request (verified via network trace, not
  guessed). Next's image optimizer choking on the upsell fallback asset — pre-existing, unrelated
  to webhook/purchase logic. Shadowed in `webhook-replay.spec.ts`'s watchdog override rather than
  fixed here.
