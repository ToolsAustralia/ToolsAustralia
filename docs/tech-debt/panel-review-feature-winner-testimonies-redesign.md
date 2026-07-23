# Panel Review — `feature/winner-testimonies` (winner-testimonies speech-bubble redesign)

> **Note:** this branch also carried an earlier, unrelated **auth security** review whose tracked doc is
> [`panel-review-feature-winner-testimonies.md`](./panel-review-feature-winner-testimonies.md) (register
> privileged-account guard — F-001…F-006 there, all resolved). This file is a **separate** review of the
> **winner-testimonies UI redesign** committed later on the same branch; its `F-NNN` ids are local to this
> review and do not continue the auth doc's numbering.

- **Date:** 2026-07-23
- **Branch:** `feature/winner-testimonies` · **HEAD:** `a5ba51c9`
- **Base:** `origin/main` · diff: `git diff origin/main` (8 files, +792 / −306) — the redesign commit only.
- **PR:** none open (`gh` not installed). Acceptance graded against the design handoff `claudeDesign/design_handoff_winner_testimonies/README.md` + the user's three follow-up asks.
- **Touched domains:** draws · promo · shared-ui
- **Artifact:** https://claude.ai/code/artifact/2f9aba99-7847-40b9-b52d-b0ea1055a506
- **Gate:** `type-check` ✓ pass · `lint` ✓ pass (no new errors vs the 6-error baseline in unrelated files). No `test:*`/e2e run — presentational redesign; the section renders no seeded data in the e2e env (see F-012).
- **Evidence:** live browser pass on the dev server (Playwright): measurements via `getBoundingClientRect`/`getComputedStyle` at 390/1280, a DOM probe on `/promotions/ryobi`, screenshots of the section/modal/mobile in both themes.
- **Verdict:** **SHIP WITH FIXES** — 0 P0, 3 P1, 10 P2. All 17 acceptance requirements MET (Reviewer F, zero findings).

## Handoff

Fresh session? Run `/panel-fix` on this branch, or paste:

> Read `docs/tech-debt/panel-review-feature-winner-testimonies-redesign.md`. Fix ONLY the Now items: F-002, F-003 (and get an owner decision on F-001 before touching it).
> Findings were written against `a5ba51c9` — re-grep each `file:line`, they may have moved.
> One commit-worthy change per finding. Do NOT commit. When a finding is done, tick its box
> and fill `_Handled:_` with the date. If a fix turns out to be wrong, mark it Overridden with
> a reason instead of silently skipping it.

**Now:** ✅ F-001 accepted (owner) · ✅ F-002 fixed · ✅ F-003 fixed (+ F-006 folded in) — all 2026-07-23.
**Next:** F-004, F-005, F-008
**Later:** F-007, F-009, F-011, F-012
**Overridden / no-action:** F-010 (refuted by measurement), F-013 (user chose the singular)

---

## P1 — should-fix

