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
`landing.spec.ts`, `my-account.spec.ts`, `purchase-subscription.spec.ts`.

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
2. **Burns subtitles** — `toSrt(cues)` (`e2e/proof/srt.ts`) writes the `.srt`, then ffmpeg's
   `subtitles` filter burns it into the video (`libx264`/`yuv420p`).
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
