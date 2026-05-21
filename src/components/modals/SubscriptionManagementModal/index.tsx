"use client";

/**
 * SubscriptionManagementModal — decomposed from a 1487-LOC flat file into the
 * canonical orchestrator-folder pattern.
 *
 * Public API (props) is preserved byte-identically — all callers (most notably
 * `SettingsModal` which embeds via `renderAsPanel`) continue to work without
 * modification because the folder/index.tsx resolves as the same import path.
 *
 * EMBEDDED CHILD MODAL INVARIANTS:
 * 1. StripePaymentModal, CancellationFlowModal, RenewalFailedModal,
 *    UpgradeConfirmModal, and DowngradeConfirmModal all stay portal-rendered
 *    from THIS orchestrator. Whichever opens at any given time is determined
 *    by orchestrator state (`showStripePaymentModal`, `showCancellationFlow`,
 *    `isRenewalFailedModalOpen`, etc.). The micro-stack z-index is preserved.
 * 2. `renderAsPanel` still bypasses `ModalContainer` — when true the body is
 *    rendered directly inside a `<div className="w-full">` wrapper for embed
 *    contexts (SettingsModal). Otherwise the body is wrapped in
 *    `<ModalContainer ... size="lg" closeOnBackdrop={false}>`.
 * 3. Body scroll lock + Escape key handling apply ONLY to real-modal mode —
 *    the embedded panel must keep document scrolling so actions below the
 *    fold stay reachable on small viewports.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ModalContainer, ModalHeader, ModalContent } from "../ui";
import { useMemberships } from "@/hooks/useMemberships";
import { useToast } from "@/components/ui/Toast";
import { useRenewSubscription } from "@/hooks/queries/useSubscriptionQueries";
import StripePaymentModal from "../StripePaymentModal";
import CancellationFlowModal from "../CancellationFlowModal";
import DowngradeConfirmModal from "../DowngradeConfirmModal";
import UpgradeConfirmModal from "../UpgradeConfirmModal";
import RenewalFailedModal from "../RenewalFailedModal";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import { calculateRenewalEntries, calculateUpgradeEntries } from "@/utils/payment/subscription-entries-calculator";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { getPartnerCatalogAccessPercentForMembershipPackageId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { useLoading } from "@/contexts/LoadingContext";
import { rewardsEnabled } from "@/config/featureFlags";

import type {
  DowngradeOption,
  ResolvedMembershipPackage,
  SubMgmtUser,
  SubscriptionBenefits,
  UpgradeOption,
} from "./types";
import CurrentBenefitsCard from "./CurrentBenefitsCard";
import PastDueAlert from "./PastDueAlert";
import PendingChangeBanner from "./PendingChangeBanner";
import UpgradeList from "./UpgradeList";
import DowngradeList from "./DowngradeList";
import CancelResumeRow from "./CancelResumeRow";
import { InactiveSubscriptionState, NoSubscriptionState } from "./EmptyStates";
import type { ResubscribeTierOption } from "./ResubscribeTierPicker";
import SettingsRedesignSubscription from "./SettingsRedesignSubscription";

interface SubscriptionManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: SubMgmtUser;
  onSubscriptionUpdate?: () => void;
  membershipModal?: ReturnType<typeof useMembershipModal>;
  /**
   * When true, renders content without modal chrome so it can be embedded.
   */
  renderAsPanel?: boolean;
  /**
   * Opt-in (settings page only). When true AND renderAsPanel, the panel body
   * uses the Claude settings redesign layout instead of the legacy body.
   * All logic/handlers/child modals are unchanged. Modal-mode callers
   * (MembershipStatus) and SettingsModal never set this → byte-identical.
   */
  settingsRedesign?: boolean;
}

