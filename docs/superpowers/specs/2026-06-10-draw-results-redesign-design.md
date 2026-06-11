# Draw Results & Winners — page redesign

**Date:** 2026-06-10
**Branch:** feature/ui-audit
**Source design:** Claude Design handoff bundle `tools-australia/project/Draw Results & Winners.html` (+ `results/{app,sections,data}.jsx`, `landing/ui.jsx`). Final iteration documented in `chats/chat10.md`.

## Goal

Rebuild the public `/draw-results` page to match the mockup, faithfully but page-scoped, using **only real backend data**. Two explicit mappings from the user:

1. The mockup's **Winners Gallery ("The Wall")** replaces the current "latest winners" grid.
2. The mockup's **Register (ledger)** replaces the current past-draws list — but its filter toggle becomes **All / Major draws / Mini draws** (the mockup shipped All / Tool prizes / Cash).

## Decisions (locked with user)

- **Visual fidelity:** faithful **page-scoped** port. New fonts (Archivo, Space Mono) + `lp-*` classes + CSS-variable token set, all scoped under a `.ta-results` root. No site-wide/global changes.
- **Theme:** light tokens by default, dark tokens under the site's existing `.dark` class (Tailwind `darkMode: "class"`, `.dark` on `<html>`). Page works in both modes and follows the site theme.
- **Accent:** brand red `--accent: #ee0000` (NOT the mockup's teal `#00b4cc`, which is actually Makita's per-product color).
- **Data honesty:** use only computable/fetchable figures. Drop anything with no backend source.
- **Lower sections:** replace the current 3-tile "How Winners Are Selected" + membership upsell with the mockup's 4-step stepper + closing CTA. **Remove** the floating countdown banner.
- **Chrome:** page renders inside the existing `(site)` Header/Footer. Drop the mockup's own PromoBar/Footer and its dev-only Tweaks panel + brand picker.

## Section sequence & copy (business-logic-corrected)

1. **Hero** — `--bg`. Kicker "Verified results · Drawn live"; headline "Every draw. Every winner. On the record."; 3 real stat counts (Major draws / Mini wins / All winners, from SSR `countDocuments`). Featured "Latest draw" card = latest completed **major** draw: prize image, winner "First L." (privacy rule), state, prize name, prize value, "Drawn {date}", **Verify this draw** → real `drawResultUrl`. Certified ribbon: "Independently drawn & certified by randomdraws.com.au" + "Live on Facebook · 8:30pm AEST · every 27th".
   - Dropped (no data): "$1.24M paid out" stat, permit chip, entrants count, "Watch the replay".
2. **The Register** — `--surface` + hairline top/bottom. "01 · The register" bar + record count + **All / Major draws / Mini draws** toggle. Rows from unified winners feed: date block (`--panel-2`) · prize thumb (plinth gradient) · winner "First L." + state · prize · prize value · Major/Mini tag · Verify → `drawResultUrl`. Truthful footer note ("Showing the most recent N results"). Dropped per row: entrants, permit, replay.
3. **The Wall** — `--bg`. Kicker "The wall"; heading "Real gear. Real faces."; copy "...announced at the live draw and shipped their prize free Australia-wide, or paid the cash." The mockup's "4.9★ / 2,100+ reviews" stat (no data) → replaced with real "N winners and counting" (allWinners count). Horizontal rail of winner cards from the feed.
4. **How a winner is chosen** — `--surface` + hairline. 4-step stepper, copy corrected to the real process: (1) Entries freeze at 8pm on the 27th; (2) Government-certified random draw via randomdraws.com.au — verifiable result every draw (no per-draw "permit number" claim); (3) Drawn live at 8:30pm on Facebook; (4) Winner announced live & contacted — tools shipped free Australia-wide or cash paid (not "phoned live on camera").
5. **Closing CTA** — `#08080a` finale (image + radial overlay, dark in both themes). "Want your name on this page?"; primary **Get your entries** → fires global `openMembershipModal` event; secondary **Watch live on Facebook** → `https://www.facebook.com/toolsaust`; trust row "From $20/mo · Drawn live on the 27th · Cancel anytime" (all verified true).

