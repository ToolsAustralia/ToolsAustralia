"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Settings, AlertTriangle, CheckCircle, XCircle, ArrowUp, ArrowDown } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import { useMemberships } from "@/hooks/useMemberships";
import { useToast } from "@/components/ui/Toast";
import { useRenewSubscription } from "@/hooks/queries/useSubscriptionQueries";
import ConfirmationModal from "./ConfirmationModal";
import BenefitCountdown from "@/components/ui/BenefitCountdown";
import StripePaymentModal from "./StripePaymentModal";
import CancellationUpsellModal from "./CancellationUpsellModal";

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
    startDate?: string | undefined;
    endDate?: string | undefined;
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
  // Cancellation upsell tracking
  cancellationUpsellRedeemed?: boolean;
  cancellationUpsellRedeemedAt?: Date;
}

interface SubscriptionBenefits {
  currentBenefits: {
    entriesPerMonth: number;
    shopDiscountPercent: number;
    partnerDiscountDays: number;
    packageName: string;
    packageId: string;
    isPendingChange: boolean;
    pendingChange?: {
      newPackageId: string;
      newPackageName: string;
      effectiveDate: string;
      changeType: "upgrade" | "downgrade";
    };
  } | null;
  availableUpgrades: Array<{
    packageId: string;
    name: string;
    price: number;
    entriesPerMonth: number;
    shopDiscountPercent: number;
    partnerDiscountDays: number;
    description: string;
  }>;
  availableDowngrades: Array<{
    packageId: string;
    name: string;
    price: number;
    entriesPerMonth: number;
    shopDiscountPercent: number;
    partnerDiscountDays: number;
    description: string;
  }>;
  pendingChangeMessage: string | null;
  hasActiveSubscription: boolean;
  subscriptionStatus: string;
  autoRenew: boolean;
  nextBillingDate?: string;
  isCancelled: boolean;
  endDate?: string;
}

interface SubscriptionManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSubscriptionUpdate?: () => void;
}