const SubscriptionManagementModal: React.FC<SubscriptionManagementModalProps> = ({
  isOpen,
  onClose,
  user,
  onSubscriptionUpdate,
  membershipModal: parentMembershipModal,
  renderAsPanel = false,
  settingsRedesign = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showCancellationFlow, setShowCancellationFlow] = useState(false);
  const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  const [selectedUpgrade, setSelectedUpgrade] = useState<UpgradeOption | null>(null);
  const [selectedDowngrade, setSelectedDowngrade] = useState<DowngradeOption | null>(null);
  const [subscriptionBenefits, setSubscriptionBenefits] = useState<SubscriptionBenefits | null>(null);
  const [benefitsLoading, setBenefitsLoading] = useState(false);
  const { showSuccess } = useLoading();

  // Stripe payment confirmation state
  const [showStripePaymentModal, setShowStripePaymentModal] = useState(false);
  const [upgradeData, setUpgradeData] = useState<{
    paymentIntentId: string;
    clientSecret: string;
    packageName: string;
    packageId: string;
    amount: number;
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

  // When the user accepts the tier_downgrade offer in CancellationFlowModal, we stash
  // the eventId here so we can record outcome:"saved" only if/when the downgrade is
  // actually confirmed — not on card click. Cleared after recording or on dismiss.
  const pendingCancellationEventId = useRef<string | null>(null);

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
            text: `${promoEntries} free accumulated entries${
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
  const membershipPackage: ResolvedMembershipPackage | null = (() => {
    if (packagesLoading) return null;

    // Priority 1: Use subscriptionPackageData if available
    if (activeSubscription && user.subscriptionPackageData) {
      return user.subscriptionPackageData as ResolvedMembershipPackage;
    }

    // Priority 2: If activeSubscription exists but no subscriptionPackageData, look it up by packageId
    if (activeSubscription?.packageId) {
      const packageId =
        typeof activeSubscription.packageId === "string"
          ? activeSubscription.packageId
          : (activeSubscription.packageId as { _id: string })?._id;

      if (packageId) {
        const foundPackage = subscriptionPackages.find(
          (pkg) => pkg.id === packageId || (pkg as { _id?: string })._id === packageId
        );
        if (foundPackage) {
          return foundPackage as unknown as ResolvedMembershipPackage;
        }
      }
    }

    // Priority 3: Check for active one-time packages
    const activeOneTimeData = user.enrichedOneTimePackages?.find((pkg) => pkg.isActive);
    return (activeOneTimeData?.packageData as ResolvedMembershipPackage | undefined) || null;
  })();

  /** Numeric data for UpgradeConfirmModal — extracted separately from upgradeConfirmationBenefits
   * so the new modal can render its own copy from raw numbers instead of pre-formatted strings. */
  const upgradeModalData = useMemo(() => {
    if (!selectedUpgrade || !membershipPackage) return null;
    const subscriptionWithEntries = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
    const currentEntries = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
    const userWithDrawFlag = user as { hasCurrentDrawMembershipGrant?: boolean };
    const hasGrantThisDraw = userWithDrawFlag.hasCurrentDrawMembershipGrant ?? false;
    const { entriesToGrant } = calculateUpgradeEntries(
      selectedUpgrade.entriesPerMonth,
      currentEntries,
      membershipPromoMultiplier,
      hasGrantThisDraw
    );
    return { currentEntries, upgradeEntriesGrant: entriesToGrant };
  }, [selectedUpgrade, membershipPackage, user.subscription, membershipPromoMultiplier]);

  /** Pending plan change banner: accumulated entries + partner access % (same rules as confirmation copy) */
  const pendingBenefitCountdownProps = useMemo(() => {
    const pending = subscriptionBenefits?.currentBenefits?.pendingChange;
    if (!subscriptionBenefits?.currentBenefits?.isPendingChange || !pending) {
      return null;
    }
    const cb = subscriptionBenefits.currentBenefits;
    const subscriptionWithEntries = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
    const currentBase = cb.entriesPerMonth;
    const lastAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? currentBase;

    const newPackageId = pending.newPackageId;
    const targetPkg =
      pending.changeType === "downgrade"
        ? subscriptionBenefits.availableDowngrades.find((d) => d.packageId === newPackageId)
        : subscriptionBenefits.availableUpgrades.find((u) => u.packageId === newPackageId);

    let newAccumulated = 0;
    if (targetPkg) {
      if (pending.changeType === "downgrade") {
        newAccumulated = calculateRenewalEntries(targetPkg.entriesPerMonth, lastAccumulated)
          .newLastMonthAccumulatedEntries;
      } else {
        const userWithDrawFlag = user as { hasCurrentDrawMembershipGrant?: boolean };
        const hasGrantThisDraw = userWithDrawFlag.hasCurrentDrawMembershipGrant ?? false;
        newAccumulated = calculateUpgradeEntries(
          targetPkg.entriesPerMonth,
          lastAccumulated,
          membershipPromoMultiplier,
          hasGrantThisDraw
        ).newLastMonthAccumulatedEntries;
      }
    }

    return {
      effectiveDate: new Date(pending.effectiveDate),
      changeType: pending.changeType as "upgrade" | "downgrade",
      currentBenefits: {
        packageName: cb.packageName,
        accumulatedEntries: lastAccumulated,
        partnerDiscountAccessPercent: getPartnerCatalogAccessPercentForMembershipPackageId(cb.packageId),
        partnerDiscountDays: cb.partnerDiscountDays,
      },
      newBenefits: {
        packageName: pending.newPackageName,
        accumulatedEntries: newAccumulated,
        partnerDiscountAccessPercent: getPartnerCatalogAccessPercentForMembershipPackageId(newPackageId),
        partnerDiscountDays: targetPkg?.partnerDiscountDays ?? 0,
      },
    };
  }, [subscriptionBenefits, user.subscription, membershipPromoMultiplier]);

  /**
   * Real entry snapshot for the CancellationFlowModal's 50% + bonus cards.
   *
   * Built ONLY from data already client-available on the active-subscription
   * path: the resolved `membershipPackage`, `subscriptionBenefits.currentBenefits`
   * (server-derived), and `user.subscription.lastMonthAccumulatedEntries` (the
   * same accumulated figure CurrentBenefitsCard renders). If any required field
   * cannot be assembled from real data we return `null` → the cancellation
   * cards render exactly as before with NO fabricated numbers.
   *
   * `currentEntries` deliberately uses `lastMonthAccumulatedEntries` — the
   * member's literal current major-draw entry count is NOT client-available
   * (single source of truth is `majordraws.entries`, server-only). This is the
   * accumulated figure the rest of the dashboard already shows as "your entries".
   */
  const cancellationEntrySnapshot = useMemo(() => {
    if (!membershipPackage || !activeSubscription) return null;

    const cb = subscriptionBenefits?.currentBenefits;
    const packageId =
      cb?.packageId ||
      membershipPackage._id ||
      (typeof activeSubscription.packageId === "string"
        ? activeSubscription.packageId
        : (activeSubscription.packageId as { _id?: string } | undefined)?._id) ||
      "";
    const packageName = cb?.packageName || membershipPackage.name || "";
    const baseEntriesPerMonth =
      cb?.entriesPerMonth ?? membershipPackage.entriesPerMonth ?? 0;

    // No real base-entries / identifiers → don't fabricate; hide the section.
    if (!packageId || !packageName || baseEntriesPerMonth <= 0) return null;

    const subscriptionWithEntries = user.subscription as
      | { lastMonthAccumulatedEntries?: number }
      | undefined;
    const lastMonthAccumulatedEntries =
      subscriptionWithEntries?.lastMonthAccumulatedEntries;
    if (lastMonthAccumulatedEntries == null) return null;

    // Populate real price labels when the package has a reliable positive price.
    // Convention matches DowngradeList / UpgradeList: "$N/mo" (whole dollars,
    // no decimal for integers). If price is 0 / negative / non-finite, omit
    // both fields so the discount card falls back to the generic display.
    const rawPrice = membershipPackage.price;
    const priceFields: {
      currentPriceLabel?: string;
      currentPriceAmount?: number;
    } =
      typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0
        ? {
            currentPriceLabel: `$${Number.isInteger(rawPrice) ? rawPrice : rawPrice.toFixed(2)}/mo`,
            currentPriceAmount: rawPrice,
          }
        : {};

    return {
      packageId,
      packageName,
      baseEntriesPerMonth,
      currentEntries: lastMonthAccumulatedEntries,
      lastMonthAccumulatedEntries,
      ...priceFields,
    };
  }, [membershipPackage, activeSubscription, subscriptionBenefits, user.subscription]);

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

      // If the downgrade was initiated from within the CancellationFlowModal, record
      // the saved outcome now that the downgrade actually succeeded. This is the ONLY
      // place the tier_downgrade outcome is committed — never on card click.
      if (pendingCancellationEventId.current) {
        const eventId = pendingCancellationEventId.current;
        pendingCancellationEventId.current = null;
        // Fire-and-forget — same pattern as useOutcomeCancellationFlow
        fetch("/api/subscription/cancellation-flow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action: "outcome",
            eventId,
            outcome: "saved",
            offerAccepted: "tier_downgrade",
          }),
        }).catch((err: unknown) => {
          console.error("Failed to record tier_downgrade cancellation outcome:", err);
        });
      }

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
    // Always open the cancellation flow — reason capture + offer routing live
    // server-side (eligibility decided in CancellationFlowService). The old
    // client-side `cancellationUpsellRedeemed` lifetime gate is removed; the
    // server's eligibility filter handles one-time-consumed offers.
    setShowCancellationFlow(true);
  };

  const handleFlowSaved = () => {
    // User accepted an offer — close the flow and refresh data.
    setShowCancellationFlow(false);
    if (onSubscriptionUpdate) {
      onSubscriptionUpdate();
    }
    fetchSubscriptionBenefits();
  };

  const handleFlowCancelled = () => {
    // User went through the flow and confirmed cancellation — refresh data.
    setShowCancellationFlow(false);
    if (onSubscriptionUpdate) {
      onSubscriptionUpdate();
    }
    fetchSubscriptionBenefits();
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
    const upgrade = selectedUpgrade;
    const subscriptionWithEntries = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
    const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? 0;
    const userWithDrawFlag = user as { hasCurrentDrawMembershipGrant?: boolean };
    const hasGrantThisDraw = userWithDrawFlag.hasCurrentDrawMembershipGrant ?? false;

    let totalEntriesAfterUpgrade = upgrade?.entriesPerMonth ?? 0;
    let entriesFromUpgrade = 0;
    if (upgrade) {
      const upgradeCalculation = calculateUpgradeEntries(
        upgrade.entriesPerMonth,
        lastMonthAccumulated,
        membershipPromoMultiplier,
        hasGrantThisDraw
      );
      totalEntriesAfterUpgrade = upgradeCalculation.newLastMonthAccumulatedEntries;
      entriesFromUpgrade = upgradeCalculation.entriesToGrant;
    }

    localStorage.setItem(
      "subscription_upgraded",
      JSON.stringify({
        packageName: upgrade?.name || "subscription",
        packageId: upgrade?.packageId || "",
        entriesPerMonth: upgrade?.entriesPerMonth || 0,
        totalEntriesAfterUpgrade,
        partnerDiscountDays: upgrade?.partnerDiscountDays || 0,
        timestamp: Date.now(),
      })
    );

    setShowStripePaymentModal(false);
    setUpgradeData(null);

    const benefits: {
      text: string;
      icon: "gift" | "star" | "zap" | "ticket" | "tag";
      highlight?: boolean;
    }[] = [];

    if (upgrade) {
      benefits.push({ text: `${upgrade.name} is now your plan`, icon: "gift" });
      if (entriesFromUpgrade > 0) {
        benefits.push({
          text:
            membershipPromoMultiplier > 1
              ? `+${entriesFromUpgrade.toLocaleString()} entries from this upgrade (${membershipPromoMultiplier}× promo on monthly grant)`
              : `+${entriesFromUpgrade.toLocaleString()} entries from this upgrade`,
          icon: "star",
        });
      }
      benefits.push({
        text: `Accumulated major draw entries: about ${totalEntriesAfterUpgrade.toLocaleString()}`,
        icon: "star",
      });
      // Subscriptions: partner access is lifecycle-gated (active while subscribed), not a day count.
      benefits.push({ text: "Partner discounts while your membership is active", icon: "tag" });
      if (rewardsEnabled()) {
        const pts = Math.floor(upgrade.price);
        if (pts > 0) {
          benefits.push({ text: `${pts} reward points earned`, icon: "zap" });
        }
      }
    } else {
      benefits.push({ text: "Your subscription has been upgraded", icon: "gift" });
    }

    const subtitle = upgrade ? `${upgrade.name} activated` : "Your plan has been updated";
    showSuccess("Upgrade successful!", subtitle, benefits, 3400);

    window.setTimeout(() => {
      window.location.reload();
    }, 3600);
  };

  // Suppress unused warning for the helper that's preserved verbatim from
  // the original flat file (kept for callers that may rely on it via codemods).
  void _getTradiePackage;

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
    return (
      <React.Fragment>
        <div className="space-y-4 sm:space-y-6">
          <CurrentBenefitsCard
            user={user}
            activeSubscription={activeSubscription}
            membershipPackage={membershipPackage}
            subscriptionBenefits={subscriptionBenefits}
            packagesLoading={packagesLoading}
          />

          {/* Failed Renewal Alert - Informational, not blocking */}
          {hasFailed && (
            <PastDueAlert
              onResolve={() => setIsRenewalFailedModalOpen(true)}
              onCancel={() => void handleCancelSubscription()}
            />
          )}

          {/* Pending Changes Countdown */}
          {pendingBenefitCountdownProps && (
            <PendingChangeBanner
              {...pendingBenefitCountdownProps}
              onExpired={() => {
                fetchSubscriptionBenefits();
                onSubscriptionUpdate?.();
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
                subscriptionBenefits?.availableUpgrades && (
                  <UpgradeList
                    user={user}
                    upgrades={subscriptionBenefits.availableUpgrades}
                    membershipPromoMultiplier={membershipPromoMultiplier}
                    isLoading={isLoading}
                    benefitsLoading={benefitsLoading}
                    onSelectUpgrade={(upgrade) => {
                      setSelectedUpgrade(upgrade);
                      setShowUpgradeConfirm(true);
                    }}
                  />
                )}

              {/* Downgrade Options - Hidden for past_due subscriptions (must pay invoice first) */}
              {!hasFailed &&
                !subscriptionBenefits?.isCancelled &&
                subscriptionBenefits?.availableDowngrades && (
                  <DowngradeList
                    user={user}
                    downgrades={subscriptionBenefits.availableDowngrades}
                    isLoading={isLoading}
                    benefitsLoading={benefitsLoading}
                    onSelectDowngrade={(downgrade) => {
                      setSelectedDowngrade(downgrade);
                      setShowDowngradeConfirm(true);
                    }}
                  />
                )}

              <CancelResumeRow
                subscriptionBenefits={subscriptionBenefits}
                isLoading={isLoading}
                formatDate={formatDate}
                onCancel={() => void handleCancelSubscription()}
                onReactivate={handleReactivateSubscription}
              />
            </div>
          )}
        </div>
      </React.Fragment>
    );
  };

  // Shared subscribe handler (close panel/modal then open membership selection).
  // When a `packageId` is provided (resubscribe tier picker), open the
  // membership modal with that plan pre-selected — otherwise fall back to the
  // legacy "show all packages" flow.
  const handleSubscribeClick = (packageId?: string) => {
    onClose();
    whenGatesOpenElseGateModal(() => {
      if (packageId) {
        const apiPlan = subscriptionPackages.find(
          (p) => p._id === packageId || p.id === packageId
        );
        if (apiPlan) {
          membershipModal.openModal(convertToLocalPlan(apiPlan));
          return;
        }
      }
      membershipModal.openModalWithPackageSelectionFirst();
    });
  };

  // Resubscribe tier picker: route the chosen packageId through the existing
  // subscribe flow with the package pre-selected.
  const handlePickResubscribeTier = (packageId: string) => {
    handleSubscribeClick(packageId);
  };

  // Build the resubscribe tier picker options from the same `subscriptionPackages`
  // source UpgradeList/DowngradeList use. We filter by entriesPerMonth being a
  // number — subscriptionPackages from useMemberships() is already the active
  // subscription set; the entriesPerMonth check guards the type narrowing.
  const resubscribePackages: ResubscribeTierOption[] = subscriptionPackages
    .filter((p): p is typeof p & { entriesPerMonth: number } => typeof p.entriesPerMonth === "number")
    .map((p) => ({
      packageId: p._id,
      name: p.name,
      price: p.price,
      entriesPerMonth: p.entriesPerMonth,
    }));

  const previousPackageId =
    typeof user.subscription?.packageId === "string"
      ? user.subscription.packageId
      : (user.subscription?.packageId as { _id?: string } | undefined)?._id;

  const lastMonthAccumulated =
    (user.subscription as { lastMonthAccumulatedEntries?: number } | undefined)
      ?.lastMonthAccumulatedEntries ?? 0;

  // Legacy 4-way state selector (modal mode + SettingsModal panel use this verbatim).
  const legacyStateBody =
    membershipPackage && activeSubscription ? (
      renderActiveSubscriptionContent()
    ) : activeOneTimePackage ||
      (user.subscription && !user.subscription.isActive && user.subscription.status !== "past_due") ? (
      <InactiveSubscriptionState
        status={user.subscription?.status ?? "none"}
        onSubscribeClick={() => handleSubscribeClick(undefined)}
        packages={resubscribePackages}
        previousPackageId={previousPackageId}
        promoMultiplier={membershipPromoMultiplier}
        lastMonthAccumulatedEntries={lastMonthAccumulated}
        onPickTier={handlePickResubscribeTier}
      />
    ) : (
      <NoSubscriptionState onSubscribeClick={handleSubscribeClick} />
    );

  // Settings-page Claude redesign body (opt-in; reuses the same logic
  // sub-components + handlers, only the surrounding layout differs).
  const settingsBody = (
    <SettingsRedesignSubscription
      user={user}
      membershipPackage={membershipPackage}
      activeSubscription={activeSubscription}
      subscriptionBenefits={subscriptionBenefits}
      packagesLoading={packagesLoading}
      hasFailed={hasFailed}
      pendingBenefitCountdownProps={pendingBenefitCountdownProps}
      isLoading={isLoading}
      benefitsLoading={benefitsLoading}
      membershipPromoMultiplier={membershipPromoMultiplier}
      activeOneTimePackage={
        activeOneTimePackage as
          | { packageId: string | { name: string }; packageData?: { name?: string } }
          | null
      }
      formatDate={formatDate}
      onResolveFailed={() => setIsRenewalFailedModalOpen(true)}
      onCancel={() => void handleCancelSubscription()}
      onReactivate={handleReactivateSubscription}
      onSelectUpgrade={(upgrade) => {
        setSelectedUpgrade(upgrade);
        setShowUpgradeConfirm(true);
      }}
      onSelectDowngrade={(downgrade) => {
        setSelectedDowngrade(downgrade);
        setShowDowngradeConfirm(true);
      }}
      onPendingExpired={() => {
        fetchSubscriptionBenefits();
        onSubscriptionUpdate?.();
      }}
      onSubscribeClick={handleSubscribeClick}
      packages={resubscribePackages}
      previousPackageId={previousPackageId}
      promoMultiplier={membershipPromoMultiplier}
      lastMonthAccumulatedEntries={lastMonthAccumulated}
      onPickTier={handlePickResubscribeTier}
    />
  );

  const childModals = (
    <>
      {/* Cancel confirmation modal removed — clicking Cancel now goes straight
         * to handleCancelSubscription() which either offers the cancellation
         * upsell (if eligible) or proceeds with the API cancel. */}

        {/* Themed Upgrade Confirmation — mirrors DowngradeConfirmModal's infographic intensity */}
        {selectedUpgrade && membershipPackage ? (
          <UpgradeConfirmModal
            isOpen={showUpgradeConfirm && !!selectedUpgrade}
            onClose={() => setShowUpgradeConfirm(false)}
            onConfirm={handleUpgradeSubscription}
            isLoading={isLoading}
            fromPackageName={membershipPackage.name}
            toPackageName={selectedUpgrade.name}
            toPackagePrice={selectedUpgrade.price}
            toPartnerAccessPercent={getPartnerCatalogAccessPercentForMembershipPackageId(selectedUpgrade.packageId)}
            toPartnerDiscountDays={selectedUpgrade.partnerDiscountDays}
            toEntriesPerMonth={selectedUpgrade.entriesPerMonth}
            upgradeEntriesGrant={upgradeModalData?.upgradeEntriesGrant}
            currentEntries={upgradeModalData?.currentEntries}
          />
        ) : null}

        {/* Themed Downgrade Confirmation — matches the cancellation modal's intensity */}
        {selectedDowngrade && membershipPackage ? (
          <DowngradeConfirmModal
            isOpen={showDowngradeConfirm}
            onClose={() => {
              // Dismiss without confirming — clear any stashed cancellation eventId so it
              // matures naturally to "abandoned" rather than being incorrectly recorded.
              pendingCancellationEventId.current = null;
              setShowDowngradeConfirm(false);
            }}
            onConfirm={handleDowngradeSubscription}
            isLoading={isLoading}
            fromPackageName={membershipPackage.name}
            toPackageName={selectedDowngrade.name}
            toPackagePrice={selectedDowngrade.price}
            toPartnerAccessPercent={getPartnerCatalogAccessPercentForMembershipPackageId(selectedDowngrade.packageId)}
            toPartnerDiscountDays={selectedDowngrade.partnerDiscountDays}
            toEntriesPerMonth={selectedDowngrade.entriesPerMonth}
            currentEntries={
              (user.subscription as { lastMonthAccumulatedEntries?: number } | undefined)
                ?.lastMonthAccumulatedEntries ?? 0
            }
            saveLabel={
              membershipPackage.price > selectedDowngrade.price
                ? `Save $${membershipPackage.price - selectedDowngrade.price}/mo`
                : undefined
            }
            effectiveDateLabel={
              activeSubscription?.endDate
                ? new Date(activeSubscription.endDate).toLocaleDateString("en-AU", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })
                : undefined
            }
          />
        ) : null}

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
          upgradeInfo={upgradeData?.upgradeInfo}
        />

        {/* Cancellation Flow Modal — replaces the old CancellationUpsellModal */}
        <CancellationFlowModal
          isOpen={showCancellationFlow}
          onClose={() => setShowCancellationFlow(false)}
          onSaved={handleFlowSaved}
          onCancelled={handleFlowCancelled}
          onResolvePayment={() => {
            setShowCancellationFlow(false);
            setIsRenewalFailedModalOpen(true);
          }}
          onRequestTierDowngrade={(eventId) => {
            // Stash the eventId — outcome is recorded only if downgrade is confirmed.
            pendingCancellationEventId.current = eventId;
            // Close the cancellation flow WITHOUT recording any outcome.
            // The event stays in_progress until the downgrade completes (or is dismissed).
            setShowCancellationFlow(false);
            // Pick the cheapest available downgrade (same heuristic as the old
            // CancellationUpsellModal downgrade prop). Falls back to the first
            // if availableDowngrades is somehow unsorted.
            const downgrades = subscriptionBenefits?.availableDowngrades ?? [];
            const cheapest = downgrades.reduce<typeof downgrades[number] | null>(
              (best, d) => (best === null || d.price < best.price ? d : best),
              null
            );
            if (cheapest) {
              setSelectedDowngrade(cheapest);
              setShowDowngradeConfirm(true);
            } else {
              // No downgrade found (shouldn't happen if tierDowngradeAvailable is correct)
              // — discard the stashed eventId so it doesn't linger.
              pendingCancellationEventId.current = null;
            }
          }}
          tierDowngradeAvailable={(subscriptionBenefits?.availableDowngrades?.length ?? 0) > 0}
          entrySnapshot={cancellationEntrySnapshot}
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
    </>
  );

  const subscriptionContent = (
    <>
      {!renderAsPanel && <ModalHeader title="Manage Subscription" onClose={onClose} showLogo={false} />}
      <ModalContent padding="lg">
        {renderAsPanel && settingsRedesign ? settingsBody : legacyStateBody}
        {childModals}
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