## Background / token system (light default + `.dark` overrides)

| Token | Light | Dark | Used by |
|---|---|---|---|
| `--bg` | `#f4f3f1` | `#0a0a0c` | Hero, Wall, page root |
| `--surface` | `#ffffff` | `#141417` | Register, How-chosen, step circle |
| `--panel` | `#ffffff` | `#1b1b1f` | cards, filter track |
| `--panel-2` | `#f6f5f3` | `#232328` | register date cell |
| `--plinth-a → --plinth-b` | `#fafafa → #efeeec` | `#202026 → #161619` | prize-image plinths |
| `--line` / `--line-2` | `#e6e6ea` / `#d8d8de` | `#2a2a31` / `#38383f` | hairline borders / dividers |
| `--ink` / `--ink-2` / `--ink-3` | `#101012` / `#44444d` / `#76767f` | `#ffffff` / `#b6b6c0` / `#7c7c87` | text |
| `--accent` / `--accent-2` / `--on-accent` | `#ee0000` / `#b80000` / `#ffffff` | (same) | brand accent |
| `--hot` / `--cash` | `#ff3b3b` / `#ffce2e` | (same) | live dot / cash highlight |
| CTA finale | `#08080a` | `#08080a` | closing CTA only |

## Data approach

- **SSR everything** in `page.tsx` (server component): the 3 hero counts (existing `countDocuments` pattern), the latest completed major (featured card), and the unified winners feed.
- **Extract** the major+mini merge currently inlined in `src/app/api/winners/all/route.ts` into a reusable loader in `src/utils/draws/` (already in draws manifest). The route keeps calling it (no behavior change); the page calls it directly for SSR.
- Pass the winners array as a **prop** to a client `ResultsRegister` (filters in memory — no extra fetch/hook) and to `WinnersWall`. Only client islands: register filter state, CTA button (window event), and `Reveal`/`Stagger` in-view wrappers (IntersectionObserver, respects `prefers-reduced-motion`).
- Empty states: if no completed majors, feature the latest winner of any type; if no winners at all, branded empty state.

## File plan

- `src/app/(site)/draw-results/draw-results.css` — scoped `.ta-results` tokens (light + `.dark`), `lp-*` classes, reveal/stagger/plinth/glow/livedot.
- `src/app/(site)/draw-results/page.tsx` — rewritten server component; loads fonts via `next/font`; SSR data; imports the css.
- `src/app/(site)/draw-results/components/` — `ResultsHero.tsx`, `ResultsRegister.tsx` (client), `WinnersWall.tsx`, `HowChosen.tsx`, `ResultsCTA.tsx` (client), `Reveal.tsx` (client). Icons mapped to **lucide-react**.
- `src/utils/draws/get-all-winners.ts` (or extend `src/utils/winners.ts`) — extracted feed loader.
- Delete now-unused components (CompletedDrawsSection, DrawResultCard, DrawResultsHero, UnifiedCompletedDrawCard, and the already-orphaned CountdownHero, WinnerAnnouncement) after confirming no external usage.
- Docs: update `docs/draws/`. No BUSINESS.md change (presentation only). No admin/Norm surface touched.

## Out of scope / dropped

Per-brand accent theming, Tweaks dev panel, brand picker, permit numbers, entrants counts, "$ paid out" total, "watch replay" buttons, the reviews rating, the floating countdown banner, and the mockup's own nav/footer.

## Verification

- `npm run lint` + `npm run type-check`.
- Manual: render in light + dark, exercise the All/Major/Mini filter, confirm winner names are "First L.", confirm Verify links resolve to `drawResultUrl`, confirm CTA opens the membership modal.
- Adversarial multi-agent review pass (copy vs business logic, token/theme fidelity, layering/manifest/docs, a11y, dead code).
