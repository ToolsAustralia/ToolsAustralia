# Membership Streak — Client Demo Video (Design Spec)

**Date:** 2026-07-28 · **Owner:** DJ · **Status:** awaiting owner review
**Feature spec:** `docs/superpowers/specs/2026-07-07-membership-streak-design.md`
**Pipeline:** `docs/e2e/proof-mode.md`

## 1. What this is

A narrated, client-facing demo of the **Membership Streak** — the complete feature run
across every account state, rendered by the repo's existing proof-mode pipeline into
watchable mp4s (mobile + desktop).

This builds **no product code**. The streak is already fully implemented; this spec covers
the *demonstration artifact* only: an e2e spec, a seed helper, one env-overlay line, and a
proposed terms clause delivered as a document.

### Framing note (must be said to the client)

The streak is **built but shipped dark** — `DASHBOARD_FEATURES.loyaltyStreak` and
`.milestoneProgress` (`src/config/dashboardFeatures.ts`) are gated behind
`NEXT_PUBLIC_DASHBOARD_STREAK_PREVIEW`, and the rungs are not yet activated. The launch
runbook (backfill → seed rungs dark → activate → flip flags) is documented in that file and
has not run in production. This demo is a **preview of a finished feature**, not a tour of a
live one. Say it in the intro rather than let it be discovered.

## 2. Deliverable

Two narrated mp4s, one per Playwright project:

- **`mobile-chrome`** (Pixel 7) — the priority viewport
- **`chromium-desktop`** (1280×720)

Each ships with AU voice-over (`en-AU-NatashaNeural`), in-page captions, spotlight rings,
per-beat screenshots and a sidecar `.srt`, under
`e2e-artifacts/proof/<date>-<branch>/<test-slug>/`.

Plus a short **coda clip** (beat 12, logged-out guest) which requires its own browser context.

**Not joined by default.** The full arc runs ~3–4 min per viewport; a joined master would be
a ~7-minute sit. `e2e/proof/join.ts` remains available if a single link is wanted.

**Binding constraint — proof-mode rule 4:** one test per Playwright project, never a
mid-recording `setViewportSize`. Playwright fixes the video canvas at context creation and
never rescales it, so resizing composites the page into a ~208×450 strip on a dead-grey
canvas. Each test asserts `testInfo.project.name` so neither can run under the wrong project.

## 3. The mechanism — one account, time-compressed

The main video walks **one member through their whole life** rather than logging into ten
accounts. Between beats the spec writes `subscription.streakMonths` (and the draw's
`entriesBySource.streak`) directly into Mongo, reloads the page, then narrates. Months
compress into seconds while every number on screen remains the **real counter driving the
real card**.

Two rules govern this, both learned the hard way and documented in `proof-mode.md`:

1. **Mutate + reload BEFORE the beat's `demo.step`, never inside it.** `demo.step` paints its
   caption and holds for `holdFor(title)` *before* running the body, so a beat that mutates
   inside its own body narrates a change the viewer cannot see yet.
2. **A beat's caption must open ON its subject.** Navigation, loading and modal dismissal all
   happen silently before the `demo.step` call.

### Account states and how each is driven

| Beat state | How it's produced |
|---|---|
| `acct: "none"` | Clear `user.subscription` — registered account, never purchased |
| `acct: "onetime"` | One-time package on the user, no active subscription |
| `streak N` | Write `subscription.streakMonths = N` |
| celebration | Seed `localStorage["ta-streak-seen:<userId>"] = N-1`, then write `N` |
| entries | Write `entriesBySource.streak` on the draw's entry subdoc; keep `totalEntries` equal to the bucket sum |
| `past_due` | `subscription.status = "past_due"` |
| `paused` | **Unverified** — the card's `paused` prop has no live payload signal (see §7) |

## 4. Beat sheet

Ladder for reference: **Lv2 +100 · Lv4 +200 · Lv6 +300 · Lv8 +400 · Lv10 +500 · Lv12 +600 +
Founding badge**, repeating every 12 renewals.

| # | Beat | State | What the viewer sees |
|---|---|---|---|
| 1 | Not a member yet | `acct: none` | `DashboardGuestPanel` — "Enter the {draw}", *Become a member* / *Buy a package*, benefits list, **full streak teaser with all six amounts** |
| 2 | One-time buyer | `acct: onetime` | Member dashboard shell, streak card still "Members only" — the ladder as upsell |
| 3 | Day one | `streak 0` | "New streak" chip, empty medallion, *"+100 free entries at your 2nd"* |
| 4 | Building | `streak 3` | Lv.2 lit, Lv.4 pulsing with +200 pill, day-granular renewal fuse |
| 5 | **The payoff** | `streak 4` + marker | Celebration: gold chip, *"+200 free entries landed in {draw}"*, confetti, wallet ticks up |
| 6 | Entries proof | `streak 6`, `streak: 600` | Gold Streak bucket = 600 banked (100+200+300), inside the real draw |
| 7 | Founding | `streak 12` | Crown medallion, permanent badge, *"the ladder repeats every year"* |
| 8 | Forgiving | `past_due` (→ `paused`) | *"Your streak's safe — fix your card and it carries on"* |
| 9 | **The save** | `streak 7` | Real modal: reason → **"Your 7-renewal streak is on the line"** → +400 at 8th → pause reframed *"Pausing freezes your streak"* → "Keep my streak" |
| 10 | Forward framing | `streak 1` | *"ONE renewal away from your first milestone"* + full ladder |
| 11 | The legals | — | `/terms` §5.1, sentence 3 spotlit |
| 12 | Coda (separate clip) | logged out | Guest bounced to `/login`; no public surface mentions the streak |

