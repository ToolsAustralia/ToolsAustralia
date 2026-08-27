# Client State — Gotchas

## Unmemoized context values fan out to every consumer (fixed 2026-07-19)

`UserContext` built its `value` object inline on every provider render, so each render — including every
2-minute my-account poll tick, which used to fire **site-wide** — produced a fresh object identity and
re-rendered all 37 `useUserContext()` consumers (Header included), even when nothing changed.
`CartContext` had the same shape. Both providers now wrap the value in `useMemo`, and the helper hooks
feeding UserContext (`useUserMembership`, `useUserStats` in
[useUserQueries.ts](../../src/hooks/queries/useUserQueries.ts)) memoize their return objects — a fresh
object from a constituent hook silently defeats the provider's memo, so keep those stable when editing
them. The poll itself is now page-scoped (see [rules.md](./rules.md) R7): `useMyAccountData` takes
`options?: { poll?: boolean }` and only UserProvider passes `poll: pathname.startsWith("/my-account")`.

## `useOrder` must read `{ order }`, not `{ success, data }` (fixed 2026-07-08)

`useOrder` ([useOrderQueries.ts](../../src/hooks/queries/useOrderQueries.ts)) previously typed the `GET /api/orders/[id]` response as `{ success, data }` while the route returns `{ order }` — so `data` was always `undefined`, `/checkout/success` rendered its error state, and the shop Purchase pixel (shop's only Meta signal) could never fire. Dormant while shop is "Coming Soon", but it would have shipped broken at launch. **The sibling order hooks are still aspirational**: `useOrders`/`useInfiniteOrders` expect a pagination shape `/api/orders` doesn't return (`{ orders }`), and `useRecentOrders`/`useOrderAnalytics` call endpoints that don't exist — none currently has a live consumer. Align them against the real routes as part of shop-launch work; don't trust the hook's declared response type without reading the route.

## `useChatbotSettings` — Cobber pause query + mutation (2026-07-08)

[`src/hooks/queries/admin/useChatbotSettings.ts`](../../src/hooks/queries/admin/useChatbotSettings.ts) now exports, besides `useSetChatProvider`: a `useChatbotSettings()` **query** (key `["admin","chatbot-settings"]`, 30s stale) returning `{ activeProvider, killSwitch, killSwitchEnvForced }`, and a `useSetChatKillSwitch()` **mutation** (`PATCH { killSwitch }`) that pauses/resumes Cobber. Both mutations invalidate **both** `["admin","chatbot-settings"]` and `["admin","chatbot-cost"]` so the availability toggle and the cost tab's config strip stay in lockstep. Consumed only by `ChatbotCostManagement`.

## Forced sign-out in `apiRequest` clears user-scoped client storage (2026-06-24, updated 2026-07-09)

`lib/queries.ts` `shouldForceLogout` path (now decided by `shouldInvalidateSession()` — 401 or 404+`USER_NOT_FOUND` only, **not** 403) calls `clearUserScopedClientStorage()` ([src/utils/auth/total-sign-out.ts](../../src/utils/auth/total-sign-out.ts)) immediately before its in-place `signOut()` per the org rule: per-user localStorage must be wiped at auth-error sign-out to prevent leakage to the next user on a shared device. That helper clears auth breadcrumbs + per-user flags **and** support-chat history / `conversationId` (delegated to `clearSupportChatStorage()`), all SSR-safe (each guards `typeof window === "undefined"` internally). It keeps its bare `signOut()` (not `totalSignOut()`) because the clear + sign-out are deliberately separate here.

## `apiRequest` no longer sends an `Authorization` header (2026-06-19)

[lib/queries.ts](../../src/lib/queries.ts) (the shared React Query fetch wrapper) used to attach `Authorization: Bearer ${session.user.id}` to every authenticated request. That raw user id is **not a credential** — it was only ever "accepted" by the old cart/orders bearer routes, which have been migrated to NextAuth `getServerSession`. The header was removed: authentication is now carried solely by the NextAuth session cookie (auto-attached on same-origin requests). `apiDelete` also gained an optional `data` body argument (for `DELETE /api/cart`). Do not reintroduce a bearer header here.

## `trialing` subscription status maps to "Active", not "Trial"

`getSubscriptionStatusText` (`useSubscriptionQueries.ts`) maps `trialing` → **"Active"**. We never sell a real free trial — Stripe `trialing` only ever means a paid, active member whose billing date was anchored/reanchored via `trial_end` (the join-25-27→24 rule and the past-due reanchor). Do not surface "Trial" to members; a `trialing` member is fully active. See `docs/PAST_DUE_REANCHOR.md`.

## Context vs Zustand confusion

Pattern: scoped to a tree → Context. Cross-cutting → Zustand. Mistake: putting cross-cutting state in Context (forces Provider at root) or scoped state in Zustand (global state for one feature).

## Hydration mismatches

If server-render produces "light theme" but client first-paint sees "dark theme" (cookie says dark), React warns about mismatch. Bootstrap script in [theme](../theme/) handles this; verify when adding similar concerns.

## usePartnerDiscountSso error copy is customer-facing (2026-07-28)

`usePartnerDiscountSso` surfaces the SSO route's JSON `error` string **verbatim, inline** (banner +
purchase-success render `sso.error.message`). Those strings are therefore customer copy — panel-fix
F-014 rewrote the hook fallback and all four route bodies to "partner portal" vocabulary with a next
step ("Your partner access isn't active right now. You can check it on My Account → Rewards."). If
you add/change an error path in `src/app/api/partner-discount/sso/route.ts`, write the body as
customer-facing copy (rule 11 + BRAND_VOICE), never API-speak.

