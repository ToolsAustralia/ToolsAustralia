# Shared UI — Gotchas

## Z-index conflicts

Modals, banners, tooltips, dropdowns — many things stack. If something disappears behind another, check `z-index.ts` and the constant in use.

## Inline-rendered modals trapped inside a `sticky`/`transform` ancestor

A modal that renders **inline** (no `createPortal`) inherits whatever stacking context its mount point lives in. If the mount point is descended from anything that creates a stacking context — `position: sticky`, `position: fixed`, `transform`, `filter`, `opacity < 1`, `will-change`, `isolation: isolate` — the modal's `z-index` is *trapped local to that context*. A sibling element in a different ancestor at a lower numeric `z-index` (e.g. `z-20`) can paint on top of it because the modal's "effective" page-level layer is whatever the trapping ancestor was assigned (often auto/0).

Concrete prior hit: on the mini-draws prize-details page, `LoginPromptModal` rendered inside the `lg:sticky lg:top-28` right column. `MiniDrawImageGallery`'s carousel chevrons (`z-20`) in the sibling left column painted over the modal's `zIndex: 90`. Fix was to portal the modal's Shell to `document.body` and use `Z_INDEX.MODAL_BASE` — same pattern `ModalContainer` already follows. See [Shell.tsx](../../src/components/modals/LoginPromptModal/Shell.tsx).

Rule of thumb: **any full-screen overlay modal must portal to `document.body`** (and use `Z_INDEX.MODAL_BASE` from `constants/z-index.ts`). Bumping the numeric z-index does **not** fix this — only escaping the trapping ancestor does. The Shell-pattern modal suite (Upgrade/Downgrade/Refer/PastDraws/StripePayment/ExistingAccount/PackageDetail/SubscriptionExplainer) historically used `zIndex: 90` without a portal — fine until rendered under a sticky/transform parent; if a similar bug appears for any of these, the fix is the same.

## Modal stacking

Multiple modals open simultaneously is a UX hazard. The modal primitive in `components/modals/` should handle this — the modal-priority store ([client-state](../client-state/)) coordinates.

## SSR + theme flash

Theme bootstrap (in [theme](../theme/)) runs pre-React. If a shared-ui component references `theme` via context before bootstrap completes, you can see a flash.

## Dark mode coverage gaps

When adding a new component, write the `dark:` variants alongside. It's hard to retrofit later.

## ElectricPackageCard / PackagesGrid price layout

`ElectricPackageCard` stacks the struck regular price above the discounted price in a vertical flex column so the `w-fit` panel contains both values without overflow; the swing tag is positioned at `-top-6 -left-2`. The `BestValueBadge` and `CornerRibbonBadge` are rendered `size="small"` with `scale-[0.5] origin-top-left` so the sash stays in the top-left corner without crossing the centred title. In `PackagesGrid` the struck original entries and struck regular price are `absolute` (offset `-top-3`) so they add no height to the row in the non-promo case.

## Image lazy-load gotchas

Lazy-loaded images need width/height to prevent layout shift. The image helper in `utils/images/` enforces this via prop validation. Don't bypass.
