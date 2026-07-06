# Promo — Gotchas

## Promo-visit recording is a dep-injected functional core

`recordPromoVisit` (`src/utils/promo-analytics/record-promo-visit.ts`) holds the visit-recording orchestration: dedup (when an anonymousId is present) → resolve UTM/referrer attribution → persist. Its side effects (`hasRecentVisit`, `recordVisit`) are **injected** by the caller — the `/api/tracking/promo-page-visit` route wires the real Mongo-backed deps inside `after()` (the injected `hasRecentVisit` calls `connectDB()` first — mongoose never auto-connects, and on a cold instance a bare query would buffer ~10s and lose the visit). This keeps the route thin and makes the logic unit-testable with no DB (`npm run test:promo-visit`). Dedup **fails open**: if the dedup read throws (timeout / connection error), the visit is recorded anyway — at worst one duplicate row inside the 60s window beats a silently dropped visit. UTM resolution order is: explicit body value → URL `utm_*` → (utmCampaign only) `fb_<campaign_id>` fallback for Facebook ads that omit `utm_campaign`. The raw slug is passed to `recordVisit` (which lowercases on write); the dedup query uses the normalized slug. See [docs/tracking/gotchas.md](../tracking/gotchas.md) for why it runs in `after()`.

## Banner behaviour

(Migrated from `docs/PROMO_BANNER_BEHAVIOUR.md` — _TODO: read root file and merge full content._)

Brief: banner displays `PromoBannerText.text`; gets suppressed on certain admin pages; respects schedule via `ScheduledPromo`; can be themed via `usePromoThemeStore`.

## Page analytics

(Migrated from `docs/PROMO_PAGE_ANALYTICS.md` — _TODO: read root file and merge._)

Brief: `PromoAnalyticsVisit` rows track every visit; aggregations roll up per promo / per day. Can desync if Klaviyo / GTM event firing fails — analytics is best-effort.

## Comeback promo

(Migrated from `docs/CANCELLED_MEMBERSHIP_COMEBACK_PROMO.md` — _TODO: read root file and merge._)

Brief: triggered by Klaviyo flow watching `MembershipStatusHistory` for cancellation rows. Respects unsubscribe; gates on prior promo eligibility.

## UTM persistence interplay

PromoLinks rely on `useUTMPersistence` ([tracking](../tracking/)) to keep UTM params across the session. If UTM persistence is broken, promo attribution breaks silently — analytics rows lack source data.

## Multiplier stacking

When a code-based promo is applied while an alternating multiplier is active, the stacking rule isn't always intuitive. Document the resolver decision before changing it. _TODO: add concrete example._

## Scheduled promo timezone

ScheduledPromo dates: are they stored as UTC or AEST? _TODO: confirm and document. If UTC, the helper that compares "now" to range must convert AEST cycles correctly._

## Terminology: `isAdditional` (was `isMemberOnly`) — 2026-07-01

The package flag `isMemberOnly` was renamed to **`isAdditional`** across the codebase. It marks packages that require *additional-package access* — an **active subscription OR current major-draw entries** (see `hasAdditionalPackageAccess`), which is broader than subscribers; it was never truly "member-only". The internal `-member` UI id-suffix (a row disambiguator) is intentionally unchanged. Full rationale: [subscription/gotchas.md](../subscription/gotchas.md).

## Hero "Enter Now" needs the page's package section to listen for `openMembershipModal` (2026-07-01)

The promo hero / giveaway countdown / entry CTAs don't own a modal — `useMajorDrawEntryCta.openEntryFlow({ openLocalModal: false })` dispatches a `window` `"openMembershipModal"` CustomEvent (the major-draw purchase gate is already applied; **members** with additional-package access are routed to the special-packages modal instead, so the event only fires for non-members). Whatever **package section** renders on the page is expected to listen for that event and open its `MembershipModal`. The lesson came from the 2026-07 packages-design A/B test (concluded 2026-07-06, control won, treatment removed): the treatment component originally didn't listen, so the hero "Enter Now" silently no-op'd for non-members on that arm. Fixed with a shared [`useOpenMembershipModalListener`](../../src/hooks/useOpenMembershipModalListener.ts) hook (gating built in) — one line, impossible to half-implement. `MembershipSection` uses it today; any future package-section variant rendered on a promo page must too, or it will reintroduce the silent no-op.
