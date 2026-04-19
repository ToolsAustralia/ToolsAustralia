"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Settings, AlertTriangle, CheckCircle, XCircle, ArrowUp, ArrowDown, CreditCard } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { useMemberships } from "@/hooks/useMemberships";
import { useToast } from "@/components/ui/Toast";
import { useRenewSubscription } from "@/hooks/queries/useSubscriptionQueries";
import ConfirmationModal from "./ConfirmationModal";
import BenefitCountdown from "@/components/ui/BenefitCountdown";
import StripePaymentModal from "./StripePaymentModal";
import CancellationUpsellModal from "./CancellationUpsellModal";
import RenewalFailedModal from "./RenewalFailedModal";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import { calculateRenewalEntries, calculateUpgradeEntries } from "@/utils/payment/subscription-entries-calculator";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { canOfferCancellationUpsellRedeem } from "@/utils/redeemables/cancellation-upsell-eligibility";

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
  membershipModal?: ReturnType<typeof useMembershipModal>;
  /**
   * When true, renders content without modal chrome so it can be embedded.
   */
  renderAsPanel?: boolean;
}

const SubscriptionManagementModal: React.FC<SubscriptionManagementModalProps> = ({
  isOpen,
  onClose,
  user,
  onSubscriptionUpdate,
  membershipModal: parentMembershipModal,
  renderAsPanel = false,
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

  // Renewal failed modal state
  const [isRenewalFailedModalOpen, setIsRenewalFailedModalOpen] = useState(false);

  // Check for failed renewal
  const hasFailed = hasFailedRenewal(user);

  // Fetch membership packages to get full package data
  const { loading: packagesLoading, subscriptionPackages } = useMemberships();

  // Renew subscription mutation
  const renewSubscription = useRenewSubscription();

  // Hooks for opening MembershipModal with Tradie package
  // Use parent's membershipModal if provided, otherwise create a new instance
  const localMembershipModal = useMembershipModal();
  const membershipModal = parentMembershipModal || localMembershipModal;
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const membershipPromoMultiplier = resolvedMembershipMultiplier ?? 1;

  // Helper function to get Tradie subscription package for non-subscribers
  const _getTradiePackage = (): LocalMembershipPlan => {
    const targetPackageId = "tradie-subscription";
    const packageData = subscriptionPackages.find((pkg) => pkg.id === targetPackageId);

    if (!packageData) {
      // Fallback if package not found
      const baseEntries = 15; // Tradie subscription has 15 entries per month
      const promoEntries = baseEntries * membershipPromoMultiplier;

      return {
        id: targetPackageId,
        name: "Tradie",
        price: 20,
        period: "mo",
        features: [
          {
            text: `${promoEntries} Free Accumulated Entries${
              membershipPromoMultiplier > 1 ? ` (${membershipPromoMultiplier}X PROMO!)` : ""
            }`,
          },
          { text: "50% Access to Partner Discounts" },
        ],
        buttonText: "Get Started",
        buttonStyle: "secondary",
        isMemberOnly: false,
        metadata: {
          entriesCount: promoEntries,
          promoMultiplier: membershipPromoMultiplier,
          originalEntries: baseEntries,
          isPromoActive: membershipPromoMultiplier > 1,
        },
      };
    }

    const localPlan = convertToLocalPlan(packageData);

    // Apply promo multiplier if active
    if (membershipPromoMultiplier <= 1) {
      return localPlan;
    }

    const originalEntries = localPlan.metadata?.entriesCount ?? 0;
    const promoEntries = originalEntries * membershipPromoMultiplier;

    return {
      ...localPlan,
      features: localPlan.features.map((feature) => {
        if (feature.text.toLowerCase().includes("entries")) {
          return {
            ...feature,
            text: feature.text.replace(/\d+/, promoEntries.toString()),
          };
        }
        return feature;
      }),
      metadata: {
        ...localPlan.metadata,
        entriesCount: promoEntries,
        originalEntries,
        promoMultiplier: membershipPromoMultiplier,
        isPromoActive: true,
      },
    };
  };

  // Fetch subscription benefits
  const fetchSubscriptionBenefits = useCallback(async () => {
    if ((!isOpen && !renderAsPanel) || !user.subscription?.isActive) return;

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
  }, [isOpen, renderAsPanel, user.subscription?.isActive]);

  // Escape + body scroll lock apply only to real modals. Embedded settings panel must keep
  // document scrolling so actions below the fold stay reachable on small viewports.
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen && !renderAsPanel) {
        onClose();
      }
    };

    const lockBody = isOpen && !renderAsPanel;

    if (lockBody) {
      document.addEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "hidden";
    }

    if (isOpen || renderAsPanel) {
      fetchSubscriptionBenefits();
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
      if (lockBody) {
        document.body.style.overflow = "unset";
      }
    };
  }, [isOpen, renderAsPanel, onClose, user.subscription?.isActive, fetchSubscriptionBenefits]);

  // Active subscription: either isActive=true OR past_due with autoRenew=true (failed renewal)
  // This allows us to show subscription details for past_due subscriptions
  const activeSubscription =
    user.subscription?.isActive ||
    (user.subscription?.status === "past_due" && user.subscription?.autoRenew === true)
      ? user.subscription
      : null;
  // Support both oneTimePackages (legacy) and enrichedOneTimePackages (current API)
  const activeOneTimePackage =
    user.enrichedOneTimePackages?.find((pkg) => pkg.isActive) ??
    user.oneTimePackages?.find((pkg) => pkg.isActive);

  // Get the full package data by finding it in the fetched packages
  // Handle the new data structure:
  // For subscriptions: use subscriptionPackageData (full package detail), or fallback to looking up by packageId
  // For one-time: enrichedOneTimePackages contains full packageData
  const membershipPackage = (() => {
    if (packagesLoading) return null;

    // Priority 1: Use subscriptionPackageData if available
    if (activeSubscription && user.subscriptionPackageData) {
      return user.subscriptionPackageData;
    }

    // Priority 2: If activeSubscription exists but no subscriptionPackageData, look it up by packageId
    if (activeSubscription?.packageId) {
      const packageId =
        typeof activeSubscription.packageId === "string"
          ? activeSubscription.packageId
          : (activeSubscription.packageId as { _id: string })?._id;
      
      if (packageId) {
        const foundPackage = subscriptionPackages.find(
          (pkg) => pkg.id === packageId || pkg._id === packageId
        );
        if (foundPackage) {
          return foundPackage;
        }
      }
    }

    // Priority 3: Check for active one-time packages
    const activeOneTimeData = user.enrichedOneTimePackages?.find((pkg) => pkg.isActive);
    return activeOneTimeData?.packageData || null;
  })();

  const upgradeConfirmationBenefits = useMemo(() => {
    if (!selectedUpgrade || !membershipPackage) return undefined;
    const subscriptionWithEntries = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
    const currentAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
    const { entriesToGrant, newLastMonthAccumulatedEntries } = calculateUpgradeEntries(
      selectedUpgrade.entriesPerMonth,
      currentAccumulated,
      membershipPromoMultiplier
    );
    const promoNote =
      membershipPromoMultiplier > 1
        ? ` Includes ${membershipPromoMultiplier}× promo on this upgrade’s monthly grant.`
        : "";
    return [
      `Accumulated free entries after upgrade: ${newLastMonthAccumulatedEntries.toLocaleString()} (${currentAccumulated.toLocaleString()} you have now + ${entriesToGrant.toLocaleString()} from ${selectedUpgrade.name}’s monthly grant).${promoNote}`,
      `Every billing cycle on this plan, your balance grows by ${selectedUpgrade.entriesPerMonth} accumulated entries.`,
      `${selectedUpgrade.partnerDiscountDays} days partner access`,
    ];
  }, [selectedUpgrade, membershipPackage, user.subscription, membershipPromoMultiplier]);

  const downgradeConfirmationBenefits = useMemo(() => {
    if (!selectedDowngrade) return undefined;
    const subscriptionWithEntries = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
    const currentAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
    const { newLastMonthAccumulatedEntries } = calculateRenewalEntries(
      selectedDowngrade.entriesPerMonth,
      currentAccumulated
    );
    const firstCycleAdd = newLastMonthAccumulatedEntries - currentAccumulated;
    return [
      `When your plan changes at the next billing date, accumulated free entries are expected to reach ${newLastMonthAccumulatedEntries.toLocaleString()} (${currentAccumulated.toLocaleString()} now + ${firstCycleAdd.toLocaleString()} from the first month on ${selectedDowngrade.name}).`,
      `Each billing cycle on this plan adds ${selectedDowngrade.entriesPerMonth} entries to your accumulated total.`,
      `${selectedDowngrade.partnerDiscountDays} days partner access`,
    ];
  }, [selectedDowngrade, user.subscription]);

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

    if (user.cancellationUpsellRedeemed) {
      await proceedWithCancellation();
    } else if (canOfferCancellationUpsellRedeem(user)) {
      setShowCancelConfirm(false);
      setShowCancellationUpsell(true);
    } else {
      await proceedWithCancellation();
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

      const cancelledImmediately = Boolean(result.data?.cancelledImmediately);
      const isPastDueCancel = Boolean(result.data?.isPastDue);

      if (cancelledImmediately) {
        showToast({
          type: "warning",
          title: "Subscription Cancelled",
          message:
            typeof result.message === "string" && result.message.trim().length > 0
              ? result.message
              : isPastDueCancel
                ? "Your subscription has been canceled. It was already past due, so access tied to an active paid subscription may have ended."
                : "Your subscription has been canceled immediately.",
          duration: 15000,
        });
      } else {
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
          duration: 15000,
        });
      }

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
        // console.log("Setup intent created:", result.data.setupIntent);
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
    // console.log("✅ Payment confirmed, webhook will handle subscription activation");

    // Calculate the total entries after upgrade for the toast message
    // This matches what's displayed in the upgrade cards
    let totalEntriesAfterUpgrade = selectedUpgrade?.entriesPerMonth || 0;
    if (selectedUpgrade) {
      const subscriptionWithEntries = user.subscription as {
        lastMonthAccumulatedEntries?: number;
      } | undefined;
      const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
      // Use active promo multiplier for membership packages (same as upgrade cards)
      const upgradeCalculation = calculateUpgradeEntries(
        selectedUpgrade.entriesPerMonth,
        lastMonthAccumulated,
        membershipPromoMultiplier
      );
      totalEntriesAfterUpgrade = upgradeCalculation.newLastMonthAccumulatedEntries;
    }

    // Set flag in localStorage to show enhanced success toast after page reload
    // Include comprehensive upgrade information for the toast
    localStorage.setItem(
      "subscription_upgraded",
      JSON.stringify({
        packageName: selectedUpgrade?.name || "subscription",
        packageId: selectedUpgrade?.packageId || "",
        entriesPerMonth: selectedUpgrade?.entriesPerMonth || 0,
        totalEntriesAfterUpgrade: totalEntriesAfterUpgrade, // Total entries user will have after upgrade
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

  if (!isOpen && !renderAsPanel) return null;

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

  const renderActiveSubscriptionContent = () => {
    if (!membershipPackage || !activeSubscription) return null;
    const planId = membershipPackage._id || membershipPackage.name?.toLowerCase().replace(/\s+/g, "-") || "";
    const currentPlanColorScheme = getMembershipSectionColorScheme(planId, true);
    return (
      <React.Fragment>
        <div className="space-y-4 sm:space-y-6">
            <div
              className={`rounded-lg p-4 sm:p-6 relative overflow-hidden shadow-lg ${currentPlanColorScheme.enterNowButtonTextClass ?? currentPlanColorScheme.text}`}
              style={{
                ...currentPlanColorScheme.badgeStyle,
                border: `2px solid ${currentPlanColorScheme.accentHex}${currentPlanColorScheme.cardBorderOpacity || "CC"}`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
                  <h2 className="text-lg sm:text-xl font-bold" style={currentPlanColorScheme.textGradientStyle ?? undefined}>Current Plan</h2>
                </div>

              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm opacity-90">Plan:</span>
                  <span className="font-semibold text-xs sm:text-sm" style={currentPlanColorScheme.textGradientStyle ?? undefined}>{membershipPackage.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm opacity-90">Price:</span>
                  <span className="font-semibold text-xs sm:text-sm">${membershipPackage.price}/month</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm opacity-90">Started:</span>
                  <span className="font-semibold text-xs sm:text-sm">
                    {new Date(activeSubscription.startDate).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                {subscriptionBenefits?.isCancelled ? (
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm opacity-90">Subscription Ends:</span>
                    <span className="font-semibold text-yellow-300 text-xs sm:text-sm">
                      {formatDate(subscriptionBenefits.endDate || activeSubscription.endDate) ?? "Unknown"}
                    </span>
                  </div>
                ) : activeSubscription.endDate ? (
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm opacity-90">Next Billing:</span>
                    <span className="font-semibold text-xs sm:text-sm">{formatDate(activeSubscription.endDate) ?? "Unknown"}</span>
                  </div>
                ) : null}

                {/* Cancellation Status */}
                {subscriptionBenefits?.isCancelled && (
                  <div className="bg-yellow-600/20 border border-yellow-500/30 rounded-lg p-2 sm:p-3 mt-2 sm:mt-3">
                    <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-300" />
                      <span className="text-yellow-300 font-semibold text-xs sm:text-sm">Subscription Cancelled</span>
                    </div>
                    <p className="text-yellow-100 text-[10px] sm:text-xs">
                      Your subscription will end on{" "}
                      {formatDate(subscriptionBenefits.endDate || activeSubscription.endDate) ||
                        "the end of your billing period"}
                      . You&apos;ll keep access to all benefits until then.
                    </p>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm opacity-90">Auto Renewal:</span>
                  <span
                    className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${
                      activeSubscription.autoRenew ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {activeSubscription.autoRenew ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
            </div>
            </div>

            <div 
              className="relative bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 sm:p-4 border-l-4 shadow-sm"
              style={{ borderColor: currentPlanColorScheme.accentHex }}
            >
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2 sm:mb-3 text-sm sm:text-base">Plan Benefits</h3>
              <div className="space-y-1.5 sm:space-y-2">
                {packagesLoading ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">Loading benefits...</div>
                ) : membershipPackage?.features ? (
                  membershipPackage.features.map((feature: unknown, index: number) => {
                    let featureText: string;
                    if (typeof feature === "string") {
                      featureText = feature;
                    } else if (typeof feature === "object" && feature !== null && "text" in feature) {
                      featureText = (feature as { text: string }).text;
                    } else {
                      featureText = String(feature);
                    }
                    const featureLower = featureText.toLowerCase();
                    
                    const isFirstFeature = index === 0;
                    const isEntriesFeature = featureLower.includes("entries");
                    let displayText = featureText;

                    if (isFirstFeature && isEntriesFeature && activeSubscription && membershipPackage && user.subscription) {
                      const baseEntries =
                        (membershipPackage as { entriesPerMonth?: number }).entriesPerMonth ??
                        (membershipPackage as { metadata?: { entriesCount?: number } }).metadata?.entriesCount ??
                        (membershipPackage as { metadata?: { originalEntries?: number } }).metadata?.originalEntries ??
                        15;
                      const subscriptionWithEntries = user.subscription as { lastMonthAccumulatedEntries?: number };
                      const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? baseEntries;

                      if (hasFailed) {
                        const renewalCalculation = calculateRenewalEntries(baseEntries, lastMonthAccumulated);
                        displayText = featureText.replace(/\d+/, renewalCalculation.entriesToGrant.toString());
                      } else {
                        displayText = featureText.replace(/\d+/, lastMonthAccumulated.toString());
                      }
                    }
                    
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <span className="text-xs sm:text-sm text-gray-700 dark:text-neutral-300">{displayText}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-gray-500 dark:text-neutral-400">No benefits information available</div>
                )}
          </div>
            </div>

            {/* Failed Renewal Alert - Informational, not blocking */}
            {hasFailed && (
              <div className="bg-red-50 dark:bg-red-950/40 border-2 border-red-200 dark:border-red-800 rounded-lg p-3 sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm sm:text-base font-semibold text-red-900 dark:text-red-100 mb-1.5 sm:mb-2">Subscription Renewal Failed</h4>
                    <p className="text-xs sm:text-sm text-red-700 dark:text-red-300 mb-3 sm:mb-4">
                      Renew your subscription now to keep your benefits active. Don&apos;t lose your accumulated entries and access to exclusive features.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <Button
                        onClick={() => setIsRenewalFailedModalOpen(true)}
                        variant="primary"
                        className="bg-red-600 hover:bg-red-700 text-sm sm:text-base"
                        size="sm"
                      >
                        Resolve Payment Issue
                      </Button>
                      <Button
                        onClick={() => setShowCancelConfirm(true)}
                        variant="outline"
                        className="border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 text-sm sm:text-base"
                        size="sm"
                      >
                        Cancel Subscription
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

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

            {/* Management Actions - Hidden for past_due subscriptions (only for active subscriptions) */}
            {!hasFailed && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Subscription Management</h3>

              {/* Upgrade Options - Hidden for past_due subscriptions (must pay invoice first) */}
              {!hasFailed &&
                !subscriptionBenefits?.isCancelled &&
                subscriptionBenefits?.availableUpgrades &&
                subscriptionBenefits.availableUpgrades.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      <ArrowUp className="w-4 h-4 text-green-600" />
                      Available Upgrades
                    </h4>
                    {subscriptionBenefits.availableUpgrades.map((upgrade) => {
                      // Calculate upgrade entries - what user will have after upgrading
                      // Upgrade adds: newBaseEntries * promoMultiplier to lastMonthAccumulatedEntries
                      // So total after upgrade = lastMonthAccumulatedEntries + (newBaseEntries * promoMultiplier)
                      const subscriptionWithEntries = user.subscription as {
                        lastMonthAccumulatedEntries?: number;
                      } | undefined;
                      const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
                      // Use active promo multiplier for membership packages (not defaulting to 1)
                      const upgradeCalculation = calculateUpgradeEntries(
                        upgrade.entriesPerMonth,
                        lastMonthAccumulated,
                        membershipPromoMultiplier // Use current active promo multiplier
                      );
                      // After upgrade, user will have: lastMonthAccumulatedEntries + (newBaseEntries * promoMultiplier)
                      const totalEntriesAfterUpgrade = upgradeCalculation.newLastMonthAccumulatedEntries;
                      const upgradeColorScheme = getMembershipSectionColorScheme(upgrade.packageId, true);
                      const upgradeTextClass =
                        upgradeColorScheme.enterNowButtonTextClass ??
                        (upgradeColorScheme.textGradientStyle ? "" : "text-white");
                      const upgradeButtonStyle = (upgradeColorScheme.enterNowButtonStyle ??
                        upgradeColorScheme.badgeStyle) as React.CSSProperties;

                      return (
                        <div
                          key={upgrade.packageId}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 bg-white dark:bg-neutral-800 border-2 border-green-200 dark:border-green-800 border-l-4 rounded-lg gap-3 sm:gap-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200"
                        >
                          <div className="flex-1 w-full sm:w-auto">
                            <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
                              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full flex-shrink-0 shadow-sm"></div>
                              <h5 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">{upgrade.name}</h5>
                              <span className="text-base sm:text-lg font-bold text-green-600 dark:text-green-400">${upgrade.price}/mo</span>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-300 mb-1.5 sm:mb-2">{upgrade.description}</p>
                            <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-4 text-[11px] sm:text-xs text-gray-500 dark:text-neutral-400">
                              <span className="font-medium">{totalEntriesAfterUpgrade} Free Accumulated Entries</span>
                              <span>{upgrade.partnerDiscountDays} days partner access</span>
                            </div>
                          </div>
                          <div
                            className={`w-full sm:w-auto sm:ml-4 rounded-2xl ${upgradeColorScheme.glow}`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUpgrade(upgrade);
                                setShowUpgradeConfirm(true);
                              }}
                              disabled={isLoading || benefitsLoading}
                              className={`font-agency font-black uppercase rounded-2xl px-4 py-2.5 flex items-center justify-center text-xs sm:text-sm transition-all duration-300 transform hover:scale-[1.02] hover:brightness-105 ${upgradeTextClass} ${upgradeColorScheme.borderGlow} membership-enter-cta-animation w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100`}
                              style={upgradeButtonStyle}
                            >
                              <span className="relative z-10" style={upgradeColorScheme.textGradientStyle ?? undefined}>
                                Upgrade Now
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              {/* Downgrade Options - Hidden for past_due subscriptions (must pay invoice first) */}
              {!hasFailed &&
                !subscriptionBenefits?.isCancelled &&
                subscriptionBenefits?.availableDowngrades &&
                subscriptionBenefits.availableDowngrades.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      <ArrowDown className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      Available Downgrades
                    </h4>
                    {subscriptionBenefits.availableDowngrades.map((downgrade) => {
                      // Calculate downgrade entries - what user will receive when downgrading
                      // Downgrade uses renewal calculation since it happens at next billing cycle
                      const subscriptionWithEntries = user.subscription as {
                        lastMonthAccumulatedEntries?: number;
                      } | undefined;
                      const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
                      const downgradeCalculation = calculateRenewalEntries(
                        downgrade.entriesPerMonth,
                        lastMonthAccumulated
                      );
                      const downgradeEntries = downgradeCalculation.entriesToGrant;
                      const colorScheme = getMembershipSectionColorScheme(downgrade.packageId, true);
                      const textClass = colorScheme.enterNowButtonTextClass ?? (colorScheme.textGradientStyle ? "" : "text-white");
                      const buttonStyle = colorScheme.enterNowButtonStyle ?? colorScheme.badgeStyle;

                      return (
                        <div
                          key={downgrade.packageId}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 bg-white dark:bg-neutral-800 border-2 border-orange-200 dark:border-orange-800 border-l-4 rounded-lg gap-3 sm:gap-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200"
                        >
                          <div className="flex-1 w-full sm:w-auto">
                            <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
                              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: colorScheme.accentHex }}></div>
                              <h5 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">{downgrade.name}</h5>
                              <span className="text-base sm:text-lg font-bold" style={{ color: colorScheme.accentHex }}>${downgrade.price}/mo</span>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-300 mb-1.5 sm:mb-2">{downgrade.description}</p>
                            <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-4 text-[11px] sm:text-xs text-gray-500 dark:text-neutral-400">
                              <span className="font-medium">{downgradeEntries} Free Accumulated Entries</span>
                              <span>{downgrade.partnerDiscountDays} days partner access</span>
                            </div>
                          </div>
                          <div className={`w-full sm:w-auto sm:ml-4 rounded-2xl ${colorScheme.glow}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDowngrade(downgrade);
                                setShowDowngradeConfirm(true);
                              }}
                              disabled={isLoading || benefitsLoading}
                              className={`font-agency font-black uppercase rounded-2xl px-4 py-2.5 flex items-center justify-center text-xs sm:text-sm transition-all duration-300 transform hover:scale-[1.02] hover:brightness-105 ${textClass} ${colorScheme.borderGlow} membership-enter-cta-animation w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100`}
                              style={buttonStyle}
                            >
                              <span className="relative z-10" style={colorScheme.textGradientStyle ?? undefined}>
                                Schedule Downgrade
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              <div
                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 rounded-lg gap-3 sm:gap-4 shadow-sm ${
                  subscriptionBenefits?.isCancelled
                    ? "bg-yellow-50 dark:bg-yellow-950/30 border-2 border-yellow-200 dark:border-yellow-800 border-l-4"
                    : "bg-white dark:bg-neutral-800 border-2 border-red-200 dark:border-red-800 border-l-4"
                }`}
              >
                <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <XCircle
                    className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 sm:mt-0 ${subscriptionBenefits?.isCancelled ? "text-yellow-600 dark:text-yellow-500" : "text-red-600 dark:text-red-400"}`}
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">
                      {subscriptionBenefits?.isCancelled ? "Subscription Cancelled" : "Cancel Subscription"}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-300">
                      {subscriptionBenefits?.isCancelled
                        ? `Benefits end on ${formatDate(subscriptionBenefits.endDate) ?? "end of billing period"}`
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
                    className="border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 w-full sm:w-auto text-xs sm:text-sm"
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    onClick={handleReactivateSubscription}
                    disabled={isLoading}
                    variant="primary"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto text-xs sm:text-sm shadow-sm hover:shadow-md"
                  >
                    Reactivate
                  </Button>
                )}
              </div>
            </div>
            )}
          </div>
      </React.Fragment>
    );
  };

  const subscriptionContent = (
    <>
      {!renderAsPanel && <ModalHeader title="Manage Subscription" onClose={onClose} showLogo={false} />}
      <ModalContent padding="lg">
        {membershipPackage && activeSubscription ? renderActiveSubscriptionContent() : activeOneTimePackage ? (
          <div className="text-center py-8">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-6 sm:p-8 border border-gray-200 dark:border-neutral-700 shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                <CreditCard className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">One-Time Package</h2>
              <p className="text-gray-600 dark:text-neutral-300 mb-4">
                You have an active one-time package:{" "}
                <strong>
                  {typeof activeOneTimePackage.packageId === "string"
                    ? (activeOneTimePackage as { packageData?: { name?: string } }).packageData?.name ?? "One-Time Package"
                    : (activeOneTimePackage.packageId as { name: string }).name}
                </strong>
              </p>
              <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
                One-time packages don&apos;t require subscription management. You can purchase additional packages
                anytime.
              </p>
              <Button
                onClick={() => {
                  onClose();
                  whenGatesOpenElseGateModal(() => membershipModal.openModalWithPackageSelectionFirst());
                }}
                variant="primary"
                className="bg-gradient-to-r from-[#ee0000] to-[#ff4444] hover:from-[#cc0000] hover:to-[#e60000] shadow-md hover:shadow-lg transition-all"
              >
                Subscribe to Membership Packages
              </Button>
            </div>
          </div>
        ) : user.subscription && !user.subscription.isActive && user.subscription.status !== "past_due" ? (
          <div className="text-center py-8">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-6 sm:p-8 border border-gray-200 dark:border-neutral-700 shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {user.subscription.status === "canceled" ? "Subscription Cancelled" : "Subscription Inactive"}
              </h2>
              <p className="text-gray-600 dark:text-neutral-300 mb-6">
                {user.subscription.status === "canceled"
                  ? "Your subscription has been cancelled. You can reactivate it anytime."
                  : "Your subscription is currently inactive."}
              </p>
              <Button
                onClick={() => {
                  onClose();
                  whenGatesOpenElseGateModal(() => membershipModal.openModalWithPackageSelectionFirst());
                }}
                variant="primary"
                className="bg-gradient-to-r from-[#ee0000] to-[#ff4444] hover:from-[#cc0000] hover:to-[#e60000] shadow-md hover:shadow-lg transition-all"
              >
                {user.subscription.status === "canceled" ? "Reactivate Subscription" : "Subscribe to Membership Packages"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-6 sm:p-8 border border-gray-200 dark:border-neutral-700 shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                <CreditCard className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Active Subscription</h2>
              <p className="text-gray-600 dark:text-neutral-300 mb-6">You don&apos;t have an active subscription to manage.</p>
              <Button
                onClick={() => {
                  onClose();
                  whenGatesOpenElseGateModal(() => membershipModal.openModalWithPackageSelectionFirst());
                }}
                variant="primary"
                className="bg-gradient-to-r from-[#ee0000] to-[#ff4444] hover:from-[#cc0000] hover:to-[#e60000] shadow-md hover:shadow-lg transition-all"
              >
                Subscribe to Membership Packages
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
            selectedUpgrade && membershipPackage && upgradeConfirmationBenefits
              ? {
                  packageName: selectedUpgrade.name,
                  price: selectedUpgrade.price,
                  benefits: upgradeConfirmationBenefits,
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
            selectedDowngrade && downgradeConfirmationBenefits
              ? {
                  packageName: selectedDowngrade.name,
                  price: selectedDowngrade.price,
                  benefits: downgradeConfirmationBenefits,
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

        {/* Renewal Failed Modal */}
        <RenewalFailedModal
          isOpen={isRenewalFailedModalOpen}
          onClose={() => {
            setIsRenewalFailedModalOpen(false);
            // Refresh subscription benefits after payment
            fetchSubscriptionBenefits();
            if (onSubscriptionUpdate) {
              onSubscriptionUpdate();
            }
          }}
        />
      </ModalContent>
    </>
  );

  if (renderAsPanel) {
    return <div className="w-full">{subscriptionContent}</div>;
  }

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      {subscriptionContent}
    </ModalContainer>
  );
};

export default SubscriptionManagementModal;
