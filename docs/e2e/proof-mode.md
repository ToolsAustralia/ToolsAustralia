# E2E — Proof mode

Proof mode turns a `@demo`-tagged spec into a watchable, narrated mp4 for non-technical
stakeholders — a demonstration artifact, not a test-result artifact.

## Running it

```bash
npm run e2e:proof -- --grep @demo --project chromium-desktop
```

Always scope with `--grep @demo` — most specs carry no narration, and proof mode forces
`workers: 1`, so running it over the whole suite is both slow and produces nothing useful for
the untagged specs. Scoping to one `--project` avoids producing three near-identical bundles when
you only need one for a demo.

`npm run e2e:proof` = `tsx e2e/run.ts --proof`, which sets `E2E_PROOF=1` and switches
`playwright.config.ts`'s profile to `retries: 0`, `workers: 1`, `video: "on"`,
`launchOptions.slowMo: 200` (see `playwright.config.ts`). Today's `@demo` flows:
`landing.spec.ts`, `landing-drawn-states.spec.ts`, `my-account.spec.ts`,
`purchase-subscription.spec.ts`, `purchase-via-showcase.spec.ts`.

### Rules learned recording `landing-drawn-states.spec.ts` (2026-07-24)

These bite **only in proof mode**, so a spec that is green locally can still fail or record badly.

1. **Prepare each beat's page state BEFORE its `demo.step`, never inside it.** `demo.step`
   paints the caption and holds for `holdFor(title)` (~1.8-4s) *before* running the body, so a
   beat that mutates state and reloads inside its own body narrates a change the viewer cannot
   see yet. The first recording of this spec ran a full state ahead of the hero for its whole
   length. Mutate + reload first, then narrate what is already on screen.
