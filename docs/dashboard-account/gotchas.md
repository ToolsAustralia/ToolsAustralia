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

Not fixed here (separate, out-of-scope drift): [mini-draws/entries/route.ts](../../src/app/api/mini-draws/entries/route.ts) still reads `miniDraw.tickets` / `ticketPrice` / `totalTickets` / `soldTickets` / `startDate` / `endDate` — an **entirely obsolete ticket-based MiniDraw schema** none of which exist on the current model. Its `now < startDate || now > endDate` entry-eligibility gate is dead (both `undefined` → the comparisons are always false, so only `!isActive` blocks). Permissive-not-harmful, but it needs its own draws-domain task — see [draws/gotchas.md](../draws/gotchas.md) if triaged.

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
