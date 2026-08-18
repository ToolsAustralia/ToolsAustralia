"use client";

// Initialize console error tracking for error reporting system
if (typeof window !== "undefined") {
  import("@/utils/error-reporting/collect-error-context").then((module) => {
    module.initializeConsoleErrorTracking();
  });
}

import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache, useQueryClient } from "@tanstack/react-query";
// import { DevTools } from "@/components/dev";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { CartProvider } from "@/contexts/CartContext";
import { UserProvider } from "@/contexts/UserContext";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { ErrorBoundary, ApiErrorBoundary } from "@/components/error";
import { defaultQueryOptions, defaultMutationOptions, retryConfig } from "@/lib/queries";
import UpgradeSuccessToast from "@/components/UpgradeSuccessToast";
import { ToastProvider } from "@/components/ui/Toast";
import { useEffect, useRef, useState } from "react";
import { LazyMotion, MotionConfig } from "framer-motion";

// Async loader (module scope so it's stable across renders): code-splits the
// framer-motion feature bundle out of the shared/critical chunk — it's fetched
// after hydration. Landing-path components use the lean `m.*` renderer that
// consumes these features; see src/app/lazy-motion-features.ts + docs.
const loadMotionFeatures = () => import("./lazy-motion-features").then((mod) => mod.default);
import DeviceTierProvider from "@/components/system/DeviceTierProvider";
import AffiliateTracker from "@/components/tracking/AffiliateTracker";
import ReferralTracker from "@/components/tracking/ReferralTracker";
import PromoLinkTracker from "@/components/tracking/PromoLinkTracker";
import KlaviyoUserIdentifier from "@/components/tracking/KlaviyoUserIdentifier";
import ContentsquareDynamicVariables from "@/components/tracking/ContentsquareDynamicVariables";
import ConversionPixelsAdvancedMatching from "@/components/tracking/ConversionPixelsAdvancedMatching";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ThemeMetaSync from "@/components/system/ThemeMetaSync";
import MajorDrawTestControls from "@/components/dev/MajorDrawTestControls";

/**
 * The React Query cache holds per-user data (redeemables wallet, account payload, partner
 * queue), so it belongs to the auth boundary exactly like the client storage cleared in
 * utils/auth/total-sign-out.ts. `signOut()` does a full document navigation, which drops the
 * cache in the tab that triggered it — but a SECOND open tab only learns via NextAuth's
 * cross-tab broadcast, with no navigation, so its cache would otherwise survive into the next
 * person's session on a shared device. Clearing whenever we LEAVE an authenticated identity
 * (sign-out, session expiry, account switch) covers that; the very first settled session and
 * the guest→member transition are skipped, since neither can be holding someone else's data.
 */
function QueryCacheAuthBoundary() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  // undefined = not yet observed; null = signed out.
  const lastUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status === "loading") return;
    const userId = session?.user?.id ?? null;
    const previous = lastUserIdRef.current;
    lastUserIdRef.current = userId;
    if (previous === undefined || previous === null || previous === userId) return;
    queryClient.clear();
  }, [status, session?.user?.id, queryClient]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            ...defaultQueryOptions,
            // Override specific settings for different data types
            staleTime: 5 * 60 * 1000, // 5 minutes default
            gcTime: 10 * 60 * 1000, // 10 minutes default (renamed from cacheTime in v5)
            refetchOnWindowFocus: false, // Disable for better UX
            refetchOnReconnect: true, // Refetch when connection restored
            refetchOnMount: true, // Allow refetch on mount for fresh data
            ...retryConfig,
          },
          mutations: {
            ...defaultMutationOptions,
          },
        },
        // Global error handling for mutations. This MUST live on the MutationCache, not on
        // defaultOptions.mutations.onError: a per-mutation onError REPLACES the default one,
        // and every optimistic mutation defines its own (to roll back), so the default handler
        // never ran for exactly the mutations that can fail visibly. Cache-level handlers run
        // IN ADDITION to the mutation's own, so rollback still happens and nothing fails
        // silently. Per-call-site toasts stay the specific UX.
        mutationCache: new MutationCache({
          onError: (error) => {
            console.error("Mutation error:", error);
          },
        }),
        // Global error handling
        queryCache: new QueryCache({
          onError: (error) => {
            console.error("Query error:", error);
            // You can add global error handling here
          },
        }),
      })
  );

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ThemeMetaSync />
        <SessionProvider refetchOnWindowFocus={false} refetchInterval={15 * 60}>
          <QueryClientProvider client={queryClient}>
            <QueryCacheAuthBoundary />
            <ApiErrorBoundary>
              <UserProvider>
                <SidebarProvider>
                  <CartProvider>
                    <LoadingProvider>
                      <ToastProvider>
                        {/* LazyMotion (non-strict) lazy-loads framer-motion's feature
                            bundle (via the async loader above) instead of shipping it
                            eagerly in the shared chunk. Landing-path components use the
                            lean `m.*` renderer (see docs/shared-ui/lazymotion.md);
                            route-isolated components (admin, mini-draws, login) keep
                            `motion.*`, which non-strict allows — they self-load features
                            in their own route chunk. */}
                        <LazyMotion features={loadMotionFeatures}>
                        <MotionConfig reducedMotion="user">
                          <DeviceTierProvider />
                          <AffiliateTracker />
                          <ReferralTracker />
                          <PromoLinkTracker />
                          <KlaviyoUserIdentifier />
                          {/* Contentsquare membership segmentation. Mounted HERE rather than
                              beside <ContentsquarePageTracker /> in the root layout because it
                              needs the session + React Query cache, which only exist inside
                              these providers. Env-gated on the same id as the tag itself
                              (docs/tracking/rules.md R8) — blank ⇒ never mounted. */}
                          {process.env.NEXT_PUBLIC_CONTENTSQUARE_ID ? <ContentsquareDynamicVariables /> : null}
                          <ConversionPixelsAdvancedMatching />
                          <UpgradeSuccessToast />
                          {children}
                          {process.env.NODE_ENV === "development" ? <MajorDrawTestControls /> : null}
                        </MotionConfig>
                        </LazyMotion>
                      </ToastProvider>
                    </LoadingProvider>
                    {/* React Query DevTools - temporarily disabled */}
                    {/* {process.env.NODE_ENV === "development" && <DevTools />} */}
                  </CartProvider>
                </SidebarProvider>
              </UserProvider>
            </ApiErrorBoundary>
          </QueryClientProvider>
        </SessionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