2. **Never hand `demo.highlight` a locator that might be hidden.** `showHighlight` calls
   `scrollIntoViewIfNeeded()`, an actionability wait — and with no `actionTimeout` set in
   `playwright.config.ts` that wait never expires, so the test hangs to its own timeout with no
   useful error. This is easy to hit on the promo hero, where `PromoHero` renders a mobile AND
   a desktop copy and hides one by breakpoint, making `.first()` a coin flip. Resolve the
   visible one first (see the spec's `visibleHero` helper). `demo.ts` now bounds both
   `scrollIntoViewIfNeeded` and `boundingBox` at 5s so a bad target degrades to "no ring drawn"
   instead of killing the run, but passing a visible locator is still the caller's job.
3. **Wait for the hero BITMAP, not just a visible `<img>`.** `PromoHero` shows a brand "stage"
   background while the draw query resolves, so an attached-and-visible hero can still be a
   placeholder. Highlighting there spotlights the loader: on the first mobile recording BOTH
   sampled frames landed on it and roughly half the run showed no artwork at all. The spec's
   `awaitHeroPainted` blocks on `complete && naturalWidth > 0` (resolving on `error` too, so a
   genuinely broken asset fails the src assertion with a useful message rather than timing out).
4. **One test per Playwright project — never one test that resizes.** Playwright fixes the video
   canvas when the context is created and never rescales it, so `setViewportSize` to a phone
   mid-recording composites the page into a ~208x450 strip anchored top-left of the 800x450
   canvas with the rest dead grey. To cover both viewports, write a mobile test (`mobile-chrome`)
   and a desktop test (`chromium-desktop`), assert `testInfo.project.name` in each so neither can
   run in the wrong one, and join the two clips afterwards (below).

## Joining clips into one deliverable (`e2e/proof/join.ts`)

Rule 4 yields one clip per viewport, but a reviewer wants a single video. `npm run e2e:proof:join`
takes an output name and two or more clips, in playback order:

```bash
npm run e2e:proof:join -- drawn-states-all-prize-combinations \
  e2e-artifacts/proof/<date>-<branch>/on-mobile-.../on-mobile-....mp4 \
  e2e-artifacts/proof/<date>-<branch>/on-desktop-.../on-desktop-....mp4
```

Each input is scaled to fit a common 1280x720 canvas and padded in the title card's `#0b0b0e`,
so a portrait phone clip sits pillarboxed and centred rather than stretched, and the bars read as
deliberate. Frame rate, SAR and audio rate are normalised first — the concat filter rejects inputs
that differ, which is exactly the portrait-beside-landscape case. A clip whose voice synthesis
failed gets silent audio substituted so the audio leg stays balanced. Sibling `.srt` files are
concatenated with each clip's start offset applied and renumbered, so subtitles stay in sync
across the seam. Output lands beside the per-test bundle dirs as `<out-name>.mp4` / `.srt`.

## What it produces

For every test directory under `e2e-artifacts/test-results/` that has both a Playwright
`video.webm` and a `narration.json` sidecar, `e2e/proof/post.ts` (run automatically by the
orchestrator after the Playwright run, see architecture.md) produces:

- **`<slug>.mp4`** — the recording with burned-in subtitles (and, best-effort, a synthesized
  voice-over — see below).
- **`<slug>.srt`** — the subtitle file itself, also shipped standalone.
- **`step-N-<slug>.png`** — one screenshot per narrated step.
- **`report/`** — a copy of the run's HTML report, alongside the videos.

All of it lands under `e2e-artifacts/proof/<date>-<branch>/<test-slug>/` — gitignored, ready to
zip and send.

## The narration model — `demo.step()`

Inside a `@demo` spec, wrap each meaningful action in `demo.step(title, fn)` (the `demo` fixture,
`e2e/fixtures/test.ts` → `e2e/fixtures/demo.ts`) instead of writing it as plain inline code:

```ts
await demo.step("Opening the member dashboard", async () => {
  await page.goto("/my-account");
});
```

- **Outside `E2E_PROOF=1`**, `demo.step` is a no-op passthrough to plain Playwright `test.step` —
  zero behavioral or console overhead. Verified live: `npm run e2e:smoke` produces identical
  results with or without `@demo` specs' `demo.step` calls in the mix.
- **Inside proof mode**, on the test's first step it shows a full-screen title card
  (`testInfo.title`, held 2s). For every step it then: injects an in-page caption overlay with
  the step title, holds the frame for `holdFor(title)` ms (`e2e/proof/srt.ts` — floors at 1800ms,
  scales ~300ms per word, so captions stay readable without needing to pause the video), runs the
  real step body, and screenshots the result (`step-N-<slug>.png`). Every cue (`title`,
  `startMs`) is recorded to a `narration.json` sidecar next to Playwright's own `video.webm`.

## Post-processing (`e2e/proof/post.ts`)

Run by the orchestrator via the same `spawnAsync` reasoning as the test run itself (the dev
server/stripe-listen children are still logging concurrently — see architecture.md). For each
`video.webm` + `narration.json` pair:

1. **Derives per-cue windows** — each cue ends 200ms before the next starts, or at the recorded
   `endMs` for the last one. The last cue's `endMs` comes from the demo fixture's `flush()`,
   which runs at test teardown (after the test body returns) and can therefore overrun the
   actual recorded video length — `post.ts` clamps it to the video's real duration (probed from
   `ffmpeg -i <file>` stderr — `ffmpeg-static` ships no `ffprobe` binary, so duration comes from
   parsing ffmpeg's own `Duration: HH:MM:SS.cc` line instead).
2. **Writes the `.srt` sidecar, does NOT burn it into the video** — `toSrt(cues)`
   (`e2e/proof/srt.ts`) writes the `.srt`, and the webm is re-muxed to `libx264`/`yuv420p` for
   the mp4, but the subtitles are deliberately never burned into the frame: the in-page caption
   pill (`showCaption`, see above) is already part of the recording, and burning the `.srt` too
   doubled every line on screen (DJ review, 2026-07-22 — also what video-review.md Judge N's "no
   caption text duplicated by burned subtitles" criterion is checking for). The `.srt` ships as a
   sidecar next to the mp4 purely for accessibility (players can toggle it).
3. **Synthesizes voice** (best-effort — see below) and muxes it in.
4. **Copies step screenshots** and the HTML report alongside the mp4/srt in the dated output
   directory.

## AI voice — best-effort, never blocks the run

Voice synthesis uses `msedge-tts` (wraps the Microsoft Edge Read-Aloud API), voice
`en-AU-NatashaNeural`, one clip per cue, muxed in with per-cue `adelay` + `amix`.

- **API quirk**: `MsEdgeTTS.toFile(dirPath, text)` treats its first argument as an **existing
  output directory**, not a target filename — it always writes `<dirPath>/audio.<ext>`
  internally, and the directory must already exist first (`fs.createWriteStream` does not create
  it). `post.ts` therefore `mkdir`s a per-cue scratch subdirectory (`.voice-tmp/cue-<i>/`) before
  calling `toFile` and uses the returned `audioFilePath` as-is.
- **Fallback**: on any failure (offline, Edge API unavailable, a mid-loop synth error, etc.),
  `synthVoice` catches, logs `[proof] AI voice unavailable (...) — emitting subtitled video
  only.`, and returns `null` — the mp4 still ships with burned subtitles, just no voice track.
  This is intentional: proof mode must never fail (or hang) a demo bundle over a missing/flaky
  external TTS dependency.
- **No `-shortest` on the voice-mux ffmpeg step** — that flag truncates the *output* to the
  shorter of its two mapped streams. Since the synthesized voice-over almost always finishes
  before the recorded video does (the video keeps rolling through test teardown after the last
  spoken line), `-shortest` was silently chopping the shipped mp4 down to the voice track's
  length — measured: a caption whose burned-in display window ended at 23.4s got truncated to a
  20.06s mp4, cutting the tail mid-caption. Omitting it lets the video's own (longer, correct)
  length win; the mixed audio just plays out and then goes silent for the remaining frames.
- **WebSocket cleanup**: the TTS socket is closed in a `finally` covering the whole per-test synth
  loop. `post.ts` is launched by the orchestrator's `spawnAsync` with no timeout, so a leaked
  socket from a mid-run partial failure would otherwise hang `npm run e2e:proof` forever waiting
  for a process that never exits on its own.

## Sharing a bundle

Each `e2e-artifacts/proof/<date>-<branch>/<test-slug>/` directory is self-contained (mp4 + srt +
step screenshots + a copy of the HTML report) — zip the whole `<date>-<branch>/` directory (or
just the one `<test-slug>/` folder if sharing a single flow) and send it. Nothing inside depends
on the repo being checked out to view.

Demo-moment note (2026-07-22): the landing `@demo` spec includes a third narrated step
scrolling the "Build your prize" showcase into frame — added so proof videos capture the
prize-showcase redesign; anchored on the showcase cards' 8px kit sublabels.

Watchability round 2 (2026-07-22, after DJ's review of the first landing video):
- Captions render TOP-center (below the header) — this app parks sticky promo/countdown
  bars at the bottom of the viewport, and a bottom caption stacked on them reads as two
  overlapping banners. On viewports under 700px that 96px offset lands the caption squarely on
  the hero headline and hides the prize copy the video exists to show, so `showCaption`
  re-derives placement on every paint: phones pin it to the very top (over the logo bar, which
  is chrome rather than content) with tighter type, desktops keep the 96px offset.
- Captions survive navigation. `showCaption` appends to `document.body`, so any `page.goto`
  destroys it — a beat that walks several URLs (as `landing-drawn-states.spec.ts` does, stepping
  through all 15 prize combinations inside one step) would caption only its first page and run
  the rest silent, drifting out of sync with the SRT and voice-over that are still on that cue.
  `makeDemo` repaints the active caption on every `domcontentloaded`, pinning it to the BEAT
  rather than the document.
- `demo.smoothScrollTo(locator)` glides in ~350px smooth increments in proof mode
  (instant outside it) so videos show the page flowing instead of jump-cutting between
  sections. Use it for any demo step that moves down a page.
- Deliverable QA rule: extract frames from every produced mp4 (ffmpeg -ss ... -frames:v 1)
  and visually verify caption placement + content BEFORE sharing a proof video.

Visual guidance (2026-07-22, `purchase-via-showcase.spec.ts`): `demo.highlight(locator, note?)`
draws a pulsing cyan/blue ring (`#00c2ff` — NOT this app's own brand red, which several of its
own CTAs and active-state borders already use) + optional corner note label around a target's
current boundingBox so a viewer knows WHERE to look (video-review.md Judge H) — call it AFTER a
scroll settles (it reads the boundingBox once and doesn't track further scrolling), and it's
cleared automatically at the start of the next `demo.step` so a spotlight never bleeds into the
following caption; no-op outside proof mode like every other `demo` method.

Judge-panel polish round (2026-07-22, chasing a stricter shipping bar — no criterion <4, average
≥4.5, zero disclosed cosmetic defects):
- **Warm the route before the first `demo.step`, never inside it.** `demo.step`'s caption/title
  card paints on whatever page is CURRENTLY loaded the instant it's called — with `page.goto`
  living inside the first step's body, the opening caption showed over the still-blank tab,
  before navigation had even started (Judge R: "opening beat never captions over a blank page").
  Every `@demo` spec's opening beat now does `await page.goto(...)` + waits for a real landmark
  (e.g. `section.hero-section`, the Hero wrapper) to be visible BEFORE calling `demo.step` at
  all — a silent warm — so the first caption always lands on an already-rendered page.
- **`demo.highlight`'s ring now dims everything else on screen** (a huge-spread second
  box-shadow — the standard "spotlight cutout" trick, see the doc comment in `demo.ts`), not
  just outlining the target. This satisfies "ring/glow + dimmed surroundings" AND removes
  competing noise for free: a sticky site widget (promo banner, countdown) sharing the frame
  with a highlighted CTA now dims along with the rest of the page instead of fighting it for
  attention.
- **Call `demo.highlight` again within the SAME beat to move the spotlight onto a later click
  target.** It replaces the single fixed-id ring, not stacks — so if a beat highlights element A
  (e.g. the Stripe iframe, to show what's being typed) and then clicks a DIFFERENT element B
  outside A's box (e.g. a submit button below the iframe), re-call `demo.highlight(B, ...)` right
  before the click so the click always lands inside the currently-highlighted region (Judge H:
  "clicks land visibly inside the highlighted region").
- **Land the final beat on the app's own settled confirmation state, not mid-poll.** Purchase
  specs assert the outcome at the database (webhook-granted benefits), which can resolve before
  the client's own success UI has caught up. Explicitly wait for that UI's confirmation text
  (e.g. `SuccessScreen.tsx`'s fixed "Transaction complete" status strip) at the end of the last
  step so the recording's final frames land on a meaningful result, not an in-flight state
  (Judge R: "ending lands on a meaningful final state ... not mid-motion").

## Watchability round 3 — open on the title card, speak the client's language (2026-07-22)

Frame-verifying the "SHIP"-rated showcase video at t<2s (a region the judge panel's
cue-midpoint frame set never sampled) found two defects the panel missed:

1. **~2.2s of pure white at the start.** Playwright records the whole browser context, so
   the raw webm opens with the pre-navigation blank tab. Fix is in the pipeline, not per
   spec: `demo.ts` stamps `titleCardAtMs` into `narration.json`, and `post.ts` trims the
   shipped mp4 to start there (`-ss` before `-i` + re-encode = frame-accurate), shifting
   every cue and voice-clip delay by the same amount so the sidecar `.srt` and narration
   stay in sync. Videos now open ON the title card. Older `narration.json` files without
   the field get a zero trim.
2. **The title card showed the spec id** ("payment → webhook → 15 entries exactly once") —
   engineer jargon for a client-facing demo. A spec can now push
   `test.info().annotations.push({ type: "demo-title", description: "..." })` and the card
   (plus `narration.json.displayTitle`) uses that copy; fallback is still `testInfo.title`.
   The annotation MUST be read lazily at the first `demo.step` — `makeDemo` runs during
   fixture setup, before the test body pushes the annotation (the eager version shipped the
   old title; caught by frame-reading the re-render, kept as a warning here).

Rule reaffirmed by both catches: **extract frames where nobody looked, not just where the
cues point** — opening/closing seconds are now part of the standard verification set in
`.claude/commands/video-review.md` runs.

## Round 4 — settle overlays BEFORE the beat, never inside it (2026-07-22, flagship)

Same failure class as the warm-route rule, at the other end of the flow: `demo.step` paints
its caption the INSTANT it's called, so any settling work inside the beat body (waiting out
auto-modals, dismissing an onboarding wizard) runs UNDER the beat's caption — the first
flagship render captioned "their wallet shows all 450 free entries" over the new member's
force-opened SET PASSWORD wizard for ~5s (frame-verified at t=61.4s). The rule generalizes:

> A beat's caption must open ON its subject. Anything that must happen first — navigation,
> loading, modal dismissal — happens BEFORE `demo.step` is called, silently, under the
> previous beat's (still-relevant) caption or none.

The full-journey spec's final beat is the reference: success-screen auto-close + wizard
dismissal + wallet-visible wait all precede the `demo.step` call.

## `@demo` is a CLIENT-FACING curation tag (2026-07-22 full-bundle review)

`@demo` means "this flow's narrated video is client-demo material" — it is not a synonym for
"has `demo.step` calls". The first full `--grep "@demo"` bundle render surfaced the drift:
the my-account **chunk-gating regression guard** and the **guest-gate redirect** carried the
tag from the foundation build and produced engineer-facing videos (spec-id title cards, a
26s chunk-download narration). Both lost the tag; `demo.step` calls may remain in untagged
tests (they're plain `test.step` outside proof mode and still caption correctly if a bare
unscoped proof run ever renders them). The curated client bundle is exactly
`npx tsx e2e/run.ts --proof --grep "@demo" --project chromium-desktop`.

Checklist for tagging a test `@demo`: client-meaningful story, `demo-title` annotation,
route warmed before the first beat, captions explain (never label), and the video passes
the `/video-review` panel once rendered.
