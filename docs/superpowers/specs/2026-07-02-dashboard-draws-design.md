# Member Dashboard Revamp — Spec 3: Draws — Design + Plan

**Date:** 2026-07-02 · **Branch:** `feature/user-dashboard-revamp` · **Status:** proposed (autonomous)
**Builds on:** Spec 1 foundation + Spec 2 `DashboardPageHeader`.

## Goal

Rebuild the Draws destination (`/my-account/draws`) to the prototype: a **Major / Mini segmented
toggle**, a premium major-draw hero with **prize picker** (setup vs $10k cash) + live countdown +
"View this promotion", the user's entries breakdown, a **how-it-works** trio, and **past winners**.
Mini draws are **entries-based** (% filled + remaining + the user's own entries). Replaces the
current stacked marketing layout (`PrizeShowcase` + `MembershipSection` + mini list).

## Decisions (autonomous)

1. **Major/Mini toggle** via the shared `Seg` primitive (client state `drawType`).
2. **Prize picker** mirrors `MembershipPrizeChooser`: `usePrizeCatalog().activePrize` (setup) vs
   `resolvePrize("cash-prize")` (cash) — real catalog data; setup/cash bullet copy is presentation.
3. **Reuse `EntryWallet`** (Spec 1) for the entries breakdown — DRY, identical semantics.
4. **Mini draws reuse `MiniDrawCard`** + the existing `miniDrawParticipation` mapping (per-user
   entries). Do **not** wire the dead per-mini-draw entry hooks. "View all" → `/mini-draws`.
5. **Winners** via `useMajorDrawWinners` (clean hook) with `Monogram` fallback + FB verified link —
   replaces the raw `fetch("/api/winners/all")`. Real winners; state (suburb not stored).
6. **How-it-works** = static 3-step copy (get entries → freeze 8PM 27th → drawn 8:30PM live). No
   partner-discount mention (unrelated to the draw).
7. **"View this promotion"** → `https://toolsaustralia.com.au/promotions/{slug}` (new tab).

## Sections — `src/components/sections/draws/`

| Section | Build | Data |
|---|---|---|
| **DrawsMajorHero** | NEW | dark hero: live pill + prize picker (`Seg`, `usePrizeCatalog`) + prize image/highlights + countdown to `freezeEntriesAt`/`drawDate` (`useLeafTimer`) + "View this promotion" |
| **DrawHowItWorks** | NEW | static 3-step copy |
| **DrawWinners** | NEW | `useMajorDrawWinners`; compact winner rows (name · state · prize · cash · month), `Monogram` fallback, `drawResultUrl` FB link |
| **DrawsMini** | NEW | `useMiniDraws({status:"active"})` + `miniDrawParticipation`; `MiniDrawCard` grid (your active first, then explore) + participation banner + "View all" |
| entries breakdown | **reuse `EntryWallet`** | `useDashboardState` |

Page: `Seg` toggle → major branch (`DrawsMajorHero` → `EntryWallet` + package CTA → `DrawHowItWorks` → `DrawWinners`) or mini branch (`DrawsMini`).

## Architecture

- `draws/page.tsx` — rewritten thin composer: `DashboardPageHeader` + `Seg` + branch, fed by
  `useDashboardState`. Keeps login redirect + `MembershipModal` + `useMajorDrawEntryCta`.
- New `src/components/sections/draws/*`. **Reuse:** `Seg`, `EntryWallet`, `MiniDrawCard`,
  `useMajorDrawWinners`, `usePrizeCatalog`, `Monogram`, `AnimatedNumber`, `useLeafTimer`,
  `useMiniDraws`, `MembershipModal`, `useMajorDrawEntryCta`.
- **Flagged (kept, shared):** `PrizeShowcase`, `MembershipSection`, `LatestWinnerHero`,
  `WinnersTestimony`, `MajorDrawHeaderStrip` — removed from this page's composition only.
- **Manifest:** `src/components/sections/draws/**` → shared-ui (covered). Docs: dashboard-account/frontend.md.

## Verification
tsc + lint; toggle major↔mini; prize picker setup↔cash; countdown; entries per state; mini
participation; winners with/without photos; light/dark; mobile/desktop.