## Query key drift

If you inline `["user", userId]` in one place and `["user", userId, "detail"]` in another, invalidation breaks. Always go through the key factory.

**Live instance (fixed 2026-07-24):** `usePurchaseInvalidation` invalidated `["partner-discount-queue", userId]`, but the query `usePartnerDiscountQueue` actually registers is `["partnerDiscountQueue"]` (no userId segment) — so no purchase ever refreshed the partner-discount queue cache. An invalidation key **must match the key the owning hook registers** — copy it from that hook (or `src/lib/queryKeys.ts`), never retype it from memory. Full note: [cart-shop-products/gotchas.md](../cart-shop-products/gotchas.md#dead-invalidation-key-partner-discount-queue-fixed-2026-07-24).

## Modal stacking

If modal A is open and modal B fires, the priority store decides. If both have the same priority, the order is undefined. Always set explicit priorities.

## Stale closures in Zustand

```ts
// Wrong — captures old state
const { items } = useStore.getState();
setTimeout(() => doSomething(items), 1000);

// Right — read fresh state
setTimeout(() => doSomething(useStore.getState().items), 1000);
```

## 403 no longer force-signs-out — only 401 / 404+USER_NOT_FOUND do (fixed 2026-07-09)

`apiRequest` in [src/lib/queries.ts](../../src/lib/queries.ts) used to treat **any 401/403** as an invalid session and call `signOut()`. The 403 half was a bug: 403 means *authenticated but not allowed*, which is routine once staff roles hold partial permission sets — a staff member whose role lacked `miniDraws.view` was force-logged-out seconds after login because the admin Overview's `TopDrawsCard` auto-fired `/api/admin/mini-draw/list` through `apiGet`. The decision now lives in the exported pure predicate `shouldInvalidateSession(status, errorCode)` (regression test: `npm run test:session-invalidation`): only **401** and **404 + `USER_NOT_FOUND`** invalidate the session. Do not re-add 403 to it. The earlier per-call-site workaround (routing feature-gate-403 hooks like [`usePartnerDiscountSso`](../../src/hooks/queries/usePartnerDiscountSso.ts) through raw `fetch` instead of `apiPost`) is no longer *required*, though existing raw-fetch call sites are fine as-is. Still prefer not firing a guaranteed-403 request at all — gate the query with `usePermissions().has(...)` (see `TopDrawsCard`).

## Banner-text hook: no client `cache:"no-store"` (2026-07-19)

`useActivePromoBannerText` dropped its `cache: "no-store"` fetch option — the route serves `s-maxage=60` now and the CDN should absorb the polling. Don't re-add no-store to hooks whose endpoints are deliberately CDN-cached; React Query's staleTime/refetchInterval already governs client freshness.

## A query hook can point at a route that doesn't exist — `useMajorDrawStats` removed (2026-07-30)

`useMajorDrawStats()` in [`useMajorDrawQueries.ts`](../../src/hooks/queries/useMajorDrawQueries.ts)
fetched `/api/major-draw/stats`. **That route has never existed** (`src/app/api/major-draw/`
contains `completed`, `next`, `route.ts`, `select-winner`, `user-entries`). Nothing called the
hook — it was only re-exported from `hooks/queries/index.ts` — so the dead endpoint never
produced a visible 404 and the hook survived indefinitely.

The cost was not the dead code. Its `MajorDrawStats` interface declared `totalRevenue`,
`topParticipants` and `dailyEntries[].revenue`, so during the admin draws audit **per-draw
revenue looked already-implemented** when no such aggregation existed anywhere in the app. A
type with no backing implementation is worse than no type: it reads as a contract.

Both the hook and the interface are deleted. Real per-draw revenue now lives in
[`src/services/admin/drawRevenue.ts`](../../src/services/admin/drawRevenue.ts).

**Two lessons for this folder:**

1. **A `useQuery` hook is not evidence its endpoint exists.** TanStack Query hooks fail at
   runtime, not compile time, and an uncalled hook never runs. When trusting a hook's shape as a
   description of available data, check the route file exists.
2. **`useMajorDrawStats` and `useUserMajorDrawStats` are one word apart.** The second is very much
   alive — `/my-account`, `/rewards` and the header entry badge all read it, and it is the
   write-target for the optimistic "+N entries" ecosystem. When deleting near-identically named
   hooks, grep for the *exact* identifier with a word boundary; a substring grep for
   `MajorDrawStats` matches `userMajorDrawStats` at ~30 live call sites and an unrelated
   `src/components/sections/MajorDrawStats.tsx` component.

## The global mutation error handler never ran (fixed 2026-08-03)

`providers.tsx` carried an `onError` on `defaultOptions.mutations` — the only site-wide record that a
mutation failed. It never fired for a single optimistic mutation. A mutation's own `onError`
**replaces** the default rather than running alongside it, and every optimistic mutation defines one
(that is where the rollback lives), so the default handler was reachable only for mutations that could
not visibly fail. The failure mode was silent: the UI reverted with no console line and no toast, and
the member saw a value flicker back with no explanation.

The handler now lives on a `MutationCache` passed to the `QueryClient`. Cache-level handlers run **in
addition to** the mutation's own, so rollback is unaffected. This is the same asymmetry the `QueryCache`
`onError` already relied on — see [rules.md](./rules.md) R10.

## `setQueryData` is exact-match; `cancelQueries` / `invalidateQueries` are prefix-match (fixed 2026-08-03)

`useUpdateAutoRenew` predicted the toggle into `queryKeys.users.detail(id)` (`["users", id]`) and stopped
there. `/my-account` — the only surface with a Resume/auto-renew control — reads
`queryKeys.users.account(id)` (`["users", id, "account"]`). Prefix semantics made this look correct: the
one `cancelQueries` on `users.detail` genuinely covers both keys, so the cancel half of the pattern was
fine. `setQueryData` does not work that way. The prediction landed in a cache entry nothing on the page
rendered, so the "Membership resumed" toast fired while the card still read "Ends <date>" — and the still-live
Resume button could send a second billing PATCH. The mutation now mirrors the write into `users.account`
and rolls both back.

**Transferable:** when adding an optimistic write, don't ask "which key owns this data?" — ask "which key
does the component I'm about to re-render actually subscribe to?" and write to each one.

## A rollback that restores snapshots `onMutate` never wrote is a clobber, not a rollback (fixed 2026-08-03)

`usePurchaseMembership` and `usePurchaseUpsell` snapshotted `majorDraw.current`, `majorDraw.userStats`
and `users.account` in `onMutate` and restored all three in `onError` — but `onMutate` writes **no**
optimistic data for these two (it cancels, freezes refetch intervals for the webhook window, and arms the
dashboard entry hold). So the restore rolled nothing back; it re-wrote a pre-charge snapshot over
whatever had legitimately landed during a payment that can run tens of seconds. Releasing the entry hold
was always the entire rollback, and is now all `onError` does.

Related, on the success side: both mutations wrote the `/api/major-draw` payload into
`majorDraw.current` only. The dashboard wallet reads `majorDraw.userStats` — a separate key the *same*
payload already carries — so post-webhook entries appeared only on the next mount or window-focus
refetch. Both passes now write both keys.

## HTTP 200 is not success — React Query reads the `mutationFn`, not the status code (fixed 2026-08-03)

`POST /api/upsell/purchase` answers **200** with `{ success: false, requiresAction: true }` when the card
needs 3D Secure; no charge has been taken. Because the fetch resolved, the mutation ran `onSuccess`, which
wrote `isProcessing: false, pendingEntries: 0` — i.e. "your entries are here" — for a payment the member
could then abandon. `usePurchaseUpsell`'s `mutationFn` now throws on `!response.success`, routing the 3DS
and failure branches to `onError` (which releases the entry hold). Any route that reports a business-level
failure inside a 200 body needs the same explicit throw.

## Optimistic writes need data to write — payment methods had none (fixed 2026-08-03)

`useAddPaymentMethod` inserted an optimistic row from the only field it had, the `paymentMethodId`. Brand,
last4 and expiry exist only on Stripe (the GET joins `stripe.paymentMethods.list`), so the prediction
rendered a ghost "Card •••• / Expires --/--" card — which also hijacked the hero card face — beside the
still-open add form for the whole POST. There was nothing to predict, so `onMutate` no longer writes; the
POST response carries the real card metadata and `onSuccess` writes the row.

`useSetDefaultPaymentMethod` had the mirror-image problem on the way back: the PUT echoes the
`User.savedPaymentMethods` row, which holds no card metadata, and `onSuccess` used it to **replace** the
cached entry — blanking the card the member had just starred until the refetch landed. It now merges the
response over the cached row (`{ ...cached, ...data, card: data.card ?? cached?.card }`).

`normalizePaymentMethodsCache` is exported from `usePaymentQueries.ts` for this reason: the entry can still
hold a legacy bare-array shape, so every writer — including `useUpdateSubscriptionPaymentMethod` in
`useSubscriptionQueries.ts` — must normalize before writing.

## `subscriptionDefaultPaymentMethodId` was predicted by nobody (fixed 2026-08-03)

For subscribers the Payment sheet picks the starred/hero card off `subscriptionDefaultPaymentMethodId`,
not `isDefault`. No mutation predicted it, so choosing a renewal card sat visibly dead through three
sequential round-trips (PUT default → POST update-payment-method → refetched GET).
`useUpdateSubscriptionPaymentMethod` now predicts it, leaving `paymentMethods` untouched (it moves which
card *renews*, not the wallet default). It must not be predicted inside `useSetDefaultPaymentMethod`:
`SavedPaymentMethodsModal` calls that one without any subscription update, where the prediction would be
wrong and snap back.

## Awaiting invalidations in `onSuccess` holds the mutation `pending` (fixed 2026-08-03)

`useRedeemableRedemption` awaited three invalidations — including the heavy my-account payload — inside
`onSuccess`. React Query keeps a mutation `pending` until its callbacks settle, so the Claim button stayed
disabled and the success toast stayed back for exactly the round-trip the optimistic entry-count write
exists to hide. The reconciliation moved to `onSettled` as fire-and-forget (`void`), which also fixes the
failure path: it previously re-synced only on success, but a 409 means the server **already burned the
issuance**, so a rolled-back wallet keeps rendering the item as claimable and the member taps it again.
The same non-idempotency is why this mutation sets `retry: 0` ([rules.md](./rules.md) R11).

## The React Query cache is per-user state and belongs to the auth boundary (fixed 2026-08-03)

The cache holds the redeemables wallet, the my-account payload and the partner queue — the same class of
data `clearUserScopedClientStorage()` wipes on sign-out. `signOut()` does a full document navigation,
which drops the cache in the tab that triggered it, so this looked handled. A **second open tab** learns
about the sign-out only through NextAuth's cross-tab broadcast, with no navigation — its cache would have
survived into the next person's session on a shared device. `QueryCacheAuthBoundary` in
[providers.tsx](../../src/app/providers.tsx) now calls `queryClient.clear()` whenever the observed
identity **leaves** an authenticated user (sign-out, expiry, account switch). The first settled session
and the guest→member transition are deliberately skipped — neither can be holding someone else's data.

## Resolved — a purchase route's response type did not match the route (2026-08-04)

`MembershipResponse` in `src/hooks/queries/useMembershipQueries.ts` declared the payment intent
at `data.paymentIntent` with a snake_case `client_secret`. The route actually returns it at the
**top level** with `clientSecret`. Both the location and the field name were wrong.

That is worse than a cosmetic mismatch: consumers reading the typed path got `undefined` at
runtime while type-checking cleanly, so `paymentIntent.status` — the field that says whether the
bank still has to authenticate the charge — was unreadable through the type. Three dead
`data.paymentIntent` fallbacks had accumulated behind it in MembershipModal and
SpecialPackagesModal; none could ever have matched. See docs/payment/gotchas.md for the customer-
facing consequence.

**When a response type and a route disagree, tsc protects nothing.** If you change a purchase
route's response shape, update the hook's interface in the same edit.

## Three upsell hooks deleted (2026-08-27)

`useUpsellManager`, `useTrackUpsellEvent` and `useUpsellTracking` are gone from
`useUpsellQueries.ts` and its barrel export. All three served the upsell tracker, which was
never mounted — see `docs/upsell/gotchas.md`. `useUpsellTracking` additionally called
`/api/upsell/tracking/${offerId}`, a route that has never existed.

**`usePurchaseUpsell` and `useUpsellPrefetch` are live and were preserved.** `useUpsellOffers`,
`useUpsellAnalytics`, `useAcceptUpsellOffer` and `useDismissUpsellOffer` now have zero consumers
(their only caller was `useUpsellManager`) — left in place as they are separate dead code, not
part of the tracker.
