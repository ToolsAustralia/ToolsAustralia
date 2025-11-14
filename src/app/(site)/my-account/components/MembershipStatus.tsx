"use client";

import { Check, Star } from "lucide-react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import SubscriptionManagementModal from "@/components/modals/SubscriptionManagementModal";

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  subscription?: {
    // Support both old (populated) and new (id-only) API structures
    packageId:
      | string
      | {
          _id: string;
          name: string;
          type: "subscription";
          price: number;
          description: string;
          features: string[];
          entriesPerMonth?: number;
          shopDiscountPercent?: number;
          partnerDiscountDays?: number;
          isActive: boolean;
        };
    isActive: boolean;
    startDate: string;
    endDate?: string;
    autoRenew: boolean;
    status?: string;
  };
  oneTimePackages?: Array<{
    packageId:
      | string
      | {
          _id: string;
          name: string;
          type: "one-time";
          price: number;
          description: string;
          features: string[];
          totalEntries?: number;
          shopDiscountPercent?: number;
          partnerDiscountDays?: number;
          isActive: boolean;
        };
    purchaseDate: string;
    startDate: string | undefined;
    endDate: string | undefined;
    isActive: boolean;
    entriesGranted?: number;
  }>;
  // New fields from the updated API structure (after static data migration)
  subscriptionPackageData?: {
    _id: string;
    name: string;
    type: "subscription" | "one-time";
    price: number;
    description: string;
    features: string[];
    entriesPerMonth?: number;
    shopDiscountPercent?: number;
    partnerDiscountDays?: number;
    isActive: boolean;
  };
  enrichedOneTimePackages?: Array<{
    packageId: string;
    isActive: boolean;
    purchaseDate: string;
    packageData: {
      _id: string;
      name: string;
      type: "subscription" | "one-time";
      price: number;
      description: string;
      features: string[];
      totalEntries?: number;
      shopDiscountPercent?: number;
      partnerDiscountDays?: number;
      isActive: boolean;
    };
  }>;
}

interface MembershipStatusProps {
  user: User;
}