const SubscriptionManagementModal: React.FC<SubscriptionManagementModalProps> = ({
  isOpen,
  onClose,
  user,
  onSubscriptionUpdate,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancellationUpsell, setShowCancellationUpsell] = useState(false);
  const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  const [selectedUpgrade, setSelectedUpgrade] = useState<{
    packageId: string;
    name: string;
    price: number;
    entriesPerMonth: number;
    shopDiscountPercent: number;
    partnerDiscountDays: number;
    description: string;
  } | null>(null);
  const [selectedDowngrade, setSelectedDowngrade] = useState<{
    packageId: string;
    name: string;
    price: number;
    entriesPerMonth: number;
    shopDiscountPercent: number;
    partnerDiscountDays: number;
    description: string;
  } | null>(null);
  const [subscriptionBenefits, setSubscriptionBenefits] = useState<SubscriptionBenefits | null>(null);
  const [benefitsLoading, setBenefitsLoading] = useState(false);

  // Stripe payment confirmation state
  const [showStripePaymentModal, setShowStripePaymentModal] = useState(false);
  const [upgradeData, setUpgradeData] = useState<{
    paymentIntentId: string;
    clientSecret: string;
    packageName: string;
    packageId: string;
    amount: number;
    // Upgrade information (no proration)
    upgradeInfo?: {
      fromPackage: { name: string; price: number };
      toPackage: { name: string; price: number };
      billingInfo?: {
        currentBillingDate: string;
        nextBillingDate: string;
        nextBillingAmount: number;
        billingDateStays: boolean;
      };
    };
  } | null>(null);

  // Toast notifications
  const { showToast } = useToast();

  // Fetch membership packages to get full package data
  const { loading: packagesLoading } = useMemberships();

  // Renew subscription mutation
  const renewSubscription = useRenewSubscription();

  // Fetch subscription benefits
  const fetchSubscriptionBenefits = useCallback(async () => {
    if (!isOpen || !user.subscription?.isActive) return;

    setBenefitsLoading(true);
    try {
      const response = await fetch("/api/subscription/benefits", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptionBenefits(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch subscription benefits:", error);
    } finally {
      setBenefitsLoading(false);
    }
  }, [isOpen, user.subscription?.isActive]);

  // Handle escape key to close modal and fetch benefits
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "hidden";
      fetchSubscriptionBenefits();
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose, user.subscription?.isActive, fetchSubscriptionBenefits]);

  const activeSubscription = user.subscription?.isActive ? user.subscription : null;
  const activeOneTimePackage = user.oneTimePackages?.find((pkg) => pkg.isActive);

  // Get the full package data by finding it in the fetched packages
  // Handle the new data structure:
  // For subscriptions: use subscriptionPackageData (full package detail)
  // For one-time: enrichedOneTimePackages contains full packageData
  const membershipPackage = (() => {
    if (packagesLoading) return null;

    if (activeSubscription && user.subscriptionPackageData) {
      return user.subscriptionPackageData;
    } else {
      const activeOneTimeData = user.enrichedOneTimePackages?.find((pkg) => pkg.isActive);
      return activeOneTimeData?.packageData;
    }
  })();

  const handleUpgradeSubscription = async () => {
    if (!selectedUpgrade || !membershipPackage) return;

    setShowUpgradeConfirm(false);

    // Open StripePaymentModal with full plan price (no proration)
    setUpgradeData({
      paymentIntentId: "", // Will be created by StripePaymentModal
      clientSecret: "", // Will be created by StripePaymentModal
      packageName: selectedUpgrade.name,
      packageId: selectedUpgrade.packageId,
      amount: selectedUpgrade.price * 100, // full price in cents
      upgradeInfo: {
        fromPackage: {
          name: membershipPackage.name,
          price: membershipPackage.price,
        },
        toPackage: {
          name: selectedUpgrade.name,
          price: selectedUpgrade.price,
        },
        billingInfo: undefined,
      },
    });

    // Show Stripe payment modal after confirmation
    setShowStripePaymentModal(true);
  };

  const handleDowngradeSubscription = async () => {
    if (!selectedDowngrade) return;

    setIsLoading(true);
    setShowDowngradeConfirm(false);

    try {
      const response = await fetch("/api/stripe/downgrade-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPackageId: selectedDowngrade.packageId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to downgrade subscription");
      }

      // Show enhanced success toast with preserved benefits information
      const currentPackageName = membershipPackage?.name || "current";
      const daysUntilChange = result.data?.daysUntilChange || 0;
      const effectiveDate = result.data?.newPackage?.activatesOn || result.data?.previousPackage?.benefitsUntil;

      showToast({
        type: "success",
        title: "Downgrade Scheduled Successfully!",
        message: `You'll keep all your ${currentPackageName} benefits for ${daysUntilChange} more days. Your ${
          selectedDowngrade.name
        } membership starts on ${new Date(
          effectiveDate
        ).toLocaleDateString()}. No refunds, but you keep what you paid for!`,
        duration: 20000, // Show for 20 seconds for important downgrade info
      });

      // Store downgrade data for potential page reload toast
      localStorage.setItem(
        "subscription_downgraded",
        JSON.stringify({
          currentPackageName,
          newPackageName: selectedDowngrade.name,
          daysUntilChange,
          effectiveDate,
          timestamp: Date.now(),
        })
      );

      // Refresh user data and benefits
      if (onSubscriptionUpdate) {
        onSubscriptionUpdate();
      }
      fetchSubscriptionBenefits();
      setSelectedDowngrade(null);
    } catch (error) {
      console.error("Failed to downgrade subscription:", error);
      showToast({
        type: "error",
        title: "Downgrade Failed",
        message: error instanceof Error ? error.message : "Failed to downgrade subscription. Please try again.",
        duration: 10000, // Show for 10 seconds for error messages
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!activeSubscription) return;

    // Check if user has already redeemed the cancellation upsell
    if (user.cancellationUpsellRedeemed) {
      // User already redeemed, proceed with cancellation
      await proceedWithCancellation();
    } else {
      // Show cancellation upsell modal
      setShowCancelConfirm(false);
      setShowCancellationUpsell(true);
    }
  };

  const proceedWithCancellation = async () => {
    if (!activeSubscription) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/stripe/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include cookies for session authentication
        body: JSON.stringify({ cancelAtPeriodEnd: true }), // Cancel at end of billing period
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to cancel subscription");
      }

      // Show enhanced cancellation toast with end date
      const resolvedEndDateIso =
        result.data?.currentPeriodEnd || result.data?.endDate || user.subscription?.endDate || null;
      const endDate = resolvedEndDateIso
        ? new Date(resolvedEndDateIso).toLocaleDateString()
        : "the end of your billing period";
      const daysRemaining = resolvedEndDateIso
        ? Math.max(0, Math.ceil((new Date(resolvedEndDateIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : "several";

      showToast({
        type: "warning",
        title: "Subscription Cancelled",
        message: `Your subscription will end on ${endDate} (${daysRemaining} days). You'll keep full access until then. We're sad to see you go!`,
        duration: 15000, // Show for 15 seconds for important info
      });

      // Refresh user data and benefits
      if (onSubscriptionUpdate) {
        onSubscriptionUpdate();
      }
      fetchSubscriptionBenefits();
      setShowCancelConfirm(false);
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
      showToast({
        type: "error",
        title: "Cancellation Failed",
        message: error instanceof Error ? error.message : "Failed to cancel subscription. Please try again.",
        duration: 10000, // Show for 10 seconds for error messages
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpsellRedeem = () => {
    // User redeemed the offer, close the modal and refresh data
    setShowCancellationUpsell(false);
    if (onSubscriptionUpdate) {
      onSubscriptionUpdate();
    }
    fetchSubscriptionBenefits();
  };

  const handleUpsellDecline = () => {
    // User declined the offer, proceed with cancellation
    setShowCancellationUpsell(false);
    proceedWithCancellation();
  };

  const handleReactivateSubscription = async () => {
    if (!user.subscription?.packageId) return;

    setIsLoading(true);
    try {
      // Use the renewal mutation with the current package ID
      const result = await renewSubscription.mutateAsync({
        packageId:
          typeof user.subscription.packageId === "string"
            ? user.subscription.packageId
            : user.subscription.packageId._id,
        createSetupIntent: true, // Allow creation of setup intent if no valid payment methods
      });

      if (result.success) {
        if (result.requiresPaymentConfirmation && result.data?.paymentIntent) {
          // Handle payment confirmation flow
          setShowStripePaymentModal(true);
          setUpgradeData({
            paymentIntentId: result.data.paymentIntent.id,
            clientSecret: result.data.paymentIntent.clientSecret,
            packageName: result.data.subscription?.packageName || "Subscription",
            packageId: result.data.subscription?.packageId || "",
            amount: result.data.paymentIntent.amount || 0,
          });
        } else {
          // Immediate success
          showToast({
            type: "success",
            title: "Subscription Reactivated!",
            message: result.message || "Your subscription has been successfully reactivated.",
            duration: 8000,
          });

          // Refresh user data and benefits
          if (onSubscriptionUpdate) {
            onSubscriptionUpdate();
          }
          fetchSubscriptionBenefits();
        }
      } else if (result.requiresSetupIntent && result.data?.setupIntent) {
        // Handle setup intent flow - user needs to add a payment method
        showToast({
          type: "info",
          title: "Payment Method Required",
          message: "Please add a payment method to reactivate your subscription.",
          duration: 10000,
        });

        // TODO: Show setup intent modal or redirect to payment method page
        // For now, just show the message
        console.log("Setup intent created:", result.data.setupIntent);
      } else {
        throw new Error(result.message || "Failed to reactivate subscription");
      }
    } catch (error) {
      console.error("Failed to reactivate subscription:", error);

      // Check if it's a payment method error
      const errorMessage =
        error instanceof Error ? error.message : "Failed to reactivate subscription. Please try again.";
      const isPaymentMethodError =
        errorMessage.includes("payment method") || errorMessage.includes("No valid payment method");

      showToast({
        type: "error",
        title: "Reactivation Failed",
        message: isPaymentMethodError
          ? "Your saved payment method is no longer valid. Please add a new payment method to reactivate your subscription."
          : errorMessage,
        duration: 15000, // Longer duration for important messages
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Stripe payment confirmation for upgrades
  const handleStripePaymentConfirm = async () => {
    console.log("✅ Payment confirmed, webhook will handle subscription activation");

    // Set flag in localStorage to show enhanced success toast after page reload
    // Include comprehensive upgrade information for the toast
    localStorage.setItem(
      "subscription_upgraded",
      JSON.stringify({
        packageName: selectedUpgrade?.name || "subscription",
        entriesPerMonth: selectedUpgrade?.entriesPerMonth || 0,
        shopDiscountPercent: selectedUpgrade?.shopDiscountPercent || 0,
        partnerDiscountDays: selectedUpgrade?.partnerDiscountDays || 0,
        timestamp: Date.now(),
      })
    );

    // Close Stripe payment modal
    setShowStripePaymentModal(false);
    setUpgradeData(null);

    // Refresh the page immediately to show updated subscription data
    window.location.reload();
  };

  if (!isOpen) return null;

  const parseDate = (value?: string | Date | null) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatDate = (value?: string | Date | null, locale: string = "en-US") => {
    const date = parseDate(value);
    return date
      ? date.toLocaleDateString(locale, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <ModalHeader title="Manage Subscription" onClose={onClose} showLogo={false} />

      <ModalContent padding="lg">
        {membershipPackage && activeSubscription ? (
          <div className="space-y-6">
            {/* Current Plan Info */}
            <div
              className={`rounded-lg p-6 text-white ${
                // Dynamic gradient based on plan type - matching MembershipSection.tsx
                membershipPackage.name?.toLowerCase().includes("tradie") ||
                membershipPackage._id?.includes("tradie") ||
                membershipPackage._id?.includes("apprentice-pack")
                  ? "bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800"
                  : membershipPackage.name?.toLowerCase().includes("tradie-pack") ||
                    membershipPackage._id?.includes("tradie-pack")
                  ? "bg-gradient-to-br from-emerald-600 via-green-700 to-teal-800"
                  : membershipPackage.name?.toLowerCase().includes("foreman") ||
                    membershipPackage._id?.includes("foreman") ||
                    membershipPackage._id?.includes("foreman-pack")
                  ? "bg-gradient-to-br from-purple-600 via-violet-700 to-indigo-800"
                  : membershipPackage.name?.toLowerCase().includes("boss") || membershipPackage._id?.includes("boss")
                  ? "bg-gradient-to-br from-gray-900 via-black to-gray-800 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-yellow-400/20 before:via-transparent before:to-yellow-400/20 before:animate-pulse before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-1000"
                  : // Default fallback
                    "bg-gradient-to-br from-gray-600 via-gray-700 to-gray-800"
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <Settings className="w-6 h-6" />
                <h2 className="text-xl font-bold">Current Plan</h2>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-white/90">Plan:</span>
                  <span className="font-semibold">{membershipPackage.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/90">Price:</span>
                  <span className="font-semibold">${membershipPackage.price}/month</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/90">Started:</span>
                  <span className="font-semibold">
                    {new Date(activeSubscription.startDate).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                {subscriptionBenefits?.isCancelled ? (
                  <div className="flex justify-between items-center">
                    <span className="text-white/90">Subscription Ends:</span>
                    <span className="font-semibold text-yellow-300">
                      {formatDate(subscriptionBenefits.endDate || activeSubscription.endDate) ?? "Unknown"}
                    </span>
                  </div>
                ) : activeSubscription.endDate ? (
                  <div className="flex justify-between items-center">
                    <span className="text-white/90">Next Billing:</span>
                    <span className="font-semibold">{formatDate(activeSubscription.endDate) ?? "Unknown"}</span>
                  </div>
                ) : null}

                {/* Cancellation Status */}
                {subscriptionBenefits?.isCancelled && (
                  <div className="bg-yellow-600/20 border border-yellow-500/30 rounded-lg p-3 mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-300" />
                      <span className="text-yellow-300 font-semibold text-sm">Subscription Cancelled</span>
                    </div>
                    <p className="text-yellow-100 text-xs">
                      Your subscription will end on{" "}
                      {formatDate(subscriptionBenefits.endDate || activeSubscription.endDate) ||
                        "the end of your billing period"}
                      . You&apos;ll keep access to all benefits until then.
                    </p>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-white/90">Auto Renewal:</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      activeSubscription.autoRenew ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {activeSubscription.autoRenew ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
            </div>

            {/* Plan Features */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Plan Benefits</h3>
              <div className="space-y-2">
                {packagesLoading ? (
                  <div className="text-sm text-gray-500">Loading benefits...</div>
                ) : membershipPackage?.features ? (
                  membershipPackage.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500">No benefits information available</div>
                )}
              </div>
            </div>

            {/* Pending Changes Countdown */}
            {subscriptionBenefits?.currentBenefits?.isPendingChange &&
              subscriptionBenefits.currentBenefits.pendingChange && (
                <BenefitCountdown
                  effectiveDate={new Date(subscriptionBenefits.currentBenefits.pendingChange.effectiveDate)}
                  changeType={subscriptionBenefits.currentBenefits.pendingChange.changeType}
                  currentBenefits={{
                    packageName: subscriptionBenefits.currentBenefits.packageName,
                    entriesPerMonth: subscriptionBenefits.currentBenefits.entriesPerMonth,
                    shopDiscountPercent: subscriptionBenefits.currentBenefits.shopDiscountPercent,
                    partnerDiscountDays: subscriptionBenefits.currentBenefits.partnerDiscountDays,
                  }}
                  newBenefits={{
                    packageName: subscriptionBenefits.currentBenefits.pendingChange.newPackageName,
                    entriesPerMonth:
                      subscriptionBenefits.availableDowngrades.find(
                        (d) => d.packageId === subscriptionBenefits.currentBenefits?.pendingChange?.newPackageId
                      )?.entriesPerMonth || 0,
                    shopDiscountPercent:
                      subscriptionBenefits.availableDowngrades.find(
                        (d) => d.packageId === subscriptionBenefits.currentBenefits?.pendingChange?.newPackageId
                      )?.shopDiscountPercent || 0,
                    partnerDiscountDays:
                      subscriptionBenefits.availableDowngrades.find(
                        (d) => d.packageId === subscriptionBenefits.currentBenefits?.pendingChange?.newPackageId
                      )?.partnerDiscountDays || 0,
                  }}
                  onExpired={() => {
                    // Refresh benefits when countdown expires
                    fetchSubscriptionBenefits();
                    if (onSubscriptionUpdate) {
                      onSubscriptionUpdate();
                    }
                  }}
                />
              )}

            {/* Management Actions */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Subscription Management</h3>

              {/* Upgrade Options */}
              {!subscriptionBenefits?.isCancelled &&
                subscriptionBenefits?.availableUpgrades &&
                subscriptionBenefits.availableUpgrades.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <ArrowUp className="w-4 h-4 text-green-600" />
                      Available Upgrades
                    </h4>
                    {subscriptionBenefits.availableUpgrades.map((upgrade) => (
                      <div
                        key={upgrade.packageId}
                        className="flex items-center justify-between p-4 bg-white border border-green-200 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                            <h5 className="font-medium text-gray-900">{upgrade.name}</h5>
                            <span className="text-lg font-bold text-green-600">${upgrade.price}/month</span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{upgrade.description}</p>
                          <div className="flex gap-4 text-xs text-gray-500">
                            <span>{upgrade.entriesPerMonth} entries/month</span>
                            <span>{upgrade.shopDiscountPercent}% shop discount</span>
                            <span>{upgrade.partnerDiscountDays} days partner access</span>
                          </div>
                        </div>
                        <Button
                          onClick={() => {
                            setSelectedUpgrade(upgrade);
                            setShowUpgradeConfirm(true);
                          }}
                          disabled={isLoading || benefitsLoading}
                          variant="primary"
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 ml-4"
                        >
                          Upgrade Now
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

              {/* Downgrade Options */}
              {!subscriptionBenefits?.isCancelled &&
                subscriptionBenefits?.availableDowngrades &&
                subscriptionBenefits.availableDowngrades.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <ArrowDown className="w-4 h-4 text-orange-600" />
                      Available Downgrades
                    </h4>
                    {subscriptionBenefits.availableDowngrades.map((downgrade) => (
                      <div
                        key={downgrade.packageId}
                        className="flex items-center justify-between p-4 bg-white border border-orange-200 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                            <h5 className="font-medium text-gray-900">{downgrade.name}</h5>
                            <span className="text-lg font-bold text-orange-600">${downgrade.price}/month</span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{downgrade.description}</p>
                          <div className="flex gap-4 text-xs text-gray-500">
                            <span>{downgrade.entriesPerMonth} entries/month</span>
                            <span>{downgrade.shopDiscountPercent}% shop discount</span>
                            <span>{downgrade.partnerDiscountDays} days partner access</span>
                          </div>
                        </div>
                        <Button
                          onClick={() => {
                            setSelectedDowngrade(downgrade);
                            setShowDowngradeConfirm(true);
                          }}
                          disabled={isLoading || benefitsLoading}
                          variant="secondary"
                          size="sm"
                          className="border-orange-300 text-orange-600 hover:bg-orange-50 ml-4"
                        >
                          Schedule Downgrade
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

              {/* Cancel Subscription */}
              <div
                className={`flex items-center justify-between p-4 rounded-lg ${
                  subscriptionBenefits?.isCancelled
                    ? "bg-yellow-50 border border-yellow-200"
                    : "bg-white border border-red-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <XCircle
                    className={`w-5 h-5 ${subscriptionBenefits?.isCancelled ? "text-yellow-600" : "text-red-600"}`}
                  />
                  <div>
                    <p className="font-medium text-gray-900">
                      {subscriptionBenefits?.isCancelled ? "Subscription Cancelled" : "Cancel Subscription"}
                    </p>
                    <p className="text-sm text-gray-600">
                      {subscriptionBenefits?.isCancelled
                        ? `Beneftis ends on ${formatDate(subscriptionBenefits.endDate) ?? "end of billing period"}`
                        : "You'll retain access until the end of your billing period"}
                    </p>
                  </div>
                </div>
                {!subscriptionBenefits?.isCancelled ? (
                  <Button
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={isLoading}
                    variant="secondary"
                    size="sm"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    onClick={handleReactivateSubscription}
                    disabled={isLoading}
                    variant="primary"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Reactivate
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : activeOneTimePackage ? (
          <div className="text-center py-8">
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">One-Time Package</h2>
              <p className="text-gray-600 mb-4">
                You have an active one-time package:{" "}
                <strong>
                  {typeof activeOneTimePackage.packageId === "string"
                    ? "One-Time Package"
                    : activeOneTimePackage.packageId.name}
                </strong>
              </p>
              <p className="text-sm text-gray-500">
                One-time packages don&apos;t require subscription management. You can purchase additional packages
                anytime.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">No Active Subscription</h2>
              <p className="text-gray-600 mb-4">You don&apos;t have an active subscription to manage.</p>
              <Button onClick={onClose} variant="primary" className="bg-[#ee0000] hover:bg-red-700">
                View Membership Plans
              </Button>
            </div>
          </div>
        )}

        {/* Cancel Confirmation Modal */}
        <ConfirmationModal
          isOpen={showCancelConfirm}
          onClose={() => setShowCancelConfirm(false)}
          onConfirm={handleCancelSubscription}
          type="cancel"
          title="Cancel Subscription"
          message="Are you sure you want to cancel your subscription? You'll retain access to all benefits until the end of your current billing period."
          confirmText="Cancel Subscription"
          cancelText="Keep Subscription"
          isLoading={isLoading}
          details={{
            packageName: membershipPackage?.name || "Current Plan",
            warnings: [
              "You'll lose access to subscription benefits after the current billing period",
              "No refunds for unused time",
            ],
            info: ["You'll keep current benefits until cycle end", "You can resubscribe anytime"],
          }}
        />

        {/* Upgrade Confirmation Modal */}
        <ConfirmationModal
          isOpen={showUpgradeConfirm && !!selectedUpgrade}
          onClose={() => setShowUpgradeConfirm(false)}
          onConfirm={handleUpgradeSubscription}
          type="upgrade"
          title={`Upgrade to ${selectedUpgrade?.name || ""}`}
          message={`You'll be charged the full upgrade amount now. Your billing cycle will restart today.`}
          confirmText="Continue to Payment"
          cancelText="Keep Current Plan"
          isLoading={isLoading}
          details={
            selectedUpgrade && membershipPackage
              ? {
                  packageName: selectedUpgrade.name,
                  price: selectedUpgrade.price,
                  benefits: [
                    `${selectedUpgrade.entriesPerMonth} entries per month (from ${
                      "entriesPerMonth" in membershipPackage
                        ? membershipPackage.entriesPerMonth || 0
                        : "totalEntries" in membershipPackage
                        ? membershipPackage.totalEntries || 0
                        : 0
                    })`,
                    `${selectedUpgrade.shopDiscountPercent}% shop discount (from ${
                      membershipPackage.shopDiscountPercent || 0
                    }%)`,
                    `${selectedUpgrade.partnerDiscountDays} days partner access`,
                  ],
                  info: [
                    "✓ Pay full plan price now",
                    "✓ Upgrade activates immediately",
                    "✓ Billing cycle restarts today",
                    `✓ Next bill: $${selectedUpgrade.price}/month`,
                  ],
                  warnings: ["No credit/refund is applied. Billing resets to the new plan."],
                }
              : undefined
          }
        />

        {/* Downgrade Confirmation Modal */}
        <ConfirmationModal
          isOpen={showDowngradeConfirm && !!selectedDowngrade}
          onClose={() => setShowDowngradeConfirm(false)}
          onConfirm={handleDowngradeSubscription}
          type="downgrade"
          title={`Downgrade to ${selectedDowngrade?.name || ""}`}
          message={`Your ${
            selectedDowngrade?.name || ""
          } membership will start at the end of your current billing cycle.`}
          confirmText="Schedule Downgrade"
          cancelText="Keep Current Plan"
          isLoading={isLoading}
          details={
            selectedDowngrade
              ? {
                  packageName: selectedDowngrade.name,
                  price: selectedDowngrade.price,
                  benefits: [
                    `${selectedDowngrade.entriesPerMonth} entries per month`,
                    `${selectedDowngrade.shopDiscountPercent}% shop discount`,
                    `${selectedDowngrade.partnerDiscountDays} days partner access`,
                  ],
                  info: ["No charge today", "Keep current benefits until cycle end"],
                  warnings: ["No refunds - you keep what you paid for"],
                }
              : undefined
          }
        />

        {/* Stripe Payment Modal for Upgrades */}
        <StripePaymentModal
          isOpen={showStripePaymentModal}
          onClose={() => {
            setShowStripePaymentModal(false);
            setUpgradeData(null);
            setSelectedUpgrade(null);
          }}
          clientSecret={upgradeData?.clientSecret || ""}
          packageName={upgradeData?.packageName || ""}
          packageId={upgradeData?.packageId || ""}
          amount={upgradeData?.amount || 0}
          onPaymentSuccess={handleStripePaymentConfirm}
          upgradeInfo={upgradeData?.upgradeInfo} // ✅ Pass upgrade info for proration display
        />

        {/* Cancellation Upsell Modal */}
        <CancellationUpsellModal
          isOpen={showCancellationUpsell}
          onClose={() => setShowCancellationUpsell(false)}
          onRedeem={handleUpsellRedeem}
          onDecline={handleUpsellDecline}
        />
      </ModalContent>
    </ModalContainer>
  );
};

export default SubscriptionManagementModal;
