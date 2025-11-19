"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { useMyAccountData } from "@/hooks/queries";
import PartnerDiscountQueue from "@/components/features/PartnerDiscountQueue";
import UnlockDiscounts from "@/components/sections/promo/UnlockDiscounts";
import { hasActivePartnerDiscountAccess } from "@/utils/membership/benefit-resolution";

export default function PartnerBenefitsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: accountData, isLoading, error } = useMyAccountData(session?.user?.id);

  // Redirect unauthenticated visitors back to login just like the main my-account page.
  React.useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (!session) {
      router.push("/login");
    }
  }, [session, status, router]);

  if (status === "loading" || isLoading) {
    return (
      <div className="min-h-screen-svh flex flex-col items-center justify-center gap-4 bg-gray-50">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600 font-medium">Loading your benefits...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen-svh flex flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center">
        <p className="text-2xl font-semibold text-gray-900">We couldn&apos;t load your benefits.</p>
        <p className="text-gray-600">{error instanceof Error ? error.message : "Please try again shortly."}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold shadow hover:bg-red-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!session || !accountData) {
    return null;
  }

  const { user } = accountData;
  const hasAccess = hasActivePartnerDiscountAccess(user as unknown as import("@/models/User").IUser);

  return (
    <div className="min-h-screen-svh w-full bg-gray-50">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-[#ee0000] via-red-600 to-red-700 text-white pt-[90px] sm:pt-[106px] pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-transparent to-black/20"></div>
        <div className="absolute top-20 left-10 w-20 h-20 bg-white/10 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-16 h-16 bg-yellow-400/20 rounded-full blur-lg animate-pulse delay-1000"></div>
        <div className="absolute bottom-20 left-1/4 w-12 h-12 bg-white/15 rounded-full blur-md animate-pulse delay-2000"></div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center pb-10">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.35em] text-white/70 mb-4">
            Partner Benefits
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-['Poppins'] leading-tight mb-4">
            Everything you need to manage partner discounts.
          </h1>
          <p className="text-white/80 text-base sm:text-lg mb-6">
            Jump back to your dashboard or keep scrolling to browse the current offers.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/my-account"
              className="inline-flex items-center gap-2 bg-white text-red-600 font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition"
            >
              Back to Dashboard
            </Link>
            <button
              onClick={() => document?.getElementById("partner-discounts-grid")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center gap-2 border border-white/40 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/10 transition"
            >
              View Discounts
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Partner Discount Queue */}
      <section className="relative -mt-16 pb-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <PartnerDiscountQueue startExpanded variant="detailed" />
        </div>
      </section>

      {/* Discount Grid */}
      <section id="partner-discounts-grid" className="bg-white ">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <UnlockDiscounts
            showUnlockButton={!hasAccess}
            title={hasAccess ? "Your Partner Discounts" : "Become a Member to Unlock"}
            description={
              hasAccess
                ? "Flash your code or mention TA at checkout to redeem partner deals instantly."
                : "Subscriptions and one-time packages both unlock our partner network. Choose what suits you best."
            }
          />
        </div>
      </section>
    </div>
  );
}
