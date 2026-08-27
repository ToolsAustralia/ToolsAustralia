# Dashboard-Account — Gotchas

## The my-account payload is include-list projected (2026-07-19)

Everything the dashboard derives (`useDashboardState`, `useDashboardEntryDisplay`, the sheets, the
draws page's `miniDrawParticipation` read) consumes `GET /api/users/[id]/my-account`, whose User /
MiniDraw / Order queries are projected through
[src/utils/dashboard/my-account-projection.ts](../../src/utils/dashboard/my-account-projection.ts).
A new dashboard surface that reads a User field NOT in `MY_ACCOUNT_USER_FIELDS` will see `undefined`
at runtime with no type error — add the field to the projection first (fields inside `subscription`
ship automatically). `activeMiniDraws` deliberately excludes `entries[]`/`winner` (the MB-scale wire
leak this fixed). Contract + guard: [auth/gotchas.md](../auth/gotchas.md), `npm run test:my-account-projection`.

## my-account `recentOrders` / `activeMiniDraws` were silently empty (latent, fixed 2026-07-20)

Three latent bugs in [my-account/route.ts](../../src/app/api/users/[id]/my-account/route.ts) (pre-dated the projection work — the initial commit shipped them) each made a query match **zero docs with no error**:

- **`recentOrders` / `insights.totalSpent`**: the query filtered `Order.find({ userId })`, but the Order model's owner field is **`user`** (see [Order.ts](../../src/models/Order.ts) + every other Order query, e.g. `/api/orders`). `userId` is a phantom field → always `[]` → `totalSpent` always `$0`, `recentOrdersCount` always `0`. Fixed to `Order.find({ user })`.
- **`activeMiniDraws` / `insights.activeDrawsCount`**: the query filtered `MiniDraw.find({ isActive: true, endDate: { $gt: now } })`, but **MiniDraw has no `endDate` path** (draws gate on `isActive`/`status` + `minimumEntries`, not a date). The phantom clause matched nothing → `activeMiniDraws` always `[]`. Fixed to `{ isActive: true }` (matches the canonical active query in `sitemap.ts` / `getActiveMiniDraws`).
- Both phantom fields (`endDate` on MiniDraw, `items` on Order) were also removed from the projection constants — the member UI renders only `totalAmount` (→ `totalSpent`) and the order/draw counts, never order line items or a draw end date.

Impact: corrects the my-account **payload data** — `recentOrders`, `insights.totalSpent` / `activeDrawsCount` / `recentOrdersCount`, and the `useUserStats` → `UserContext.userStats` values now hold real data instead of empty/`0`. Note: **no customer-facing surface currently renders these insights** (searched — they're derived and exposed via context but not displayed today), so this is a data-correctness fix, not a visible screen change. It matters the moment any surface starts reading them (and keeps `useUserStats` honest). Guard: the `test:my-account-projection` static assertions now check the route queries `Order` by `user` and does not filter on the phantom `MiniDraw.endDate`. The `MyAccountData` client type ([useUserQueries.ts](../../src/hooks/queries/useUserQueries.ts)) was trimmed to match the projection (dropped the phantom `activeMiniDraws[].endDate` and `recentOrders[].items`).

**`insights.totalSpent` is NOT lifetime spend.** It sums `totalAmount` over the **10 most recent orders regardless of status** (`.sort({ createdAt: -1 }).limit(10)`, no status filter → includes cancelled/pending, capped at 10). It was a rough dashboard stat, not an accounting figure. If a surface ever needs true LTV, compute it server-side from settled payments — don't render `insights.totalSpent` as accurate lifetime spend.

~~Not fixed here (separate, out-of-scope drift): `mini-draws/entries/route.ts` still reads `miniDraw.tickets` / `ticketPrice` / `totalTickets` / `soldTickets` / `startDate` / `endDate` — an **entirely obsolete ticket-based MiniDraw schema** none of which exist on the current model.~~ **Resolved 2026-08-20: the route was deleted.** It had zero callers and threw a TypeError before saving anything. See [draws/gotchas.md](../draws/gotchas.md) for the full write-up and the related dead-hook cluster that remains.

## Account settings reads `hasPassword` from the users/[id] payload, not my-account (fixed 2026-07-20)

`PasswordTab` decides "set a password" vs "change password" from `hasPassword === false`. `hasPassword` is **DERIVED** on `GET /api/users/[id]` (a separate password-only query — [route.ts](../../src/app/api/users/[id]/route.ts)); it is **not** a stored User field and is **not** in `MY_ACCOUNT_USER_FIELDS`, so the my-account payload never carries it. The settings page ([settings/page-client.tsx](../../src/app/(site)/my-account/settings/page-client.tsx)) previously read `accountData.user.hasPassword` (always `undefined` → `undefined === false` is `false` → the page **always** treated the member as having a password). A passwordless member (Google-OAuth-only, never set a password) was therefore shown the change-password flow demanding a current password they never had — so they could not set a first password. Fixed by sourcing it from `useUserData` (the `/api/users/[id]` payload, shared cache already warmed by `UserProvider` — no extra fetch). Guard: `test:my-account-projection` asserts `hasPassword` is NOT in `MY_ACCOUNT_USER_FIELDS`.

## Membership management path: no "Settings → Subscription" tab (2026-07-07)

The 2026-07 revamp removed the tabbed Settings IA (`?tab=subscription`/`payment`). Membership management is now the **Manage sheet** (`useDashboardSheetStore.openSheet("manage")`), reached from the **Membership page** (`/my-account/membership`) "Manage plan" button or the `/my-account?open=subscription` deep-link; payment is the **Payment sheet**. Settings holds only Profile / Theme / Password. Copy that referenced "Settings → Subscription" was corrected — the dashboard SupportSheet FAQ ("cancel my membership" → "Membership → Manage plan") and the membership-page change-tier comment. Chatbot copy lives separately (see [ai-chatbot/gotchas.md](../ai-chatbot/gotchas.md)).

## Landing-trigger storage

`dashboard-landing-session.ts` and `dashboard-entry-hold.ts` use sessionStorage. If user opens multiple tabs, each has its own session — landing experiences may re-fire.

## Mobile date toolbar slot

[useAdminMobileDateToolbarSlot](../admin/frontend.md) is admin-only despite the "dashboard" sounding name — admin's date filtering UI for mobile. Don't confuse with member dashboard.

## Cross-domain data freshness

The dashboard reads from many sources. After a mutation in one source domain, that source must invalidate its query keys; the dashboard re-renders. If you add a new mutation, ensure key invalidation is wired up.

## Sign-out clears support-chat client storage via `totalSignOut` (2026-06-24, updated 2026-07-07)

Account-settings sign-out (`src/app/(site)/my-account/settings/page.tsx`) calls `totalSignOut()` ([src/utils/auth/total-sign-out.ts](../../src/utils/auth/total-sign-out.ts)), whose `clearUserScopedClientStorage()` wipes per-user localStorage **including support-chat history / `conversationId`** (delegated to the chat module's own `clearSupportChatStorage()`). This satisfies the org rule (per-user storage wiped at sign-out so chat can't leak to the next user on a shared device) with one canonical helper — see [auth/frontend.md § Total sign-out](../auth/frontend.md#total-sign-out-2026-07-02).

## Landing race conditions

If the user reaches `/my-account` before the landing-page metric write completes, the landing trigger may decide based on stale data. _TODO: verify timing._

## `ManageSheet` fired `/api/stripe/payment-methods` on every dashboard load, closed or not (fixed 2026-07-21)

The `/my-account` layout mounts `ManageSheet` unconditionally as a hidden overlay sibling (alongside `SupportSheet`/`PaymentSheet`) so it's ready the instant `useDashboardSheetStore`'s `sheet` flips to `"manage"`. But `ManageSheet` calls `useSavedPaymentMethods()` at the top of its component body — **above** the `sheet === "manage"` check that only gates `SheetShell`'s visible markup — so the hook (and its `/api/stripe/payment-methods` fetch) ran on every `/my-account` page load regardless of whether the sheet was ever opened. Same root cause as the `LazyMembershipModal` chunk-download footgun (see [shared-ui/gotchas.md](../shared-ui/gotchas.md)), just for a query instead of a chunk. Fixed with the identical pattern: [`LazyManageSheet`](../../src/app/(site)/my-account/components/sheets/LazyManageSheet.tsx) reads the (cheap, no-network) `sheet` selector, latches on the first time it equals `"manage"`, and only then `next/dynamic`-mounts the real `ManageSheet` — closed = zero requests, and the deep-link (`/my-account?open=subscription`) still works because the Zustand store value persists independent of whether a subscriber existed when it changed. The `/my-account/membership` page's "Manage" button reaches the same sheet (it's mounted once at the layout level, shared across all `/my-account/*` routes).

## The sticky sidebar was killed by `overflow-x: hidden` on `body` (2026-07-31)

**Symptom.** On desktop, `DeskNav` scrolled away with the page on any long dashboard route —
its white panel simply ended mid-scroll, leaving bare page background beside the content. Most
visible on `/my-account/rewards/catalogue`, which is thousands of pixels tall.

**It was not the layout.** `DeskNav` is already `sticky top-0 h-screen-svh`, and
`my-account/layout.tsx` already carries a comment warning not to put `overflow-x-hidden` on the
flex parent for exactly this reason. The trap had simply moved up a level.

**Cause — a CSS spec behaviour worth knowing.** `html` **and** `body` both set
`overflow-x: hidden` in `globals.css` `@layer base`. Per spec, when one axis is not `visible`,
**the other computes to `auto`**. So `body`'s `overflow-y` silently became `auto`, making body a
scroll container — and a `position: sticky` element sticks to its nearest *scrolling* ancestor.
With the window doing the real scrolling, the sidebar had nothing to stick to.

Measured before the fix, at `scrollY: 1200`:

```
aside  position: sticky   top: 0px   height: 860px
aside  rect.top: -1200    ← scrolled clean off the top; never stuck
body   overflow: hidden / auto      ← the `auto` is computed, not authored
```

**Fix.** `overflow-x: clip` instead of `hidden`, scoped to `body[data-account-layout]` and
`html:has(body[data-account-layout])`. `clip` still clips horizontal overflow — the reason the
original rule exists — but does **not** create a scroll container and does **not** force the
other axis to `auto`. After: `clip/visible`, and the aside reports `rect.top: 0` at scrollY 0 /
600 / 1600 / 3000, with no horizontal scroll at 1440px or 390px.

**Deliberately scoped, not global.** The same root cause almost certainly breaks
`position: sticky` on other routes. Lifting the fix to the base `html`/`body` rule would fix
those too, but it changes scroll behaviour on every page in the app — a call to make on
purpose, not a side effect of a sidebar fix. The one behavioural difference to weigh if you do:
`clip` forbids *programmatic* horizontal scrolling (`scrollLeft`), where `hidden` allows it.

**If you ever see a sticky element not sticking**, check the computed `overflow` of every
ancestor **including `body` and `html`** before touching the element itself.

## The dashboard is now `hasEverPaid`-gated, and the flag lives on the JWT (2026-08-27)

`/my-account/**` and `/rewards` are no longer reachable by a signed-in account that has never
paid — [src/middleware.ts](../../src/middleware.ts) redirects it to `/membership`. Three
consequences for anyone working in this domain:

- **The gate reads `token.hasEverPaid`, not the database.** It is stamped in the jwt callback
  ([src/lib/auth.ts](../../src/lib/auth.ts)), so it is only as fresh as the token. A token minted
  **before** this shipped carries `undefined`, which the rule deliberately lets through (bouncing
  an existing signed-in member mid-session is worse than letting one request past; the next
  request carries the stamp). So a never-paid account reaching the dashboard stays reproducible
  in the wild for a while — that is the gate working as designed, not a hole in it.
- **The gate and the dashboard's own "guest" state answer different questions.** The gate asks
  `hasEverPaid` (ever bought anything); the UI asks `dash.acct === "none"` — no *currently
  active* membership or pack ([useDashboardState.ts](../../src/hooks/useDashboardState.ts)).
  A lapsed member passes the gate and still gets `DashboardGuestPanel`
  ([page-client.tsx](../../src/app/(site)/my-account/page-client.tsx)) and the settings identity
  card's `Guest` badge
  ([settings/page-client.tsx](../../src/app/(site)/my-account/settings/page-client.tsx)), so
  neither became dead code — but "guest" on the dashboard now means **lapsed**, not **never
  paid**. Don't wire new UI to one of the two predicates thinking it is the other.
- **A one-time pack buyer passes the gate.** `hasEverPaid` counts `processedPayments`,
  `stripeSubscriptionId`, `oneTimePackages` and `subscription.startDate`
  ([has-ever-paid.ts](../../src/utils/auth/has-ever-paid.ts)) — a pack buyer with no membership
  passes the gate, exactly like a cancelled or past-due member.

The gate itself is owned by [security-csp/middleware.md](../security-csp/middleware.md); the rule
for this domain is [rules.md → R1](./rules.md#r1-auth-gated). Design:
[2026-08-25-mobile-verification-and-sms-login-design.md](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md).

## Editing the mobile in Settings does NOT clear `isMobileVerified` (2026-08-27)

The Personal details card's **Mobile number** field posts to `/api/user/update-profile`, which
sets `user.mobile` and leaves `isMobileVerified` untouched (verified in
[route.ts](../../src/app/api/user/update-profile/route.ts); `User`'s `pre("save")` hook only
normalises the number to `+61…`, it resets nothing). So a member who verifies their mobile and
then edits it keeps the green **Verified** chip against a number nobody ever confirmed — and, once
SMS login is live, that stale flag is attached to the recovery credential. Anything that treats
`isMobileVerified` as proof of the number *currently* on file must not read it from this surface
alone. Same shape as the email field, except email is not editable here.
