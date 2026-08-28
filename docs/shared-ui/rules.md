# Shared UI — Rules

## R1. No business logic in shared-ui

Components in `src/components/{ui,cards,cta,layout,...}/` MUST NOT contain feature logic. Take data via props; don't fetch; don't compute domain-specific things. If you find yourself adding feature logic, the component belongs in the feature domain instead.

## R2. No API calls

No `fetch()` or TanStack Query inside shared-ui components. Receive data via props or hooks-passed-in.

## R3. Use z-index constants

Reference `src/constants/z-index.ts` for stacking order. Never hardcode `z-50` etc.

## R4. Honour theme

All components respect the current theme via `dark:` Tailwind classes. Test both light and dark.

## R5. Accessibility

ARIA labels, keyboard navigation, focus rings. Use the primitives in `components/ui/` which already handle this rather than rolling raw `<button>` etc.

## R6. No raw colours

Use Tailwind theme tokens or the brand-color helpers. Don't write `#FF5733` — use `text-brand-red` or similar.

## R7. Never reach for `useSearchParams()` in a section that renders on a prerendered page (2026-07-27)

On `revalidate`-backed marketing routes (`/`, `/promotions/*` — see
[security-csp/rules.md R8](../security-csp/rules.md)), `useSearchParams()` de-opts the client subtree
up to the nearest Suspense boundary to **client-only rendering**, so Next puts the *fallback* in the
static HTML. That silently removes the section from first paint and from the crawled HTML.

- Read the query with `window.location.search` inside an effect (or a client-guarded helper) —
  `PromoBanner`, `MembershipSection`, `PrizeShowcase` and `useMembershipModalDeepLink` all do this.
  The server then renders the default state and the param applies post-mount.
- This applies **transitively** — a custom hook that calls `useSearchParams()` de-opts its caller.
- Never "fix" the resulting build error with `<Suspense fallback={null}>`. If a boundary really is
  unavoidable, its fallback must reserve the section's real height.
- Anything that appears only after hydration must occupy the same box beforehand. Reserve it
  (`min-h-*`, `aspect-*`) — see `ComboHero`'s drawn-date chip and `PromoHero`'s CTA spacer.

See [gotchas.md](./gotchas.md) for the measured CLS case this came from (1.1689 → 0.7970 on a throttled phone profile; the residual is a separate footer/streaming shift documented there).

## R-MODAL: background interaction — modal blocks, popover does not (2026-08-06)

Raised by a real report: the `/discount` filter sheet let the catalogue scroll behind it. An
audit found the same gap across five customer surfaces, and — tellingly — the **admin** copy of
the same mobile filter drawer DID lock while the customer one did not. The misses were
accidental, so the rule needs writing down.

**The test is the surface's own ARIA, not how it looks.**

| | Asserts | Must block scroll | Must trap focus | Examples |
|---|---|---|---|---|
| **Modal** | `aria-modal="true"` and/or a full-viewport scrim | **yes** | **yes** | filter sheet, offer modal, access modal, MembershipModal, every confirm modal, mobile filter drawers |
| **Popover** | `aria-expanded` / `aria-haspopup`, anchored to a trigger | **no** | no (dismiss on outside-click + Escape) | the `/discount` sort dropdown, toasts, tooltips, announcement bar, SupportChatWidget, RewardsFloatingWidget |

A blanket "every overlay locks" rule is wrong — it would freeze the page behind a five-item
dropdown. A blanket "never lock" is the bug we started with.

**`aria-modal="true"` is a promise, not decoration.** It tells assistive tech the rest of the
page is inert. If nothing enforces it, the AT user's virtual cursor is confined to the panel
while their Tab focus is not — they land on controls the screen reader will not describe,
behind an opaque scrim. Declaring it without enforcing it is worse than not declaring it. So:
**set `aria-modal` and `useModalA11y` together, or set neither.**

**Use `src/hooks/useModalBlocking.ts`** — `useScrollLock(active)` + `useModalA11y(active, ref,
onClose)`. Do not hand-roll `document.body.style.overflow`. Two reasons it cannot be done
per-component:
- **Reference counting.** Every hand-rolled copy restores unconditionally, so with two
  overlays open the first to close unlocks the page while the second is still up. Only a
  module-level count knows it is the last one out.
- **iOS.** `overflow: hidden` on `<body>` does not stop touch-scrolling in iOS Safari. The
  hook uses the `position: fixed; top: -scrollY` recipe `ModalContainer` already proved.

Two traps found while fixing this, both worth checking on any new overlay:

1. **Stacking context.** The sheet's `z-index: 10000` was meaningless because it rendered
   inside the sticky filter bar (`sticky z-20`) — the `fixed; z-index: 40` site header painted
   over the scrim and stayed clickable. **Portal modal surfaces to `document.body`** so their
   z-index is measured against the page, not a local context.
2. **Portalling escapes CSS-variable scope.** `/discount`'s entire skin is custom properties
   on `.ta-discount`; portalling made every `--dc-*` undefined and the panel background
   resolved to `rgba(0,0,0,0)` — a transparent sheet. **Re-apply the scope class on the portal
   root.** Theme classes on `<html>` (`.dark`) still apply; page-level wrapper classes do not.