export default function MembershipStatus({ user }: MembershipStatusProps) {
  const [isManagementModalOpen, setIsManagementModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const pathname = usePathname();

  // Handle client-side mounting to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Determine pricing suffix based on current page
  // Home page (/) and membership page (/membership) show "/mo", all other pages show "Per Giveaway"
  // Default to false (show "Per Giveaway") during SSR to match client-side behavior on non-home pages
  const isHomeOrMembershipPage = isMounted && (pathname === "/" || pathname === "/membership");

  // Check for active subscription or one-time package
  const activeSubscription = user.subscription?.isActive ? user.subscription : null;
  const activeOneTimePackage = user.oneTimePackages?.find((pkg) => pkg.isActive);

  // Handle the new data structure:
  // For subscriptions: use subscriptionPackageData (full package detail)
  // For one-time: enrichedOneTimePackages contains full packageData
  let membershipPackage;
  if (activeSubscription && user.subscriptionPackageData) {
    membershipPackage = user.subscriptionPackageData;
  } else {
    const activeOneTimeData = user.enrichedOneTimePackages?.find((pkg) => pkg.isActive);
    membershipPackage = activeOneTimeData?.packageData;
  }

  const isActive = !!(activeSubscription || activeOneTimePackage);

  // Get membership color scheme based on package name
  const getMembershipColorScheme = (packageName?: string) => {
    if (!packageName) return "bg-gradient-to-br from-slate-600 via-gray-700 to-slate-800 shadow-slate-500/25";

    const name = packageName.toLowerCase();
    if (name.includes("tradie") || name.includes("apprentice")) {
      return "bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 shadow-blue-500/30 hover:shadow-blue-500/50";
    } else if (name.includes("tradie")) {
      return "bg-gradient-to-br from-emerald-600 via-green-700 to-teal-800 shadow-emerald-500/30 hover:shadow-emerald-500/50";
    } else if (name.includes("foreman")) {
      return "bg-gradient-to-br from-purple-600 via-purple-700 to-violet-800 shadow-purple-500/30 hover:shadow-purple-500/50";
    } else if (name.includes("boss")) {
      return "bg-gradient-to-br from-gray-900 via-black to-gray-800 shadow-gray-900/50 hover:shadow-gray-900/70 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-yellow-400/20 before:via-transparent before:to-yellow-400/20 before:animate-pulse before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-1000";
    } else if (name.includes("power")) {
      return "bg-gradient-to-br from-gray-900 via-black to-gray-800 shadow-gray-900/50 hover:shadow-gray-900/70 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-yellow-400/20 before:via-transparent before:to-yellow-400/20 before:animate-pulse before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-1000";
    } else {
      return "bg-gradient-to-br from-slate-600 via-gray-700 to-slate-800 shadow-slate-500/25";
    }
  };

  return (
    <div className="space-y-6">
      {isActive && membershipPackage ? (
        <div className="relative">
          {/* Membership Card - Same format as membership section */}
          <div
            className={`relative w-full h-[650px] rounded-[20px] shadow-2xl transition-all duration-500 hover:shadow-3xl hover:scale-[1.02] hover:-translate-y-1 ${getMembershipColorScheme(
              membershipPackage.name
            )}`}
          >
            {/* Popular Badge for VIP packages */}
            {membershipPackage.name && membershipPackage.name.toLowerCase().includes("boss") && (
              <div className="absolute -top-0 left-1/2 transform -translate-x-1/2 z-10">
                <div className="bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-black px-4 py-2 rounded-full font-bold text-sm shadow-2xl shadow-yellow-500/50 border-2 border-yellow-300 flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  CURRENT PLAN
                </div>
              </div>
            )}

            {/* Card Content */}
            <div className="h-full rounded-[20px] p-8 transition-all duration-500 hover:shadow-2xl">
              <div className="h-full flex flex-col">
                {/* Plan Header */}
                <div className="text-center h-[160px] flex flex-col justify-center">
                  <h3
                    className={`text-2xl font-bold mb-2 ${
                      membershipPackage.name?.toLowerCase().includes("boss") ||
                      membershipPackage.name?.toLowerCase().includes("power")
                        ? "text-yellow-400 animate-pulse drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                        : "text-white"
                    }`}
                  >
                    {membershipPackage.name || "Package"}
                  </h3>
                  <div
                    className={`${
                      membershipPackage.name?.toLowerCase().includes("boss") ||
                      membershipPackage.name?.toLowerCase().includes("power")
                        ? "text-yellow-400"
                        : "text-white"
                    }`}
                  >
                    <span
                      className={`text-4xl font-bold ${
                        membershipPackage.name?.toLowerCase().includes("boss") ||
                        membershipPackage.name?.toLowerCase().includes("power")
                          ? "animate-pulse drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                          : ""
                      }`}
                    >
                      ${membershipPackage.price || 0}
                    </span>
                    {membershipPackage.type === "subscription" && (
                      <>
                        {isHomeOrMembershipPage ? (
                          <>
                            <span className="text-lg">/</span>
                            <span className="text-lg">mo</span>
                          </>
                        ) : (
                          <span className="text-lg ml-1">Per Giveaway</span>
                        )}
                      </>
                    )}
                    {membershipPackage.type === "one-time" && (
                      <div className="text-sm text-white/70 mt-1">One Time Payment</div>
                    )}
                  </div>
                </div>

                {/* Features List */}
                <div className="flex-1 max-h-[200px] overflow-y-auto space-y-3 mb-6">
                  {membershipPackage.features &&
                    membershipPackage.features.map((feature, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <Check className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-sm text-white leading-relaxed">{feature}</span>
                      </div>
                    ))}
                </div>

                {/* Status and Details */}
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between items-center text-white/90 text-sm">
                    <span>Status:</span>
                    <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full font-medium">Active</span>
                  </div>
                  <div className="flex justify-between items-center text-white/90 text-sm">
                    <span>{activeSubscription ? "Started:" : "Purchased:"}</span>
                    <span>
                      {new Date(
                        activeSubscription?.startDate || activeOneTimePackage?.purchaseDate || ""
                      ).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  {activeSubscription?.endDate && (
                    <div className="flex justify-between items-center text-white/90 text-sm">
                      <span>Expires:</span>
                      <span>
                        {new Date(activeSubscription.endDate).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  )}
                  {activeSubscription?.autoRenew && (
                    <div className="flex justify-between items-center text-white/90 text-sm">
                      <span>Auto Renew:</span>
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs">Enabled</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={() => setIsManagementModalOpen(true)}
                    className="w-full h-[50px] rounded-[15px] flex items-center justify-center font-bold text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl bg-white/20 backdrop-blur-sm text-white hover:bg-red-600 hover:text-white border border-white/30 hover:border-red-600"
                  >
                    Manage Membership
                  </button>
                  {membershipPackage && membershipPackage.type === "subscription" && (
                    <a
                      href="/membership/upgrade"
                      className="w-full h-[45px] rounded-[12px] flex items-center justify-center font-semibold text-sm transition-all duration-300 bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:from-yellow-500 hover:to-orange-600"
                    >
                      Upgrade Plan
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative w-full h-[420px] rounded-[20px] shadow-2xl transition-all duration-500 hover:shadow-3xl hover:scale-[1.02] hover:-translate-y-1 bg-gradient-to-br from-slate-600 via-gray-700 to-slate-800 shadow-slate-500/25">
          <div className="h-full rounded-[20px] p-8">
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="text-white/40 mb-6">
                <svg className="w-20 h-20 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">No Active Membership</h3>
              <p className="text-white/80 mb-8 leading-relaxed">
                Join a membership plan to get monthly entries, shop discounts, and exclusive benefits!
              </p>
              <a
                href="/membership"
                className="w-full h-[50px] rounded-[15px] flex items-center justify-center font-bold text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl bg-white text-slate-800 hover:bg-red-600 hover:text-white"
              >
                View Membership Plans
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Management Modal */}
      <SubscriptionManagementModal
        isOpen={isManagementModalOpen}
        onClose={() => setIsManagementModalOpen(false)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        user={user as any}
        onSubscriptionUpdate={() => {
          // Refresh user data - this would typically trigger a refetch
          window.location.reload();
        }}
      />
    </div>
  );
}
