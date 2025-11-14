"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useUserContext } from "@/contexts/UserContext";
import MembershipSection from "@/components/sections/MembershipSection";

interface SubscriptionProtectedProps {
  children: React.ReactNode;
  redirectTo?: string;
  showMembershipSection?: boolean;
}

/**
 * Component that protects routes requiring an active subscription
 * Redirects to membership page if user doesn't have active subscription
 */
export default function SubscriptionProtected({
  children,
  redirectTo = "/membership",
  showMembershipSection = true,
}: SubscriptionProtectedProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { hasActiveSubscription, loading } = useUserContext();

  useEffect(() => {
    // Wait for session to load
    if (status === "loading" || loading) return;

    // If not authenticated, redirect to login
    if (!session) {
      router.push("/login");
      return;
    }

    // If authenticated but no active subscription, redirect to membership
    if (!hasActiveSubscription) {
      router.push(redirectTo);
      return;
    }
  }, [session, status, hasActiveSubscription, loading, router, redirectTo]);

  // Show loading state while checking
  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600"></div>
      </div>
    );
  }

  // If not authenticated, don't render (will redirect)
  if (!session) {
    return null;
  }

  // If no active subscription, show membership prompt
  if (!hasActiveSubscription) {
    return (
      <div className="min-h-screen-svh bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Subscription Required
            </h1>
            <p className="text-lg text-gray-600">
              This page is only available to members with an active subscription. Please subscribe to access this content.
            </p>
          </div>
          {showMembershipSection && <MembershipSection />}
        </div>
      </div>
    );
  }

  // User has active subscription, render children
  return <>{children}</>;
}

