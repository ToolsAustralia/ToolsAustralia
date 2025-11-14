"use client";

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
import PromoCountdownBanner from "@/components/banners/PromoCountdownBanner";

// Export loading components for global use
export {
  Skeleton,
  ProductCardSkeleton,
  UserProfileSkeleton,
  TableSkeleton,
  MembershipCardSkeleton,
} from "@/components/loading/SkeletonLoader";
export { ProgressBar, StepProgress, UploadProgress, PaymentProgress } from "@/components/loading/ProgressLoader";
export { Spinner, ButtonSpinner, InlineSpinner, PageSpinner, CardSpinner } from "@/components/loading/SpinnerLoader";
export {
  ErrorRecovery,
  NetworkErrorRecovery,
  ServerErrorRecovery,
  ValidationErrorRecovery,
  FallbackContent,
} from "@/components/error/ErrorRecovery";
export { useErrorRecovery } from "@/hooks/useErrorRecovery";

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
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          <ApiErrorBoundary>
            <UserProvider>
              <SidebarProvider>
                <CartProvider>
                  <LoadingProvider>
                    <ToastProvider>
                      <UpgradeSuccessToast />
                      {children}
                      <PromoCountdownBanner />
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
    </ErrorBoundary>
  );
}
