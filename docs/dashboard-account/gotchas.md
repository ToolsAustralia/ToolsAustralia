# Dashboard-Account — Gotchas

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