Beats 9–10 get the longest holds — that is the retention lever and the commercial argument.

Beat 12 needs its own test with `storageState: { cookies: [], origins: [] }`: Playwright
records per browser context, so signing out mid-recording would end the clip.

## 5. What is real vs. staged

**Real:** the dashboard and all seven card states; the ladder config; the entry wallet and its
gold bucket; the cancellation route, stakes screen and offer waterfall; the terms page; every
number displayed.

**Verified — the cancellation story records for real.** The `start` and `stakes` actions on
`src/app/api/subscription/cancellation-flow/route.ts` are pure Mongo; `streakMonths` is
server-derived from the user doc so the stakes screen renders genuine data. Only
`accept_offer` touches Stripe, and "Keep my streak" (the save) does not. No stubbing is
needed for beats 9–10.

**Staged:** the passage of time (the counter is written directly rather than waiting six
months), and beat 5's celebration marker. Neither changes what the feature does.

## 6. Proposed terms clause (separate deliverable)

Terms §5.1 sentence 3 currently reads *"Additional entries may be offered via promotions,
referrals, or free entry methods"* — generic coverage; the streak is never named. Proposed
addition, compliant with CLAUDE.md rule 11 (free-entry framing, no probability language,
entries never priced):

> **5.1(e) Membership Streak.** Members receive free entries at consecutive paid renewal
> milestones — the 2nd, 4th, 6th, 8th, 10th and 12th consecutive renewal — granted
> automatically into the next eligible Major Giveaway. These free entries are included with
> the membership at no additional cost and are not sold separately. A streak counts
> consecutive **paid** renewals only. A membership that lapses in full resets the streak to
> zero and the milestone ladder restarts. Paused or overdue memberships accrue no streak
> progress while no renewal payment is made. The ladder repeats every twelve consecutive
> renewals. Tools Australia may vary or withdraw future unearned milestones on reasonable
> notice; milestones already earned are unaffected.

Adoption is the owner's call. The video shows §5.1 **as it stands today**; this clause ships
as a document alongside it.

## 7. Findings to report to the client

**The streak has no public surface.** It renders on exactly three pages, all under
`/my-account` (`page-client.tsx`, `draws/page-client.tsx`, `rewards/page-client.tsx`). It
appears nowhere on the public marketing site and **nowhere in `MembershipModal`** — the
surface where a customer actually decides to buy. The strongest reason-to-join is therefore
invisible until after joining. This is not a defect in the streak branch (the spec scoped the
teaser to the dashboard) but it is a high-value, low-effort follow-up.

**The `paused` card state may not be reachable from seeded data.** `LoyaltyStreak`'s `paused`
prop is documented in the component as "no live payload signal yet — prop-ready per the Build
Kit". If seeded data cannot drive it, beat 8 narrows to the at-risk state alone and the pause
story is carried by beat 9's pause-freeze reframe, which *is* real. To be verified during
implementation, not assumed.

## 8. Files

**New**
- `e2e/specs/membership/streak-journey.spec.ts` — mobile test, desktop test, guest coda
- `e2e/seed/streak.ts` — the cast + state-mutation helpers
- `docs/STREAK_TERMS_CLAUSE.md` — the §5.1(e) draft (root `docs/*.md` is this repo's
  convention for cross-cutting documents, e.g. `BRAND_VOICE.md`; no new folder is warranted)

**Touched**
- `e2e/lib/env.ts` — add `NEXT_PUBLIC_DASHBOARD_STREAK_PREVIEW: "true"` to the overlay.
  **Without this the streak card never renders and the whole demo is blank.**
- `e2e/seed/index.ts` — wire the streak seed
- `docs/e2e/proof-mode.md` — document the new `@demo` flow and any rules learned

No `src/` or `scripts/` changes, so no BUSINESS.md / CUSTOMER.md doc-sync triggers fire. The
`e2e` domain doc is the one to update.

## 9. Verification

Test titles (fixed here so the `--grep` scoping below is unambiguous):

- `"the Membership Streak, end to end, on mobile"` — `mobile-chrome`
- `"the Membership Streak, end to end, on desktop"` — `chromium-desktop`
- `"what a non-member sees"` — the beat-12 coda, `mobile-chrome`

```bash
npx tsx e2e/run.ts --proof --grep "on mobile"  --project mobile-chrome
npx tsx e2e/run.ts --proof --grep "on desktop" --project chromium-desktop
```

- Scope by **test title**, not just `--project` — `--project` alone still collects both tests,
  and a serial describe will skip the survivor when the mis-projected one fails.
- Extract frames from each mp4 **including the opening and closing seconds** (`ffmpeg -ss …
  -frames:v 1`), not just at cue midpoints — that is where the blank-tab and stale-title-card
  defects hid.
- Run `/video-review` on both files before sharing. Bar: no criterion below 4, average ≥ 4.5,
  zero disclosed cosmetic defects.

## 10. Out of scope

No product code changes. No terms edit (the clause is proposed, not applied). No launch-runbook
execution. No public-surface streak teaser — reported as a finding (§7), not built here.