- [x] **F-001** · P1 · Product/Legal · **ACCEPTED (won't-change) 2026-07-23** · `src/app/(site)/winners/components/WinnersTestimony.tsx:44` — Every winner shows a fixed 5-star rating no winner gave.
      _What:_ A visitor reads each testimonial beside five filled stars and takes it as that winner's rating, but no rating is collected — `Stars` renders a hard-coded 5 everywhere; uniform fabricated ratings are an ACCC / Australian Consumer Law surface on a public page.  _Disposition:_ **Owner decision — keep as-is.** The 5-star treatment is a deliberate decorative element from the handoff mock; no rating claim is made in copy. Revisit only if legal flags it. _Handled:_ 2026-07-23 — accepted, no code change.

- [x] **F-002** · P1 · Theming · **FIXED 2026-07-23** · `src/app/(site)/winners/components/WinnersTestimony.tsx` · `src/app/globals.css` — Story modal opened light on the force-dark Ryobi brand pages.
      _What:_ On `/promotions/ryobi` (+ ryobi-milwaukee / ryobi-sidchrome), which force dark via a `<div class="dark">` **inside** `<body>`, the modal portals to `document.body` and escaped that wrapper, so `.dark .winner-testimonies-modal` never matched and it rendered a white panel on a dark page.  _Fix applied:_ added a `sectionRef`, compute `modalDark = openWinner != null && sectionRef.current?.closest('.dark') != null`, pass `dark` into `WinnerStoryModal`, and wrap the portalled tree in `<div className={dark ? 'dark' : undefined} style={{display:'contents'}}>`. `closest('.dark')` covers `html.dark` AND the wrapper-div case. Corrected the stale globals.css comment. _Handled:_ 2026-07-23 — **verified live on /promotions/ryobi**: panel `getComputedStyle` = `rgb(20,22,28)` (`#14161c`) with white text; 0 console errors. type-check + lint clean.

- [x] **F-003** · P1 · Accessibility · **FIXED 2026-07-23** · `src/app/(site)/winners/components/WinnersTestimony.tsx` — Mobile carousel dots were a 7px tap target (WCAG 2.5.8 fail).
      _What:_ Each dot was a 7px-tall zero-padding button (7×7 / 22×7), well under the 24×24 minimum.  _Fix applied:_ the `<button>` is now the hit target (`display:flex; place-items:center; height:44; minWidth:24; background:none; border:none`, class `wt-dot`) with the visual pill moved to an inner `<span aria-hidden>`; row `gap` dropped 7→2; `aria-label` + `aria-current` kept. _Handled:_ 2026-07-23 — **verified live @390px**: button `getBoundingClientRect` = 24×44, pill 22×7, no horizontal scroll.

## P2 — polish

- [ ] **F-004** · P2 · Robustness · `src/app/(site)/winners/components/WinnersTestimony.tsx:291-298` — Background scrolls behind the modal on iOS; desktop layout jumps ~15px when it opens.
      _What:_ The scroll-lock uses only `body.style.overflow='hidden'`, which iOS Safari ignores and which shifts the page as the scrollbar vanishes. `ModalContainer` already solves both.  _Fix:_ Adopt ModalContainer's lock — capture `scrollY` + scrollbar width; set `body { position:fixed; top:-scrollY; width:100%; overflow:hidden; paddingRight:sbw }`; restore all four + `window.scrollTo(0, scrollY)` on cleanup.  _Verdict:_ PLAUSIBLE (code).  _Handled:_ —

- [ ] **F-005** · P2 · Accessibility · `src/app/(site)/winners/components/WinnersTestimony.tsx:630` (deps `:300`) — Closing the modal can drop keyboard focus on the wrong element.
      _What:_ A new `onClose` arrow every parent render makes the modal effect re-run on a background feed refetch and re-capture return-focus as the Close button; on close, focus lands there instead of the "Read full story" trigger.  _Fix:_ `const closeModal = useCallback(() => setOpenId(null), [])` and pass `onClose={closeModal}`.  _Verdict:_ PLAUSIBLE (code).  _Handled:_ —

- [x] **F-006** · P2 · Reduced-motion · **FIXED 2026-07-23** (folded in with F-003) · `src/app/globals.css` — Dot-growth tween + read-more arrow slide ignored reduced-motion.
      _What:_ The `prefers-reduced-motion` block only covered `.wt-card/.wt-nav/.wt-overlay/.wt-panel`; the dot width transition and `.wt-readmore` hover gap escaped it.  _Fix applied:_ the dot transition now lives on `.wt-dot span` (from the F-003 restructure); the reduced-motion block adds `.wt-dot span, .wt-readmore { transition:none !important }` and `.wt-readmore:hover { gap:7px !important }`. _Handled:_ 2026-07-23. type-check + lint clean.

- [ ] **F-007** · P2 · Efficiency · `src/app/(site)/winners/components/WinnersTestimony.tsx:539` — Every carousel tap / modal open re-parses up to 100 testimonies.
      _What:_ `winners.filter(hasWinnerTestimony)` runs regex-heavy `stripRichTextHtml` over up to 100 winners on every interaction re-render, and each card re-strips its own quote — none memoized.  _Fix:_ `const stories = useMemo(() => winners.filter(hasWinnerTestimony), [winners])`; wrap `TestimonyCard` in `React.memo`.  _Verdict:_ CONFIRMED (code).  _Handled:_ —

- [ ] **F-008** · P2 · Accessibility · `src/app/(site)/winners/components/WinnersTestimony.tsx:565-573` — Screen-reader heading list shows the section as just "testimonial".
      _What:_ "Winners" is a plain `<p>`; only "testimonial" is the `<h2>`, so heading navigation announces a bare "testimonial".  _Fix:_ Add `aria-label="Winner testimonials"` to the `<h2 className="wt-title">`; keep the visible split.  _Verdict:_ CONFIRMED (code).  _Handled:_ —

- [ ] **F-009** · P2 · Copy · `src/app/(site)/winners/components/WinnersTestimony.tsx:428-441` — Modal's "certified" link doesn't say what it is or where it goes.
      _What:_ "Draw 2 · certified" with "certified" as a bare link — the reader can't tell it opens the independent draw result. `drawResultUrl` is documented as the "View result / Verify" link.  _Fix:_ Relabel link + fallback from `certified` to `Verify result` → "Draw 2 · Verify result".  _Verdict:_ PLAUSIBLE (judgment).  _Handled:_ —

- [ ] **F-011** · P2 · Dead-code · `src/app/globals.css:715` (and `:729`) — Unused `--wtm-chip-hover` token.
      _What:_ Declared in both modal scopes but nothing reads it; reads as an intended-but-missing hover state.  _Fix:_ Delete both `--wtm-chip-hover` declarations.  _Verdict:_ CONFIRMED (code).  _Handled:_ —

- [ ] **F-012** · P2 · Test-coverage · `src/app/(site)/winners/components/WinnersTestimony.tsx:256-300` — The modal's keyboard/focus contract has no automated test.
      _What:_ The hand-rolled focus-trap, Esc, scroll-lock, and return-focus are untested; `/promotions` & `/winners` have no e2e specs and the e2e seed inserts no winner-with-testimony, so the section never renders in a run. tsx tests have no jsdom, so e2e is the only vehicle.  _Fix:_ Add `e2e/seed/winner.ts` (a completed major draw + a winner with a non-empty `testimony` and a `drawResultUrl`), call it from `e2e/seed/index.ts`, and add an `@a11y` spec: goto `/promotions`, click "Read full story", assert `role=dialog` visible + Close holds focus, Tab never leaves the dialog, Escape closes AND re-focuses the trigger button.  _Verdict:_ CONFIRMED (code).  _Handled:_ —

## Overridden / no-action

- [x] **F-010** · Overridden (REFUTED by measurement) · `src/app/globals.css:688-704` — Header quote glyphs feared to clip/overlap.
      _What:_ Reviewer B feared the absolutely-positioned quote glyphs clip or overlap text. Measured at 320px & 390px: the open quote (right ≈40px) clears the kicker (left ≈44px), the close quote clears the first card, no horizontal scroll. Downgraded to a watch-note. _Residual:_ the close quote vs top-right card on desktop with **≥3 winners** is unverified (dev data has 2) — low risk; re-check once ≥3 consented testimonies exist. _Handled:_ 2026-07-23 — no code change; refuted at tested breakpoints.

- [x] **F-013** · Overridden (user decision) · `src/app/(site)/winners/components/WinnersTestimony.tsx:570` — "Winners / testimonial" (singular).
      _What:_ Reviewer C suggested the plural "testimonials". The user was explicitly offered the plural and chose to keep the singular from the supplied header sample. Not a defect. _Handled:_ 2026-07-23 — kept per user; no change.

## Reviewer notes

- **Verdict spread:** A ship · B ship-with-fixes · C ship-with-fixes · D ship · E ship-with-fixes · F ship (17/17 acceptance MET, 0 findings).
- **Corrections from rendering:** F-010 refuted (quote glyphs measured clear at 320/390px); F-002 promoted to CONFIRMED by a live DOM probe on `/promotions/ryobi`.
- **Intentional deviations (all MET per Reviewer F):** grid width-cap vs the mock's `1fr`; CSS-`.dark` theming instead of the handoff's `usePromoThemeStore` (which is a brand-colour store, not a light/dark toggle); "Watch the draw" link kept beyond the mock; the redesign replaces the shared component on every host (home, /winners, brand pages, my-account draws), not only /promotions.
