---
description: Judge panel for proof-mode demo videos — rates recording, narration, and visual guidance against the demo bar; verdict SHIP / RERENDER with executable fixes. Run on every client-facing video before sharing.
---

Rate a proof-mode demo video (`$ARGUMENTS` = path to the mp4, or the newest bundle under
`e2e-artifacts/proof/` when empty) against the house demo bar. The output is a verdict —
**SHIP** or **RERENDER** — with per-dimension scores and *executable* fixes, never vibes.

## 0. Extract the evidence (controller, before any judging)

- Locate the mp4 + its sibling `.srt` and the flow's `narration.json` (same folder) and
  step screenshots.
- Probe duration/streams: `node_modules/ffmpeg-static/ffmpeg.exe -i <mp4>` (stderr).
- Extract a frame at each narration cue's midpoint plus the final second:
  `ffmpeg -y -ss <t> -i <mp4> -frames:v 1 frame-<t>.png`. These frames + the cue titles
  ARE the judging package. A video nobody frame-checked is an unverified claim.

## 1. The three judges (parallel subagents, one message)

Each judge gets: the frame set (Read as images), the cue list with timestamps, duration,
and this rubric. Each returns scores 1-5 per criterion with frame-referenced evidence and
one executable fix per deduction. 5 = client-ready; 3 = acceptable internally; ≤2 = defect.

### Judge R — Recording quality (does it watch like a human demo?)
- **Pacing:** actions visible at human speed; no jump-cuts between page sections — scrolls
  glide (`demo.smoothScrollTo`), loads are allowed to be seen loading. Brisk but never
  rushed: the viewer gets time to process each beat before the next lands.
- **Smoothness (researched bar, 2026-07):** motion reads deliberate, not twitchy — smooth
  scroll interpolation, no stuttering frames, no janky reflows. Stutter is acceptable ONLY
  when the app under test itself lags (that's a finding about the app, record it as one);
  harness-induced jank (slowMo artifacts, overlay repaints) is a deduction.
- **Length discipline:** aim ≤90s per flow; industry completion data: under 1 minute ≈68%
  watch-through, 5 minutes ≈50%, 10+ minutes ≈20%. A demo that needs longer should be two
  flows. Dead air over ~3s with nothing changing is a cut, not a pause.
- **Interaction legibility:** clicks and typing are deliberate and visible (cursor moves
  slower than feels natural to the author); the click lands visibly on its target.
- **Framing:** the subject of each step is fully in frame when its caption shows; nothing
  load-bearing hidden behind overlays, sticky bars, or the fold. Opening beat never
  captions over a blank/unrendered page — warm the route first.
- **Continuity:** title card present; ending lands on a meaningful final state
  (confirmation, result), not mid-motion; resolution crisp at the delivery size.

### Judge N — Narration & captions (does the text EXPLAIN, not label?)
- **Explains intent and outcome**, not mechanics: "Entries come free with the pack — watch
  the total update" beats "Clicking the pay button". Each caption answers *why this
  matters* or *what to notice*, in customer language.
- **One caption on screen at a time**, top-anchored, legible in every frame it appears in;
  no caption text duplicated by burned subtitles (sidecar `.srt` only).
- **Voice/caption sync:** narration audible within its cue window; no cue cut off by video
  end (compare `.srt` end vs duration).
- **Legal framing (§11, hard requirement):** free-entry vocabulary only. Any banned word
  (odds/lottery/raffle/bet/chances/buy-entries) = automatic RERENDER regardless of scores.

### Judge H — Visual guidance (does the viewer know WHERE to look?)
- **Highlight on the subject:** the element each caption discusses carries a visible
  spotlight (`demo.highlight`) — ring/glow + dimmed surroundings — for the duration of its
  beat. A caption about a button nobody can find is a 1.
- **Cursor/action legibility:** clicks land visibly inside the highlighted region; typed
  input is watchable (slowMo), not pasted.
- **No competing noise:** highlight is removed before the next beat; site's own attention
  magnets (countdowns, badges) never fight the highlighted subject in the same frame.

## 2. Consolidate (controller)

- Score table per judge; any criterion ≤2, any §11 hit, or average <3.5 → **RERENDER**
  with the judges' executable fixes queued; else **SHIP**.
- Verdict + table + fixes go in the reply (and into the flow's report file if one exists).
- On RERENDER: apply fixes (spec captions, `demo.highlight` placement, pacing), re-render,
  re-run this panel on the new file. Never ship a video the panel hasn't passed.

## Rules
- Judges rate only from extracted frames + cue data — no imagination, no source-code
  credit. If a virtue isn't visible in a frame, it doesn't exist.
- Frame extraction is mandatory even when "it just rendered fine" — that instinct is the
  exact failure this panel exists to stop.
- Never commit, never share the video outside the session until verdict is SHIP.
