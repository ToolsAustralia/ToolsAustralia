"use client";

// Initialize console error tracking for error reporting system
if (typeof window !== "undefined") {
  import("@/utils/error-reporting/collect-error-context").then((module) => {
    module.initializeConsoleErrorTracking();
  });
}

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
// import { DevTools } from "@/components/dev";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { CartProvider } from "@/contexts/CartContext";
import { UserProvider } from "@/contexts/UserContext";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { ErrorBoundary, ApiErrorBoundary } from "@/components/error";
import { defaultQueryOptions, defaultMutationOptions, retryConfig } from "@/lib/queries";
import UpgradeSuccessToast from "@/components/UpgradeSuccessToast";
import { ToastProvider } from "@/components/ui/Toast";
import { useState } from "react";
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
import ConversionPixelsAdvancedMatching from "@/components/tracking/ConversionPixelsAdvancedMatching";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ThemeMetaSync from "@/components/system/ThemeMetaSync";
import MajorDrawTestControls from "@/components/dev/MajorDrawTestControls";

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
            // Global error handling for mutations
            onError: (error) => {
              console.error("Mutation error:", error);
              // You can add global error handling here (e.g., toast notifications)
            },
          },
        },
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
