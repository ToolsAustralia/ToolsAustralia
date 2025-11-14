"use client";

import { Package, Star, Check, Loader2 } from "lucide-react";
import { UserData } from "@/hooks/queries/useUserQueries";
import { getOneTimePackages, getPackagesWithPromo } from "@/data/membershipPackages";
import { getMiniDrawPackages, getMiniPackagesWithPromo } from "@/data/miniDrawPackages";
import { useState, useEffect, useRef, useMemo } from "react";
import { useToast } from "@/components/ui/Toast";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import PromoBadge from "@/components/ui/PromoBadge";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";

interface RewardsRedemptionProps {
  user: UserData;
  onPointsUpdate?: (newPoints: number) => void;
}

interface RedemptionOption {
  id: string;
  name: string;
  description: string;
  pointsRequired: number;
  value: number;
  type: "discount" | "entry" | "shipping" | "package";
  isAvailable: boolean;
  packageId?: string; // For package redemptions
  packageType?: "one-time" | "mini-draw"; // Package type
  entries?: number; // For package redemptions
  isMemberOnly?: boolean; // Whether this is a member-only package
  isPromoActive?: boolean; // Whether promo is active
  promoMultiplier?: number; // Promo multiplier
}

export default function RewardsRedemption({ user, onPointsUpdate }: RewardsRedemptionProps) {
  const isRewardsFeatureEnabled = rewardsEnabled();
  const pauseMessage = rewardsDisabledMessage();
  const { showToast } = useToast();
  const [isRedeeming, setIsRedeeming] = useState<string | null>(null);
  const [redeemMessage, setRedeemMessage] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [visibleCount, setVisibleCount] = useState(4); // Start with 4 packages (2 rows of 2)
  const [currentUserPoints, setCurrentUserPoints] = useState(user.rewardsPoints);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get active promos
  const { data: oneTimePromo } = usePromoByType("one-time-packages");
  const { data: miniPromo } = usePromoByType("mini-packages");

  // Get available packages for redemption (5x multiplier) with promo applied
  const allOneTimePackages = useMemo(() => {
    const packages = getOneTimePackages();
    if (oneTimePromo) {
      return getPackagesWithPromo(packages, oneTimePromo.multiplier, "one-time-packages");
    }
    return packages;
  }, [oneTimePromo]);

  const miniDrawPackages = useMemo(() => {
    const packages = getMiniDrawPackages();
    if (miniPromo) {
      return getMiniPackagesWithPromo(packages, miniPromo.multiplier);
    }
    return packages;
  }, [miniPromo]);

  const getIcon = (type: string) => {
    switch (type) {
      case "package":
        return <Package className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />;
      case "entry":
        return <Star className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />;
      default:
        return <Check className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />;
    }
  };

  // Check if user has active membership
  const userHasMembership = user.subscription && user.subscription.isActive;

  // Create package redemption options (5x multiplier) - memoized for performance
  const redemptionOptions: RedemptionOption[] = useMemo(
    () => [
      // Show packages based on membership status
      ...(userHasMembership
        ? // Members see only member-exclusive packages
          allOneTimePackages
            .filter((pkg) => pkg.isMemberOnly)
            .map((pkg) => ({
              id: `package-${pkg._id}`,
              name: `Claim ${pkg.name}`,
              description: `Get ${pkg.totalEntries} entries + ${pkg.partnerDiscountDays} days partner discounts`,
              pointsRequired: pkg.price * 5, // 5x multiplier
              value: pkg.price,
              type: "package" as const,
              isAvailable: currentUserPoints >= pkg.price * 5,
              packageId: pkg._id,
              packageType: "one-time" as const,
              entries: pkg.totalEntries,
              isMemberOnly: true,
              isPromoActive: pkg.isPromoActive,
              promoMultiplier: pkg.promoMultiplier,
            }))
        : // Non-members see only non-member packages
          allOneTimePackages
            .filter((pkg) => !pkg.isMemberOnly)
            .map((pkg) => ({
              id: `package-${pkg._id}`,
              name: `Claim ${pkg.name}`,
              description: `Get ${pkg.totalEntries} entries + ${pkg.partnerDiscountDays} days partner discounts`,
              pointsRequired: pkg.price * 5, // 5x multiplier
              value: pkg.price,
              type: "package" as const,
              isAvailable: currentUserPoints >= pkg.price * 5,
              packageId: pkg._id,
              packageType: "one-time" as const,
              entries: pkg.totalEntries,
              isMemberOnly: false,
              isPromoActive: pkg.isPromoActive,
              promoMultiplier: pkg.promoMultiplier,
            }))),

      // Mini draw packages (show all)
      ...miniDrawPackages.map((pkg) => ({
        id: `mini-${pkg._id}`,
        name: `Claim ${pkg.name}`,
        description: `Get ${pkg.entries} entries + ${pkg.partnerDiscountDays} days partner discounts`,
        pointsRequired: pkg.price * 5, // 5x multiplier
        value: pkg.price,
        type: "package" as const,
        isAvailable: user.rewardsPoints >= pkg.price * 5,
        packageId: pkg._id,
        packageType: "mini-draw" as const,
        entries: pkg.entries,
        isMemberOnly: false,
        isPromoActive: pkg.isPromoActive,
        promoMultiplier: pkg.promoMultiplier,
      })),
    ],
    [allOneTimePackages, miniDrawPackages, userHasMembership, currentUserPoints, user.rewardsPoints]
  );

  // Infinite scrolling effect
  useEffect(() => {
    if (!isRewardsFeatureEnabled) {
      return;
    }

    const handleScroll = () => {
      if (scrollContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

        // Load more when 80% scrolled
        if (scrollPercentage > 0.8 && visibleCount < redemptionOptions.length) {
          setVisibleCount((prev) => Math.min(prev + 2, redemptionOptions.length)); // Add 2 more (1 row)
        }
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [isRewardsFeatureEnabled, visibleCount, redemptionOptions.length]);

  // Reset visible count when redemption options change
  useEffect(() => {
    if (!isRewardsFeatureEnabled) {
      return;
    }

    setVisibleCount(4);
  }, [isRewardsFeatureEnabled, redemptionOptions.length]);

  const handleRedeem = async (option: RedemptionOption) => {
    if (!option.isAvailable || isRedeeming) return;

    setIsRedeeming(option.id);
    setRedeemMessage(null);

    try {
      const response = await fetch("/api/rewards/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user._id,
          redemptionType: option.type,
          pointsRequired: option.pointsRequired,
          packageId: option.packageId,
          description:
            option.type === "package" ? `Claimed ${option.name} with points` : `Redeemed ${option.name} with points`,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update points dynamically
        const newPoints = currentUserPoints - option.pointsRequired;
        setCurrentUserPoints(newPoints);

        // Update parent component if callback provided
        if (onPointsUpdate) {
          onPointsUpdate(newPoints);
        }

        // Build dynamic success message with package details
        let successMessage = data.data.message || "Redemption successful!";

        // Add package-specific details for better user experience
        if (option.type === "package" && option.entries && option.entries > 0) {
          successMessage += ` You received ${option.entries} entries`;

          // Add partner discount info if available
          if (option.packageId) {
            const packageInfo =
              allOneTimePackages.find((p) => p._id === option.packageId) ||
              miniDrawPackages.find((p) => p._id === option.packageId);
            if (packageInfo && (packageInfo.partnerDiscountDays || "partnerDiscountHours" in packageInfo)) {
              const discountDays = packageInfo.partnerDiscountDays || 0;
              const discountHours =
                "partnerDiscountHours" in packageInfo
                  ? (packageInfo as { partnerDiscountHours: number }).partnerDiscountHours
                  : 0;
              if (discountDays > 0) {
                successMessage += ` and ${discountDays} days of partner discounts`;
              } else if (discountHours > 0) {
                successMessage += ` and ${discountHours} hours of partner discounts`;
              }
            }
          }

          successMessage += "!";
        }

        // Show success toast with dynamic message
        showToast({
          type: "success",
          title: "Package Claimed Successfully!",
          message: successMessage,
          duration: 6000, // Show for 6 seconds for detailed info
          action: {
            label: "View Benefits",
            onClick: () => (window.location.href = "/my-account"),
          },
        });

        // Clear any existing success message
        setRedeemMessage(null);
      } else {
        // Extract detailed error message from API response
        let errorMessage = "Redemption failed. Please try again.";

        if (data.error) {
          errorMessage = data.error;
        } else if (data.message) {
          errorMessage = data.message;
        }

        // Show error toast with detailed message
        showToast({
          type: "error",
          title: "❌ Redemption Failed",
          message: errorMessage,
          duration: 8000, // Longer duration for detailed errors
        });

        setRedeemMessage({
          type: "error",
          message: errorMessage,
        });
      }
    } catch (error: unknown) {
      console.error("Redemption error:", error);

      // Extract detailed error message from network/API errors
      let errorMessage = "Network error. Please check your connection and try again.";

      if (error && typeof error === "object" && "response" in error) {
        const apiError = error as { response?: { data?: { error?: string; details?: string } } };
        if (apiError.response?.data?.error) {
          errorMessage = apiError.response.data.error;
          if (apiError.response.data.details) {
            errorMessage += `: ${apiError.response.data.details}`;
          }
        }
      } else if (error && typeof error === "object" && "message" in error) {
        const err = error as { message: string };
        errorMessage = err.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      // Show error toast with detailed message
      showToast({
        type: "error",
        title: "❌ Redemption Failed",
        message: errorMessage,
        duration: 8000, // Longer duration for detailed errors
      });

      setRedeemMessage({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setIsRedeeming(null);
    }
  };

  if (!isRewardsFeatureEnabled) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-200/50">
        <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-gray-100">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-[#ee0000]/10 rounded-lg">
              <Package className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[#ee0000]" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 font-['Poppins']">
                Rewards Redemption Paused
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">{pauseMessage}</p>
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-6 md:p-8">
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
            We&apos;re temporarily disabling redemptions while we upgrade the rewards programme. If you need help with
            an existing request, reach out to support and we&apos;ll get you sorted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-200/50">
      <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-gray-100">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-[#ee0000]/10 rounded-lg">
            <Package className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[#ee0000]" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 font-['Poppins']">
              Claim Packages with Points
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
              Use your {currentUserPoints.toLocaleString()} points to claim packages for free
            </p>
          </div>
        </div>
      </div>

      {/* Success/Error Message */}
      {redeemMessage && (
        <div
          className={`mx-4 sm:mx-6 mt-4 sm:mt-6 p-3 sm:p-4 rounded-lg ${
            redeemMessage.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          <p className="text-xs sm:text-sm font-medium">{redeemMessage.message}</p>
        </div>
      )}

      <div className="p-4 sm:p-6 md:p-8">
        <div
          ref={scrollContainerRef}
          className="h-[500px] sm:h-[600px] md:h-[700px] lg:h-[800px] overflow-y-auto pr-2 custom-scrollbar"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#ee0000 #f3f4f6",
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {redemptionOptions.slice(0, visibleCount).map((option) => (
              <div
                key={option.id}
                className={`relative overflow-hidden border-2 rounded-xl sm:rounded-2xl p-4 sm:p-6 transition-colors duration-200 flex flex-col h-[240px] sm:h-[320px] ${
                  option.isAvailable
                    ? "border-gray-200 hover:border-[#ee0000]/40 cursor-pointer bg-white"
                    : "border-gray-100 bg-gray-50/50"
                }`}
              >
                {/* Package Badge */}
                {option.type === "package" && (
                  <div
                    className={`absolute top-2 right-2 sm:top-3 sm:right-3 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-semibold ${
                      option.isMemberOnly
                        ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-white"
                        : "bg-gradient-to-r from-[#ee0000] to-red-600 text-white"
                    }`}
                  >
                    {option.isMemberOnly ? "MEMBER" : "PACKAGE"}
                  </div>
                )}

                {/* Header Section */}
                <div className="mb-3 sm:mb-4 min-h-[60px] sm:min-h-[80px]">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="p-1 sm:p-1.5 bg-[#ee0000]/10 rounded-lg flex-shrink-0">{getIcon(option.type)}</div>
                    <div className="flex-1 min-h-0">
                      <div className="flex items-center gap-2 mb-1 sm:mb-2">
                        <h3 className="text-sm sm:text-base md:text-lg font-bold text-gray-900 font-['Poppins'] line-clamp-2">
                          {option.name}
                        </h3>
                        {option.isPromoActive && option.promoMultiplier && (
                          <PromoBadge multiplier={option.promoMultiplier as 2 | 3 | 5 | 10} size="small" />
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 leading-relaxed line-clamp-2 sm:line-clamp-3">
                    {option.description}
                  </p>
                </div>

                {/* Points Section */}
                <div className="mb-3 sm:mb-4 min-h-[35px] sm:min-h-[40px]">
                  <div className="flex items-baseline gap-1 sm:gap-2">
                    <span className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-900 font-['Poppins']">
                      {option.pointsRequired.toLocaleString()}
                    </span>
                    <span className="text-xs sm:text-sm text-gray-500 font-medium">points</span>
                  </div>
                  {option.type === "package" && (
                    <div className="text-xs text-gray-500 mt-1">
                      Value: ${option.value} • {option.entries} entries
                    </div>
                  )}
                </div>

                {/* Action Section */}
                <div className="mt-auto">
                  {option.isAvailable ? (
                    <button
                      onClick={() => handleRedeem(option)}
                      disabled={isRedeeming === option.id}
                      className="w-full bg-gradient-to-r from-[#ee0000] to-red-600 text-white px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-300 font-semibold flex items-center justify-center gap-1 sm:gap-2 shadow-lg hover:shadow-xl group-hover:scale-105 text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRedeeming === option.id ? (
                        <>
                          <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                          <span className="hidden sm:inline">Claiming...</span>
                          <span className="sm:hidden">Claiming</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                          {option.type === "package" ? "Claim Now" : "Redeem Now"}
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="space-y-2 sm:space-y-3">
                      <div className="text-center">
                        <div className="text-xs sm:text-sm font-medium text-gray-500 mb-1 sm:mb-2">
                          Need {(option.pointsRequired - currentUserPoints).toLocaleString()} more
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-gray-400 to-gray-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((currentUserPoints / option.pointsRequired) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                      <button
                        disabled
                        className="w-full bg-gray-200 text-gray-500 px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl font-semibold cursor-not-allowed text-xs sm:text-sm"
                      >
                        Insufficient Points
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {visibleCount < redemptionOptions.length && (
              <div className="col-span-1 sm:col-span-2 flex justify-center py-4">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading more packages...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