**Adopted so far:** the three `/discount` overlays; `ShopContent` + `MiniDrawsContent` mobile
filter drawers (both also gained the `role="dialog"`/`aria-modal` they were missing — set the
attribute and the trap together, never one alone); `PastDueTierSwitchModal`.

> **Better still: don't hand-roll the overlay at all.** Both browse-page filter panels have since
> moved to [`SheetShell`](../../src/components/ui/SheetShell.tsx) (`ShopContent` 2026-08-28,
> `MiniDrawsContent` earlier), which portals to `<body>`, calls `useScrollLock` + `useModalA11y`
> itself, and sets `role="dialog"` / `aria-modal` / `aria-labelledby` as one piece. That is four
> of this section's requirements satisfied by construction rather than by remembering. Reach for
> `useModalBlocking` directly only for an overlay `SheetShell` genuinely cannot be.

Two things worth copying from those:

- **Key the lock on the OPEN state, not the exit animation.** `MiniDrawsContent` is wrapped in
  `AnimatePresence` with a spring exit, so the panel lingers in the DOM ~1.2s after close.
  Releasing on `isFiltersOpen` frees the page immediately; the extra frames of a visible panel
  cost nothing, whereas holding the lock until unmount is a page that stays stuck after the
  thing that locked it is visually gone.
- **A modal that guards its own dismissal must guard Escape too.** `PastDueTierSwitchModal`
  is non-dismissable while `submitting` (a past-due money action), so it passes a
  `requestClose` that respects that flag rather than raw `onClose` — otherwise a keyboard user
  is the one person who can abandon the request mid-flight.

Not every overlay needs the portal: `ShopContent` and `MiniDrawsContent` were verified to have
no stacking-context ancestor, so their `z-[110]` already beats the header. Check before adding
one — `document.elementFromPoint` over the header while the overlay is open answers it.

**`ModalContainer` and `SheetShell` now route through the same hook**, so every one of their
~65 consumers inherits reference-counted locking and a focus trap without changes of its own.

Two things to know before touching them:

- **`ModalContainer` keys Escape to `closeOnBackdrop`.** That prop already meant "this surface
  accepts casual dismissal", so a modal that opted out of backdrop-click also opts out of
  Escape. Handing a keyboard user a dismissal route the pointer does not have is how a payment
  gets abandoned mid-request. If you need the trap without the key elsewhere, `useModalA11y`
  takes `{ closeOnEscape: false }`.
- **Release on the OPEN state, not on unmount.** Anything behind an exit animation
  (`AnimatePresence`, framer springs, `ModalContainer`'s own `isLocked` tail) would otherwise
  hold the page after the panel is visually gone.

**Guard rail:** `internal-norm/no-adhoc-scroll-lock` flags direct
`document.body.style.{overflow,overflowY,position}` writes, at **`warn`** — 57 pre-existing
hand-rolled locks remain (`Header`, `AdminPage`, `RewardsFloatingWidget`, `WinnersTestimony`,
the `*/Shell.tsx` family, the two admin filter drawers).

**A warning alone was not enough**, and an audit was right to call that a band-aid: warning
#58 would appear in a run that already emitted 57 and exits the same way, so a reviewer has no
signal distinguishing the new one from the noise they have learned to scroll past.

**Be honest about what the ratchet does today, though:** `npm run lint` ALREADY exits non-zero
because of **6 pre-existing errors** in `e2e/` and `scripts/`, so the warning budget does not
yet change any exit code. It is a tripwire waiting to become load-bearing — fix those 6 errors
and it starts governing immediately, at which point it has zero headroom, so expect to move the
number when unrelated warnings are added or removed. So `lint`
now carries **`--max-warnings 77`** (the current total). The count can only go down: a new
hand-rolled lock fails the command rather than needing to be spotted.

**`Header` and `AdminPage` are now migrated** — they were the two genuinely live surfaces, and
both had the same defect for the same reason: they cleared the body styles unconditionally in
BOTH an else-branch and a cleanup, so closing the mobile menu / admin sidebar released whatever
modal was open underneath. The Header is mounted on every page, so that one was reachable from
anywhere. AdminPage additionally re-derived its restore position by parsing `body.style.top`
back out of the DOM, which breaks the moment anything else owns that property.

That took the violation count 57 → 45 and the repo-wide warning count 89 → **78**, and the
ratchet moved with it. What remains is `overflow`-only copies that `useScrollLock`'s
`position: fixed` already neutralises when it owns the lock, plus admin-only surfaces — worth
finishing, no longer urgent.

**Verified under WebKit** (Safari's engine, iPhone 13 viewport, real touch gestures): with the
`/discount` sheet open and the body pinned at `-900px`, an in-panel swipe leaves the lock
intact; the `/shop` drawer behaves the same. This is the check that actually justifies
`position: fixed` — every earlier run was desktop Chromium, where plain `overflow: hidden`
would have passed too and proved nothing.

Still outstanding: those 57 sites, and `ModalContainer`'s hardcoded
`aria-labelledby="modal-title"` — 56 of its 58 consumers define no such id, so most modals
point at nothing. Unrelated to scrolling, but it is the other half of the same a11y story.
