import { signOut } from "next-auth/react";
import { clearSupportChatStorage } from "@/lib/support-chat/chatStorage";

/**
 * Total sign-out — clears the USER-scoped portion of browser storage before
 * ending the server session, so the next person on a shared device can't see the
 * previous user's in-progress work / breadcrumbs, and no user-stamped client
 * state carries into the next authenticated session.
 *
 * This app has NO IndexedDB / offline outbox / Cache-Storage writes (verified),
 * so only `localStorage` + `sessionStorage` need clearing. Support-chat history
 * (also localStorage) is cleared by delegating to the chat module's own
 * clearSupportChatStorage() — it owns its key list, so we never duplicate it here.
 *
 * The in-memory React Query cache is ALSO user-scoped, but it can't be reached from
 * this non-React module — it is cleared at the same boundary by QueryCacheAuthBoundary
 * in src/app/providers.tsx, which watches the signed-in identity (that also covers the
 * second open tab, which learns of a sign-out by broadcast and never navigates).
 *
 * KEEP (never cleared here): device prefs (`ta-theme`, `ta-admin-theme`) and
 * pre-auth **attribution** (`tools-aus:*`, `affiliate_code`, `ab_*`,
 * `promoWelcomeShown_*`, admin UI layout, dev-only keys). Those are device- or
 * campaign-level, not user-private, and the 401 guard in `useErrorHandling`
 * deliberately protects the attribution keys.
 */

/** User-scoped localStorage keys (exact match). */
const USER_LOCAL_KEYS = [
  "wasAuthenticated",
  "topBarHidden",
  "auth-token",
  "subscription_upgraded",
  "subscription_downgraded",
  "modal-priority-store", // zustand persist (defaults to localStorage)
];

/** User-scoped localStorage key prefixes (per-user breadcrumbs). */
const USER_LOCAL_PREFIXES = [
  "subscriptionExplainerSeen_",
  "rewardsWidgetSpotlightSeen_",
  // "You haven't seen the partner catalogue yet" nav indicator, per user. Left behind, the
  // next person to sign in on a shared device would silently inherit the previous member's
  // "already seen" state and never be shown the feature.
  "partnerCatalogueSpotlightSeen_",
  // Membership Streak celebration marker (last-celebrated streak level, per user —
  // useStreakCelebration). Must not leak the previous member's streak position to
  // the next sign-in on a shared device.
  "ta-streak-seen:",
];

/** User-scoped sessionStorage keys (exact match). */
const USER_SESSION_KEYS = [
  // Marks that THIS person completed a partner-portal hand-off, which is what lets the
  // catalogue deep-link offers directly (see utils/partner-discounts/portal-offer-url.ts).
  // Left behind, the next sign-in inherits a "warm" flag for a portal session that belongs
  // to someone else — and gets links that bounce them to a login page.
  "ta.partnerPortal.handedOff",
  "dashboardPostPurchaseLanding",
  "dashboardLandingCooldownUntilMs",
  "dashboardDeferSubscriptionExplainerSession",
  "pendingUpsell",
  "pendingUpsellFlag",
  "modalSessionShown",
  "specialPackagesModalShown",
  "recentPurchaseTimestamp",
  "userSetupModalState",
  "showReferFriendAfterSetup",
  "setupJustCompleted",
  "membership_subscription_checkout",
];

/** User-scoped sessionStorage key prefixes. */
const USER_SESSION_PREFIXES = ["ta:dashboard-card-nudge-clicked:", "emailVerificationModal_"];

function clearScoped(store: Storage, keys: string[], prefixes: string[]): void {
  for (const key of keys) {
    try {
      store.removeItem(key);
    } catch {
      /* ignore — one failure must never block sign-out */
    }
  }
  try {
    // Snapshot keys first: removing while iterating shifts indices.
    const all: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k) all.push(k);
    }
    for (const k of all) {
      if (prefixes.some((p) => k.startsWith(p))) {
        try {
          store.removeItem(k);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore — storage may be unavailable */
  }
}

/** Clear the user-scoped portion of client storage; keep device/attribution prefs. */
export function clearUserScopedClientStorage(): void {
  if (typeof window === "undefined") return;
  try {
    clearScoped(window.localStorage, USER_LOCAL_KEYS, USER_LOCAL_PREFIXES);
  } catch {
    /* ignore */
  }
  try {
    clearScoped(window.sessionStorage, USER_SESSION_KEYS, USER_SESSION_PREFIXES);
  } catch {
    /* ignore */
  }
  // Support-chat history + conversationId (per-user localStorage). Delegate to the
  // chat module so its key list stays the single source of truth.
  try {
    clearSupportChatStorage();
  } catch {
    /* ignore — one failure must never block sign-out */
  }
}

/**
 * Clear user-scoped client storage, then end the NextAuth session.
 * Use this for every deliberate/forced sign-out instead of calling `signOut`
 * directly, so the client-side clear can never be skipped.
 */
export async function totalSignOut(options?: { callbackUrl?: string }): Promise<void> {
  clearUserScopedClientStorage();
  await signOut({ callbackUrl: options?.callbackUrl ?? "/" });
}
