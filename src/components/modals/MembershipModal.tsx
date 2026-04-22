"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import { Check, Loader2 } from "lucide-react";
import PackageSelectionModal from "./PackageSelectionModal";
import { formatNamePart } from "@/utils/display-name";
import PaymentMethodSelector from "./PaymentMethodSelector";
import ExistingAccountModal from "./ExistingAccountModal";
import { ModalContainer, ModalHeader, ModalContent, Input, Button } from "./ui";
import { useLoading } from "@/contexts/LoadingContext";
import { type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useStripeSubscription } from "@/hooks/useStripeSubscription";
import { getStripePromise } from "@/lib/stripe-client";
import { useMemberships } from "@/hooks/useMemberships";

const stripePromise = getStripePromise();
import { usePurchaseMembership } from "@/hooks/queries/useMembershipQueries";
import { usePurchaseUpsell } from "@/hooks/queries/useUpsellQueries";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { convertToAPIPlan, getPackageId } from "@/utils/membership/membership-adapters";
import { useUserContext } from "@/contexts/UserContext";
import { markPurchaseCompleted } from "@/utils/tracking/purchase-tracking";
import { useRouter, usePathname } from "next/navigation";
import FullscreenImageViewer, { type FullscreenImageItem } from "@/components/ui/FullscreenImageViewer";
import { signIn } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
// Upsell store removed - using unified modal priority system
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { convertUpsellToLocalPlan } from "@/utils/membership/membership-adapters";
import { UpsellOffer, UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";
import { getPackageBaseEntries } from "@/utils/payment/upsell-entries-calculator";
import { PaymentProcessingScreen } from "@/components/loading";
import { type PaymentStatusResponse } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { trackCompleteRegistration, trackFacebookEvent } from "@/components/FacebookPixel";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useSetupIntent } from "@/hooks/useSetupIntent";
import { usePaymentIntent } from "@/hooks/usePaymentIntent";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import { useReferralCode } from "@/hooks/useReferralCode";
import { useAffiliateLink } from "@/hooks/useAffiliateLink";
import { usePromoLink } from "@/hooks/usePromoLink";
import { extractAttributionParams } from "@/utils/tracking/utm-helpers";
import { getStoredUTMParams } from "@/utils/tracking/utm-storage";
import HexagonalPromoBadge from "../ui/HexagonalPromoBadge";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { useMajorDrawWinners, type MajorDrawWinner } from "@/hooks/queries/useWinnersQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { rewardsEnabled } from "@/config/featureFlags";
import { getPackageById } from "@/data/membershipPackages";
import { getPartnerDiscountBenefitTextForPackageId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { getPackageColorSchemeForPromo } from "@/utils/package-colors/packageColorScheme";
import { hasBundledMultiplierAssets, isPromoMultiplier, type PromoMultiplier } from "@/types/promo-multiplier";
import { autoLogPaymentError, type PaymentErrorDetails } from "@/utils/error-reporting/auto-log-error";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";
import { extractSubscriptionData, validateSubscriptionResponse } from "@/utils/payment/subscription-response-handler";
import { createSubscriptionStateUpdate } from "@/utils/payment/subscription-state-manager";
import { handleSubscriptionError, handlePaymentIntentNotReadyError, handleInvalidResponseError } from "@/utils/payment/subscription-error-handler";
import { 
  detectPaymentError, 
  type RecoveryStrategy 
} from "@/utils/payment/stripe/payment-error-detection";
import { formatPaymentError } from "@/utils/payment/stripe/payment-error-messages";
import { recoverSetupIntent } from "@/utils/payment/stripe/setup-intent-recovery";
import { getStatePreservationInstructions } from "@/utils/payment/stripe/payment-state-preservation";
// Member package mapping utilities imported but using inline mapping for simplicity

// Type for one-time purchase response data
interface OneTimePurchaseData {
  paymentIntentId: string;
  customerId: string;
  userId: string;
  clientSecret?: string;
  status: string;
  packageName: string;
  totalEntries: number;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    subscription?: {
      packageId: string;
      isActive: boolean;
      status: string;
    };
    entryWallet: number;
    rewardsPoints: number;
  };
  autoLogin?: boolean;
}

interface MembershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPlan: LocalMembershipPlan | null;
  onPlanChange?: (newPlan: LocalMembershipPlan) => void;
  /**
   * A/B Testing configuration for membership modal behavior
   * If not provided, will attempt to get from VariantContext
   * @property showPackageSelectionFirst - When true, automatically opens package selection modal on step 2
   */
  membershipModalConfig?: {
    showPackageSelectionFirst?: boolean;
  };
}

const MembershipModal: React.FC<MembershipModalProps> = ({ 
  isOpen, 
  onClose, 
  selectedPlan, 
  onPlanChange,
  membershipModalConfig,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const promoTheme = usePromoTheme();

  // Get variant config from context (for A/B testing)
  // Use prop if provided, otherwise try to get from context
  const { variantConfig: contextVariantConfig } = useVariantContext();
  const finalMembershipModalConfig = membershipModalConfig || contextVariantConfig?.membershipModal;
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    cardNumber: "",
    expiryDate: "",
    cvv: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false); // New state for registration process
  const [upsellTriggered, setUpsellTriggered] = useState(false); // Guard against duplicate upsell calls
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponType, setCouponType] = useState<"referral" | "promo" | "campaign" | null>(null);
  const [campaignPurchaseRequirement, setCampaignPurchaseRequirement] = useState<"none" | "membership" | "one-time" | "any" | null>(null);
  const {
    referralCode: storedReferralCode,
    setReferralCode: persistReferralCode,
    clearReferralCode,
  } = useReferralCode();
  const { affiliateCode } = useAffiliateLink();
  const { promoCode: promoLinkCode, setPromoCode, clearPromoCode } = usePromoLink();
  const [isValidatingReferral, setIsValidatingReferral] = useState(false);
  const [referralInfo, setReferralInfo] = useState<{ referrerName: string } | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [isPackageSelectionOpen, setIsPackageSelectionOpen] = useState(false);

  // Promo link validation state - tracks bonus entries from promo codes
  const [promoLinkInfo, setPromoLinkInfo] = useState<{
    bonusEntries: number;
    isValid: boolean;
    isLoading: boolean;
    appliesToMembership: boolean;
    appliesToOneTime: boolean;
    code: string;
  } | null>(null);

  const normalizedCouponCode = couponCode.trim().toUpperCase();
  const appliedCouponPayload = useMemo(
    () => ({
      referralCode:
        couponApplied && couponType === "referral" ? normalizedCouponCode : undefined,
      promoLinkCode:
        couponApplied && couponType === "promo"
          ? normalizedCouponCode
          : promoLinkCode || undefined,
      campaignCode:
        couponApplied && couponType === "campaign" ? normalizedCouponCode : undefined,
    }),
    [couponApplied, couponType, normalizedCouponCode, promoLinkCode]
  );
  const showApplyingIndicator = !couponApplied && isValidatingReferral;
  const isApplyDisabled = normalizedCouponCode.length === 0 || isValidatingReferral;

  // Registration error states
  const [registrationErrors, setRegistrationErrors] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    general?: string;
  }>({});

  // Saved payment method state
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SavedPaymentMethod | null>(null);
  const [useSavedPaymentMethod, setUseSavedPaymentMethod] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [isCreatingSubscription, setIsCreatingSubscription] = useState(false); // Loading state while invoice PaymentIntent is being created (for Payment Element)
  const [paymentMethodTypeFromElement, setPaymentMethodTypeFromElement] = useState<string | null>(null); // Option A: hide main Purchase when google_pay/apple_pay selected

  // Stripe Elements state
  const [setupIntentClientSecret, setSetupIntentClientSecret] = useState<string | null>(null);
  const [paymentIntentClientSecret, setPaymentIntentClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [cardFormError, setCardFormError] = useState<string | null>(null);
  // Track the last amount we created a PaymentIntent for (to detect changes)
  const lastPaymentIntentAmountRef = useRef<number | null>(null);
  // ✅ FIX: Track if PaymentIntent creation is in progress to prevent double creation
  const isCreatingPaymentIntentRef = useRef<boolean>(false);
  // ✅ FIX: Track if SetupIntent creation is in progress to prevent concurrent creation
  const isCreatingSetupIntentRef = useRef<boolean>(false);
  /** Synchronous guard so two rapid submits cannot both pass before React re-renders isSubmitting. */
  const checkoutSubmitLockRef = useRef(false);
  const isCreatingSubscriptionRef = useRef<boolean>(false);
  const SUBSCRIPTION_CHECKOUT_STORAGE_KEY = "membership_subscription_checkout";
  const SUBSCRIPTION_CHECKOUT_STALE_MS = 60 * 60 * 1000; // 60 minutes
  // ✅ STRIPE BEST PRACTICE: Track if subscription was already created to prevent duplicate creation
  const subscriptionCreatedRef = useRef<string | null>(null); // Store subscriptionId once created
  const subscriptionPackageIdRef = useRef<string | null>(null); // Package the current subscription was created for (so we can invalidate on plan change)
  const previousSubscriptionToCancelRef = useRef<string | null>(null); // When user switches package: pass to API to cancel before creating new subscription
  const userIdRef = useRef<string | null>(null); // Store userId for retry scenarios
  /** Final static package _id sent to the payment API (after additional-pack remap). Drives upsell multiplier + invoice context. */
  const lastChargedStaticPackageIdRef = useRef<string | null>(null);
  // First subscription charge must be confirmed client-side; when true we run confirmStripeIntent() after Payment Element has invoice secret
  const [pendingFirstSubscriptionConfirm, setPendingFirstSubscriptionConfirm] = useState(false);
  // ✅ NEW: Track recovery attempts to prevent duplicate recoveries
  const recoveryAttemptedRef = useRef<{ errorMessage: string; attempted: boolean } | null>(null);
  const cardFormRef = useRef<{
    confirmStripeIntent: () => Promise<{
      paymentMethodId?: string;
      paymentIntentId?: string;
      error?: string;
      setupIntentAlreadySucceeded?: boolean;
      needsRecovery?: boolean;
      lastSetupError?: { code?: string; message?: string; decline_code?: string };
    }>;
  } | null>(null);
  const [guestUserData, setGuestUserData] = useState<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    mobile: string;
  } | null>(null);

  // Payment processing state
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false);
  // paymentIntentId is already declared above (line 128) - using same state for payment processing
  const [processingPackageName, setProcessingPackageName] = useState<string>("");
  const [processingPackageType, setProcessingPackageType] = useState<
    "one-time" | "membership" | "upsell" | "mini-draw"
  >("membership");

  // Original purchase context for combined invoice (invoice finalization)
  const [originalPurchaseContext, setOriginalPurchaseContext] = useState<OriginalPurchaseContext | null>(null);

  // Existing account modal state (for non-plain accounts)
  const [showExistingAccountModal, setShowExistingAccountModal] = useState(false);
  const [existingAccountConflictField, setExistingAccountConflictField] = useState<"email" | "mobile">("email");
  const [existingAccountEmail, setExistingAccountEmail] = useState<string | undefined>(undefined);

  // Major draw winners from shared cache (homepage/promotions/modal) - only fetches if not already loaded
  const { data: majorDrawWinners = [], isLoading: majorDrawWinnersLoading } = useMajorDrawWinners();
  const winnerCarouselRef = useRef<HTMLDivElement | null>(null);
  const [winnerViewerOpen, setWinnerViewerOpen] = useState(false);
  const [winnerViewerInitialIndex, setWinnerViewerInitialIndex] = useState(0);
  const winnerStripPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const winnerStripDidDragRef = useRef(false);
  /** Pairs preserve API order (newest first); first slide = two most recent winners. */
  const majorDrawWinnerPairs = React.useMemo(() => {
    const pairs: [MajorDrawWinner, MajorDrawWinner | null][] = [];
    for (let i = 0; i < majorDrawWinners.length; i += 2) {
      pairs.push([majorDrawWinners[i], majorDrawWinners[i + 1] ?? null]);
    }
    return pairs;
  }, [majorDrawWinners]);

  const winnerFullscreenImages = React.useMemo((): FullscreenImageItem[] => {
    return majorDrawWinners.map((winner) => {
      const displayImage =
        winner.imageUrl ||
        (winner.prize?.images?.[0]) ||
        "/images/promotion/PrizeHeader/PrizeHeader.webp";
      const displayName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
      const displayDate = (
        winner.drawDate ? new Date(winner.drawDate) : new Date(winner.selectedDate)
      ).toLocaleDateString("en-AU", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const drawLabel = winner.drawName?.trim() || "Major draw";
      return {
        src: displayImage,
        alt: `${displayName} — ${drawLabel}`,
        captionDetail: {
          drawName: drawLabel,
          winnerName: displayName,
          wonDate: displayDate,
          drawKind: "major",
        },
      };
    });
  }, [majorDrawWinners]);

  const renderMajorDrawWinnerTile = (winner: MajorDrawWinner) => {
    const displayImage =
      winner.imageUrl ||
      (winner.prize?.images?.[0]) ||
      "/images/promotion/PrizeHeader/PrizeHeader.webp";
    const displayName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
    const displayDate = (
      winner.drawDate ? new Date(winner.drawDate) : new Date(winner.selectedDate)
    ).toLocaleDateString("en-AU", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return (
      <div className="relative h-full min-h-0 w-full overflow-hidden bg-neutral-950">
        <Image
          src={displayImage}
          alt={displayName}
          fill
          className="object-contain object-center"
          sizes="(max-width: 640px) 45vw, 260px"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent"
          aria-hidden
        />
        <div className="absolute bottom-0 left-0 right-0 z-10 space-y-0.5 p-1.5 sm:space-y-1 sm:p-2">
          <p className="line-clamp-2 text-[7px] font-bold uppercase leading-tight tracking-wide text-white drop-shadow-sm sm:text-[8px]">
            {winner.drawName?.trim() || "Major draw"}
          </p>
          <p className="text-[7px] tabular-nums text-white/90 drop-shadow-sm sm:text-[8px]">{displayDate}</p>
          <p className="truncate font-['Poppins'] text-[8px] font-bold text-white drop-shadow-sm sm:text-[9px]">
            {displayName}
          </p>
        </div>
      </div>
    );
  };

  // Track if package selection modal has been auto-opened from promotion page
  // This prevents the modal from auto-opening multiple times during the same session
  const packageSelectionAutoOpenedRef = useRef<boolean>(false);

  // Payment confirmation state - now handled directly in handleSubmit
  // Removed showPaymentConfirmation and paymentData states

  // Memoized fallback plan keeps useMemo dependencies stable and easy to reason about.
  const placeholderPlan = React.useMemo<LocalMembershipPlan>(
    () => ({
      id: "placeholder",
      name: "Select a package",
      price: 0,
      period: "one-time",
      features: [],
      subtitle: "Please select a package to continue",
      isMemberOnly: false,
      buttonText: "Select",
      buttonStyle: "primary",
      metadata: {
        entriesCount: 0,
      },
    }),
    []
  );

  // When opening with package selection first (e.g. subscription tab / Enter now), show membership packages tab
  const membershipPlaceholderPlan = React.useMemo<LocalMembershipPlan>(
    () => ({
      ...placeholderPlan,
      id: "placeholder-membership",
      period: "mo",
      name: "Select a membership package",
      subtitle: "Choose a plan to continue",
    }),
    [placeholderPlan]
  );

  const showPackageSelectionFirst = finalMembershipModalConfig?.showPackageSelectionFirst === true;
  const activePlan =
    selectedPlan || (showPackageSelectionFirst ? membershipPlaceholderPlan : placeholderPlan);

  /** Plan is a placeholder (user must select a real package); used to block API calls and disable purchase. */
  const isPlaceholderPlan =
    !activePlan || activePlan.id === "placeholder" || activePlan.id.startsWith("placeholder-");

  // Hooks for API integration
  const { createSubscription, createOneTimePurchase, createSubscriptionExistingUser } = useStripeSubscription();
  const { subscriptionPackages, oneTimePackages } = useMemberships();
  /** Static catalog _id (e.g. tradie-subscription) for getPackageById + partner copy */
  const catalogPackageIdForBenefits = useMemo(() => {
    const api = convertToAPIPlan(activePlan, [...subscriptionPackages, ...oneTimePackages]);
    return (api?._id || activePlan.id).trim();
  }, [activePlan, subscriptionPackages, oneTimePackages]);

  const purchaseSuccessSubtitle = useMemo(
    () =>
      activePlan.period === "mo"
        ? `${activePlan.name} membership activated`
        : `${activePlan.name} activated`,
    [activePlan.name, activePlan.period]
  );

  const { userData: _userDataForPromo, isMember: isMemberForPromo } = useUserContext();

  // Get resolved multipliers (includes scheduled, toggle, and alternating)
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedMiniMultiplier = useResolvedMultiplier("mini-packages", "display");

  // Apply promo multiplier to activePlan if applicable
  const promoEnhancedPlan = React.useMemo(() => {
    if (!activePlan || activePlan.id === "placeholder") return activePlan;

    const parseEntries = (value: unknown) => {
      if (typeof value === "number") return value;
      const parsed = parseInt(String(value ?? 0), 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    const updateFeatureEntries = (plan: LocalMembershipPlan, targetEntries: number) => {
      if (!Array.isArray(plan.features) || targetEntries <= 0) {
        return plan.features;
      }

      return plan.features.map((feature) => {
        if (!feature.text.toLowerCase().includes("entries")) {
          return feature;
        }

        if (feature.text.includes(targetEntries.toString())) {
          return feature;
        }

        return {
          ...feature,
          text: feature.text.replace(/\d[\d,]*/, targetEntries.toString()),
        };
      });
    };

    const normalisePromoPlan = (plan: LocalMembershipPlan) => {
      const promoEntries = parseEntries(plan.metadata?.entriesCount);
      if (promoEntries <= 0) {
        return plan;
      }

      const multiplierFromMetadataRaw = plan.metadata?.promoMultiplier;
      const multiplierFromMetadataNumber =
        typeof multiplierFromMetadataRaw === "number"
          ? multiplierFromMetadataRaw
          : parseFloat(String(multiplierFromMetadataRaw ?? ""));
      const multiplierFromMetadata =
        Number.isFinite(multiplierFromMetadataNumber) && multiplierFromMetadataNumber > 0
          ? multiplierFromMetadataNumber
          : undefined;

      const baseEntriesFromMetadataRaw = plan.metadata?.originalEntries;
      const baseEntriesFromMetadataNumber = parseEntries(baseEntriesFromMetadataRaw);
      const baseEntriesFromMetadata = baseEntriesFromMetadataNumber > 0 ? baseEntriesFromMetadataNumber : undefined;

      const resolvedMultiplier =
        multiplierFromMetadata || (baseEntriesFromMetadata ? promoEntries / baseEntriesFromMetadata : undefined);
      const resolvedOriginalEntries =
        baseEntriesFromMetadata ||
        (resolvedMultiplier && resolvedMultiplier > 0 ? Math.round(promoEntries / resolvedMultiplier) : promoEntries);

      return {
        ...plan,
        features: updateFeatureEntries(plan, promoEntries),
        metadata: {
          ...plan.metadata,
          entriesCount: promoEntries,
          originalEntries: resolvedOriginalEntries,
          promoMultiplier: resolvedMultiplier,
          isPromoActive: true,
        },
      };
    };

    if (activePlan.metadata?.isPromoActive) {
      return normalisePromoPlan(activePlan);
    }

    const applyMultiplier = (multiplier: number) => {
      if (multiplier <= 1) {
        return activePlan;
      }

      const baseEntriesRaw = activePlan.metadata?.originalEntries ?? activePlan.metadata?.entriesCount ?? 0;
      const baseEntries = parseEntries(baseEntriesRaw);
      const promoEntries = baseEntries * multiplier;

      return {
        ...activePlan,
        features: updateFeatureEntries(activePlan, promoEntries),
        metadata: {
          ...activePlan.metadata,
          entriesCount: promoEntries,
          originalEntries: baseEntries,
          promoMultiplier: multiplier,
          isPromoActive: true,
        },
      };
    };

    // One-time: use membership multiplier for member-only packages when user is a member
    if (activePlan.period === "one-time") {
      const effectiveType = getEffectivePromoType(activePlan.id, "one-time", isMemberForPromo ?? false);
      const multiplier =
        effectiveType === "membership-packages" ? resolvedMembershipMultiplier : resolvedOneTimeMultiplier;
      if (multiplier !== null && multiplier > 1) {
        return applyMultiplier(multiplier);
      }
    }

    if (activePlan.id.startsWith("mini-pack-") && resolvedMiniMultiplier !== null && resolvedMiniMultiplier > 1) {
      return applyMultiplier(resolvedMiniMultiplier);
    }

    return activePlan;
  }, [activePlan, resolvedOneTimeMultiplier, resolvedMembershipMultiplier, resolvedMiniMultiplier, isMemberForPromo]);
  const { isAuthenticated, userData, isMember } = useUserContext();
  const { gatesClosed, openGateClosedModal } = useMajorDrawPurchaseGate();
  const { trackInitiateCheckout } = usePixelTracking();
  const { data: userMajorDrawStats } = useUserMajorDrawStats(userData?._id);
  const { savePaymentMethod } = useSavedPaymentMethods();
  const purchaseMembership = usePurchaseMembership();
  const purchaseUpsell = usePurchaseUpsell();
  const createSetupIntent = useSetupIntent();
  const createPaymentIntent = usePaymentIntent();
  // Upsell functionality now handled through modal priority system
  const { showLoading, hideLoading, showSuccess } = useLoading();

  // Add query client for UI updates
  const queryClient = useQueryClient();

  // Helper function to invalidate user-related caches
  const invalidateUserCaches = useCallback(
    (userId: string) => {
      // console.log("🔄 Invalidating user caches for:", userId);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rewards.user(userId) });
    },
    [queryClient]
  );

  // Custom close handler that resets payment processing state
  const handleClose = useCallback(async () => {
    // console.log("🔄 MembershipModal: Resetting payment processing state on close");

    // ✅ FIX: Cancel any pending/incomplete PaymentIntents when modal closes
    // This prevents accumulation of incomplete PaymentIntents in Stripe dashboard
    if (paymentIntentId) {
      try {
        await fetch("/api/stripe/cancel-payment-intent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ paymentIntentId }),
        });
        console.log("✅ Cancelled PaymentIntent on modal close:", paymentIntentId);
      } catch (error) {
        console.error("❌ Failed to cancel PaymentIntent on modal close:", error);
        // Non-blocking - continue with modal close even if cancellation fails
      }
    }

    // Clear PaymentIntent state
    setPaymentIntentClientSecret(null);
    setPaymentIntentId(null);
    setSetupIntentClientSecret(null);
    lastPaymentIntentAmountRef.current = null;
    isCreatingPaymentIntentRef.current = false;

    setShowPaymentProcessing(false);
    setProcessingPackageName("");
    setProcessingPackageType(undefined as unknown as "one-time" | "membership" | "upsell" | "mini-draw");
    onClose();
  }, [onClose, paymentIntentId]);

  useEffect(() => {
    if (!isOpen) return;
    const allowDuringClosedGates =
      isAuthenticated && userData?.subscription?.status === "past_due";
    if (!gatesClosed || allowDuringClosedGates) return;
    void handleClose();
    openGateClosedModal();
  }, [
    isOpen,
    gatesClosed,
    isAuthenticated,
    userData?.subscription?.status,
    handleClose,
    openGateClosedModal,
  ]);

  // Reset upsell trigger guard and payment processing state when modal reopens for a new purchase
  useEffect(() => {
    if (isOpen) {
      setUpsellTriggered(false);
      // Reset payment processing state to prevent infinite polling
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);
      setProcessingPackageName("");
      setProcessingPackageType(undefined as unknown as "one-time" | "membership" | "upsell" | "mini-draw");
      // ✅ STRIPE BEST PRACTICE: Reset subscription tracking when modal opens for new purchase
      subscriptionCreatedRef.current = null;
      subscriptionPackageIdRef.current = null;
      previousSubscriptionToCancelRef.current = null;
      setIsCreatingSubscription(false);
      setPaymentMethodTypeFromElement(null);
      userIdRef.current = null; // ✅ Reset userId tracking for clean state
      // Success state is now handled by global LoadingContext
      // console.log("🔄 Reset upsell trigger guard and payment processing state for new purchase");
    } else {
      // Ensure payment processing is cancelled when modal closes
      // console.log("🔄 MembershipModal: Cancelling payment processing on modal close");
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);
      setProcessingPackageName("");
      setProcessingPackageType(undefined as unknown as "one-time" | "membership" | "upsell" | "mini-draw");
    }
  }, [isOpen]);

  const [currentStep, setCurrentStep] = useState(1); // Start neutral, will be updated by useEffect based on auth

  // Step 2 is only available when step 1 is complete (registered or authenticated)
  const hasCompletedRegistration = isAuthenticated || guestUserData !== null;

  // Validate promo link when code is detected.
  // Uses the unified code validator, preferring promo semantics.
  useEffect(() => {
    const validatePromoLink = async () => {
      // Only validate if we have a promo code and modal is open
      if (!promoLinkCode || !isOpen) {
        setPromoLinkInfo(null);
        return;
      }

      // Only validate for subscription or one-time packages (not placeholder)
      if (isPlaceholderPlan) {
        setPromoLinkInfo(null);
        return;
      }

      try {
        setPromoLinkInfo({
          bonusEntries: 0,
          isValid: false,
          isLoading: true,
          appliesToMembership: false,
          appliesToOneTime: false,
          code: "",
        });

        const response = await fetch("/api/codes/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: promoLinkCode,
            preferType: "promo",
          }),
        });
        const data = await response.json();

        if (data.success && data.valid && data.type === "promo" && data.data) {
          setPromoLinkInfo({
            bonusEntries: data.data.bonusEntries,
            isValid: true,
            isLoading: false,
            appliesToMembership: data.data.appliesToMembership || false,
            appliesToOneTime: data.data.appliesToOneTime || false,
            code: data.data.code || promoLinkCode,
          });
        } else {
          setPromoLinkInfo(null);
        }
      } catch (error) {
        console.error("Error validating promo link:", error);
        setPromoLinkInfo(null);
      }
    };

    validatePromoLink();
  }, [promoLinkCode, isOpen, activePlan]); // eslint-disable-line react-hooks/exhaustive-deps -- isPlaceholderPlan derived from activePlan

  // Winner carousel: two winners per slide; auto-advance by one slide (user can swipe too)
  useEffect(() => {
    if (!isOpen || majorDrawWinnerPairs.length <= 1 || majorDrawWinnersLoading) return;
    const el = winnerCarouselRef.current;
    if (!el) return;

    const tick = () => {
      const node = winnerCarouselRef.current;
      if (!node) return;
      const page = node.clientWidth;
      if (page <= 0) return;
      const maxLeft = Math.max(0, node.scrollWidth - page);
      const next = node.scrollLeft + page >= maxLeft - 2 ? 0 : node.scrollLeft + page;
      node.scrollTo({ left: next, behavior: "smooth" });
    };

    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [isOpen, majorDrawWinnerPairs.length, majorDrawWinnersLoading]);

  // Reset scroll when modal opens or winner list changes
  useEffect(() => {
    if (isOpen && winnerCarouselRef.current) {
      winnerCarouselRef.current.scrollLeft = 0;
    }
  }, [isOpen, majorDrawWinners]);

  // Resolve billing details once so every Stripe call receives consistent data.
  const resolvedBillingDetails = React.useMemo(() => {
    const safeTrim = (value: string | null | undefined) => {
      if (!value) return undefined;
      const trimmed = value.toString().trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const sourceFirstName = safeTrim(userData?.firstName) ?? safeTrim(formData.firstName);
    const sourceLastName = safeTrim(userData?.lastName) ?? safeTrim(formData.lastName);
    const fullName =
      sourceFirstName || sourceLastName ? [sourceFirstName, sourceLastName].filter(Boolean).join(" ") : undefined;

    const resolvedAddress = {
      country: "AU",
      state: "NSW",
      city: "Sydney",
      postalCode: "2000",
      line1: "1 Martin Place",
    };

    return {
      name: fullName,
      email: safeTrim(userData?.email) ?? safeTrim(formData.email),
      phone: safeTrim(userData?.mobile) ?? safeTrim(formData.phone),
      ...resolvedAddress,
    };
  }, [
    formData.email,
    formData.firstName,
    formData.lastName,
    formData.phone,
    userData?.email,
    userData?.firstName,
    userData?.lastName,
    userData?.mobile,
  ]);

  // Set initial payment method preference based on authentication status
  useEffect(() => {
    setUseSavedPaymentMethod(isAuthenticated);
  }, [isAuthenticated]);

  // Pre-populate form fields with user data when authenticated user opens modal
  useEffect(() => {
    if (isAuthenticated && userData && isOpen) {
      // console.log(`?? Pre-populating form for authenticated user:`, userData.email);
      setFormData((prevFormData) => ({
        firstName: userData.firstName || prevFormData.firstName,
        lastName: userData.lastName || prevFormData.lastName,
        email: userData.email || prevFormData.email,
        phone: userData.mobile || prevFormData.phone, // Use mobile field from userData
        cardNumber: prevFormData.cardNumber,
        expiryDate: prevFormData.expiryDate,
        cvv: prevFormData.cvv,
      }));

      // Auto-skip to step 2 since user is authenticated
      setCurrentStep(2);
    } else if (!isAuthenticated && isOpen) {
      // For unauthenticated users, ensure they start from personal details
      setCurrentStep(1);
    }
  }, [isAuthenticated, userData, isOpen]);

  /**
   * Auto-open package selection modal on step 2 (same pattern as PromoBanner countdown).
   * Component default: show package selection first unless variant explicitly sets false.
   * - variantConfig?.membershipModal?.showPackageSelectionFirst !== false → show (default)
   * - No variant config: use pathname (promotions page) as fallback to open on /promotions/...
   */
  useEffect(() => {
    // Same pattern as banner: showCountdown !== false → default true in component
    const isPromotionsPage = pathname?.match(/^\/promotions\/([^/?#]+)/) !== null;
    const shouldAutoOpen = finalMembershipModalConfig == null
      ? isPromotionsPage
      : (finalMembershipModalConfig.showPackageSelectionFirst !== false);

    // Only auto-open if all conditions are met:
    // 1. Modal is open
    // 2. We're in step 2 (payment step)
    // 3. Config says to auto-open (or pathname indicates promotion page for backward compatibility)
    // 4. Package selection modal hasn't been auto-opened yet (prevents duplicate opens)
    // 5. Package selection modal is not already open
    if (
      isOpen &&
      currentStep === 2 &&
      shouldAutoOpen &&
      !packageSelectionAutoOpenedRef.current &&
      !isPackageSelectionOpen
    ) {
      // Small delay to ensure membership modal is fully rendered before opening package selection
      const timer = setTimeout(() => {
        setIsPackageSelectionOpen(true);
        packageSelectionAutoOpenedRef.current = true;
      }, 300);

      return () => clearTimeout(timer);
    }

    // Reset ref when modal closes so it can auto-open again next time
    // This ensures the feature works correctly if user closes and reopens the modal
    if (!isOpen) {
      packageSelectionAutoOpenedRef.current = false;
    }
  }, [isOpen, currentStep, pathname, isPackageSelectionOpen, finalMembershipModalConfig]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleClose]);

  // Handle upsell payment events
  useEffect(() => {
    const handleUpsellPayment = (event: CustomEvent) => {
      // console.log("🎯 Received upsell payment event:", event.detail);
      const { offer } = event.detail;

      if (!offer) {
        console.error("❌ No upsell offer in event detail");
        return;
      }

      // Convert upsell offer to LocalMembershipPlan format using the new helper
      const upsellPlan = convertUpsellToLocalPlan(offer);
      // console.log("🎯 Converted upsell offer to membership plan:", upsellPlan);

      // Set the upsell plan and notify parent component to change it
      if (onPlanChange) {
        onPlanChange(upsellPlan);
      }

      // Dispatch openMembershipModal event to trigger parent components to open the membership modal
      const openModalEvent = new CustomEvent("openMembershipModal", {
        detail: { plan: upsellPlan },
      });
      window.dispatchEvent(openModalEvent);

      // console.log("🎯 Upsell plan converted, selected and dispatched openMembershipModal");
    };

    window.addEventListener("showUpsellPayment", handleUpsellPayment as EventListener);

    return () => {
      window.removeEventListener("showUpsellPayment", handleUpsellPayment as EventListener);
    };
  }, [onPlanChange]);

  // Allow external triggers (e.g. rewards unlock button) to prefill coupon codes.
  useEffect(() => {
    const handleOpenMembershipModalPrefill = (event: CustomEvent) => {
      const detail = event.detail as { referralCode?: string } | undefined;
      const incomingCode = detail?.referralCode?.trim().toUpperCase();
      if (!incomingCode) return;

      setCouponCode(incomingCode);
      setCouponApplied(false);
      setCouponType(null);
      setReferralInfo(null);
      setReferralError(null);
    };

    window.addEventListener("openMembershipModal", handleOpenMembershipModalPrefill as EventListener);
    return () => {
      window.removeEventListener("openMembershipModal", handleOpenMembershipModalPrefill as EventListener);
    };
  }, []);

  // Debug logging for amount calculation before passing to PaymentMethodSelector
  useEffect(() => {
    const promoEnhancedPlanPrice = promoEnhancedPlan?.price;
    const activePlanPrice = activePlan?.price;
    const calculatedAmount = Math.round((promoEnhancedPlanPrice || activePlanPrice || 0) * 100);
    const packageName = promoEnhancedPlan?.name || activePlan?.name;

    console.log("🔍 MembershipModal Amount Calculation:", {
      promoEnhancedPlanPrice,
      activePlanPrice,
      calculatedAmount,
      calculatedAmountInDollars: (calculatedAmount / 100).toFixed(2),
      packageName,
      promoEnhancedPlanName: promoEnhancedPlan?.name,
      activePlanName: activePlan?.name,
    });
  }, [promoEnhancedPlan, activePlan]);

  // ✅ FIX: Clear client secrets when package type OR amount changes to ensure PaymentMethodSelector remounts
  useEffect(() => {
    const isSubscription = activePlan?.period === "mo";
    const currentHasPaymentIntent = !!paymentIntentClientSecret;
    const currentHasSetupIntent = !!setupIntentClientSecret;
    const newAmount = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
    const lastAmount = lastPaymentIntentAmountRef.current;

    // ✅ CRITICAL: Clear PaymentIntent if:
    // 1. Switching TO subscription (from one-time)
    // 2. Switching BETWEEN subscription packages (amount changed)
    if (isSubscription && currentHasPaymentIntent) {
      if (lastAmount === null || lastAmount !== newAmount) {
        console.log("🔄 Package/amount changed - clearing PaymentIntent for recreation:", {
          oldAmount: lastAmount,
          newAmount,
          packageName: promoEnhancedPlan?.name || activePlan?.name,
        });
        setPaymentIntentClientSecret(null);
        setPaymentIntentId(null);
        lastPaymentIntentAmountRef.current = null;
        // ✅ CRITICAL: Also clear card form to force re-render
        setShowCardForm(false);
      }
    }

    // If switching to one-time and we have SetupIntent, clear it (will be recreated when needed)
    if (!isSubscription && currentHasSetupIntent) {
      console.log("🔄 Package type changed to one-time - clearing SetupIntent");
      setSetupIntentClientSecret(null);
      // ✅ CRITICAL: Also clear card form to force re-render
      setShowCardForm(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan?.period, activePlan?.price, promoEnhancedPlan?.price]); // ✅ Also depend on price to detect amount changes

  // ✅ STRIPE BEST PRACTICE: Create PaymentIntent proactively for subscriptions
  // This handles both scenarios:
  // 1. Direct opening with membership package - PaymentIntent ready before user clicks "Add Payment Method"
  // 2. Switching from one-time to membership - PaymentIntent created when package type changes
  // ✅ FIX: Only create PaymentIntent during actual payment flows
  // This prevents unnecessary PaymentIntent creation on modal open/page load
  useEffect(() => {
    // ✅ CRITICAL FIX: Don't run any Stripe logic when modal is closed
    // This prevents endless Stripe API calls when modal is mounted but not visible
    if (!isOpen) {
      return;
    }

    const isSubscription = activePlan?.period === "mo";
    const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);

    // ✅ CRITICAL: Only create PaymentIntent when:
    // 1. User is in payment step (step 2)
    // 2. User has completed registration (authenticated OR guestUserData exists)
    // 3. User is viewing payment form OR has selected a plan (not placeholder)
    const isInPaymentFlow = currentStep >= 2;
    const hasCompletedRegistration = isAuthenticated || guestUserData !== null;
    const isActualPlan = !isPlaceholderPlan;
    const _shouldCreatePaymentIntent =
      isInPaymentFlow && hasCompletedRegistration && isActualPlan && (showCardForm || isSubscription); // Only for subscriptions or when card form is shown

    // ✅ Option A: When Step 2 and subscription – use invoice PaymentIntent only (no SetupIntent)
    if (currentStep === 2 && hasCompletedRegistration && isActualPlan) {
      const isSubscription = activePlan?.period === "mo";
      const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);

      if (isSubscription && !isCreatingSubscriptionRef.current) {
        const currentPackageId = packageId || null;

        // ✅ If user changed package, capture old subscription id for backend cancel, then clear state so we create a new one for the new package
        if (
          subscriptionCreatedRef.current &&
          subscriptionPackageIdRef.current !== null &&
          subscriptionPackageIdRef.current !== currentPackageId
        ) {
          previousSubscriptionToCancelRef.current = subscriptionCreatedRef.current;
          setPaymentIntentClientSecret(null);
          subscriptionCreatedRef.current = null;
          subscriptionPackageIdRef.current = null;
          try {
            sessionStorage.removeItem(SUBSCRIPTION_CHECKOUT_STORAGE_KEY);
          } catch {
            // Ignore
          }
        }

        if (!paymentIntentClientSecret) {
          try {
            const stored = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SUBSCRIPTION_CHECKOUT_STORAGE_KEY) : null;
            const parsed = stored ? (JSON.parse(stored) as { subscriptionId?: string; invoicePaymentIntentClientSecret?: string | { client_secret?: string }; subscriptionRequestId?: string; ts?: number; packageId?: string }) : null;
            const notStale = parsed?.ts && Date.now() - parsed.ts < SUBSCRIPTION_CHECKOUT_STALE_MS;
            const storedPackageMatches = parsed?.packageId != null && parsed.packageId === currentPackageId;
            const storedSecret = parsed?.invoicePaymentIntentClientSecret;
            const secretStr = typeof storedSecret === "string" ? storedSecret : (storedSecret && typeof storedSecret === "object" && typeof (storedSecret as { client_secret?: string }).client_secret === "string" ? (storedSecret as { client_secret: string }).client_secret : null);
            if (parsed?.subscriptionId && secretStr && notStale && storedPackageMatches) {
              setPaymentIntentClientSecret(secretStr);
              subscriptionCreatedRef.current = parsed.subscriptionId;
              subscriptionPackageIdRef.current = currentPackageId;
              return;
            }
          } catch {
            // Ignore sessionStorage parse errors
          }
        }

        if (!paymentIntentClientSecret) {
          isCreatingSubscriptionRef.current = true;
          setIsCreatingSubscription(true);
          const subscriptionRequestId = crypto.randomUUID();
          const cancelPreviousSubscriptionId = previousSubscriptionToCancelRef.current ?? undefined;
          if (previousSubscriptionToCancelRef.current) previousSubscriptionToCancelRef.current = null;

        const onSuccess = (res: { data?: { subscriptionId?: string; invoicePaymentIntentClientSecret?: string | { client_secret?: string }; clientSecret?: string | { client_secret?: string }; customerId?: string; userId?: string }; subscription?: { id?: string; clientSecret?: string }; success?: boolean }) => {
          const subId = res?.data?.subscriptionId ?? res?.subscription?.id;
          const rawSecret = res?.data?.invoicePaymentIntentClientSecret ?? res?.data?.clientSecret ?? (res as { subscription?: { clientSecret?: string } })?.subscription?.clientSecret;
          const clientSecret = typeof rawSecret === "string" ? rawSecret : (rawSecret && typeof rawSecret === "object" && typeof (rawSecret as { client_secret?: string }).client_secret === "string" ? (rawSecret as { client_secret: string }).client_secret : null);
          if (subId && clientSecret) {
            setPaymentIntentClientSecret(clientSecret);
            setSetupIntentClientSecret(null);
            setCardFormError(null);
            subscriptionCreatedRef.current = subId;
            subscriptionPackageIdRef.current = packageId || null;
            if (res?.data?.userId) userIdRef.current = res.data.userId;
            try {
              sessionStorage.setItem(
                SUBSCRIPTION_CHECKOUT_STORAGE_KEY,
                JSON.stringify({
                  subscriptionId: subId,
                  invoicePaymentIntentClientSecret: clientSecret,
                  subscriptionRequestId,
                  packageId: packageId || undefined,
                  ts: Date.now(),
                })
              );
            } catch {
              // Ignore
            }
          }
          isCreatingSubscriptionRef.current = false;
          setIsCreatingSubscription(false);
        };

        const onError = (err: unknown) => {
          isCreatingSubscriptionRef.current = false;
          setIsCreatingSubscription(false);

          const errCode =
            err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
          const errMsg =
            err instanceof Error ? err.message : "Failed to create subscription. Please try again.";

          if (errCode === "EXISTING_SUBSCRIPTION") {
            showToast({
              type: "error",
              title: "Existing Subscription",
              message: errMsg,
              duration: 10000,
              action: {
                label: "Manage Subscription",
                onClick: () => {
                  router.push("/my-account");
                },
              },
            });
          } else {
            showToast({
              type: "error",
              title: "Subscription Error",
              message: errMsg,
              duration: 6000,
            });
          }
        };

        if (isAuthenticated && userData) {
          if (selectedPaymentMethod) {
            // User has saved/default payment method selected – don't create subscription here; create in handleSubmit with paymentMethodId so first invoice is charged with saved card
            isCreatingSubscriptionRef.current = false;
            setIsCreatingSubscription(false);
          } else {
            createSubscriptionExistingUser({
              packageId: packageId || "",
              subscriptionRequestId,
              cancelPreviousSubscriptionId,
              referralCode: appliedCouponPayload.referralCode,
              affiliateCode: affiliateCode || undefined,
              promoLinkCode: appliedCouponPayload.promoLinkCode,
              campaignCode: appliedCouponPayload.campaignCode,
            })
              .then((result) => result && onSuccess(result as never))
              .catch(onError);
          }
        } else if (guestUserData && packageId) {
          createSubscription({
            userEmail: guestUserData.email,
            firstName: guestUserData.firstName,
            lastName: guestUserData.lastName,
            mobile: guestUserData.mobile,
            packageId,
            subscriptionRequestId,
            cancelPreviousSubscriptionId,
            referralCode: appliedCouponPayload.referralCode,
            affiliateCode: affiliateCode || undefined,
            promoLinkCode: appliedCouponPayload.promoLinkCode,
            campaignCode: appliedCouponPayload.campaignCode,
          })
            .then((result) => result && onSuccess(result as never))
            .catch(onError);
        } else {
          isCreatingSubscriptionRef.current = false;
          setIsCreatingSubscription(false);
        }
        }
      }
    }

    // One-time: ensure PaymentIntent when Step 2 and no secrets yet (do not use SetupIntent for one-time)
    if (
      currentStep === 2 &&
      hasCompletedRegistration &&
      isActualPlan &&
      !setupIntentClientSecret &&
      !paymentIntentClientSecret &&
      activePlan?.period !== "mo" &&
      amountInCents > 0
    ) {
      if (!isCreatingPaymentIntentRef.current) {
        const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
        const packageName = promoEnhancedPlan?.name || activePlan?.name;
        isCreatingPaymentIntentRef.current = true;
        createPaymentIntent.mutate(
          {
            amount: amountInCents,
            currency: "aud",
            packageId: packageId || undefined,
            packageName: packageName,
            userEmail: isAuthenticated ? userData?.email : guestUserData?.email,
            packageType: "one-time",
          },
          {
            onSuccess: (result) => {
              if (result.success && result.client_secret) {
                setPaymentIntentClientSecret(result.client_secret);
                if (result.payment_intent_id) {
                  setPaymentIntentId(result.payment_intent_id);
                }
                setSetupIntentClientSecret(null);
                setCardFormError(null);
                lastPaymentIntentAmountRef.current = amountInCents;
              }
              isCreatingPaymentIntentRef.current = false;
            },
            onError: (error) => {
              console.error("Failed to create PaymentIntent on Step 2 (one-time):", error);
              isCreatingPaymentIntentRef.current = false;
            },
          }
        );
      }
    }

    // For subscriptions: Create PaymentIntent only when in payment flow
    // ✅ CRITICAL: Also recreate if amount changed (switching between membership packages)
    const lastAmount = lastPaymentIntentAmountRef.current;
    const amountChanged = lastAmount !== null && lastAmount !== amountInCents;
    const _needsPaymentIntent = !paymentIntentClientSecret || amountChanged;

    // ✅ REMOVED: Upfront PaymentIntent creation for subscriptions
    // Subscriptions now use invoice PaymentIntent from subscription creation response
    // This prevents multiple PaymentIntents and ensures correct wallet amounts
    // The invoice PaymentIntent will be provided when subscription is created

    // Recreate PaymentIntent/SetupIntent when package/amount changes (for existing card form)
    // Only recreate if card form is shown
    if (showCardForm && (paymentIntentClientSecret || setupIntentClientSecret)) {
      const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
      const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
      const packageName = promoEnhancedPlan?.name || activePlan?.name;
      const isSubscription = activePlan?.period === "mo";

      // ✅ FIX: Prevent double creation - skip if already creating
      if (isCreatingPaymentIntentRef.current) {
        return; // Already creating, skip to prevent duplicate API calls
      }

      // ✅ Option A: Subscription uses invoice PaymentIntent only – no SetupIntent
      if (isSubscription) {
        // Subscription flow: paymentIntentClientSecret comes from create-subscription (or sessionStorage). Do not create SetupIntent; do not clear paymentIntentClientSecret.
        return;
      }

      // For one-time purchases: Create PaymentIntent for wallet display with correct amount
      // ✅ REMOVED: Subscription PaymentIntent creation - subscriptions use invoice PaymentIntent from subscription creation
      if (amountInCents > 0 && !isSubscription) {
        // Check if we need to recreate (amount changed or no PaymentIntent exists yet)
        const lastAmount = lastPaymentIntentAmountRef.current;
        const shouldRecreate = !paymentIntentClientSecret || lastAmount === null || lastAmount !== amountInCents;

        if (shouldRecreate) {
          console.log("🔄 Recreating PaymentIntent for package change:", {
            oldAmount: lastAmount,
            newAmount: amountInCents,
            packageName,
            hasPaymentIntent: !!paymentIntentClientSecret,
          });

          // ✅ FIX: Mark as creating to prevent duplicate calls
          isCreatingPaymentIntentRef.current = true;

          createPaymentIntent.mutate(
            {
              amount: amountInCents,
              currency: "aud",
              packageId: packageId || undefined,
              packageName: packageName,
              userEmail: isAuthenticated ? userData?.email : guestUserData?.email,
              packageType: "one-time", // Only one-time purchases use this endpoint
            },
            {
              onSuccess: (result) => {
                if (result.success && result.client_secret) {
                  setPaymentIntentClientSecret(result.client_secret);
                  if (result.payment_intent_id) {
                    setPaymentIntentId(result.payment_intent_id);
                  }
                  setSetupIntentClientSecret(null); // Clear SetupIntent
                  setCardFormError(null);
                  // Update the ref to track the amount we just created PaymentIntent for
                  lastPaymentIntentAmountRef.current = amountInCents;
                }
                // ✅ FIX: Reset flag after successful creation
                isCreatingPaymentIntentRef.current = false;
              },
              onError: () => {
                // Don't show error toast on package change - user can still proceed
                // ✅ FIX: Reset flag on error so user can retry
                isCreatingPaymentIntentRef.current = false;
              },
            }
          );
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activePlan?.period,
    activePlan?.price,
    activePlan?.name,
    activePlan?.id, // ✅ Added to detect placeholder plan changes
    promoEnhancedPlan?.price,
    promoEnhancedPlan?.name,
    paymentIntentClientSecret,
    setupIntentClientSecret,
    showCardForm, // ✅ Keep to know when card form is shown (removed redundant setShowCardForm to prevent loops)
    currentStep, // ✅ Added to track payment flow step
    isAuthenticated, // ✅ Added to track registration completion
    guestUserData, // ✅ Added to track guest registration completion
    userData?.email,
    guestUserData?.email,
    isOpen, // ✅ Added to prevent Stripe calls when modal is closed
  ]);

  // ✅ First subscription charge (existing user): confirm invoice PaymentIntent client-side after state has updated
  useEffect(() => {
    if (
      !pendingFirstSubscriptionConfirm ||
      !paymentIntentClientSecret ||
      !subscriptionCreatedRef.current ||
      !cardFormRef.current ||
      activePlan?.period !== "mo"
    ) {
      return;
    }
    setPendingFirstSubscriptionConfirm(false);
    const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
    // Brief delay so Payment Element has re-mounted with the invoice client secret
    const t = setTimeout(() => {
      if (!cardFormRef.current) return;
      cardFormRef.current.confirmStripeIntent().then(
      async (result) => {
        if (result.error) {
          await handlePaymentError(result.error, {
            preserveState: true,
            packageId: packageId || "",
            packageName: activePlan?.name ?? "",
          });
          return;
        }
        if (result.paymentIntentId) {
          setPaymentIntentId(result.paymentIntentId);
          try {
            sessionStorage.removeItem(SUBSCRIPTION_CHECKOUT_STORAGE_KEY);
          } catch {
            // Ignore
          }
          const userId = userIdRef.current || guestUserData?.userId;
          const isNewUser = !!userId && !isAuthenticated;
          const successData: Parameters<typeof handlePaymentSuccess>[0] = isNewUser
            ? {
                paymentIntentId: result.paymentIntentId,
                ...(result.paymentMethodId ? { paymentMethodId: result.paymentMethodId } : {}),
                user: {
                  id: userId,
                  email: guestUserData?.email ?? "",
                  firstName: guestUserData?.firstName ?? "",
                  lastName: guestUserData?.lastName ?? "",
                  role: "user",
                  subscription: {
                    packageId: packageId || "",
                    isActive: true,
                    status: "active",
                  },
                  entryWallet: 0,
                  rewardsPoints: 0,
                },
                subscriptionId: subscriptionCreatedRef.current || undefined,
                status: "active",
                paymentIntentStatus: "succeeded",
              }
            : {
                paymentIntentId: result.paymentIntentId,
                ...(result.paymentMethodId ? { paymentMethodId: result.paymentMethodId } : {}),
                subscriptionId: subscriptionCreatedRef.current || undefined,
                status: "active",
                paymentIntentStatus: "succeeded",
              };
          await handlePaymentSuccess(successData);
        }
      },
      (err) => {
        console.error("❌ Deferred subscription confirm failed:", err);
        handlePaymentError(err instanceof Error ? err.message : String(err), {
          preserveState: true,
          packageId: packageId || "",
          packageName: activePlan?.name ?? "",
        });
      }
    );
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- omitting activePlan, handlePaymentError, handlePaymentSuccess to avoid payment flow loops
  }, [
    pendingFirstSubscriptionConfirm,
    paymentIntentClientSecret,
    activePlan?.period,
    activePlan?.name,
    subscriptionPackages,
    oneTimePackages,
    guestUserData?.userId,
    guestUserData?.email,
    guestUserData?.firstName,
    guestUserData?.lastName,
    isAuthenticated,
  ]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formatCardNumber = (value: string) => {
    // Add null/undefined check to prevent runtime errors
    if (!value || typeof value !== "string") {
      return "";
    }

    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = v?.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || "";
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(" ");
    } else {
      return v;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formatExpiryDate = (value: string) => {
    // Add null/undefined check to prevent runtime errors
    if (!value || typeof value !== "string") {
      return "";
    }

    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    if (v.length >= 2) {
      return v.substring(0, 2) + "/" + v.substring(2, 4);
    }
    return v;
  };

  const formatMobileNumber = (value: string) => {
    // Add null/undefined check to prevent runtime errors
    if (!value || typeof value !== "string") {
      return "";
    }

    // Remove all non-digits except +
    const v = value.replace(/[^\d+]/g, "");

    // Handle different input patterns
    if (v.startsWith("+61")) {
      // International format: +61 4XX XXX XXX
      const digits = v.substring(3);
      if (digits.length <= 9) {
        // Format with spaces if we have exactly 9 digits
        if (digits.length === 9) {
          return "+61 " + digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
        }
        // Return partially formatted during typing/auto-fill
        return "+61 " + digits;
      }
      // If longer than expected, return as-is (validation will catch it)
      return v;
    } else if (v.startsWith("61") && v.length > 2) {
      // Country code without +: 61 4XX XXX XXX
      const digits = v.substring(2);
      if (digits.length <= 9) {
        // Format with spaces if we have exactly 9 digits
        if (digits.length === 9) {
          return "+61 " + digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
        }
        // Return partially formatted during typing/auto-fill
        return "+61 " + digits;
      }
      // If longer than expected, return as-is
      return v;
    } else if (v.startsWith("0")) {
      // Domestic format: 04XX XXX XXX
      if (v.length <= 10) {
        // Format with spaces if we have exactly 10 digits
        if (v.length === 10) {
          return v.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3");
        }
        // Return partially formatted during typing/auto-fill
        return v;
      }
      // If longer than expected, return as-is
      return v;
    } else if (v.startsWith("4") || v.startsWith("5")) {
      // Mobile without leading 0: 4XX XXX XXX
      if (v.length <= 9) {
        // Format with spaces if we have exactly 9 digits
        if (v.length === 9) {
          return "0" + v.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
        }
        // Return partially formatted during typing/auto-fill
        return "0" + v;
      }
      // If longer than expected, return as-is
      return v;
    }

    // Return as-is for unrecognized patterns
    return v;
  };

  const validateMobileNumber = (mobile: string): boolean => {
    // Remove spaces and formatting
    const cleaned = mobile.replace(/\s+/g, "");

    // Australian mobile number patterns (explicit patterns for each format)
    const patterns = [
      /^\+61[4-5]\d{8}$/, // +61412345678
      /^61[4-5]\d{8}$/, // 61412345678
      /^0[4-5]\d{8}$/, // 0412345678
      /^[4-5]\d{8}$/, // 412345678
    ];

    return patterns.some((pattern) => pattern.test(cleaned));
  };

  /**
   * Calculate the expected max length for phone number input based on format
   * Returns the maximum allowed length to prevent typing beyond a complete valid number
   */
  const getPhoneMaxLength = (value: string): number => {
    if (!value) return 16; // Default max length
    
    // Remove all non-digits except +
    const cleaned = value.replace(/[^\d+]/g, "");
    
    // Determine format and return appropriate max length (including spaces)
    if (cleaned.startsWith("+61")) {
      // +61 412 345 678 = 15 characters (with spaces)
      return 15;
    } else if (cleaned.startsWith("61")) {
      // Will be formatted to +61 412 345 678 = 15 characters
      return 15;
    } else if (cleaned.startsWith("0")) {
      // 0412 345 678 = 12 characters (with spaces)
      return 12;
    } else if (cleaned.startsWith("4") || cleaned.startsWith("5")) {
      // Will be formatted to 0412 345 678 = 12 characters
      return 12;
    }
    
    // Default to 16 for unrecognized formats
    return 16;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear registration errors when user starts typing
    if (registrationErrors[field as keyof typeof registrationErrors]) {
      setRegistrationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof typeof registrationErrors];
        return newErrors;
      });
    }
  };

  // Registration function
  const handleRegistration = async () => {
    setIsRegistering(true);
    setRegistrationErrors({}); // Clear previous errors

    // Extract promotion slug from current URL if on promotions page
    // Format: /promotions/[slug] -> extract slug
    let promotionSlug: string | undefined;
    try {
      const currentPathname = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
      const promotionsMatch = currentPathname.match(/^\/promotions\/([^/?#]+)/);
      if (promotionsMatch && promotionsMatch[1]) {
        promotionSlug = promotionsMatch[1];
        // console.log(`📊 Captured promotion slug from URL: ${promotionSlug}`);
      }
    } catch {
      // console.warn("⚠️ Could not extract promotion slug from URL:", error);
      // Non-blocking - continue without slug (will default to "milwaukee")
    }

    // Attribution for signup: current URL first, then sessionStorage (from earlier landing)
    let attributionParams: {
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      utm_content?: string;
      utm_term?: string;
      campaign_id?: string;
      adset_id?: string;
      ad_id?: string;
    } = {};
    try {
      if (typeof window !== "undefined") {
        const fromUrl = extractAttributionParams(window.location.search);
        const fromStorage = getStoredUTMParams();
        const hasFromUrl =
          fromUrl.utm_source || fromUrl.utm_medium || fromUrl.utm_campaign || fromUrl.campaign_id || fromUrl.adset_id || fromUrl.ad_id;
        attributionParams = hasFromUrl ? fromUrl : (fromStorage || {});
      }
    } catch {
      // Non-blocking - continue without attribution
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          mobile: formData.phone,
          affiliateCode: affiliateCode || undefined, // Include affiliate code if present
          promotionSlug: promotionSlug, // Include promotion slug if on promotions page
          ...(attributionParams.utm_source && { utm_source: attributionParams.utm_source }),
          ...(attributionParams.utm_medium && { utm_medium: attributionParams.utm_medium }),
          ...(attributionParams.utm_campaign && { utm_campaign: attributionParams.utm_campaign }),
          ...(attributionParams.utm_content && { utm_content: attributionParams.utm_content }),
          ...(attributionParams.utm_term && { utm_term: attributionParams.utm_term }),
          ...(attributionParams.campaign_id && { campaign_id: attributionParams.campaign_id }),
          ...(attributionParams.adset_id && { adset_id: attributionParams.adset_id }),
          ...(attributionParams.ad_id && { ad_id: attributionParams.ad_id }),
        }),
      });

      const result = await response.json();

      if (result.success) {
        // console.log("✅ User registered successfully:", result.data);

        // Track CompleteRegistration event client-side for Meta Pixel Helper visibility
        // Use same EventID from server for deduplication
        try {
          if (result.data.pixelEventId) {
            // Track with EventID for deduplication (same EventID used in server-side Conversions API)
            trackFacebookEvent("CompleteRegistration", {
              eventID: result.data.pixelEventId,
              content_type: "user",
              registration_method: "email",
            });
            // console.log(`📘 Facebook Pixel: CompleteRegistration tracked with EventID: ${result.data.pixelEventId}`);
          } else {
            // Fallback to standard tracking if EventID not available
            trackCompleteRegistration();
            // console.log("📘 Facebook Pixel: CompleteRegistration tracked");
          }
        } catch (pixelError) {
          console.error("❌ Error tracking CompleteRegistration client-side:", pixelError);
          // Non-blocking - continue with registration flow
        }

        // Store guest user data for later use
        setGuestUserData({
          userId: result.data.userId,
          email: result.data.email,
          firstName: result.data.firstName,
          lastName: result.data.lastName,
          mobile: result.data.mobile,
        });

        // Show success toast notification
        showToast({
          type: "success",
          title: "Step 1 Completed!",
          message: `Welcome ${formatNamePart(formData.firstName)}! Now let's set up your payment method to complete your membership.`,
          duration: 8000,
        });

        // Registration successful, proceed to step 2
        setCurrentStep(2);

        // Show card form by default for new users
        setShowCardForm(true);

        // ✅ Option A: Subscription uses invoice PaymentIntent only (no SetupIntent). Effect on step 2 will call create-subscription.
        // One-time: create PaymentIntent here so Payment Element shows correct amount.
        const isSubscription = activePlan?.period === "mo";
        const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
        const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
        const packageName = promoEnhancedPlan?.name || activePlan?.name;

        try {
          if (isSubscription) {
            // Do NOT create SetupIntent for subscription. Effect when currentStep === 2 will call create-subscription (no paymentMethodId) and set paymentIntentClientSecret.
            setCardFormError(null);
          } else if (amountInCents > 0) {
            // For one-time purchases: Use PaymentIntent (shows correct amount in wallets)
            const paymentResult = await createPaymentIntent.mutateAsync({
              amount: amountInCents,
              currency: "aud",
              packageId: packageId || undefined,
              packageName: packageName,
            });

            if (paymentResult.success && paymentResult.client_secret) {
              setPaymentIntentClientSecret(paymentResult.client_secret);
              if (paymentResult.payment_intent_id) {
                setPaymentIntentId(paymentResult.payment_intent_id);
              }
              setSetupIntentClientSecret(null); // Clear SetupIntent
              setCardFormError(null); // Clear any previous errors
              // Track the amount we created PaymentIntent for
              lastPaymentIntentAmountRef.current = amountInCents;
            } else {
              throw new Error(paymentResult.error || "Failed to create PaymentIntent");
            }
          } else {
            // Fallback to SetupIntent if amount is 0 or not available
            const setupResult = await createSetupIntent.mutateAsync();

            if (setupResult.success && setupResult.client_secret) {
              setSetupIntentClientSecret(setupResult.client_secret);
              setPaymentIntentClientSecret(null); // Clear PaymentIntent
              setCardFormError(null); // Clear any previous errors
            } else {
              throw new Error(setupResult.error || "Failed to create SetupIntent");
            }
          }
        } catch (error: unknown) {
          console.error("Failed to create payment intent:", error);

          // Extract detailed error message
          let errorMessage = "Failed to prepare payment form. Please try again.";
          if (error && typeof error === "object" && "response" in error) {
            const apiError = error as { response?: { data?: { error?: string } } };
            if (apiError.response?.data?.error) {
              errorMessage = apiError.response.data.error;
            }
          } else if (error && typeof error === "object" && "message" in error) {
            const err = error as { message: string };
            errorMessage = err.message;
          }

          showToast({
            type: "error",
            title: "Payment Setup Failed",
            message: errorMessage,
            duration: 6000,
          });
          setCardFormError(errorMessage);
        }
      } else {
        // Handle registration errors
        console.error("❌ Registration failed:", result.error);

        // Check if this is an existing account with purchases (non-plain account)
        if (result.isExistingAccount || result.message?.includes("has made purchases")) {
          // Show existing account modal instead of field error
          const conflictField = result.field === "email" ? "email" : "mobile";
          setExistingAccountConflictField(conflictField);
          // Use the existing account email if provided (for mobile conflicts), otherwise use form email
          setExistingAccountEmail(result.existingAccountEmail || formData.email);
          setShowExistingAccountModal(true);
          // Clear any field errors since we're showing a modal
          setRegistrationErrors({});
        } else {
          // Regular validation or other errors
          if (result.field) {
            // Field-specific error
            setRegistrationErrors({
              [result.field]: result.message,
            });
          } else {
            // General error
            setRegistrationErrors({
              general: result.message || "Registration failed. Please try again.",
            });
          }
        }
      }
    } catch (error) {
      console.error("❌ Registration error:", error);
      setRegistrationErrors({
        general: "Registration failed. Please check your connection and try again.",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  /** Clickable step navigation: always allow going back to step 1; allow step 2 only when step 1 is complete (registered or authenticated). */
  const handleStepClick = (step: 1 | 2) => {
    if (step === 1) {
      setCurrentStep(1);
      return;
    }
    if (step === 2 && hasCompletedRegistration) {
      handleRegistration()
      setCurrentStep(2);
    }
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      // Already complete (registered or authenticated): just go to step 2 — do not call register API again
      if (hasCompletedRegistration) {
        handleRegistration()
        setCurrentStep(2);
        return;
      }

      // Validate personal details first
      const personalInfoValid = formData.firstName && formData.lastName && formData.email && formData.phone;
      const mobileValid = validateMobileNumber(formData.phone);

      if (!personalInfoValid) {
        setRegistrationErrors({
          general: "Please fill in all required fields",
        });
        return;
      }

      if (!mobileValid) {
        setRegistrationErrors({
          mobile: "Please enter a valid Australian mobile number (e.g., 0412345678 or +61412345678)",
        });
        return;
      }

      // If validation passes, attempt registration
      handleRegistration();
    }
  };

  const handleCouponApply = useCallback(
    async (source: "manual" | "auto" = "manual") => {
      const normalizedCode = couponCode.trim().toUpperCase();
      if (!normalizedCode) {
        setReferralError("Enter a code before applying.");
        setCouponApplied(false);
        setCouponType(null);
        setReferralInfo(null);
        return;
      }

      setIsValidatingReferral(true);
      setReferralError(null);

      try {
        const inviteeUserId = isAuthenticated ? userData?._id : guestUserData?.userId;
        const rawEmail = isAuthenticated ? userData?.email : guestUserData?.email ?? formData.email ?? undefined;
        const inviteeEmail = rawEmail?.trim() ? rawEmail.trim() : undefined;

        const response = await fetch("/api/codes/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: normalizedCode,
            inviteeUserId,
            inviteeEmail,
            preferType: "auto",
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success || !data.valid) {
          throw new Error(data.message || data.error || "This code is not valid right now.");
        }

        if (data.type === "referral") {
          setCouponCode(normalizedCode);
          setCouponApplied(true);
          setCouponType("referral");
          setReferralInfo({ referrerName: data.data.referrerName });
          setReferralError(null);
          persistReferralCode(normalizedCode);
          clearPromoCode();
          return;
        }

        if (data.type === "promo") {
          setCouponCode(normalizedCode);
          setCouponApplied(true);
          setCouponType("promo");
          setReferralInfo(null);
          setReferralError(null);
          setPromoCode(normalizedCode);
          clearReferralCode();
          return;
        }

        if (data.type === "campaign") {
          setCouponCode(normalizedCode);
          setCouponApplied(true);
          setCouponType("campaign");
          setCampaignPurchaseRequirement(data.data.purchaseRequirement);
          setReferralInfo(null);
          setReferralError(null);
          clearReferralCode();
          clearPromoCode();
          return;
        }

        throw new Error("This code is not valid right now.");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "We couldn't validate that code. Please try again.";
        setReferralError(message);
        setCouponApplied(false);
        setCouponType(null);
        setReferralInfo(null);
        if (source === "auto") {
          clearReferralCode();
          clearPromoCode();
        }
      } finally {
        setIsValidatingReferral(false);
      }
    },
    [
      couponCode,
      isAuthenticated,
      userData?._id,
      userData?.email,
      guestUserData?.userId,
      guestUserData?.email,
      formData.email,
      persistReferralCode,
      setPromoCode,
      clearPromoCode,
      clearReferralCode,
    ]
  );

  useEffect(() => {
    if (!storedReferralCode || couponCode) {
      return;
    }
    setCouponCode(storedReferralCode);
  }, [storedReferralCode, couponCode]);

  useEffect(() => {
    if (
      storedReferralCode &&
      couponCode &&
      couponCode.toUpperCase() === storedReferralCode.toUpperCase() &&
      !couponApplied &&
      !isValidatingReferral
    ) {
      handleCouponApply("auto");
    }
  }, [storedReferralCode, couponCode, couponApplied, isValidatingReferral, handleCouponApply]);

  const handlePackageChange = () => {
    // console.log("🔄 Package Change clicked:", {
    //   activePlanId: activePlan.id,
    //   activePlanName: activePlan.name,
    //   isMiniDrawPackage: activePlan.id.startsWith("mini-pack-"),
    // });

    // Check if current plan is a mini draw package
    const isMiniDrawPackage = activePlan.id.startsWith("mini-pack-");

    if (isMiniDrawPackage) {
      // console.log("📦 Mini draw packages now use SpecialPackagesModal");
      // Mini draw packages are handled through SpecialPackagesModal
      setIsPackageSelectionOpen(true);
    } else {
      // console.log("📦 Opening PackageSelectionModal");
      setIsPackageSelectionOpen(true);
    }
  };

  const handlePackageSelect = (newPlan: LocalMembershipPlan) => {
    // console.log("✅ Package selected:", {
    //   newPlanId: newPlan.id,
    //   newPlanName: newPlan.name,
    //   onPlanChange: !!onPlanChange,
    // });

    // Update the selected plan by calling the parent callback
    if (onPlanChange) {
      onPlanChange(newPlan);
    } else {
      // console.warn("⚠️ onPlanChange callback is not provided!");
    }

    // Close package selection modal
    setIsPackageSelectionOpen(false);
  };

  // Payment method selection handlers
  const handlePaymentMethodSelect = (paymentMethod: SavedPaymentMethod | null) => {
    setSelectedPaymentMethod(paymentMethod);
    setUseSavedPaymentMethod(paymentMethod !== null);
    setShowCardForm(false); // Hide card form when a saved payment method is selected
  };

  const handleAddNewPaymentMethod = async () => {
    try {
      setCardFormError(null); // Clear any previous errors

      if (!isAuthenticated || !userData) {
        // Guard clause: this button should only be reachable for existing members.
        showToast({
          type: "error",
          title: "Profile Not Ready",
          message: "Please make sure you are logged in before adding a new payment method.",
          duration: 5000,
        });
        return;
      }

      if (!userData.email) {
        // Stripe requires an email; guide the team member instead of failing silently.
        showToast({
          type: "error",
          title: "Missing Email",
          message: "This account does not have an email address. Please update the profile before saving a card.",
          duration: 6000,
        });
        return;
      }

      // ✅ FIX: Clear existing SetupIntent to allow creating a new one (for different payment method)
      // This handles the case where SetupIntent already succeeded and user wants to use a different card
      if (setupIntentClientSecret) {
        console.log("🔄 Clearing existing SetupIntent to allow new payment method selection...");
        setSetupIntentClientSecret(null);
        // Force form to remount by briefly hiding it
        setShowCardForm(false);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // ✅ STRIPE BEST PRACTICE: For subscriptions, invoice PaymentIntent is provided by subscription creation
      // For one-time purchases, use PaymentIntent (shows amount in wallets)
      // SetupIntent should NEVER be used for subscriptions as it shows $0.00 in Google Pay/Apple Pay
      const isSubscription = activePlan?.period === "mo";
      const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
      const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
      const packageName = promoEnhancedPlan?.name || activePlan?.name;

      if (isSubscription) {
        // ✅ Option A: Do NOT create SetupIntent for subscription. Use invoice PaymentIntent only (from create-subscription effect on step 2).
        // If paymentIntentClientSecret is not set yet, the step-2 effect will call create-subscription and set it.
        setUseSavedPaymentMethod(false);
        setSelectedPaymentMethod(null);
        setShowCardForm(true);
      } else if (amountInCents > 0) {
        // For one-time purchases: Use PaymentIntent (shows correct amount in wallets)
        const result = await createPaymentIntent.mutateAsync({
          amount: amountInCents,
          currency: "aud",
          packageId: packageId || undefined,
          packageName: packageName,
          userEmail: isAuthenticated ? userData?.email : guestUserData?.email,
          packageType: "one-time", // ✅ Mark as one-time for proper metadata
        });

        if (result.success && result.client_secret) {
          setPaymentIntentClientSecret(result.client_secret);
          if (result.payment_intent_id) {
            setPaymentIntentId(result.payment_intent_id);
          }
          setSetupIntentClientSecret(null); // Clear SetupIntent
          setUseSavedPaymentMethod(false);
          setSelectedPaymentMethod(null);
          setShowCardForm(true);
          // Track the amount we created PaymentIntent for
          lastPaymentIntentAmountRef.current = amountInCents;
        } else {
          throw new Error(result.error || "Failed to create PaymentIntent");
        }
      } else {
        // Fallback to SetupIntent if amount is 0 or not available
        // ✅ STRIPE BEST PRACTICE: For subscriptions, do NOT create upfront PaymentIntent
        // Subscriptions use invoice PaymentIntent created automatically by Stripe
        // This ensures only one PaymentIntent per subscription payment
        if (isSubscription) {
          // For subscriptions, we don't create an upfront PaymentIntent
          // The invoice PaymentIntent will be created when the subscription is created
          // and returned in the subscription creation response
          console.log("ℹ️ Subscription selected - will use invoice PaymentIntent from subscription creation");
          setPaymentIntentClientSecret(null); // Will be set after subscription creation
          setSetupIntentClientSecret(null); // ✅ CRITICAL: Clear SetupIntent - should never exist for subscriptions
          setUseSavedPaymentMethod(false);
          setSelectedPaymentMethod(null);
          setShowCardForm(true);
        } else {
          // For one-time purchases, SetupIntent is not needed - PaymentIntent is created above
          // This else block should not be reached for subscriptions
          throw new Error("Invalid flow: SetupIntent should not be created for subscriptions");
        }
      }
    } catch (error: unknown) {
      console.error("Failed to create SetupIntent:", error);

      // Extract detailed error message
      let errorMessage = "Failed to set up payment method. Please try again.";
      if (error && typeof error === "object" && "response" in error) {
        const apiError = error as { response?: { data?: { error?: string } } };
        if (apiError.response?.data?.error) {
          errorMessage = apiError.response.data.error;
        }
      } else if (error && typeof error === "object" && "message" in error) {
        const err = error as { message: string };
        errorMessage = err.message;
      }

      showToast({
        type: "error",
        title: "Payment Setup Failed",
        message: errorMessage,
        duration: 6000,
      });
      setCardFormError(errorMessage);
    }
  };

  // Card element change handler
  const handleCardElementChange = (event: { error?: { message?: string } }) => {
    setCardFormError(event.error?.message || null);
  };

  // ✅ EXPERT ERROR HANDLING: Universal payment recovery function
  const handlePaymentRecovery = useCallback(async (
    recoveryStrategy: RecoveryStrategy,
    originalError: unknown,
    options?: { skipToasts?: boolean } // ✅ NEW: Option to skip recovery toasts
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      switch (recoveryStrategy) {
        case "setup_intent_recovery": {
          // ✅ FIXED: Only show recovery toasts if not explicitly skipped
          if (!options?.skipToasts) {
            showToast({
              type: "info",
              title: "Recovering payment",
              message: "Detected a recoverable error. Setting up again. Please try again.",
              duration: 3000,
            });
          }

          const recoveryResult = await recoverSetupIntent();
          
          if (!recoveryResult.success || !recoveryResult.clientSecret) {
            return {
              success: false,
              error: recoveryResult.error || "Failed to recover SetupIntent",
            };
          }

          // Update SetupIntent client secret for retry
          setSetupIntentClientSecret(recoveryResult.clientSecret);
          
          // Wait a moment for PaymentElement to remount
          await new Promise((resolve) => setTimeout(resolve, 500));

          // ✅ FIXED: Only show ready toast if not explicitly skipped
          if (!options?.skipToasts) {
            showToast({
              type: "success",
              title: "Ready",
              message: "Payment setup ready. Retrying automatically...",
              duration: 2000,
            });
          }

          return { success: true };
        }

        case "payment_intent_recovery": {
          // PaymentIntent recovery requires payment details
          // This is handled in the specific error handler
          return {
            success: false,
            error: "PaymentIntent recovery requires payment details",
          };
        }

        case "api_retry":
          // Simple retry without recovery
          return { success: true };

        default:
          return {
            success: false,
            error: "No recovery strategy available",
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown recovery error";
      console.error("❌ Payment recovery failed:", errorMessage);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [showToast]);

  // ✅ EXPERT ERROR HANDLING: Universal payment error handler
  const handlePaymentError = useCallback(async (
    error: unknown,
    context: {
      preserveState?: boolean;
      showToast?: boolean;
      autoRetry?: boolean;
      packageId?: string;
      packageName?: string;
      isManualRetry?: boolean; // ✅ NEW: Flag to indicate manual retry
    } = {}
  ): Promise<void> => {
    // Detect error type and category
    const errorDetection = detectPaymentError(error);
    const formattedError = formatPaymentError(error);
    const statePreservation = getStatePreservationInstructions(error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // ✅ NEW: Reset recovery flag if error message changed (new error)
    if (recoveryAttemptedRef.current && recoveryAttemptedRef.current.errorMessage !== errorMessage) {
      recoveryAttemptedRef.current = null;
    }

    // ✅ CRITICAL: Preserve state for ALL errors unless explicitly overridden
    if (context.preserveState !== false && statePreservation.shouldPreserveSetupIntent) {
      // Do NOT clear setupIntentClientSecret
      // Do NOT clear paymentMethodId
      // Do NOT reset form data
    }

    // ✅ ENHANCED: Auto-log ALL payment errors (not just recoverable ones)
    const amountInCents = activePlan?.price ? Math.round(activePlan.price * 100) : undefined;
    
    // ✅ FIXED: Capture user email from form data if not authenticated
    // This ensures we log the user's email even if they haven't completed registration yet
    const capturedUserEmail = isAuthenticated 
      ? userData?.email 
      : (guestUserData?.email || formData.email || undefined);
    
    ErrorLoggingService.logError(error, {
      component: "MembershipModal",
      flow: context.packageId ? "subscription-purchase" : "one-time-purchase",
      paymentIntentId: paymentIntentId || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customerId: (userData as any)?.stripeCustomerId || undefined,
      amount: amountInCents,
      packageId: context.packageId || undefined,
      packageName: context.packageName || activePlan?.name,
      userEmail: isAuthenticated ? capturedUserEmail : undefined,
      guestEmail: !isAuthenticated ? capturedUserEmail : undefined,
    }).catch((logError) => {
      console.warn("Failed to auto-log error:", logError);
      // Fallback to old method if ErrorLoggingService fails
      // ✅ FIXED: Use same email capture logic for fallback
      const paymentErrorDetails: PaymentErrorDetails = {
        paymentIntentId: paymentIntentId || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customerId: (userData as any)?.stripeCustomerId || undefined,
        amount: amountInCents,
        packageId: context.packageId || undefined,
        packageName: context.packageName || activePlan?.name,
        errorMessage: formattedError.message,
        userEmail: isAuthenticated ? capturedUserEmail : undefined,
        guestEmail: !isAuthenticated ? capturedUserEmail : undefined,
      };
      autoLogPaymentError(error, paymentErrorDetails).catch(() => {
        // Silently fail if both methods fail
      });
    });

    // ✅ FIXED: Only attempt automatic recovery if:
    // 1. Not a manual retry (user changed card manually)
    // 2. Error is recoverable
    // 3. autoRetry is not explicitly disabled
    // 4. Recovery hasn't been attempted for this error yet
    const shouldAttemptRecovery = 
      context.autoRetry !== false && 
      errorDetection.isRecoverable && 
      !context.isManualRetry && // ✅ NEW: Skip recovery on manual retry
      (!recoveryAttemptedRef.current || recoveryAttemptedRef.current.errorMessage !== errorMessage); // ✅ NEW: Only recover once per error

    if (shouldAttemptRecovery) {
      // ✅ NEW: Mark recovery as attempted
      recoveryAttemptedRef.current = { errorMessage, attempted: true };
      
      const recoveryResult = await handlePaymentRecovery(
        errorDetection.recoveryStrategy,
        error,
        { skipToasts: false } // Show recovery toasts only on first automatic recovery
      );

      if (recoveryResult.success) {
        // Recovery succeeded - will retry automatically in calling code
        // ✅ FIXED: Don't show error toast if recovery succeeded
        return;
      }

      // Recovery failed - reset flag and show error
      recoveryAttemptedRef.current = null;
      if (context.showToast !== false) {
        showToast({
          type: "error",
          title: formattedError.title,
          message: `${formattedError.message} Please try again.`,
          duration: 5000,
        });
      }
      return;
    }

    // ✅ FIXED: For manual retries or non-recoverable errors, show single error toast
    if (context.showToast !== false) {
      showToast({
        type: "error",
        title: formattedError.title,
        message: formattedError.message,
        duration: 5000,
      });
    }

    // Clear card form errors but preserve state
    setCardFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- formData.email, guestUserData?.email, isAuthenticated omitted to prevent submit handler churn
  }, [
    activePlan,
    paymentIntentId,
    userData,
    showToast,
    handlePaymentRecovery,
  ]);

  const appendCodeBenefits = useCallback(
    (benefits: { text: string; icon: "gift" | "star" | "zap" | "ticket" | "tag"; highlight?: boolean }[]) => {
      if (couponApplied && couponCode) {
        const label = couponType === "campaign" ? "Campaign" : couponType === "referral" ? "Referral" : "Promo";
        benefits.push({
          text: `${label} code ${normalizedCouponCode} applied`,
          icon: "tag",
          highlight: true,
        });
      }
    },
    [couponApplied, couponCode, couponType, normalizedCouponCode]
  );

  /** Same benefit lines as post-purchase success (entries, points, partner) for new and existing users */
  const buildActivationBenefits = useCallback(
    (options?: { entriesOverride?: number }): { text: string; icon: "gift" | "star" | "zap" | "ticket" | "tag" }[] => {
      const benefits: { text: string; icon: "gift" | "star" | "zap" | "ticket" | "tag" }[] = [];
      benefits.push({
        text:
          activePlan.period === "mo"
            ? `${activePlan.name} membership activated`
            : `${activePlan.name} activated`,
        icon: "gift",
      });
      let entriesCount = options?.entriesOverride ?? activePlan.metadata?.entriesCount ?? 0;
      if (entriesCount <= 0) {
        const staticPkg = getPackageById(catalogPackageIdForBenefits);
        if (staticPkg?.type === "subscription" && staticPkg.entriesPerMonth) {
          entriesCount = staticPkg.entriesPerMonth;
        } else if (staticPkg?.type === "one-time" && staticPkg.totalEntries) {
          entriesCount = staticPkg.totalEntries;
        }
      }
      if (entriesCount > 0) {
        benefits.push({
          text:
            activePlan.period === "mo"
              ? `${entriesCount} free entries added every month`
              : `${entriesCount} free entries added to your account`,
          icon: "star",
        });
      }
      if (rewardsEnabled()) {
        const rewardPoints = Math.floor(activePlan.price);
        if (rewardPoints > 0) {
          benefits.push({
            text:
              activePlan.period === "mo"
                ? `${rewardPoints} reward points earned every month`
                : `${rewardPoints} reward points earned`,
            icon: "gift",
          });
        }
      }
      const partnerLine = getPartnerDiscountBenefitTextForPackageId(catalogPackageIdForBenefits);
      if (partnerLine) {
        benefits.push({ text: partnerLine, icon: "tag" });
      }
      return benefits;
    },
    [activePlan, catalogPackageIdForBenefits]
  );

  // Payment processing handlers
  const handlePaymentProcessingSuccess = async (status: PaymentStatusResponse) => {
    // console.log("🎉 Payment processing completed:", status);
    setShowPaymentProcessing(false);

    // ✅ REMOVED: Client-side Facebook Pixel tracking
    // Server-side tracking via grantBenefits → trackPixelPurchase is sufficient and more reliable
    // This prevents duplicate tracking that causes inflated revenue in Facebook Ads

    // Build benefits array with entry information
    const benefits = [];

    // Always show the package activation
    benefits.push({
      text: `${processingPackageName} activated successfully`,
      icon: "gift" as const,
    });

    // Add entry count if available
    if (status.data?.entries && status.data.entries > 0) {
      benefits.push({
        text:
          processingPackageType === "membership"
            ? `${status.data.entries} free entries added every month`
            : `${status.data.entries} free entries added to your account`,
        icon: "star" as const,
      });
    }

    // Add reward points if available and rewards are enabled
    if (rewardsEnabled() && status.data?.points && status.data.points > 0) {
      benefits.push({
        text: `${status.data.points} reward points earned`,
        icon: "zap" as const,
      });
    }

    const partnerLine = getPartnerDiscountBenefitTextForPackageId(
      convertToAPIPlan(activePlan, [...subscriptionPackages, ...oneTimePackages])?._id || activePlan.id
    );
    if (partnerLine) {
      benefits.push({ text: partnerLine, icon: "tag" as const });
    }

    appendCodeBenefits(benefits);

    // Show success modal with entry information
    const purchaseProcessingSubtitle =
      processingPackageType === "membership"
        ? `${processingPackageName} membership activated`
        : `${processingPackageName} activated`;
    showSuccess("Purchase Successful!", purchaseProcessingSubtitle, benefits);

    // ✅ Store original purchase context for combined invoice (if needed for upsells)
    // CRITICAL FIX: Create local variable to avoid React state closure issue
    let contextToPass: OriginalPurchaseContext | null = null;

    // console.log("🔍 Checking invoice context storage:", {
    //   hasPaymentIntentId: !!paymentIntentId,
    //   hasProcessingPackageName: !!processingPackageName,
    //   hasProcessingPackageType: !!processingPackageType,
    //   processingPackageType,
    //   isUpsell: processingPackageType === "upsell",
    // });
    if (paymentIntentId && processingPackageName && processingPackageType && processingPackageType !== "upsell") {
      const isMiniDrawPackage = activePlan.id.startsWith("mini-pack-");
      const packageId = isMiniDrawPackage
        ? activePlan.id
        : lastChargedStaticPackageIdRef.current ??
          getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
          "";

      // Keep "mini-draw" so upsell entry math uses miniDrawPackages (mapping to "one-time" broke base entry lookup → static 10 entries).
      const packageTypeForUpsell = processingPackageType;

      // For mini-draw packages, try to get miniDrawId from payment intent metadata
      let miniDrawId: string | undefined;
      let miniDrawName: string | undefined;
      if (processingPackageType === "mini-draw" && paymentIntentId) {
        try {
          // Fetch payment intent metadata to get miniDrawId
          const response = await fetch(`/api/payment-intent/${paymentIntentId}/metadata`);
          if (response.ok) {
            const metadata = await response.json();
            if (metadata.miniDrawId) {
              miniDrawId = metadata.miniDrawId;
              miniDrawName = metadata.miniDrawName;
              // console.log("📧 Retrieved miniDrawId from payment intent metadata:", miniDrawId);
            }
          }
        } catch {
          // console.warn("⚠️ Could not fetch miniDrawId from payment intent metadata:", error);
        }
      }

      // Get base entries for upsell calculation
      const baseEntries = getPackageBaseEntries({
        packageId: packageId || "",
        packageType: packageTypeForUpsell,
      });

      const multiplierFromMetadata = activePlan.metadata?.promoMultiplier;
      const multiplierValue =
        typeof multiplierFromMetadata === "number"
          ? multiplierFromMetadata
          : typeof multiplierFromMetadata === "string"
            ? parseFloat(multiplierFromMetadata)
            : undefined;

      let appliedPromoForContext: number | undefined;
      if (isMiniDrawPackage || processingPackageType === "mini-draw") {
        const applied =
          multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue)
            ? multiplierValue
            : resolvedMiniMultiplier ?? 1;
        appliedPromoForContext = applied > 1 ? applied : undefined;
      } else if (packageTypeForUpsell === "membership") {
        const applied =
          multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue)
            ? multiplierValue
            : resolvedMembershipMultiplier ?? 1;
        appliedPromoForContext = applied > 1 ? applied : undefined;
      } else {
        const effectiveOneTimeMultiplier =
          getEffectivePromoType(packageId || activePlan.id, "one-time", isMember ?? false) === "membership-packages"
            ? resolvedMembershipMultiplier
            : resolvedOneTimeMultiplier;
        const applied =
          multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue)
            ? multiplierValue
            : effectiveOneTimeMultiplier ?? 1;
        appliedPromoForContext = applied > 1 ? applied : undefined;
      }

      // Create context object in local variable to pass directly (avoids closure issue)
      contextToPass = {
        paymentIntentId,
        packageId: packageId || "",
        packageName: processingPackageName,
        packageType: packageTypeForUpsell,
        price: activePlan.price,
        entries: status.data?.entries || 0,
        baseEntries,
        promoMultiplier: appliedPromoForContext,
        miniDrawId,
        miniDrawName,
      };

      // Also update state for other component uses
      setOriginalPurchaseContext(contextToPass);
      // console.log("📧 Stored original purchase context for invoice finalization", {
      //   miniDrawId,
      //   miniDrawName,
      // });
    } else {
      // console.log("⚠️ Invoice context NOT stored - condition failed");
    }

    // Trigger upsell after successful payment processing
    if (!upsellTriggered) {
      setUpsellTriggered(true);

      // Capture contextToPass in closure to ensure it's available when setTimeout executes
      const finalContextToPass = contextToPass;

      setTimeout(() => {
        // Get the packageId based on package type
        const isMiniDrawPackage = activePlan.id.startsWith("mini-pack-");
        const packageId = isMiniDrawPackage
          ? activePlan.id
          : lastChargedStaticPackageIdRef.current ??
            getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
            "";

        const triggerType = activePlan.period === "one-time" ? "one-time-purchase" : "membership-purchase";
        const packageType = activePlan.period === "mo" ? "membership" : "one-time";

        // console.log("🎯 Triggering upsell from PaymentProcessingScreen:", {
        //   packageName: processingPackageName || activePlan.name,
        //   packageType: processingPackageType || packageType,
        //   packageId,
        //   triggerType,
        //   hasContext: !!finalContextToPass,
        // });

        triggerUpsellModal(
          triggerType,
          processingPackageName || activePlan.name,
          activePlan.price,
          finalContextToPass?.packageId || packageId || undefined,
          packageType,
          finalContextToPass
        );
      }, 2000);
    }

    // Close modal after triggering upsell
    onClose();
  };

  const handlePaymentProcessingError = (error: string) => {
    console.error("❌ Payment processing failed:", error);
    setShowPaymentProcessing(false);
  };

  const handlePaymentProcessingTimeout = () => {
    // console.warn("⏰ Payment processing timed out - showing fallback success");
    setShowPaymentProcessing(false);

    // Show fallback success message since payment was successful
    showSuccess(
      "Purchase Complete!",
      processingPackageType === "membership"
        ? `${processingPackageName} membership activated`
        : `${processingPackageName} activated`,
      [
        { text: `${processingPackageName} activated successfully`, icon: "gift" },
        { text: "Your payment was successful", icon: "star" },
        { text: "Benefits are being processed", icon: "zap" },
        { text: "Check your account shortly", icon: "star" },
      ],
      5000
    );

  };

  // Payment confirmation handlers
  const handlePaymentSuccess = async (data?: {
    autoLogin?: boolean;
    user?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      subscription?: { packageId: string; isActive: boolean; status: string };
      entryWallet: number;
      rewardsPoints: number;
    };
    subscriptionId?: string;
    status?: string;
    paymentIntentStatus?: string;
    paymentIntentId?: string;
    paymentMethodId?: string;
    cardLast4?: string;
    cardBrand?: string;
  }) => {
    const upsellPmFields = {
      ...(data?.paymentMethodId ? { paymentMethodId: data.paymentMethodId } : {}),
      ...(data?.cardLast4 ? { cardLast4: data.cardLast4 } : {}),
      ...(data?.cardBrand ? { cardBrand: data.cardBrand } : {}),
    };
    const effectivePaymentIntentId = data?.paymentIntentId ?? paymentIntentId;

    // Check if this is a new user registration
    if (data?.user) {
      // console.log("🔄 New user registration completed:", data.user);

      try {
        // Get auto-login token from the API
        const autoLoginResponse = await fetch("/api/auth/auto-login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: data.user.id,
            email: data.user.email,
          }),
        });

        const autoLoginData = await autoLoginResponse.json();

        if (autoLoginData.success && autoLoginData.token) {
          // Sign in the user automatically using the token
          const signInResult = await signIn("auto-login", {
            token: autoLoginData.token,
            redirect: false,
          });

          if (signInResult?.ok) {
            // console.log("✅ Auto-login successful");
            const triggerType = activePlan.period === "one-time" ? "one-time-purchase" : "membership-purchase";

            onClose();

            // Mark purchase as completed to prevent mini draw modal conflicts
            markPurchaseCompleted();

            // Invalidate user caches to update UI immediately
            if (userData?._id) {
              invalidateUserCaches(userData._id);
            }

            // Show global success screen instead of alert
            hideLoading();
            {
              const benefits = buildActivationBenefits();
              appendCodeBenefits(benefits);
              showSuccess("Successful!", purchaseSuccessSubtitle, benefits, 3000);
            }

            // Store original purchase context for combined invoice (if paymentIntentId is available)
            // CRITICAL FIX: Create local variable to avoid React state closure issue
            let contextToPass: OriginalPurchaseContext | null = null;

            if (effectivePaymentIntentId) {
              const packageId =
                lastChargedStaticPackageIdRef.current ??
                getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
                "";
              const entriesCount = activePlan.metadata?.entriesCount || 0;
              const packageType = activePlan.period === "mo" ? "membership" : "one-time";

              // Get base entries for upsell calculation
              const baseEntries = getPackageBaseEntries({
                packageId: packageId || "",
                packageType,
              });

              // ✅ FIX: Get the multiplier that was actually applied during the original purchase
              const multiplierFromMetadata = activePlan.metadata?.promoMultiplier;
              const multiplierValue = typeof multiplierFromMetadata === "number" 
                ? multiplierFromMetadata 
                : typeof multiplierFromMetadata === "string" 
                ? parseFloat(multiplierFromMetadata) 
                : undefined;
              const effectiveOneTimeMultiplier =
                packageType === "one-time"
                  ? (getEffectivePromoType(packageId || activePlan.id, "one-time", isMember ?? false) === "membership-packages"
                      ? resolvedMembershipMultiplier
                      : resolvedOneTimeMultiplier)
                  : null;
              const appliedMultiplier =
                multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue)
                  ? multiplierValue
                  : packageType === "membership"
                    ? (resolvedMembershipMultiplier ?? 1)
                    : (effectiveOneTimeMultiplier ?? 1);

              // Create context object in local variable to pass directly (avoids closure issue)
              contextToPass = {
                paymentIntentId: effectivePaymentIntentId,
                packageId: packageId || "",
                packageName: activePlan.name,
                packageType,
                price: activePlan.price,
                entries: entriesCount,
                baseEntries,
                promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined, // Only store if multiplier > 1
                ...upsellPmFields,
              };

              // Also update state for other component uses
              setOriginalPurchaseContext(contextToPass);
              // console.log("📧 Stored original purchase context for invoice finalization (new user)");
            }

            // Add delay to allow authentication to complete before triggering upsell
            // Capture contextToPass in closure to ensure it's available when setTimeout executes
            const finalContextToPass = contextToPass;

            setTimeout(() => {
              // Prevent duplicate upsell calls for new users too
              if (upsellTriggered) {
                // console.log("?? Upsell already triggered for new user, skipping to prevent duplicate API calls");
                return;
              }
              setUpsellTriggered(true); // Mark that we've triggered this once

              // Trigger upsell modal for new user AFTER authentication is complete
              triggerUpsellModal(
                triggerType,
                activePlan.name,
                activePlan.price,
                finalContextToPass?.packageId ||
                  lastChargedStaticPackageIdRef.current ||
                  getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ||
                  undefined,
                activePlan.period === "mo" ? "membership" : "one-time",
                finalContextToPass
              );

              // Add delay to allow upsell modal to show before redirecting
              setTimeout(() => {
                router.push("/my-account");
              }, 2000); // 2 second delay
            }, 1000); // 1 second delay for authentication
            return;
          } else {
            // console.log("❌ Auto-login failed:", signInResult?.error);
            // Show global success screen for account creation
            hideLoading();
            {
              const benefits = buildActivationBenefits();
              appendCodeBenefits(benefits);
              showSuccess("Account Created!", purchaseSuccessSubtitle, benefits, 3000);
            }
          }
        } else {
          // console.log("❌ Failed to get auto-login token:", autoLoginData.error);
          // Show global success screen for account creation
          hideLoading();
          {
            const benefits = buildActivationBenefits();
            appendCodeBenefits(benefits);
            showSuccess("Account Created!", purchaseSuccessSubtitle, benefits, 3000);
          }
        }
      } catch (error) {
        console.error("❌ Auto-login error:", error);
        // Show global success screen for account creation
        hideLoading();
        {
          const benefits = buildActivationBenefits();
          appendCodeBenefits(benefits);
          showSuccess("Account Created!", purchaseSuccessSubtitle, benefits, 3000);
        }
      }

      onClose();
      // Redirect to login page as fallback
      router.push("/login");
      return;
    } else {
      // Existing user flow - handle both subscription and one-time purchases
      const triggerType = activePlan.period === "one-time" ? "one-time-purchase" : "membership-purchase";

      // Mark purchase as completed to prevent mini draw modal conflicts
      markPurchaseCompleted();

      // Invalidate user caches to update UI immediately
      if (userData?._id) {
        invalidateUserCaches(userData._id);
      }

      // Show global success screen
      hideLoading();

      const benefits = buildActivationBenefits();
      appendCodeBenefits(benefits);
      showSuccess("Successful!", purchaseSuccessSubtitle, benefits);

      let entriesCount = activePlan.metadata?.entriesCount ?? 0;
      if (entriesCount <= 0) {
        const staticPkg = getPackageById(catalogPackageIdForBenefits);
        if (staticPkg?.type === "subscription" && staticPkg.entriesPerMonth) {
          entriesCount = staticPkg.entriesPerMonth;
        } else if (staticPkg?.type === "one-time" && staticPkg.totalEntries) {
          entriesCount = staticPkg.totalEntries;
        }
      }

      // Store original purchase context for combined invoice (if needed for upsells)
      // CRITICAL FIX: Create local variable to avoid React state closure issue
      let contextToPass: OriginalPurchaseContext | null = null;

      if (effectivePaymentIntentId && activePlan.period === "one-time") {
        const packageId =
          lastChargedStaticPackageIdRef.current ??
          getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
          "";
        
        // Get base entries for upsell calculation
        const baseEntries = getPackageBaseEntries({
          packageId: packageId || "",
          packageType: "one-time",
        });

        // ✅ FIX: Get the multiplier that was actually applied during the original purchase
        const multiplierFromMetadata = activePlan.metadata?.promoMultiplier;
        const multiplierValue = typeof multiplierFromMetadata === "number" 
          ? multiplierFromMetadata 
          : typeof multiplierFromMetadata === "string" 
          ? parseFloat(multiplierFromMetadata) 
          : undefined;
        const effectiveOneTimeMultiplier =
          getEffectivePromoType(packageId || activePlan.id, "one-time", isMember ?? false) === "membership-packages"
            ? resolvedMembershipMultiplier
            : resolvedOneTimeMultiplier;
        const appliedMultiplier = (multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue))
          ? multiplierValue
          : effectiveOneTimeMultiplier ?? 1;

        // Create context object in local variable to pass directly (avoids closure issue)
        contextToPass = {
          paymentIntentId: effectivePaymentIntentId,
          packageId: packageId || "",
          packageName: activePlan.name,
          packageType: "one-time",
          price: activePlan.price,
          entries: entriesCount,
          baseEntries,
          promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined, // Only store if multiplier > 1
          ...upsellPmFields,
        };
        // Also update state for other component uses
        setOriginalPurchaseContext(contextToPass);
        // console.log("📧 Stored original purchase context for invoice finalization (from handlePaymentSuccess)");
      } else if (effectivePaymentIntentId && activePlan.period === "mo") {
        const packageId =
          lastChargedStaticPackageIdRef.current ??
          getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
          "";
        
        // Get base entries for upsell calculation
        const baseEntries = getPackageBaseEntries({
          packageId: packageId || "",
          packageType: "membership",
        });

        // ✅ FIX: Get the multiplier that was actually applied during the original purchase
        const multiplierFromMetadata = activePlan.metadata?.promoMultiplier;
        const multiplierValue = typeof multiplierFromMetadata === "number" 
          ? multiplierFromMetadata 
          : typeof multiplierFromMetadata === "string" 
          ? parseFloat(multiplierFromMetadata) 
          : undefined;
        const appliedMultiplier = (multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue))
          ? multiplierValue
          : (resolvedMembershipMultiplier ?? 1);

        // Create context object in local variable to pass directly (avoids closure issue)
        contextToPass = {
          paymentIntentId: effectivePaymentIntentId,
          packageId: packageId || "",
          packageName: activePlan.name,
          packageType: "membership",
          price: activePlan.price,
          ...upsellPmFields,
          entries: entriesCount,
          baseEntries,
          promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined, // Only store if multiplier > 1
        };
        // Also update state for other component uses
        setOriginalPurchaseContext(contextToPass);
        // console.log("📧 Stored original purchase context for invoice finalization (subscription)");
      }

      // Trigger upsell modal for existing user after a delay with duplicate prevention
      // Capture contextToPass in closure to ensure it's available when setTimeout executes
      const finalContextToPass = contextToPass;

      setTimeout(() => {
        // Prevent duplicate upsell calls
        if (upsellTriggered) {
          // console.log("?? Upsell already triggered for this purchase, skipping to prevent duplicate API calls");
          return;
        }

        // console.log("?? TRIGGERING UPSELL for existing user:", {
        //   triggerType,
        //   activePlanName: activePlan.name,
        //   activePlanPeriod: activePlan.period,
        //   activePlanPrice: activePlan.price,
        //   subscriptionPackagesCount: subscriptionPackages?.length || 0,
        //   oneTimePackagesCount: oneTimePackages?.length || 0,
        //   packageId: getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]),
        //   hasContext: !!finalContextToPass,
        // });

        setUpsellTriggered(true); // Mark that we've triggered this once

        triggerUpsellModal(
          triggerType,
          activePlan.name,
          activePlan.price,
          finalContextToPass?.packageId ||
            lastChargedStaticPackageIdRef.current ||
            getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ||
            undefined,
          activePlan.period === "mo" ? "membership" : "one-time",
          finalContextToPass
        );

        // Navigate existing user to dashboard (my-account) after success, same as new-user flow
        router.push("/my-account");
      }, 2000); // 2 second delay

      // Close modal after triggering upsell
      onClose();
    }
  };

  // handlePaymentError removed - errors now handled directly in handleSubmit

  const handleSubmit = async () => {
    // Ref + state: ref updates synchronously so a second click cannot slip through before re-render
    if (isSubmitting || checkoutSubmitLockRef.current) {
      console.warn("⚠️ Payment already in progress, ignoring duplicate submission");
      return;
    }

    // Block submit when no real package selected (e.g. still showing placeholder from "package selection first" flow)
    if (isPlaceholderPlan) {
      showToast({
        type: "error",
        title: "Select a package",
        message: "Please choose a membership or one-time package above before purchasing.",
        duration: 5000,
      });
      return;
    }

    if (couponType === "campaign" && campaignPurchaseRequirement) {
      const isSubscription = activePlan?.period === "mo";
      
      if (campaignPurchaseRequirement === "membership" && !isSubscription) {
        showToast({
          type: "error",
          title: "Code not applicable",
          message: "This code is for membership packs only.",
          duration: 5000,
        });
        return;
      }
      
      if (campaignPurchaseRequirement === "one-time" && isSubscription) {
        showToast({
          type: "error",
          title: "Code not applicable",
          message: "This code is for one-time packages only.",
          duration: 5000,
        });
        return;
      }
    }

    checkoutSubmitLockRef.current = true;
    setIsSubmitting(true);

    // Track button click before processing purchase
    try {
      // Track InitiateCheckout event (standard Meta Pixel event)
      // This replaces the non-standard ButtonClick event with the official InitiateCheckout event
      // InitiateCheckout fires when a user starts the checkout process
      const packagePrice = activePlan?.price || 0;

      trackInitiateCheckout({
        value: packagePrice,
        currency: "AUD",
        numItems: 1, // Single membership package
      });
    } catch {
      // Non-blocking - continue with purchase even if tracking fails
      if (process.env.NODE_ENV === "development") {
        // console.warn("Button click tracking failed:", trackingError);
      }
    }

    // Show global loading screen
    showLoading("Processing Purchase", "", [
      "Authorizing payment method",
      "Confirming transaction with Stripe",
      isAuthenticated ? "Activating your membership benefits" : "Creating your account",
      "Granting entries to major draw",
      "Updating your dashboard",
    ]);

    // Declare variables in outer scope for error handling
    let packageId: string | null = null;
    let confirmedPaymentIntentId: string | undefined = undefined;

    try {
      lastChargedStaticPackageIdRef.current = null;

      // Check if this is an upsell purchase using metadata flag
      const isUpsellOffer = activePlan?.metadata?.isUpsellOffer === true;

      if (isUpsellOffer) {
        // Handle upsell plan purchase via upsell API
        // console.log("🎯 Handling upsell purchase:", activePlan.name, {
        //   entriesCount: activePlan.metadata?.entriesCount,
        //   category: activePlan.metadata?.category,
        // });

        // Use optimistic upsell purchase hook
        const result = await purchaseUpsell.mutateAsync({
          offerId: activePlan.id,
          useDefaultPayment: !!(
            useSavedPaymentMethod &&
            selectedPaymentMethod &&
            selectedPaymentMethod.paymentMethodId
          ),
          paymentMethodId: selectedPaymentMethod?.paymentMethodId || undefined,
          userId: userData?._id || "",
          idempotencyKey: crypto.randomUUID(),
        });

        if (result.success) {
          const entriesAdded = activePlan.metadata?.entriesCount || 0;
          // Show global success screen for upsell purchase
          hideLoading();
          showSuccess(
            "Successful!",
            `${entriesAdded} free entries added to your account`,
            [{ text: `${entriesAdded} free entries added to your wallet`, icon: "gift" }],
            3000
          );
          onClose();
          return;
        } else {
          throw new Error("Upsell purchase failed");
        }
      }

      // Check if this is a mini draw package first
      const isMiniDrawPackage = activePlan.id.startsWith("mini-pack-");

      if (isMiniDrawPackage) {
        // For mini draw packages, use the ID directly
        packageId = activePlan.id;
        // console.log("🎲 Mini draw package detected:", packageId);
      } else {
        // Get the real MongoDB ObjectId for regular membership packages
        const allPackages = [...subscriptionPackages, ...oneTimePackages];
        packageId = getPackageId(activePlan, allPackages);

        if (!packageId) {
          throw new Error("Package not found. Please refresh and try again.");
        }
      }

      // Safety check: Prevent users without access from purchasing additional packages
      const isAdditionalPackage = packageId.startsWith("additional-");
      if (isAdditionalPackage && (!isAuthenticated || !hasAdditionalPackageAccess(userData, userMajorDrawStats))) {
        throw new Error(
          "This package requires an active subscription or entries in the current draw. Please subscribe to a membership or enter the draw first to access additional packages."
        );
      }

      // Safety check: Auto-adjust non-member packages to additional packages for users with access
      if (isAuthenticated && hasAdditionalPackageAccess(userData, userMajorDrawStats)) {
        // Simple mapping for non-member to member packages
        const packageMapping: Record<string, string> = {
          "apprentice-pack": "additional-tradie-pack",
          "tradie-pack": "additional-tradie-pack",
          "foreman-pack": "additional-foreman-pack",
          "boss-pack": "additional-boss-pack",
          "power-pack": "additional-power-pack",
          "vip-pack": "additional-vip-pack",
        };

        const adjustedPackageId = packageMapping[packageId] || packageId;
        if (adjustedPackageId !== packageId) {
          // console.log(`🔄 Package auto-adjustment: ${packageId} → ${adjustedPackageId}`);
          // console.log(
          //   `📢 User message: As a member, you've been upgraded to the member-exclusive package with better benefits!`
          // );

          // Update the packageId to the adjusted one
          packageId = adjustedPackageId;
        }
      }

      lastChargedStaticPackageIdRef.current = packageId;

      // ✅ Option A: Subscription with invoice PaymentIntent – confirm client-side only; no confirm-subscription-payment
      // Only use Payment Element when user is paying with the form; if they selected a saved/default payment method, use the saved-method path below instead (avoids "card number is incomplete" on empty Element)
      if (
        activePlan.period === "mo" &&
        subscriptionCreatedRef.current &&
        paymentIntentClientSecret &&
        cardFormRef.current &&
        !(useSavedPaymentMethod && selectedPaymentMethod)
      ) {
        const result = await cardFormRef.current.confirmStripeIntent();
        if (result.error) {
          await handlePaymentError(result.error, {
            preserveState: true,
            packageId: packageId || "",
            packageName: activePlan.name,
          });
          throw new Error(result.error);
        }
        if (result.paymentIntentId) {
          // Succeeded – use original purchase success flow (in-modal success, auto-login, showSuccess, onClose)
          setPaymentIntentId(result.paymentIntentId);
          try {
            sessionStorage.removeItem(SUBSCRIPTION_CHECKOUT_STORAGE_KEY);
          } catch {
            // Ignore
          }
          const userId = userIdRef.current || guestUserData?.userId;
          const isNewUser = !!userId && !isAuthenticated;
          const successData: Parameters<typeof handlePaymentSuccess>[0] = isNewUser
            ? {
                paymentIntentId: result.paymentIntentId,
                ...(result.paymentMethodId ? { paymentMethodId: result.paymentMethodId } : {}),
                user: {
                  id: userId,
                  email: guestUserData?.email || "",
                  firstName: guestUserData?.firstName ?? "",
                  lastName: guestUserData?.lastName ?? "",
                  role: "user",
                  subscription: { packageId: getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) || "", isActive: true, status: "active" },
                  entryWallet: 0,
                  rewardsPoints: 0,
                },
                subscriptionId: subscriptionCreatedRef.current || undefined,
                status: "active",
                paymentIntentStatus: "succeeded",
              }
            : {
                paymentIntentId: result.paymentIntentId,
                ...(result.paymentMethodId ? { paymentMethodId: result.paymentMethodId } : {}),
                subscriptionId: subscriptionCreatedRef.current || undefined,
                status: "active",
                paymentIntentStatus: "succeeded",
              };
          await handlePaymentSuccess(successData);
          return;
        }
        // 3DS redirect will happen – Stripe redirects to return_url; no further action here
        return;
      }

      // Determine payment method to use
      let paymentMethodId: string;
      let isNewPaymentMethod = false;
      // ✅ SINGLE SOURCE OF TRUTH: Capture paymentIntentId from PaymentIntent confirmation
      // (confirmedPaymentIntentId is already declared in outer scope)

      if (useSavedPaymentMethod && selectedPaymentMethod) {
        // Use saved payment method
        paymentMethodId = selectedPaymentMethod.paymentMethodId;
        console.log("�'� Using saved payment method:", paymentMethodId);
      } else if (showCardForm || !isAuthenticated) {
        // For new payment methods or new users, confirm the card form first
        // ✅ FIX: Check if we have a client secret (SetupIntent or PaymentIntent) even if showCardForm is false
        const hasClientSecret = setupIntentClientSecret || paymentIntentClientSecret;

        if ((showCardForm || hasClientSecret) && cardFormRef.current) {
          console.log("💳 Confirming card setup...", {
            showCardForm,
            hasClientSecret,
            hasSetupIntent: !!setupIntentClientSecret,
            hasPaymentIntent: !!paymentIntentClientSecret,
            subscriptionExists: !!subscriptionCreatedRef.current, // ✅ Log if subscription already exists
          });
          const result = await cardFormRef.current.confirmStripeIntent();
          
          // ✅ CRITICAL: Log paymentMethodId extraction for debugging retry scenarios
          if (result.paymentMethodId) {
            console.log("✅ PaymentMethodId extracted from SetupIntent:", result.paymentMethodId);
          } else {
            console.warn("⚠️ No paymentMethodId in confirmStripeIntent result - this may cause issues on retry");
          }

          // ✅ CRITICAL: Handle SetupIntent that already succeeded - create new SetupIntent for new card
          // A succeeded SetupIntent cannot be reused - user entered new card, need new SetupIntent
          if (result.setupIntentAlreadySucceeded) {
            console.log("⚠️ SetupIntent already succeeded. User entered new card - creating new SetupIntent...");
            
            // Clear old SetupIntent and create new one
            setSetupIntentClientSecret(null);
            
            // Create new SetupIntent for new card
            if (!isCreatingSetupIntentRef.current) {
              isCreatingSetupIntentRef.current = true;
              try {
                const setupResult = await createSetupIntent.mutateAsync();
                if (setupResult.success && setupResult.client_secret) {
                  setSetupIntentClientSecret(setupResult.client_secret);
                  console.log("✅ New SetupIntent created for new card");
                  
                  // Wait for PaymentElement to update with new SetupIntent
                  await new Promise((resolve) => setTimeout(resolve, 500));
                  
                  // Retry confirmation with new SetupIntent
                  if (cardFormRef.current) {
                    const retryResult = await cardFormRef.current.confirmStripeIntent();
                    if (retryResult.error) {
                      await handlePaymentError(retryResult.error, {
                        preserveState: true,
                        packageId,
                        packageName: activePlan.name,
                      });
                      throw new Error(retryResult.error);
                    }
                    if (retryResult.paymentMethodId) {
                      paymentMethodId = retryResult.paymentMethodId;
                      console.log("✅ New payment method extracted from new SetupIntent:", paymentMethodId);
                    } else {
                      throw new Error("Failed to extract payment method from new SetupIntent");
                    }
                  } else {
                    throw new Error("Payment form unavailable after SetupIntent creation");
                  }
                } else {
                  throw new Error("Failed to create new SetupIntent");
                }
              } catch (recoveryError) {
                console.error("❌ Failed to create new SetupIntent:", recoveryError);
                await handlePaymentError(recoveryError instanceof Error ? recoveryError.message : "Failed to create new SetupIntent", {
                  preserveState: true,
                  packageId,
                  packageName: activePlan.name,
                });
                throw recoveryError;
              } finally {
                isCreatingSetupIntentRef.current = false;
              }
            } else {
              throw new Error("SetupIntent creation already in progress");
            }
          } else if (result.error?.includes("SETUP_INTENT_CANCELED_RETRY") || 
                     result.needsRecovery) {
            // ✅ STRIPE BEST PRACTICE: Handle canceled SetupIntent - automatic recovery
            // Only canceled SetupIntents need recovery (requires_payment_method with last_setup_error is still valid)
            console.log("⚠️ SetupIntent was canceled, triggering automatic recovery...");
            
            // ✅ EXPERT ERROR HANDLING: Use recovery function for seamless retry
            // Note: handlePaymentRecovery already updates setupIntentClientSecret internally
            const recoveryResult = await handlePaymentRecovery("setup_intent_recovery", result.error);
            
            if (recoveryResult.success) {
              // Recovery succeeded - SetupIntent client secret already updated by handlePaymentRecovery
              console.log("✅ SetupIntent recovery succeeded, retrying with new SetupIntent...");
              
              // Wait for PaymentElement to remount with new SetupIntent (already done in handlePaymentRecovery, but wait a bit more)
              await new Promise((resolve) => setTimeout(resolve, 300));
              
              // Retry confirmation with new SetupIntent
              if (cardFormRef.current) {
                const retryResult = await cardFormRef.current.confirmStripeIntent();
                if (retryResult.error) {
                  // Recovery succeeded but retry failed - show error with state preserved
                  await handlePaymentError(retryResult.error, {
                    preserveState: true,
                    packageId,
                    packageName: activePlan.name,
                  });
                  throw new Error(retryResult.error);
                }
                if (retryResult.paymentMethodId) {
                  paymentMethodId = retryResult.paymentMethodId;
                  console.log("✅ Payment method confirmed after SetupIntent recovery:", paymentMethodId);
                } else {
                  throw new Error("Failed to confirm payment method after SetupIntent recovery.");
                }
              } else {
                throw new Error("Payment form was closed during recovery. Please try again.");
              }
            } else {
              // Recovery failed - show error but allow retry
              await handlePaymentError(result.error || "Failed to recover SetupIntent", {
                preserveState: true,
                packageId,
                packageName: activePlan.name,
              });
              throw new Error(result.error || "SetupIntent recovery failed");
            }
          } else if (result.error) {
            // ✅ CRITICAL FIX: Automatic recovery for canceled PaymentIntent
            // When PaymentIntent is canceled, automatically create a new one and retry
            // Note: Card declines don't need recovery - PaymentIntent can be reused
            if (result.error.includes("PAYMENT_INTENT_CANCELED_RETRY") || 
                (result.error.includes("canceled") && result.error.includes("unexpected_state"))) {
              console.warn("⚠️ PaymentIntent was canceled - automatically creating new PaymentIntent and retrying...");
              
              // ✅ CRITICAL FIX: Clear the canceled PaymentIntent and force form reset
              setPaymentIntentClientSecret(null);
              setPaymentIntentId(null);
              setCardFormError(null); // Clear any previous card errors
              setShowCardForm(false); // Force form to hide and remount
              
              // Automatically create a new PaymentIntent (only for one-time purchases)
              try {
                const isSubscription = activePlan?.period === "mo";
                
                // ✅ STRIPE BEST PRACTICE: For subscriptions, do NOT recreate PaymentIntent
                // Subscriptions use invoice PaymentIntent from subscription creation
                // If PaymentIntent was canceled, user should retry subscription creation
                if (isSubscription) {
                  throw new Error(
                    "Payment was interrupted. Please try subscribing again. The payment form will be reset."
                  );
                }
                
                const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
                // Use existing packageId from outer scope, or get it if not set yet
                const recoveryPackageId = packageId || getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
                const packageName = promoEnhancedPlan?.name || activePlan?.name;
                
                const newPaymentIntentResult = await createPaymentIntent.mutateAsync({
                  amount: amountInCents,
                  currency: "aud",
                  packageId: recoveryPackageId || undefined,
                  packageName: packageName,
                  userEmail: isAuthenticated ? userData?.email : guestUserData?.email,
                  packageType: "one-time", // Only for one-time purchases
                });
                
                if (newPaymentIntentResult.success && newPaymentIntentResult.client_secret) {
                  setPaymentIntentClientSecret(newPaymentIntentResult.client_secret);
                  if (newPaymentIntentResult.payment_intent_id) {
                    setPaymentIntentId(newPaymentIntentResult.payment_intent_id);
                  }
                  lastPaymentIntentAmountRef.current = amountInCents;
                  
                  // ✅ CRITICAL: Force form to show and remount with new PaymentIntent
                  // PaymentElement key includes clientSecret, so it will remount automatically
                  setShowCardForm(true);
                  setCardFormError(null); // Clear any errors
                  
                  // Wait for PaymentElement to remount with new client secret
                  // Increased delay to ensure Elements wrapper remounts completely
                  await new Promise(resolve => setTimeout(resolve, 800));
                  
                  // ✅ CRITICAL: Check if form is still available before retrying
                  // User might have closed the modal during recovery
                  if (!cardFormRef.current) {
                    throw new Error("Payment form was closed. Please try again.");
                  }
                  
                  // Retry the confirmation with the new PaymentIntent
                  console.log("🔄 Retrying payment confirmation with new PaymentIntent...");
                  const retryResult = await cardFormRef.current.confirmStripeIntent();
                  
                  if (retryResult.error) {
                    throw new Error(retryResult.error);
                  } else if (retryResult.paymentMethodId) {
                    paymentMethodId = retryResult.paymentMethodId;
                    if (retryResult.paymentIntentId) {
                      confirmedPaymentIntentId = retryResult.paymentIntentId;
                      setPaymentIntentId(retryResult.paymentIntentId);
                    }
                    console.log("✅ Payment confirmation succeeded after automatic recovery");
                  } else {
                    throw new Error("Failed to confirm card details after retry.");
                  }
                } else {
                  throw new Error(newPaymentIntentResult.error || "Failed to create new PaymentIntent for retry");
                }
              } catch (recoveryError) {
                console.error("❌ Automatic recovery failed:", recoveryError);
                throw new Error("Payment was interrupted. Please try again - a new payment form has been created.");
              }
            } else {
              // For other errors, check if it's a canceled PaymentIntent without the special code
              if (result.error.includes("canceled") || result.error.includes("unexpected_state")) {
                console.warn("⚠️ PaymentIntent was canceled - checking if payment method was already extracted");
                // The payment method might have been extracted before cancellation
                // Check if we can get it from the subscription creation response
                // For now, throw error to let user retry
              }
              throw new Error(result.error);
            }
          } else if (result.paymentMethodId) {
            paymentMethodId = result.paymentMethodId;
            // Store paymentIntentId if PaymentIntent was used
            if (result.paymentIntentId) {
              // ✅ CRITICAL: For subscriptions, the upfront PaymentIntent should NOT be confirmed
              // It's only for wallet display - the invoice PaymentIntent will be used for actual payment
              const isSubscription = activePlan?.period === "mo";
              if (isSubscription) {
                console.log(`ℹ️ Upfront PaymentIntent ${result.paymentIntentId} confirmed for wallet display only - will be cancelled by backend`);
                // Still store it so backend can cancel it, but don't use it for payment confirmation
              }
              confirmedPaymentIntentId = result.paymentIntentId; // Capture for passing to backend (for cancellation)
              setPaymentIntentId(result.paymentIntentId);
            }
            // console.log("✅ Card confirmed successfully:", paymentMethodId);

            // ✅ REMOVED: Early subscription creation causes double subscription creation
            // Subscription will be created once in the main flow (line 2501) to prevent duplicates
            // This follows Stripe best practice: create subscription only when user explicitly purchases
          } else {
            throw new Error("Failed to confirm card details.");
          }
        } else if (selectedPaymentMethod) {
          paymentMethodId = selectedPaymentMethod.paymentMethodId;
        } else if (hasClientSecret && cardFormRef.current) {
          // ✅ FIX: If we have a client secret but showCardForm is false, try to confirm anyway
          console.log("💳 Attempting to confirm with client secret even though showCardForm is false");
          const result = await cardFormRef.current.confirmStripeIntent();

          // ✅ STRIPE BEST PRACTICE: Handle canceled SetupIntent - automatic recovery (second occurrence)
          // Only canceled SetupIntents need recovery (requires_payment_method with last_setup_error is still valid)
          if (result.error?.includes("SETUP_INTENT_CANCELED_RETRY") || 
              result.needsRecovery) {
            console.log("⚠️ SetupIntent was canceled, triggering automatic recovery...");
            
            // ✅ EXPERT ERROR HANDLING: Use recovery function for seamless retry
            // Note: handlePaymentRecovery already updates setupIntentClientSecret internally
            const recoveryResult = await handlePaymentRecovery("setup_intent_recovery", result.error);
            
            if (recoveryResult.success) {
              // Recovery succeeded - SetupIntent client secret already updated by handlePaymentRecovery
              console.log("✅ SetupIntent recovery succeeded, retrying with new SetupIntent...");
              
              // Wait for PaymentElement to remount with new SetupIntent (already done in handlePaymentRecovery, but wait a bit more)
              await new Promise((resolve) => setTimeout(resolve, 300));
              
              // Retry confirmation with new SetupIntent
              if (cardFormRef.current) {
                const retryResult = await cardFormRef.current.confirmStripeIntent();
                if (retryResult.error) {
                  // Recovery succeeded but retry failed - show error with state preserved
                  await handlePaymentError(retryResult.error, {
                    preserveState: true,
                    packageId,
                    packageName: activePlan.name,
                  });
                  throw new Error(retryResult.error);
                }
                if (retryResult.paymentMethodId) {
                  paymentMethodId = retryResult.paymentMethodId;
                  console.log("✅ Payment method confirmed after SetupIntent recovery:", paymentMethodId);
                } else {
                  throw new Error("Failed to confirm payment method after SetupIntent recovery.");
                }
              } else {
                throw new Error("Payment form was closed during recovery. Please try again.");
              }
            } else {
              // Recovery failed - show error but allow retry
              await handlePaymentError(result.error || "Failed to recover SetupIntent", {
                preserveState: true,
                packageId,
                packageName: activePlan.name,
              });
              throw new Error(result.error || "SetupIntent recovery failed");
            }
          } else if (result.error) {
            // ✅ CRITICAL FIX: Automatic recovery for canceled PaymentIntent (second occurrence)
            // When PaymentIntent is canceled, automatically create a new one and retry
            // Note: Card declines don't need recovery - PaymentIntent can be reused
            if (result.error.includes("PAYMENT_INTENT_CANCELED_RETRY") || 
                (result.error.includes("canceled") && result.error.includes("unexpected_state"))) {
              console.warn("⚠️ PaymentIntent was canceled - automatically creating new PaymentIntent and retrying...");
              
              // ✅ CRITICAL FIX: Clear the canceled PaymentIntent and force form reset
              setPaymentIntentClientSecret(null);
              setPaymentIntentId(null);
              setCardFormError(null); // Clear any previous card errors
              setShowCardForm(false); // Force form to hide and remount
              
              // Automatically create a new PaymentIntent (only for one-time purchases)
              try {
                const isSubscription = activePlan?.period === "mo";
                
                // ✅ STRIPE BEST PRACTICE: For subscriptions, do NOT recreate PaymentIntent
                // Subscriptions use invoice PaymentIntent from subscription creation
                // If PaymentIntent was canceled, user should retry subscription creation
                if (isSubscription) {
                  throw new Error(
                    "Payment was interrupted. Please try subscribing again. The payment form will be reset."
                  );
                }
                
                const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
                // Use existing packageId from outer scope, or get it if not set yet
                const recoveryPackageId = packageId || getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
                const packageName = promoEnhancedPlan?.name || activePlan?.name;
                
                const newPaymentIntentResult = await createPaymentIntent.mutateAsync({
                  amount: amountInCents,
                  currency: "aud",
                  packageId: recoveryPackageId || undefined,
                  packageName: packageName,
                  userEmail: isAuthenticated ? userData?.email : guestUserData?.email,
                  packageType: "one-time", // Only for one-time purchases
                });
                
                if (newPaymentIntentResult.success && newPaymentIntentResult.client_secret) {
                  setPaymentIntentClientSecret(newPaymentIntentResult.client_secret);
                  if (newPaymentIntentResult.payment_intent_id) {
                    setPaymentIntentId(newPaymentIntentResult.payment_intent_id);
                  }
                  lastPaymentIntentAmountRef.current = amountInCents;
                  
                  // ✅ CRITICAL: Force form to show and remount with new PaymentIntent
                  // PaymentElement key includes clientSecret, so it will remount automatically
                  setShowCardForm(true);
                  setCardFormError(null); // Clear any errors
                  
                  // Wait for PaymentElement to remount with new client secret
                  // Increased delay to ensure Elements wrapper remounts completely
                  await new Promise(resolve => setTimeout(resolve, 800));
                  
                  // ✅ CRITICAL: Check if form is still available before retrying
                  // User might have closed the modal during recovery
                  if (!cardFormRef.current) {
                    throw new Error("Payment form was closed. Please try again.");
                  }
                  
                  // Retry the confirmation with the new PaymentIntent
                  console.log("🔄 Retrying payment confirmation with new PaymentIntent...");
                  const retryResult = await cardFormRef.current.confirmStripeIntent();
                  
                  if (retryResult.error) {
                    throw new Error(retryResult.error);
                  } else if (retryResult.paymentMethodId) {
                    paymentMethodId = retryResult.paymentMethodId;
                    if (retryResult.paymentIntentId) {
                      confirmedPaymentIntentId = retryResult.paymentIntentId;
                      setPaymentIntentId(retryResult.paymentIntentId);
                    }
                    console.log("✅ Payment confirmation succeeded after automatic recovery");
                  } else {
                    throw new Error("Failed to confirm card details after retry.");
                  }
                } else {
                  throw new Error(newPaymentIntentResult.error || "Failed to create new PaymentIntent for retry");
                }
              } catch (recoveryError) {
                console.error("❌ Automatic recovery failed:", recoveryError);
                throw new Error("Payment was interrupted. Please try again - a new payment form has been created.");
              }
            } else {
              // For other errors, check if it's a canceled PaymentIntent without the special code
              if (result.error.includes("canceled") || result.error.includes("unexpected_state")) {
                console.warn("⚠️ PaymentIntent was canceled - checking if payment method was already extracted");
              }
              throw new Error(result.error);
            }
          } else if (result.paymentMethodId) {
            paymentMethodId = result.paymentMethodId;
            if (result.paymentIntentId) {
              confirmedPaymentIntentId = result.paymentIntentId;
              setPaymentIntentId(result.paymentIntentId);
            }
          } else {
            throw new Error("Failed to confirm card details.");
          }
        } else {
          throw new Error("Please complete the card details to add a new payment method.");
        }
        isNewPaymentMethod = true;
        console.log("💳 Using new payment method:", paymentMethodId);
      } else {
        // For authenticated users: No payment method selected and card form not shown
        throw new Error("Please select a payment method or add a new one");
      }

      let result;

      const oneTimeCheckoutIdempotencyKey = crypto.randomUUID();

      // Handle mini draw package purchase
      if (isMiniDrawPackage) {
        // console.log("🎲 Processing mini draw package purchase:", activePlan.name);

        // Use the mini draw purchase hook
        const miniDrawResult = await purchaseMembership.mutateAsync({
          packageId: packageId,
          userId: userData?._id || "",
          paymentMethodId,
          idempotencyKey: oneTimeCheckoutIdempotencyKey,
          referralCode: appliedCouponPayload.referralCode,
          affiliateCode: affiliateCode || undefined,
          promoLinkCode: appliedCouponPayload.promoLinkCode,
          campaignCode: appliedCouponPayload.campaignCode,
        });

        if (miniDrawResult) {
          // console.log("✅ Mini draw purchase successful:", miniDrawResult);

          // Check if we have paymentIntentId for PaymentProcessingScreen
          let paymentIntentId: string | null = null;

          // Handle API response structure - paymentIntent is at root level
          if (
            "paymentIntent" in miniDrawResult &&
            miniDrawResult.paymentIntent &&
            typeof miniDrawResult.paymentIntent === "object" &&
            "id" in miniDrawResult.paymentIntent
          ) {
            paymentIntentId = (miniDrawResult.paymentIntent as { id: string }).id || null;
          }
          // Handle MembershipResponse type (from optimistic hook)
          else if ("data" in miniDrawResult && miniDrawResult.data && "paymentIntent" in miniDrawResult.data) {
            paymentIntentId = miniDrawResult.data.paymentIntent?.id || null;
          }
          // Handle SubscriptionResult type (from old hook)
          else if ("paymentIntentId" in miniDrawResult && miniDrawResult.paymentIntentId) {
            paymentIntentId = miniDrawResult.paymentIntentId as string;
          }

          if (paymentIntentId) {
            // console.log("🎯 Using PaymentProcessingScreen for mini draw purchase");

            markPurchaseCompleted();
            hideLoading();

            // Set up PaymentProcessingScreen
            setPaymentIntentId(paymentIntentId);
            setProcessingPackageName(activePlan.name);
            setProcessingPackageType("mini-draw");
            setShowPaymentProcessing(true);
          } else {
            // Fallback to success screen
            const triggerType = "one-time-purchase";

            markPurchaseCompleted();
            hideLoading();

            // Build benefits array with entry information
            const benefits = [];

            // Add package activation message
            benefits.push({
              text: `${activePlan.name} activated`,
              icon: "gift" as const,
            });

            // Add entries if available
            const entriesCount = activePlan.metadata?.entriesCount || 0;
            if (entriesCount > 0) {
              benefits.push({
                text: `${entriesCount} free entries added to your account`,
                icon: "star" as const,
              });
            }

            // Add reward points if available and rewards are enabled
            if (rewardsEnabled()) {
              const rewardPoints = Math.floor(activePlan.price);
              if (rewardPoints > 0) {
                benefits.push({
                  text: `${rewardPoints} reward points earned`,
                  icon: "gift" as const,
                });
              }
            }

            appendCodeBenefits(benefits);
            showSuccess("Successful!", purchaseSuccessSubtitle, benefits);

            // Trigger upsell modal after a delay with duplicate prevention
            setTimeout(() => {
              if (upsellTriggered) {
                // console.log("🎯 Upsell already triggered for mini draw purchase, skipping");
                return;
              }

              setUpsellTriggered(true);

              // Note: For mini-draw fallback case, we don't have paymentIntentId, so originalPurchaseContext can't be set
              // This is a fallback path when paymentIntentId is not available
              triggerUpsellModal(
                triggerType,
                activePlan.name,
                activePlan.price,
                packageId || undefined,
                "one-time",
                null
              );
            }, 2000);

            onClose();
          }
        } else {
          throw new Error("Failed to complete mini draw purchase. Please try again.");
        }

        return; // Exit early for mini draw packages
      }

      if (isAuthenticated) {
        // Existing user purchase - no personal details needed
        // console.log("🚀 Creating purchase for existing user:", userData?.email);

        if (activePlan.period === "mo") {
          // Subscription for existing user
          // When paying with saved PM we must always call the API so the backend can charge the first invoice.
          // Only reuse cached subscription when using Payment Element (no saved method) to avoid duplicate creation.
          const payingWithSavedMethod = !!(useSavedPaymentMethod && selectedPaymentMethod);
          const canReuseSubscription = subscriptionCreatedRef.current && !payingWithSavedMethod;

          if (canReuseSubscription) {
            console.log(
              "⚠️ Subscription already created (Payment Element flow), reusing:",
              subscriptionCreatedRef.current
            );
            result = {
              success: true,
              data: {
                subscriptionId: subscriptionCreatedRef.current,
                clientSecret: paymentIntentClientSecret || undefined,
                userId: userIdRef.current || undefined,
              },
              subscription: {
                id: subscriptionCreatedRef.current,
                status: "incomplete",
                clientSecret: paymentIntentClientSecret || undefined,
              },
            };
          } else {
            // ✅ Always call API when paying with saved method; or create when no subscription exists yet
            const userEmail = userData?.email || "unknown";
            const idempotencyKey = `sub_${packageId}_${userEmail}_${Date.now()}`;
            const promoLinkCodeToSend = appliedCouponPayload.promoLinkCode;
            const cancelPreviousSubscriptionId = previousSubscriptionToCancelRef.current ?? undefined;
            if (previousSubscriptionToCancelRef.current) previousSubscriptionToCancelRef.current = null;

            result = await createSubscriptionExistingUser({
              packageId,
              paymentMethodId,
              idempotencyKey,
              cancelPreviousSubscriptionId,
              referralCode: appliedCouponPayload.referralCode,
              affiliateCode: affiliateCode || undefined,
              promoLinkCode: promoLinkCodeToSend,
              campaignCode: appliedCouponPayload.campaignCode,
            });

            if (result?.success && result.subscription?.id) {
              subscriptionCreatedRef.current = result.subscription.id;
              console.log("✅ Subscription created and tracked:", result.subscription.id);
            }
          }
        } else {
          // One-time purchase for existing user using optimistic updates
          result = await purchaseMembership.mutateAsync({
            packageId,
            userId: userData?._id || "",
            paymentMethodId,
            idempotencyKey: oneTimeCheckoutIdempotencyKey,
            referralCode: appliedCouponPayload.referralCode,
            affiliateCode: affiliateCode || undefined,
            promoLinkCode: appliedCouponPayload.promoLinkCode,
            campaignCode: appliedCouponPayload.campaignCode,
          });
        }

        // console.log("✅ Purchase successful for existing user:", result);

        // Automatically save payment method if it's new and user is authenticated
        if (isNewPaymentMethod) {
          try {
            await savePaymentMethod(paymentMethodId, true); // Set as default
            // console.log("💾 Payment method saved automatically");
          } catch {
            // console.warn("Could not save payment method:", error);
          }
        }

        // Handle subscription payment confirmation directly for existing users
        if (activePlan.period === "mo") {
          // ✅ Clean separation: Data extraction using utility function
          const subscriptionData = extractSubscriptionData(result);
          
          if (!subscriptionData || !validateSubscriptionResponse(subscriptionData)) {
            const error = handleInvalidResponseError(result);
            console.error(`❌ ${error.message}`);
            showToast({
              type: "error",
              title: "Subscription Error",
              message: error.userMessage,
              duration: 6000,
            });
            throw new Error(error.message);
          }

          // When subscription was created with saved payment method, Stripe may have charged the first invoice already – show success immediately
          const resultSub = (result as { subscription?: { id?: string; status?: string } })?.subscription;
          if (resultSub?.status === "active" && paymentMethodId) {
            hideLoading();
            const piFromResult = (result as { paymentIntent?: { id?: string } })?.paymentIntent?.id;
            const piFromSecret = subscriptionData.clientSecret?.split("_secret_")[0];
            const resolvedPi = piFromResult || paymentIntentId || piFromSecret;
            await handlePaymentSuccess(
              resolvedPi
                ? {
                    subscriptionId: resultSub.id,
                    status: "active",
                    paymentIntentStatus: "succeeded",
                    paymentIntentId: resolvedPi,
                    paymentMethodId,
                  }
                : {
                    subscriptionId: resultSub.id,
                    status: "active",
                    paymentIntentStatus: "succeeded",
                  }
            );
            return;
          }

          // ✅ Clean separation: State update using utility function
          const stateUpdate = createSubscriptionStateUpdate(subscriptionData);
          
          // Update React state with invoice PaymentIntent client_secret
          if (stateUpdate.clientSecret) {
            setPaymentIntentClientSecret(stateUpdate.clientSecret);
            const invoicePIId = stateUpdate.clientSecret.split("_secret_")[0];
            console.log(`✅ Using invoice PaymentIntent ${invoicePIId} for subscription payment`);
          }

          // ✅ First subscription charge must be confirmed in the browser (Stripe requirement).
          // Do NOT call confirm-subscription-payment; trigger client-side confirm after Payment Element has the invoice secret.
          setSetupIntentClientSecret(null); // So Elements use invoice PaymentIntent, not SetupIntent
          setPendingFirstSubscriptionConfirm(true);
          return;
        } else if (activePlan.period === "one-time") {
          // console.log("🚀 One-time purchase completed for existing user");

          // Check if we have paymentIntentId for PaymentProcessingScreen
          let paymentIntentId: string | null = null;

          // Handle different response structures
          // Priority 1: Check root level paymentIntent (one-time packages from create-one-time-purchase-existing-user)
          if ("paymentIntent" in result && result.paymentIntent) {
            // Handle API response with paymentIntent at root level
            paymentIntentId =
              typeof result.paymentIntent === "string" ? result.paymentIntent : result.paymentIntent.id || null;
            // console.log("🔍 Extracted paymentIntentId from result.paymentIntent:", paymentIntentId);
          }
          // Priority 2: Check nested data.paymentIntent (some response formats)
          else if ("data" in result && result.data && "paymentIntent" in result.data) {
            paymentIntentId = result.data.paymentIntent?.id || null;
            // console.log("🔍 Extracted paymentIntentId from result.data.paymentIntent:", paymentIntentId);
          }
          // Priority 3: Check data.paymentIntentId (mini-draw packages)
          else if ("data" in result && result.data && "paymentIntentId" in result.data) {
            paymentIntentId = result.data.paymentIntentId as string;
            // console.log("🔍 Extracted paymentIntentId from result.data.paymentIntentId:", paymentIntentId);
          }
          // Priority 4: Check root level paymentIntentId (legacy format)
          else if ("paymentIntentId" in result && result.paymentIntentId) {
            paymentIntentId = result.paymentIntentId as string;
            // console.log("🔍 Extracted paymentIntentId from result.paymentIntentId:", paymentIntentId);
          } else {
            // console.log("⚠️ Could not extract paymentIntentId from result. Result structure:", {
            //   hasPaymentIntent: "paymentIntent" in result,
            //   hasData: "data" in result,
            //   hasPaymentIntentId: "paymentIntentId" in result,
            //   resultKeys: Object.keys(result || {}),
            // });
          }

          if (paymentIntentId) {
            // console.log(
            //   "🎯 Using PaymentProcessingScreen for one-time purchase with paymentIntentId:",
            //   paymentIntentId
            // );

            markPurchaseCompleted();
            hideLoading();

            // Set up PaymentProcessingScreen
            setPaymentIntentId(paymentIntentId);
            setProcessingPackageName(activePlan.name);
            setProcessingPackageType("one-time");
            setShowPaymentProcessing(true);
          } else {
            // Fallback to old success screen
            const triggerType = activePlan.period === "one-time" ? "one-time-purchase" : "membership-purchase";

            markPurchaseCompleted();
            hideLoading();

            // Build benefits array with entry and reward information
            const benefits = [];

            // Add package activation message
            benefits.push({
              text: `${activePlan.name} activated`,
              icon: "gift" as const,
            });

            // Add entries if available
            const entriesCount = activePlan.metadata?.entriesCount || 0;
            if (entriesCount > 0) {
              benefits.push({
                text: `${entriesCount} free entries added to your account`,
                icon: "star" as const,
              });
            }

            // Add reward points if available and rewards are enabled (using a default calculation)
            // For one-time packages, reward points are typically 1 point per dollar spent
            if (rewardsEnabled()) {
              const rewardPoints = Math.floor(activePlan.price); // Price is already in dollars
              if (rewardPoints > 0) {
                benefits.push({
                  text: `${rewardPoints} reward points earned`,
                  icon: "gift" as const,
                });
              }
            }

            appendCodeBenefits(benefits);
            showSuccess("Successful!", purchaseSuccessSubtitle, benefits);

            // Attempt to recover paymentIntentId even in fallback path
            let fallbackPaymentIntentId: string | null = null;

            if ("paymentIntent" in result && result.paymentIntent) {
              fallbackPaymentIntentId =
                typeof result.paymentIntent === "string" ? result.paymentIntent : result.paymentIntent.id || null;
            } else if ("data" in result && result.data && "paymentIntent" in result.data) {
              fallbackPaymentIntentId = result.data.paymentIntent?.id || null;
            } else if ("data" in result && result.data && "paymentIntentId" in result.data) {
              fallbackPaymentIntentId = result.data.paymentIntentId as string;
            } else if ("paymentIntentId" in result && result.paymentIntentId) {
              fallbackPaymentIntentId = result.paymentIntentId as string;
            }

            let fallbackContext: OriginalPurchaseContext | null = null;
            if (fallbackPaymentIntentId) {
              const packageId =
                lastChargedStaticPackageIdRef.current ??
                getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
                "";
              const entriesCount = activePlan.metadata?.entriesCount || 0;

              // Get base entries for upsell calculation
              const baseEntries = getPackageBaseEntries({
                packageId: packageId || "",
                packageType: "one-time",
              });

              const multiplierFromMetadata = activePlan.metadata?.promoMultiplier;
              const multiplierValue =
                typeof multiplierFromMetadata === "number"
                  ? multiplierFromMetadata
                  : typeof multiplierFromMetadata === "string"
                    ? parseFloat(multiplierFromMetadata)
                    : undefined;
              const effectiveOneTimeMultiplier =
                getEffectivePromoType(packageId || activePlan.id, "one-time", isMember ?? false) === "membership-packages"
                  ? resolvedMembershipMultiplier
                  : resolvedOneTimeMultiplier;
              const appliedMultiplier =
                multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue)
                  ? multiplierValue
                  : effectiveOneTimeMultiplier ?? 1;

              fallbackContext = {
                paymentIntentId: fallbackPaymentIntentId,
                packageId: packageId || "",
                packageName: activePlan.name,
                packageType: "one-time",
                price: activePlan.price,
                entries: entriesCount,
                baseEntries,
                promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined,
              };

              setOriginalPurchaseContext(fallbackContext);
              // console.log("📧 Stored original purchase context for invoice finalization (fallback path)");
            } else {
              // console.warn("⚠️ Fallback path could not extract paymentIntentId - invoice finalization may be delayed");
            }

            // Trigger upsell modal for existing user after a delay with duplicate prevention
            const finalFallbackContext = fallbackContext;
            setTimeout(() => {
              // Prevent duplicate upsell calls
              if (upsellTriggered) {
                // console.log("🎯 Upsell already triggered for this purchase, skipping to prevent duplicate API calls");
                return;
              }

              // console.log("🎯 TRIGGERING UPSELL for existing user:", {
              //   triggerType,
              //   activePlanName: activePlan.name,
              //   activePlanPeriod: activePlan.period,
              //   activePlanPrice: activePlan.price,
              //   subscriptionPackagesCount: subscriptionPackages?.length || 0,
              //   oneTimePackagesCount: oneTimePackages?.length || 0,
              //   packageId: getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]),
              // });

              setUpsellTriggered(true); // Mark that we've triggered this once

              triggerUpsellModal(
                triggerType,
                activePlan.name,
                activePlan.price,
                finalFallbackContext?.packageId ||
                  lastChargedStaticPackageIdRef.current ||
                  getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ||
                  undefined,
                activePlan.period === "mo" ? "membership" : "one-time",
                finalFallbackContext || originalPurchaseContext
              );
            }, 2000); // 2 second delay

            // Close modal after triggering upsell
            onClose();
          }
        } else {
          // Show global success screen for other cases
          hideLoading();
          showSuccess(
            "Successful!",
            purchaseSuccessSubtitle,
            [{ text: "Free entries have been added to your wallet", icon: "gift" }],
            3000
          );

          // Trigger upsell modal
          triggerUpsellModal(
            activePlan.period === "mo" ? "membership-purchase" : "one-time-purchase",
            activePlan.name,
            activePlan.price,
            originalPurchaseContext?.packageId ||
              lastChargedStaticPackageIdRef.current ||
              getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ||
              undefined,
            activePlan.period === "mo" ? "membership" : "one-time",
            originalPurchaseContext
          );

          // Close modal and exit early
          onClose();
          return;
        }
      } else {
        // New user purchase (user already registered in step 1)
        if (!guestUserData) {
          throw new Error("User registration data not found. Please try registering again.");
        }

        // console.log("🚀 Creating purchase for newly registered user:", guestUserData.email);

        // ✅ STRIPE BEST PRACTICE: Check if subscription was already created to prevent duplicate creation
        // Use ref to track subscription creation (more reliable than checking paymentIntentId format)
        // ✅ CRITICAL: Even if subscription exists, we still need to confirm the new SetupIntent to get the new paymentMethodId
        // The paymentMethodId from confirmStripeIntent() above should already be extracted, but we verify it's available
        if (activePlan.period === "mo" && subscriptionCreatedRef.current) {
          // Subscription was already created - skip duplicate creation
          console.log("✅ Subscription already created, skipping duplicate creation:", subscriptionCreatedRef.current);
          console.log("💳 Current paymentMethodId from SetupIntent:", paymentMethodId);
          
          // ✅ CRITICAL: Ensure paymentMethodId is available from the new SetupIntent confirmation
          // If paymentMethodId is not set, it means confirmStripeIntent() was skipped - try to call it now
          if (!paymentMethodId) {
            console.warn("⚠️ paymentMethodId is missing - confirmStripeIntent() may have been skipped. Attempting to confirm now...");
            
            // Try to confirm SetupIntent if we have a client secret and card form
            if ((showCardForm || setupIntentClientSecret || paymentIntentClientSecret) && cardFormRef.current) {
              try {
                const retryResult = await cardFormRef.current.confirmStripeIntent();
                if (retryResult.paymentMethodId) {
                  paymentMethodId = retryResult.paymentMethodId;
                  console.log("✅ Successfully extracted paymentMethodId on retry:", paymentMethodId);
                } else if (retryResult.error) {
                  console.error("❌ confirmSetup() failed on retry:", retryResult.error);
                  throw new Error(retryResult.error || "Payment method confirmation failed. Please try again.");
                } else {
                  throw new Error("Failed to confirm payment method. Please enter your card details again.");
                }
              } catch (retryError) {
                console.error("❌ Failed to confirm SetupIntent on retry:", retryError);
                throw new Error("Payment method confirmation failed. Please enter your card details again.");
              }
            } else {
              console.error("❌ Cannot retry confirmStripeIntent() - missing client secret or card form");
              throw new Error("Payment method confirmation failed. Please enter your card details again.");
            }
          }
          
          // Retrieve the existing subscription data
          result = {
            success: true,
            data: {
              subscriptionId: subscriptionCreatedRef.current,
              clientSecret: paymentIntentClientSecret || undefined,
              userId: userIdRef.current || undefined, // ✅ Include userId from ref for retry scenarios
            },
          };
        } else {
          // Prepare subscription data for new user
          // ✅ STRIPE BEST PRACTICE: For subscriptions, pass upfront PaymentIntent ID for wallet display
          // ✅ For one-time purchases, pass paymentIntentId to reuse confirmed PaymentIntent (prevent double charge)
          const subscriptionData = {
            userEmail: guestUserData.email,
            firstName: guestUserData.firstName,
            lastName: guestUserData.lastName,
            mobile: guestUserData.mobile,
            packageId,
            paymentMethodId, // Payment method from SetupIntent
            // ✅ STRIPE BEST PRACTICE: Subscriptions use invoice PaymentIntent (no upfront PaymentIntent needed)
            // For one-time purchases: Reuse confirmed PaymentIntent to prevent double charge
            ...(activePlan.period !== "mo" && confirmedPaymentIntentId
              ? { paymentIntentId: confirmedPaymentIntentId }
              : {}),
            referralCode: appliedCouponPayload.referralCode,
            affiliateCode: affiliateCode || undefined,
            promoLinkCode: appliedCouponPayload.promoLinkCode,
            campaignCode: appliedCouponPayload.campaignCode,
          };

          console.log(
            `[MEMBERSHIP MODAL] Creating subscription (new user) with promoLinkCode:`,
            subscriptionData.promoLinkCode
          );

          // console.log("📦 Subscription data:", subscriptionData);

          // ✅ STRIPE BEST PRACTICE: Create subscription or one-time purchase ONCE
          // Use idempotency key to prevent duplicate creation even on retries/double-clicks
          if (activePlan.period === "mo") {
            // ✅ CRITICAL: Check again if subscription was created (race condition protection)
            if (subscriptionCreatedRef.current) {
              console.log("⚠️ Subscription already created during request, skipping:", subscriptionCreatedRef.current);
              result = {
                success: true,
                data: {
                  subscriptionId: subscriptionCreatedRef.current,
                  clientSecret: paymentIntentClientSecret || undefined,
                },
              };
            } else {
              // ✅ STRIPE BEST PRACTICE: Generate idempotency key to prevent duplicate subscription creation
              // Format: sub_{packageId}_{userEmail}_{timestamp} - ensures uniqueness per purchase attempt
              const idempotencyKey = `sub_${packageId}_${guestUserData.email}_${Date.now()}`;

              result = await createSubscription({
                ...subscriptionData,
                idempotencyKey, // ✅ Pass idempotency key to prevent duplicate creation
              });

              // ✅ Track subscription creation to prevent duplicates
              if (result?.success && result.data?.subscriptionId) {
                subscriptionCreatedRef.current = result.data.subscriptionId;
                console.log("✅ Subscription created and tracked:", result.data.subscriptionId);
                // ✅ Store userId for retry scenarios
                if (result.data?.userId) {
                  userIdRef.current = result.data.userId;
                  console.log("✅ UserId stored for retry scenarios:", result.data.userId);
                }
              }
            }
          } else {
            result = await createOneTimePurchase(subscriptionData);
          }
        }

        if (result) {
          // console.log("✅ Account created successfully:", result);
          // console.log("🔍 Debug - result.data:", result.data);
          // console.log("🔍 Debug - clientSecret:", result.data?.clientSecret);
          // console.log("🔍 Debug - activePlan.period:", activePlan.period);

          // Payment method is automatically saved during user creation in the API
          // console.log("💾 Payment method saved automatically during user creation");

          // Handle subscription payment confirmation directly for new users
          if (activePlan.period === "mo") {
            // ✅ Clean separation: Data extraction using utility function
            const subscriptionData = extractSubscriptionData(result);
            
            if (!subscriptionData || !validateSubscriptionResponse(subscriptionData)) {
              const error = handleInvalidResponseError(result);
              console.error(`❌ ${error.message}`);
              showToast({
                type: "error",
                title: "Subscription Error",
                message: error.userMessage,
                duration: 6000,
              });
              throw new Error(error.message);
            }

            // ✅ Clean separation: State update using utility function
            const stateUpdate = createSubscriptionStateUpdate(subscriptionData);
            
            // Update React state with invoice PaymentIntent client_secret
            if (stateUpdate.clientSecret) {
              setPaymentIntentClientSecret(stateUpdate.clientSecret);
              const invoicePIId = stateUpdate.clientSecret.split("_secret_")[0];
              console.log(`✅ Using invoice PaymentIntent ${invoicePIId} for subscription payment`);
            }

            const subscriptionId = stateUpdate.subscriptionId!; // Validated above
            const clientSecret = stateUpdate.clientSecret;
            const userId = subscriptionData.userId || result.data?.userId || userIdRef.current; // ✅ Include userId from ref for retry scenarios

            // ✅ Only show "Payment Processing" toast during initial subscription creation, not on retries
            // If subscription already exists (retry scenario), skip this check
            if (!subscriptionCreatedRef.current && !clientSecret) {
              const error = handlePaymentIntentNotReadyError();
              console.warn(`⚠️ ${error.message}`);
              showToast({
                type: "warning",
                title: "Payment Processing",
                message: error.userMessage,
                duration: 4000,
              });
              // Still try to confirm - backend will handle retry logic
            }

            // ✅ STRIPE BEST PRACTICE: Use PaymentIntent client_secret from subscription's invoice
            // This PaymentIntent was created by Stripe automatically with the correct amount
            // Confirm subscription payment directly
            try {
              const confirmResponse = await fetch("/api/stripe/confirm-subscription-payment", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                credentials: "include",
              body: JSON.stringify({
                subscriptionId,
                clientSecret: clientSecret, // ✅ PaymentIntent client_secret from Stripe (invoice PaymentIntent)
                userId: userId, // New user - include userId
                paymentMethodId: paymentMethodId, // ✅ Pass new payment method from SetupIntent
              }),
              });

              const confirmResult = await confirmResponse.json();

              // ✅ CRITICAL: Handle 3DS authentication requirement
              if (confirmResult.requiresPaymentConfirmation && confirmResult.data?.paymentIntent?.clientSecret) {
                console.log("⏳ Payment requires 3DS authentication - handling redirect");
                
                // Use the PaymentIntent client_secret for 3DS handling
                const threeDSClientSecret = confirmResult.data.paymentIntent.clientSecret;
                
                // Import Stripe confirmation utility
                const { getReturnUrlForPaymentTypeClient } = await import("@/utils/payment/stripe/payment-intent-config");
                
                // Load Stripe instance for 3DS confirmation (doesn't require Elements context)
                const stripe = await stripePromise;
                if (!stripe) {
                  throw new Error("Stripe not loaded. Please refresh and try again.");
                }

                // Confirm payment with 3DS redirect
                const { error: confirmError } = await stripe.confirmPayment({
                  clientSecret: threeDSClientSecret,
                  confirmParams: {
                    return_url: getReturnUrlForPaymentTypeClient("subscription"),
                  },
                });

                if (confirmError) {
                  throw new Error(confirmError.message || "3D Secure authentication failed");
                }

                // 3DS redirect will happen - user will be redirected to success page
                // Don't throw error - let the redirect happen
                return;
              }

              if (!confirmResponse.ok) {
                const formatted = formatPaymentError(confirmResult);
                // ✅ Error will be caught by catch block below, which will create new SetupIntent
                throw new Error(formatted.message);
              }

              // console.log("✅ New user subscription payment confirmed successfully");

              // Handle success directly with user data for auto-login
              await handlePaymentSuccess(confirmResult.data);
              return;
            } catch (confirmError) {
              console.error("❌ New user subscription payment confirmation failed:", confirmError);
              
              // ✅ CRITICAL: Payment failed - SetupIntent already succeeded, cannot be reused
              // Create new SetupIntent BEFORE clearing old one to prevent PaymentElement from losing clientSecret
              console.warn("⚠️ Payment failed - creating new SetupIntent for retry (in catch block)");
              
              // ✅ Create new SetupIntent FIRST (before clearing old one)
              if (!isCreatingSetupIntentRef.current) {
                isCreatingSetupIntentRef.current = true;
                try {
                  const setupResult = await createSetupIntent.mutateAsync();
                  if (setupResult.success && setupResult.client_secret) {
                    // Only set new AFTER it's ready - don't clear old one until new is ready
                    setSetupIntentClientSecret(setupResult.client_secret);
                    console.log("✅ New SetupIntent created after payment failure (catch block) - ready for new card");
                  } else {
                    // If creation failed, don't clear old one - let PaymentElement keep working
                    console.error("❌ SetupIntent creation returned no client_secret, keeping old SetupIntent");
                  }
                } catch (setupError) {
                  console.error("❌ Failed to create new SetupIntent after payment failure (catch block):", setupError);
                  // Don't clear old SetupIntent if new one fails - PaymentElement needs clientSecret
                } finally {
                  isCreatingSetupIntentRef.current = false;
                }
              } else {
                console.warn("⚠️ SetupIntent creation already in progress, skipping duplicate creation");
              }
              
              throw confirmError;
            }
          } else if (activePlan.period === "one-time") {
            // Check if we can handle one-time purchase with autologin directly first
            const oneTimeData = result.data as OneTimePurchaseData;
            if (oneTimeData?.user && (oneTimeData?.autoLogin || result.data?.userId)) {
              // console.log("🎯 One-time purchase with user data - handling autologin directly");

              try {
                // Get auto-login token from the API
                const userId = oneTimeData.user.id || result.data?.userId;
                const userEmail = oneTimeData.user.email;

                const autoLoginResponse = await fetch("/api/auth/auto-login", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    userId: userId,
                    email: userEmail,
                  }),
                });

                const autoLoginData = await autoLoginResponse.json();

                if (autoLoginData.success && autoLoginData.token) {
                  // Sign in the user automatically using the token
                  const signInResult = await signIn("auto-login", {
                    token: autoLoginData.token,
                    redirect: false,
                  });

                  if (signInResult?.ok) {
                    // console.log("✅ Auto-login successful for one-time purchase");
                    const triggerType = "one-time-purchase";

                    onClose();

                    // Mark purchase as completed to prevent special packages modal conflicts
                    markPurchaseCompleted();

                    // Invalidate user caches to update UI immediately
                    if (userId) {
                      invalidateUserCaches(userId);
                    }

                    // Show global success screen
                    hideLoading();
                    const oneTimeEntries =
                      activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0;
                    const benefits = buildActivationBenefits({ entriesOverride: oneTimeEntries });
                    appendCodeBenefits(benefits);
                    showSuccess("Welcome!", purchaseSuccessSubtitle, benefits);

                    // Extract paymentIntentId and set originalPurchaseContext for invoice finalization
                    const oneTimePaymentIntentId = oneTimeData?.paymentIntentId || result.data?.paymentIntentId || null;
                    const oneTimeOriginalContext: OriginalPurchaseContext | null = oneTimePaymentIntentId
                      ? (() => {
                          const packageId =
                            lastChargedStaticPackageIdRef.current ??
                            getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
                            "";
                          const baseEntries = getPackageBaseEntries({
                            packageId,
                            packageType: "one-time",
                          });
                          const multiplierFromMetadata = activePlan.metadata?.promoMultiplier;
                          const multiplierValue =
                            typeof multiplierFromMetadata === "number"
                              ? multiplierFromMetadata
                              : typeof multiplierFromMetadata === "string"
                                ? parseFloat(multiplierFromMetadata)
                                : undefined;
                          const effectiveOneTimeMultiplier =
                            getEffectivePromoType(packageId || activePlan.id, "one-time", isMember ?? false) ===
                            "membership-packages"
                              ? resolvedMembershipMultiplier
                              : resolvedOneTimeMultiplier;
                          const appliedMultiplier =
                            multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue)
                              ? multiplierValue
                              : effectiveOneTimeMultiplier ?? 1;

                          return {
                            paymentIntentId: oneTimePaymentIntentId,
                            packageId,
                            packageName: activePlan.name,
                            packageType: "one-time",
                            price: activePlan.price,
                            entries: activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0,
                            baseEntries,
                            promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined,
                          };
                        })()
                      : null;

                    // Add delay to allow authentication to complete before triggering upsell
                    setTimeout(() => {
                      triggerUpsellModal(
                        triggerType,
                        activePlan.name,
                        activePlan.price,
                        oneTimeOriginalContext?.packageId ||
                          lastChargedStaticPackageIdRef.current ||
                          getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ||
                          undefined,
                        "one-time",
                        oneTimeOriginalContext || originalPurchaseContext
                      );

                      setTimeout(() => {
                        router.push("/my-account");
                      }, 2000);
                    }, 1000);
                    return;
                  }
                }

                // If autologin failed, continue to confirmation modal
                // console.log("🎯 Auto-login attempted but failed, continuing to payment confirmation");
              } catch (authError) {
                console.error("? Error in one-time autologin:", authError);
              }
            }

            // console.log("🚀 Showing payment confirmation modal for one-time purchase");
            // Show payment confirmation modal for one-time purchases too
            // One-time purchase confirmation removed - handled directly in handleSubmit
          } else {
            // console.log("📦 One-time purchase - handling success");
            // One-time purchase - handle auto-login if user data is provided
            const oneTimeData = result.data as OneTimePurchaseData;
            if (oneTimeData?.user && oneTimeData?.autoLogin) {
              // console.log("🔄 One-time purchase with auto-login:", oneTimeData.user);

              try {
                // Get auto-login token from the API
                const autoLoginResponse = await fetch("/api/auth/auto-login", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    userId: oneTimeData.user.id,
                    email: oneTimeData.user.email,
                  }),
                });

                const autoLoginData = await autoLoginResponse.json();

                if (autoLoginData.success && autoLoginData.token) {
                  // Sign in the user automatically using the token
                  const signInResult = await signIn("auto-login", {
                    token: autoLoginData.token,
                    redirect: false,
                  });

                  if (signInResult?.ok) {
                    // console.log("✅ Auto-login successful for one-time purchase");
                    // Show global success screen
                    hideLoading();
                    const oneTimeEntries2 =
                      activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0;
                    const benefits2 = buildActivationBenefits({ entriesOverride: oneTimeEntries2 });
                    appendCodeBenefits(benefits2);
                    showSuccess("Welcome!", purchaseSuccessSubtitle, benefits2, 3000);

                    // Extract paymentIntentId and set originalPurchaseContext for invoice finalization
                    const oneTimePaymentIntentId2 =
                      oneTimeData?.paymentIntentId || result.data?.paymentIntentId || null;
                    const oneTimeOriginalContext2: OriginalPurchaseContext | null = oneTimePaymentIntentId2
                      ? (() => {
                          const packageId =
                            lastChargedStaticPackageIdRef.current ??
                            getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
                            "";
                          const packageType = activePlan.period === "mo" ? "membership" : "one-time";
                          const baseEntries = getPackageBaseEntries({
                            packageId,
                            packageType,
                          });
                          const multiplierFromMetadata = activePlan.metadata?.promoMultiplier;
                          const multiplierValue =
                            typeof multiplierFromMetadata === "number"
                              ? multiplierFromMetadata
                              : typeof multiplierFromMetadata === "string"
                                ? parseFloat(multiplierFromMetadata)
                                : undefined;
                          let appliedMultiplier: number;
                          if (packageType === "membership") {
                            appliedMultiplier =
                              multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue)
                                ? multiplierValue
                                : resolvedMembershipMultiplier ?? 1;
                          } else {
                            const effectiveOneTimeMultiplier =
                              getEffectivePromoType(packageId || activePlan.id, "one-time", isMember ?? false) ===
                              "membership-packages"
                                ? resolvedMembershipMultiplier
                                : resolvedOneTimeMultiplier;
                            appliedMultiplier =
                              multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue)
                                ? multiplierValue
                                : effectiveOneTimeMultiplier ?? 1;
                          }
                          return {
                            paymentIntentId: oneTimePaymentIntentId2,
                            packageId,
                            packageName: activePlan.name,
                            packageType,
                            price: activePlan.price,
                            entries: activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0,
                            baseEntries,
                            promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined,
                          };
                        })()
                      : null;

                    onClose();

                    // Add delay to allow authentication to complete before triggering upsell
                    setTimeout(() => {
                      // Trigger upsell modal for new user AFTER authentication is complete
                      triggerUpsellModal(
                        "one-time-purchase",
                        activePlan.name,
                        activePlan.price,
                        oneTimeOriginalContext2?.packageId ||
                          lastChargedStaticPackageIdRef.current ||
                          getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ||
                          undefined,
                        activePlan.period === "mo" ? "membership" : "one-time",
                        oneTimeOriginalContext2 || originalPurchaseContext
                      );

                      // Add delay to allow upsell modal to show before redirecting
                      setTimeout(() => {
                        router.push("/my-account");
                      }, 2000); // 2 second delay
                    }, 1000); // 1 second delay for authentication
                    return;
                  } else {
                    // console.log("❌ Auto-login failed:", signInResult?.error);
                    // Show global success screen for account creation
                    hideLoading();
                    {
                      const benefits = buildActivationBenefits({
                        entriesOverride:
                          activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0,
                      });
                      appendCodeBenefits(benefits);
                      showSuccess("Account Created!", purchaseSuccessSubtitle, benefits, 3000);
                    }
                  }
                } else {
                  // console.log("❌ Failed to get auto-login token:", autoLoginData.error);
                  // Show global success screen for account creation
                  hideLoading();
                  {
                    const benefits = buildActivationBenefits({
                      entriesOverride:
                        activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0,
                    });
                    appendCodeBenefits(benefits);
                    showSuccess("Account Created!", purchaseSuccessSubtitle, benefits, 3000);
                  }
                }
              } catch (autoLoginError) {
                console.error("❌ Auto-login error:", autoLoginError);
                // Show global success screen for account creation
                hideLoading();
                {
                  const benefits = buildActivationBenefits({
                    entriesOverride:
                      activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0,
                  });
                  appendCodeBenefits(benefits);
                  showSuccess("Account Created!", purchaseSuccessSubtitle, benefits, 3000);
                }
              }
            } else {
              // Fallback for cases without auto-login data
              // Show global success screen for account creation
              hideLoading();
              {
                const benefits = buildActivationBenefits({
                  entriesOverride: oneTimeData?.totalEntries || 0,
                });
                appendCodeBenefits(benefits);
                showSuccess("Account Created!", purchaseSuccessSubtitle, benefits, 3000);
              }
            }

            // Extract paymentIntentId and set originalPurchaseContext for invoice finalization
            const finalPaymentIntentId = oneTimeData?.paymentIntentId || result.data?.paymentIntentId || null;
            const finalOriginalContext: OriginalPurchaseContext | null = finalPaymentIntentId
              ? (() => {
                  const packageId =
                    lastChargedStaticPackageIdRef.current ??
                    getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
                    "";
                  const packageType = activePlan.period === "mo" ? "membership" : "one-time";
                  const baseEntries = getPackageBaseEntries({
                    packageId,
                    packageType,
                  });
                  const multiplierFromMetadata = activePlan.metadata?.promoMultiplier;
                  const multiplierValue =
                    typeof multiplierFromMetadata === "number"
                      ? multiplierFromMetadata
                      : typeof multiplierFromMetadata === "string"
                        ? parseFloat(multiplierFromMetadata)
                        : undefined;
                  let appliedMultiplier: number;
                  if (packageType === "membership") {
                    appliedMultiplier =
                      multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue)
                        ? multiplierValue
                        : resolvedMembershipMultiplier ?? 1;
                  } else {
                    const effectiveOneTimeMultiplier =
                      getEffectivePromoType(packageId || activePlan.id, "one-time", isMember ?? false) ===
                      "membership-packages"
                        ? resolvedMembershipMultiplier
                        : resolvedOneTimeMultiplier;
                    appliedMultiplier =
                      multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue)
                        ? multiplierValue
                        : effectiveOneTimeMultiplier ?? 1;
                  }
                  return {
                    paymentIntentId: finalPaymentIntentId,
                    packageId,
                    packageName: activePlan.name,
                    packageType,
                    price: activePlan.price,
                    entries: activePlan.metadata?.entriesCount || oneTimeData?.totalEntries || 0,
                    baseEntries,
                    promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined,
                  };
                })()
              : null;

            // Trigger upsell modal (cache invalidation now handled inside triggerUpsellModal)
            triggerUpsellModal(
              "one-time-purchase",
              activePlan.name,
              activePlan.price,
              finalOriginalContext?.packageId ||
                lastChargedStaticPackageIdRef.current ||
                getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ||
                undefined,
              activePlan.period === "mo" ? "membership" : "one-time",
              finalOriginalContext || originalPurchaseContext
            );

            onClose();
          }
        } else {
          throw new Error("Failed to create account. Please try again.");
        }
      }
    } catch (error: unknown) {
      // ✅ Clean separation: Error handling using utility function
      const subscriptionError = handleSubscriptionError(error);
      console.error(`❌ Purchase failed: ${subscriptionError.message}`, subscriptionError.originalError);

      // Hide loading screen immediately (skip success animation on error)
      hideLoading();

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MembershipModal.tsx:3177',message:'Error caught in handleSubmit catch block',data:{errorType:subscriptionError.type,errorMessage:subscriptionError.message,errorCode:subscriptionError.code,packageId,packageName:activePlan.name,userId:userData?._id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
      // #endregion
      
      // Use user-friendly error message from error handler
      let errorMessage = subscriptionError.userMessage;
      const _errorTitle = isAuthenticated ? "Purchase Failed" : "Account Creation Failed";
      let errorCode = subscriptionError.code; // Extract from utility function
      let declineCode: string | undefined;
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MembershipModal.tsx:3188',message:'STARTING error extraction',data:{errorType:typeof error,hasResponse:error && typeof error === "object" && "response" in error,errorKeys:error && typeof error === "object" ? Object.keys(error) : [],errorStringified:JSON.stringify(error).substring(0,500),packageId,packageName:activePlan.name,userId:userData?._id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
      // #endregion
      
      // ✅ CRITICAL FIX: Enhanced error extraction to catch ALL possible error formats
      // This ensures we capture the actual Stripe error even if it's deeply nested

      // Helper function to extract Stripe error codes
      const extractStripeErrorCode = (err: unknown): string | undefined => {
        if (err && typeof err === "object") {
          // Check for Stripe error structure
          if ("code" in err) return err.code as string;
          if ("type" in err) return err.type as string;
          // Check nested error objects
          if ("error" in err && typeof err.error === "object" && err.error !== null) {
            if ("code" in err.error) return err.error.code as string;
            if ("type" in err.error) return err.error.type as string;
          }
          // Check response.data structure
          if ("response" in err) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = (err as any).response;
            if (response?.data?.code) return response.data.code;
            if (response?.data?.error?.code) return response.data.error.code;
            if (response?.data?.error?.type) return response.data.error.type;
          }
        }
        return undefined;
      };

      // Helper function to extract Stripe decline code
      const extractStripeDeclineCode = (err: unknown): string | undefined => {
        if (err && typeof err === "object") {
          if ("decline_code" in err) return err.decline_code as string;
          if ("error" in err && typeof err.error === "object" && err.error !== null) {
            if ("decline_code" in err.error) return err.error.decline_code as string;
          }
          if ("response" in err) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = (err as any).response;
            if (response?.data?.decline_code) return response.data.decline_code;
            if (response?.data?.error?.decline_code) return response.data.error.decline_code;
          }
        }
        return undefined;
      };

      // ✅ ENHANCED: Try multiple error extraction strategies in order of specificity
      if (error && typeof error === "object" && "response" in error) {
        const apiError = error as { response?: { data?: { error?: string; details?: string; code?: string; decline_code?: string; message?: string }; status?: number } };
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MembershipModal.tsx:3225',message:'Extracting error from API response',data:{hasResponseData:!!apiError.response?.data,responseDataKeys:apiError.response?.data ? Object.keys(apiError.response.data) : [],responseStatus:apiError.response?.status,packageId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
        // #endregion
        
        if (apiError.response?.data) {
          // ✅ CRITICAL: Log full response data structure for debugging BEFORE extraction
          console.error("🔍 API Error Response Structure:", JSON.stringify(apiError.response.data, null, 2));
          
          // ✅ ENHANCED: Try multiple extraction strategies in order of priority
          // Priority 1: details field (most specific, often contains full error message)
          if (apiError.response.data.details) {
            errorMessage = apiError.response.data.details;
            errorCode = apiError.response.data.code;
            declineCode = apiError.response.data.decline_code;
          }
          // Priority 2: error field (standard API error format)
          else if (apiError.response.data.error) {
            errorMessage = apiError.response.data.error;
            errorCode = apiError.response.data.code;
            declineCode = apiError.response.data.decline_code;
          }
          // Priority 3: message field (fallback)
          else if (apiError.response.data.message) {
            errorMessage = apiError.response.data.message;
            errorCode = apiError.response.data.code;
            declineCode = apiError.response.data.decline_code;
          }
          
          // ✅ ENHANCED: If we have both details and error, combine them intelligently
          if (apiError.response.data.error && apiError.response.data.details && apiError.response.data.details !== apiError.response.data.error) {
            // Details is usually more specific, use it as primary with error as context
            errorMessage = `${apiError.response.data.details} (${apiError.response.data.error})`;
          }
        }
      } else if (error && typeof error === "object" && "message" in error) {
        const err = error as { message: string; code?: string; decline_code?: string; type?: string };
        errorMessage = err.message;
        errorCode = err.code || extractStripeErrorCode(error); // Check for code directly on error object
        declineCode = err.decline_code || extractStripeDeclineCode(error);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MembershipModal.tsx:3243',message:'Extracted error from error.message',data:{errorMessage,errorCode,declineCode,errorType:err.type,packageId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
        // #endregion
        
        // ✅ CRITICAL: Log full error object for debugging
        console.error("🔍 Error Object Structure:", JSON.stringify(err, null, 2));
      } else if (typeof error === "string") {
        errorMessage = error;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MembershipModal.tsx:3250',message:'Error is a string',data:{errorMessage,packageId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
        // #endregion
      } else {
        // ✅ CRITICAL: If we can't extract error, log the full error object
        console.error("❌ ERROR EXTRACTION FAILED - Full error object:", error);
        console.error("❌ Error type:", typeof error);
        console.error("❌ Error stringified:", JSON.stringify(error, null, 2));
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MembershipModal.tsx:3255',message:'ERROR EXTRACTION FAILED - could not parse error',data:{errorType:typeof error,errorStringified:JSON.stringify(error).substring(0,1000),packageId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
        // #endregion
        
        // Try one more time to extract any message
        try {
          const errorStr = JSON.stringify(error);
          if (errorStr && errorStr !== "{}") {
            errorMessage = `Error details: ${errorStr.substring(0, 200)}`;
          }
        } catch {
          // Give up - use default message
          errorMessage = "A processing error occurred. Please check Vercel logs for details.";
        }
      }

      // Extract error codes if not already extracted
      if (!errorCode) {
        errorCode = extractStripeErrorCode(error);
      }
      if (!declineCode) {
        declineCode = extractStripeDeclineCode(error);
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MembershipModal.tsx:3317',message:'After error code extraction',data:{errorMessage,errorCode,declineCode,packageId,isGenericMessage:errorMessage.includes("unexpected") || errorMessage.includes("processing error")},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
      // #endregion
      
      // ✅ CRITICAL: If we still have a generic message, log warning for investigation
      if (errorMessage === "An unexpected error occurred" || errorMessage.includes("processing error occurred")) {
        console.error("⚠️ WARNING: Generic error message detected! Original error:", error);
        console.error("⚠️ This suggests error extraction failed. Check logs above for actual error details.");
      }
      
      // ✅ CRITICAL: If we still have a generic message, log warning for investigation
      if (errorMessage === "An unexpected error occurred" || errorMessage.includes("processing error occurred")) {
        console.error("⚠️ WARNING: Generic error message detected! Original error:", error);
        console.error("⚠️ This suggests error extraction failed. Check logs above for actual error details.");
      }

      // Debug logging for error handling
      // console.log("🔍 Error handling debug:", {
      //   error,
      //   errorCode,
      //   errorMessage,
      //   errorTitle,
      //   hasResponse: error && typeof error === "object" && "response" in error,
      //   hasCode: error && typeof error === "object" && "code" in error,
      //   errorKeys: error && typeof error === "object" ? Object.keys(error) : [],
      //   errorStringified: JSON.stringify(error, null, 2),
      // });

      // ✅ EXPERT ERROR HANDLING: Handle EXISTING_SUBSCRIPTION error with special navigation
      // Note: errorCode is already extracted above in the error handling block
      if (errorCode === "EXISTING_SUBSCRIPTION") {
        showToast({
          type: "error",
          title: "Active Subscription Found",
          message: errorMessage,
          duration: 10000, // Longer duration for important message
          action: {
            label: "Manage Subscription",
            onClick: () => {
              router.push("/my-account");
            },
          },
        });
      } else {
        // ✅ EXPERT ERROR HANDLING: Use handlePaymentError for ALL other errors
        // This ensures consistent error handling, state preservation, and user-friendly messages
        await handlePaymentError(error, {
          preserveState: true, // ✅ CRITICAL: Preserve all state for seamless retry
          autoRetry: true, // Allow automatic recovery for recoverable errors
          packageId: packageId || undefined,
          packageName: activePlan?.name,
        });
      }

      // Clear card form errors but preserve state
      setCardFormError(null);

      console.error(`${isAuthenticated ? "Purchase" : "Account creation"} failed: ${errorMessage}`);
    } finally {
      checkoutSubmitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  /**
   * Trigger upsell modal after successful purchase
   * Now uses the new upsell trigger API for better targeting
   */
  const triggerUpsellModal = async (
    triggerEvent: "membership-purchase" | "ticket-purchase" | "one-time-purchase",
    recentPurchase: string,
    purchaseAmount: number,
    packageId?: string,
    packageType?: "membership" | "one-time",
    originalPurchaseContextParam?: OriginalPurchaseContext | null
  ) => {
    try {
      // ✅ CRITICAL: Invalidate payment methods cache before triggering upsell modal
      // This ensures the upsell modal has the latest payment method available
      // Payment method was just saved during purchase, so we need to refresh the cache
      if (userData?._id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userData._id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userData._id) });
        console.log("🔄 Invalidated payment methods cache before showing upsell modal");
      }
      // If we have package information, use the new trigger API
      if (packageId && packageType) {
        // console.log(`🎯 Triggering targeted upsell for package: ${packageId} (${packageType})`);

        // Determine correct userType based on package ID and type
        // Mini draw packages (mini-pack-1, mini-pack-2, etc.) should use "mini-draw-buyer"
        // Regular one-time packages should use "returning-user" or "new-user"
        const isMiniDrawPackage = packageId.startsWith("mini-pack-");

        // Check if this is an additional package (additional- packages)
        const isAdditionalPackage = packageId.startsWith("additional-");

        // If user doesn't have access, skip upsell trigger for additional packages
        if (isAdditionalPackage && !hasAdditionalPackageAccess(userData, userMajorDrawStats)) {
          // console.log("⚠️ Skipping upsell trigger: User doesn't have access to additional packages");
          return;
        }

        const userType = isMiniDrawPackage ? "mini-draw-buyer" : isAuthenticated ? "returning-user" : "new-user";

        // ✅ FIX: Calculate if user has access to additional packages (subscription OR major draw entries)
        const hasAccessToAdditionalPackages = hasAdditionalPackageAccess(userData, userMajorDrawStats);

        const response = await fetch("/api/upsell/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId,
            packageType,
            userType, // Correctly determined based on package type
            isMember: isMember, // Keep for backward compatibility
            hasAccessToAdditionalPackages: hasAccessToAdditionalPackages, // ✅ NEW: Pass access status
            triggerEvent,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data?.offer) {
            const offer = result.data.offer;
            // console.log(`✅ Found targeted upsell offer: ${offer.name}`);

            // Convert offer to UpsellOffer format
            const upsellOffer: UpsellOffer = {
              id: offer.id,
              title: offer.name,
              description: offer.description,
              category: offer.category as "major-draw" | "mini-draw" | "membership",
              originalPrice: offer.originalPrice,
              discountedPrice: offer.discountedPrice,
              discountPercentage: offer.discountPercentage,
              entriesCount: offer.entriesCount,
              buttonText: offer.buttonText,
              conditions: offer.conditions,
              urgencyText: offer.urgencyText,
              validUntil: offer.validUntil,
              priority: offer.priority,
              imageUrl: offer.imageUrl,
              isActive: offer.isActive,
              targetAudience: offer.targetAudience || ["all-users"],
              userSegments: offer.userSegments || ["new-user", "returning-user"],
              maxShowsPerUser: offer.maxShowsPerUser || 3,
              cooldownHours: offer.cooldownHours || 24,
            };

            // Prepare user context
            const userContext: UpsellUserContext = {
              userId: userData?._id || undefined,
              isAuthenticated: isAuthenticated,
              hasDefaultPayment: isAuthenticated && (userData?.savedPaymentMethods?.length ?? 0) > 0,
              recentPurchase: recentPurchase,
              userType: isAuthenticated ? "returning-user" : "new-user",
              totalSpent: purchaseAmount,
              upsellsShown: 0,
            };

            // CRITICAL FIX: Set pending upsell IMMEDIATELY (not delayed)
            // This ensures sessionStorage is set BEFORE page navigation to /my-account
            // Use passed parameter or fallback to state
            const finalOriginalPurchaseContext = originalPurchaseContextParam ?? originalPurchaseContext;

            if (!isAuthenticated) {
              const { setPendingUpsellAfterSetup } = useModalPriorityStore.getState();
              setPendingUpsellAfterSetup(true, {
                offer: upsellOffer,
                userContext,
                originalPurchaseContext: finalOriginalPurchaseContext || undefined,
              });
              // console.log("🎯 Set pending upsell IMMEDIATELY for first-time user (before navigation)");
            } else {
              // For existing users, show upsell with a delay
              setTimeout(() => {
                const { requestModal } = useModalPriorityStore.getState();
                requestModal("upsell", false, {
                  offer: upsellOffer,
                  userContext,
                  originalPurchaseContext: finalOriginalPurchaseContext || undefined,
                });
                // console.log("🎯 Showing upsell for existing user (after delay)");
              }, offer.showAfterDelay * 1000 || 2000);
            }

            return;
          }
        }
      }

      // Fallback: No upsell available
      // console.log(`🎯 No upsell available for: ${recentPurchase}`);
    } catch (error) {
      console.error("Error triggering upsell:", error);
      // No fallback available - upsell system removed
    }
  };

  const isFormValid = () => {
    // ✅ CRITICAL: Disable button if PaymentIntent/SetupIntent is being created or PaymentElement is mounting
    // This prevents errors from clicking purchase before payment form is ready
    const isCreatingIntent =
      createPaymentIntent.isPending || createSetupIntent.isPending || isCreatingPaymentIntentRef.current;

    // If we're creating an intent, form is not valid yet
    if (isCreatingIntent) {
      return false;
    }

    // Check if we have either PaymentIntent or SetupIntent client secret
    const hasIntentClientSecret = paymentIntentClientSecret !== null || setupIntentClientSecret !== null;

    // ✅ CRITICAL: If card form is shown but no client secret yet, form is not ready
    // This handles the case where PaymentElement is still mounting
    if (showCardForm && !hasIntentClientSecret) {
      return false;
    }

    if (isAuthenticated) {
      // For authenticated users, need either saved payment method or new card details (when card form is shown)
      return useSavedPaymentMethod
        ? selectedPaymentMethod !== null
        : showCardForm
        ? !cardFormError && hasIntentClientSecret // Card form is valid if no errors and PaymentIntent/SetupIntent is ready
        : false; // If no saved payment method and card form is not shown, form is invalid
    } else {
      // For new users (guest checkout), check if registration is complete and card form is ready
      const registrationComplete = currentStep === 2 && guestUserData !== null;
      const cardFormReady = !cardFormError && hasIntentClientSecret;
      return Boolean(registrationComplete && cardFormReady);
    }
  };

  // Loading and success screens are now handled by global LoadingContext

  const promoMultiplier = promoEnhancedPlan?.metadata?.isPromoActive && typeof promoEnhancedPlan?.metadata?.promoMultiplier === "number"
    ? (promoEnhancedPlan.metadata.promoMultiplier as number)
    : 0;
  const showHeaderPromoBadge =
    (currentStep === 1 || currentStep === 2) &&
    promoMultiplier >= 2 &&
    isPromoMultiplier(promoMultiplier);
  const packageBadgeSrc =
    showHeaderPromoBadge && hasBundledMultiplierAssets(promoMultiplier)
      ? `/images/badge/X${promoMultiplier}.webp`
      : null;

  const onWinnerStripPointerDown = (e: React.PointerEvent) => {
    winnerStripPointerStartRef.current = { x: e.clientX, y: e.clientY };
    winnerStripDidDragRef.current = false;
  };
  const onWinnerStripPointerMove = (e: React.PointerEvent) => {
    const s = winnerStripPointerStartRef.current;
    if (!s) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) {
      winnerStripDidDragRef.current = true;
    }
  };
  const onWinnerStripPointerEnd = () => {
    winnerStripPointerStartRef.current = null;
  };
  const onWinnerStripClick = () => {
    if (winnerStripDidDragRef.current) {
      winnerStripDidDragRef.current = false;
      return;
    }
    const el = winnerCarouselRef.current;
    let initial = 0;
    if (el && majorDrawWinners.length > 0) {
      const w = el.clientWidth;
      if (w > 0) {
        const page = Math.round(el.scrollLeft / w);
        initial = Math.min(page * 2, majorDrawWinners.length - 1);
      }
    }
    setWinnerViewerInitialIndex(initial);
    setWinnerViewerOpen(true);
  };

  return (
    <>
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="lg" closeOnBackdrop={false}>
      <ModalHeader
        title=""
        titleNode={
          <>
            JOIN <span className="font-bold" style={{ color: promoTheme.primary }}>TOOLS AUSTRALIA</span>
          </>
        }
        subtitle={
          activePlan.period === "one-time"
            ? "Get your name into the draw"
            : "Get your name in every draw automatically"
        }
        onClose={handleClose}
        showLogo={true}
      />

      <ModalContent padding="none">
        {/* Guest step strip: full width, flush under header */}
        {!isAuthenticated && (
          <div className="relative w-full shrink-0">
            {showHeaderPromoBadge && (
              <div
                className={`absolute -top-1.5 sm:-top-2 z-20 pointer-events-none ${currentStep === 2 ? "-right-0.5" : "-left-0.5"}`}
              >
                {packageBadgeSrc ? (
                  <Image
                    src={packageBadgeSrc}
                    alt={`${promoMultiplier}x bonus entries`}
                    width={72}
                    height={72}
                    className="w-10 h-10 sm:w-11 sm:h-11 object-contain drop-shadow-md"
                  />
                ) : (
                  <div
                    className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-700 text-sm sm:text-base font-black text-white shadow-md border border-amber-300/70"
                    aria-label={`${promoMultiplier}x bonus entries`}
                  >
                    {promoMultiplier}x
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-0 w-full rounded-none border-0 border-b border-gray-200 dark:border-neutral-700 divide-x divide-gray-200 dark:divide-neutral-700">
              <button
                type="button"
                onClick={() => handleStepClick(1)}
                style={currentStep === 1 ? { backgroundColor: promoTheme.primary } : undefined}
                className={`flex w-full items-center justify-center gap-1.5 py-2 px-2.5 sm:py-2.5 sm:px-3 min-h-0 transition-colors cursor-pointer ${
                  currentStep === 1
                    ? "text-white font-bold"
                    : "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 font-medium hover:bg-gray-200 dark:hover:bg-neutral-700"
                }`}
                aria-current={currentStep === 1 ? "step" : undefined}
              >
                <span
                  className={`flex h-6 w-6 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[10px] sm:text-[11px] font-black shrink-0 shadow-sm ring-1 ring-black/10 dark:ring-white/30 ${
                    currentStep === 1 ? "bg-[#ffffff]" : "bg-gray-400 text-white dark:bg-neutral-600"
                  }`}
                  style={currentStep === 1 ? { color: promoTheme.primary } : undefined}
                >
                  1
                </span>
                <span className="text-xs sm:text-sm whitespace-nowrap leading-tight">Your Details</span>
              </button>
              <button
                type="button"
                onClick={() => hasCompletedRegistration && handleStepClick(2)}
                disabled={!hasCompletedRegistration}
                style={hasCompletedRegistration && currentStep === 2 ? { backgroundColor: promoTheme.primary } : undefined}
                className={`flex w-full items-center justify-center gap-1.5 py-2 px-2.5 sm:py-2.5 sm:px-3 min-h-0 transition-colors ${
                  !hasCompletedRegistration
                    ? "bg-gray-100 dark:bg-neutral-900 text-gray-400 dark:text-neutral-500 cursor-not-allowed opacity-80"
                    : currentStep === 2
                      ? "text-white font-bold cursor-pointer"
                      : "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 font-medium cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-700"
                }`}
                aria-current={currentStep === 2 ? "step" : undefined}
                aria-disabled={!hasCompletedRegistration}
                title={!hasCompletedRegistration ? "Complete your details first" : undefined}
              >
                <span
                  className={`flex h-6 w-6 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[10px] sm:text-[11px] font-black shrink-0 shadow-sm ring-1 ring-black/10 dark:ring-white/30 ${
                    currentStep === 2 ? "bg-[#ffffff]" : "bg-gray-400 text-white dark:bg-neutral-600"
                  }`}
                  style={currentStep === 2 ? { color: promoTheme.primary } : undefined}
                >
                  2
                </span>
                <span className="text-xs sm:text-sm whitespace-nowrap leading-tight">Billing Info</span>
              </button>
            </div>
          </div>
        )}

        <div
          className={`px-3 sm:px-6 pb-3 sm:pb-6 ${!isAuthenticated ? "pt-3 sm:pt-4" : "pt-3 sm:pt-6"}`}
        >
          {/* Active promo for entries - bonus from link (below header, centered) */}
          <div className={`text-center ${currentStep === 2 ? "hidden sm:block" : ""}`}>
          {promoLinkInfo?.isValid &&
            promoLinkInfo.bonusEntries > 0 &&
            activePlan.period !== "one-time" &&
            promoLinkInfo.appliesToMembership && (
              <p
                className="text-[12px] sm:text-sm font-extrabold px-4 py-2 rounded-lg border-2 inline-block shadow-sm whitespace-nowrap mb-2"
                style={{
                  color: "#FFFFFF",
                  backgroundColor: promoTheme.primary,
                  borderColor: "rgba(255, 255, 255, 0.45)",
                }}
              >
                Welcome back - get <span className="text-sm sm:text-base">{promoLinkInfo.bonusEntries}</span> extra entries when you join again
              </p>
            )}
          {promoLinkInfo?.isValid &&
            promoLinkInfo.bonusEntries > 0 &&
            activePlan.period === "one-time" &&
            promoLinkInfo.appliesToOneTime && (
              <p
                className="text-[12px] sm:text-sm font-extrabold px-4 py-2 rounded-lg border-2 inline-block shadow-sm whitespace-nowrap"
                style={{
                  color: "#FFFFFF",
                  backgroundColor: promoTheme.primary,
                  borderColor: "rgba(255, 255, 255, 0.45)",
                }}
              >
                Welcome back - get <span className="text-sm sm:text-base">{promoLinkInfo.bonusEntries}</span> extra entries with this purchase
              </p>
            )}
        </div>

          <div className="w-full max-w-sm mx-auto sm:max-w-lg md:max-w-xl lg:max-w-2xl relative">
            <div className="relative">
              {/* Package badge for authenticated flow (guest badge is on the flush step strip) */}
              {isAuthenticated && showHeaderPromoBadge && (
                <div
                  className={`absolute -top-4 z-20 pointer-events-none
                    ${currentStep === 2 ? "-right-[12px]" : "-left-[12px]"}
                  `}
                >
                  {packageBadgeSrc ? (
                    <Image
                      src={packageBadgeSrc}
                      alt={`${promoMultiplier}x bonus entries`}
                      width={72}
                      height={72}
                      className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-md"
                    />
                  ) : (
                    <div
                      className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-700 text-sm sm:text-base font-black text-white shadow-md border-2 border-amber-300/70"
                      aria-label={`${promoMultiplier}x bonus entries`}
                    >
                      {promoMultiplier}x
                    </div>
                  )}
                </div>
              )}

            {/* Step 1: Personal Details for new users */}
            {currentStep === 1 && (
              <div className="space-y-3 sm:space-y-4">
                {/* General error message */}
                {registrationErrors.general && (
                  <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{registrationErrors.general}</p>
                  </div>
                )}

                <Input
                  name="firstName"
                  value={formData.firstName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange("firstName", e.target.value)}
                  placeholder="Enter your first name"
                  error={registrationErrors.firstName}
                  className="h-11"
                />

                <Input
                  name="lastName"
                  value={formData.lastName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange("lastName", e.target.value)}
                  placeholder="Enter your last name"
                  error={registrationErrors.lastName}
                  className="h-11"
                />

                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange("email", e.target.value)}
                  placeholder="Enter your email address"
                  error={registrationErrors.email}
                  className="h-11"
                />

                <div>
                  <Input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const rawValue = e.target.value;
                      const formattedValue = formatMobileNumber(rawValue);
                      
                      // Get max length for the formatted value
                      const maxLength = getPhoneMaxLength(formattedValue);
                      const isDeleting = rawValue.length < formData.phone.length;
                      
                      // Allow input if:
                      // 1. User is deleting (always allow)
                      // 2. Formatted value is within expected length for the format
                      if (isDeleting || formattedValue.length <= maxLength) {
                        handleInputChange("phone", formattedValue);
                      }
                    }}
                   
                    placeholder="0412 345 678"
                    error={registrationErrors.mobile}
                    maxLength={getPhoneMaxLength(formData.phone)}
                    autoComplete="tel"
                    className="h-11"
                  />
                
                  {formData.phone && !validateMobileNumber(formData.phone) && !registrationErrors.mobile && (
                    <p className="text-xs sm:text-sm text-red-500 mt-1">
                      Please enter a valid Australian mobile number
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  onClick={handleNextStep}
                  disabled={
                    hasCompletedRegistration
                      ? false
                      : Boolean(
                          !formData.firstName ||
                            !formData.lastName ||
                            !formData.email ||
                            formData.phone === "" ||
                            !validateMobileNumber(formData.phone) ||
                            isRegistering
                        )
                  }
                  variant="primary"
                  fullWidth
                  size="lg"
                  loading={isRegistering}
                  className="h-11 !py-0 font-bold text-sm sm:text-base"
                >
                  {isRegistering ? (
                    "Creating Account..."
                  ) : hasCompletedRegistration ? (
                    <>
                      <span className="sm:hidden">Continue to Billing</span>
                      <span className="hidden sm:inline">Continue to Billing</span>
                    </>
                  ) : (
                    <>
                      <span className="sm:hidden">REGISTER</span>
                      <span className="hidden sm:inline">REGISTER</span>
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Step 2: Billing Info */}
            {currentStep === 2 && (
              <div className="space-y-2 sm:space-y-3">
                {/* Payment Method Selector - Always show for authenticated users */}
                {isAuthenticated && (
                  <PaymentMethodSelector
                    onPaymentMethodSelect={handlePaymentMethodSelect}
                    onAddNewPaymentMethod={handleAddNewPaymentMethod}
                    selectedPaymentMethod={selectedPaymentMethod}
                    isAuthenticated={isAuthenticated}
                    showCardForm={showCardForm}
                    setupIntentClientSecret={setupIntentClientSecret}
                    paymentIntentClientSecret={paymentIntentClientSecret}
                    intentType={paymentIntentClientSecret ? "payment" : setupIntentClientSecret ? "setup" : undefined}
                      cardFormRef={cardFormRef}
                      onCardElementChange={handleCardElementChange}
                      cardFormError={cardFormError}
                    isCreatingSetupIntent={createSetupIntent.isPending}
                    isCreatingPaymentIntent={createPaymentIntent.isPending}
                    isCreatingSubscription={isCreatingSubscription}
                    onPaymentMethodTypeChange={setPaymentMethodTypeFromElement}
                    billingDetails={resolvedBillingDetails}
                    amount={Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100)}
                    packageName={promoEnhancedPlan?.name || activePlan?.name}
                  />
                )}

                {/* Payment Section - Always show package info and payment button */}
                <div className="space-y-2 sm:space-y-3 border-t-0 sm:border-t border-gray-200 pt-0 sm:pt-4">
                  {/* Payment Method Selector for non-authenticated users */}
                  {/* ✅ VERIFIED: Amount is correctly calculated from activePlan (from PackageSelectionModal) 
                      Flow: PackageSelectionModal -> onPlanSelect -> handlePackageSelect -> onPlanChange -> 
                      Parent updates selectedPlan -> activePlan -> amount calculation -> PaymentMethodSelector */}
                  {!isAuthenticated && (
                    <PaymentMethodSelector
                      onPaymentMethodSelect={handlePaymentMethodSelect}
                      onAddNewPaymentMethod={handleAddNewPaymentMethod}
                      selectedPaymentMethod={selectedPaymentMethod}
                      isAuthenticated={isAuthenticated}
                      showCardForm={showCardForm}
                      setupIntentClientSecret={setupIntentClientSecret}
                      paymentIntentClientSecret={paymentIntentClientSecret}
                      intentType={paymentIntentClientSecret ? "payment" : setupIntentClientSecret ? "setup" : undefined}
                      cardFormRef={cardFormRef}
                      onCardElementChange={handleCardElementChange}
                      cardFormError={cardFormError}
                      isCreatingSetupIntent={createSetupIntent.isPending}
                    isCreatingPaymentIntent={createPaymentIntent.isPending}
                    isCreatingSubscription={isCreatingSubscription}
                    onPaymentMethodTypeChange={setPaymentMethodTypeFromElement}
                      billingDetails={resolvedBillingDetails}
                      amount={Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100)}
                      packageName={promoEnhancedPlan?.name || activePlan?.name}
                    />
                  )}

                  {/* Bonus Applied or Coupon Code - Only show for regular packages, not upsells */}
                  {promoEnhancedPlan?.metadata?.isUpsellOffer !== true && (
                    <div>
                      {/* Show Bonus Applied section when promo link is active */}
                      {promoLinkInfo?.isValid && promoLinkInfo.bonusEntries > 0 ? (
                        <div className="flex gap-2">
                          <div className="flex-1 h-11 px-2 sm:px-3 border border-gray-300 rounded-lg sm:rounded-xl bg-gray-50 flex items-center text-sm sm:text-base text-gray-700 dark:text-neutral-200">
                            {promoLinkInfo.bonusEntries} extra entries applied
                          </div>
                          <div className="h-11 bg-green-500 text-white px-2 sm:px-3 rounded-lg sm:rounded-xl flex items-center gap-1 sm:gap-2">
                            <Check size={12} />
                            <span className="text-xs font-bold">APPLIED</span>
                          </div>
                        </div>
                      ) : (
                        /* Regular coupon code input when no promo link is active */
                        <>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={couponCode}
                              onChange={(e) => {
                                const value = e.target.value.toUpperCase();
                                setCouponCode(value);
                                setCouponApplied(false);
                                setCouponType(null);
                                setReferralInfo(null);
                                setReferralError(null);
                                if (!value.trim()) {
                                  clearReferralCode();
                                }
                              }}
                              className="flex-1 h-11 px-2 sm:px-3 border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:border-transparent transition-all duration-300 text-sm sm:text-base bg-white text-gray-900 placeholder:text-gray-500 dark:bg-slate-800 dark:border-slate-600 dark:text-gray-100 dark:placeholder:text-gray-400"
                              style={{ ["--tw-ring-color" as string]: promoTheme.primary }}
                              placeholder="Enter coupon code"
                            />
                            {couponApplied ? (
                              <div className="h-11 bg-green-500 text-white px-2 sm:px-3 rounded-lg sm:rounded-xl flex items-center gap-1 sm:gap-2">
                                <Check size={12} />
                                <span className="text-xs font-bold">APPLIED</span>
                              </div>
                            ) : showApplyingIndicator ? (
                              <div className="h-11 flex items-center gap-2 text-xs text-gray-500 px-2 sm:px-3">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Applying...</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleCouponApply("manual")}
                                disabled={isApplyDisabled}
                                className="h-11 bg-gray-500 text-white px-2 sm:px-3 rounded-lg sm:rounded-xl hover:bg-gray-600 transition-colors text-xs sm:text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                Apply
                              </button>
                            )}
                          </div>
                          {referralInfo && (
                            <p className="mt-2 text-xs text-green-600">
                              Code confirmed! You and {referralInfo.referrerName} will receive 100 bonus entries when you
                              complete your purchase.
                            </p>
                          )}
                          {referralError && <p className="mt-2 text-xs text-red-600">{referralError}</p>}
                        </>
                      )}
                    </div>
                  )}

                  {/* Purchase Button - Moved above Selected Package for better UX */}
                  {/* Option A (wallet UX): when Google Pay or Apple Pay is selected, hide main Purchase and show instruction to click wallet button in form */}
                  {isPlaceholderPlan ? (
                    // Payment Button Skeleton – user must select a package first
                    <div className="h-11 bg-gray-200 rounded-lg animate-pulse"></div>
                  ) : (paymentMethodTypeFromElement === "google_pay" || paymentMethodTypeFromElement === "googlePay" || paymentMethodTypeFromElement === "apple_pay" || paymentMethodTypeFromElement === "applePay") ? (
                    <div className="rounded-lg sm:rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4 text-center">
                      <p className="text-sm font-medium text-amber-900">
                        To pay with {(paymentMethodTypeFromElement === "google_pay" || paymentMethodTypeFromElement === "googlePay") ? "Google Pay" : "Apple Pay"}, click the{" "}
                        {(paymentMethodTypeFromElement === "google_pay" || paymentMethodTypeFromElement === "googlePay") ? "Google Pay" : "Apple Pay"} button in the payment form above—do not use a separate Purchase button.
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        This keeps your payment secure and avoids browser restrictions.
                      </p>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!isFormValid() || isSubmitting}
                      variant="metallic"
                      fullWidth
                      size="lg"
                      loading={isSubmitting || createPaymentIntent.isPending || createSetupIntent.isPending}
                      className="h-11 !py-0 font-bold text-sm sm:text-base"
                    >
                      {isSubmitting ? (
                        "Processing..."
                      ) : createPaymentIntent.isPending || createSetupIntent.isPending ? (
                        "Setting up payment..."
                      ) : isAuthenticated ? (
                        <>
                          <span className="sm:hidden">PURCHASE & ENTER</span>
                          <span className="hidden sm:inline">PURCHASE & ENTER THE DRAW</span>
                        </>
                      ) : (
                        <>
                          <span className="sm:hidden">PURCHASE</span>
                          <span className="hidden sm:inline">PURCHASE</span>
                        </>
                      )}
                    </Button>
                  )}

                  {/* Selected Package */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl p-2 sm:p-3">
                    {!promoEnhancedPlan || promoEnhancedPlan.id === "placeholder" || promoEnhancedPlan.id.startsWith("placeholder-") ? (
                      // Package Selection Skeleton
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-32"></div>
                        <div className="border rounded-lg sm:rounded-xl p-2 sm:p-3 bg-gray-100">
                          <div className="space-y-2">
                            <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4"></div>
                            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
                            <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3"></div>
                          </div>
                        </div>
                      </div>
                    ) : (() => {
                        const planId = promoEnhancedPlan?.metadata?.isUpsellOffer
                          ? "power-pack"
                          : (promoEnhancedPlan?.id || "power-pack");
                        const isMembershipTab = promoEnhancedPlan?.period !== "one-time";
                        const pkgScheme = getPackageColorSchemeForPromo(planId, isMembershipTab, contextVariantConfig);
                        const accentHex = promoEnhancedPlan?.metadata?.isUpsellOffer
                          ? promoTheme.primary
                          : (pkgScheme.accentHexLight ?? pkgScheme.accentHex);
                        const isPackageCard = Boolean(
                          promoEnhancedPlan?.id &&
                            (promoEnhancedPlan.id.startsWith("mini-pack-") ||
                              promoEnhancedPlan.id.includes("apprentice") ||
                              promoEnhancedPlan.id.includes("tradie") ||
                              promoEnhancedPlan.id.includes("foreman") ||
                              promoEnhancedPlan.id.includes("boss") ||
                              promoEnhancedPlan.id.includes("power-pack") ||
                              promoEnhancedPlan.id.includes("vip"))
                        );
                        const cardBorderColor = isPackageCard ? `${accentHex}${pkgScheme.cardBorderOpacity}` : undefined;
                        const nameStyle = isPackageCard && pkgScheme.textGradientStyle
                          ? pkgScheme.textGradientStyle
                          : isPackageCard
                            ? { color: accentHex }
                            : undefined;
                        const bonusBorderColor = isPackageCard ? `${accentHex}4D` : `${promoTheme.primary}4D`;
                        const bonusTextColor = isPackageCard ? accentHex : promoTheme.primary;
                        const selectedCatalogId = (() => {
                          const api = convertToAPIPlan(promoEnhancedPlan, [...subscriptionPackages, ...oneTimePackages]);
                          return (api?._id || promoEnhancedPlan.id).trim();
                        })();
                        const parseSelectedEntries = (value: unknown) => {
                          if (typeof value === "number") return value;
                          const parsed = parseInt(String(value ?? 0), 10);
                          return Number.isNaN(parsed) ? 0 : parsed;
                        };
                        let selectedEntriesCount = parseSelectedEntries(promoEnhancedPlan?.metadata?.entriesCount);
                        if (selectedEntriesCount <= 0) {
                          const staticPkg = getPackageById(selectedCatalogId);
                          if (staticPkg?.type === "subscription" && staticPkg.entriesPerMonth) {
                            selectedEntriesCount = staticPkg.entriesPerMonth;
                          } else if (staticPkg?.type === "one-time" && staticPkg.totalEntries) {
                            selectedEntriesCount = staticPkg.totalEntries;
                          }
                        }
                        return (
                      <>
                        <h3
                          className={`text-xs sm:text-sm font-bold mb-1 sm:mb-2 ${
                            promoEnhancedPlan?.metadata?.isUpsellOffer === true ? "" : "text-gray-800 dark:text-neutral-100"
                          }`}
                          style={promoEnhancedPlan?.metadata?.isUpsellOffer === true ? { color: promoTheme.primary } : undefined}
                        >
                          {promoEnhancedPlan?.metadata?.isUpsellOffer === true ? "Limited Offer" : "Selected Package"}
                        </h3>
                        <div
                          className="rounded-lg sm:rounded-xl p-2 sm:p-3"
                          style={
                            cardBorderColor
                              ? {
                                  border: `2px solid ${cardBorderColor}`,
                                  backgroundImage: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
                                }
                              : {
                                  border: "2px solid transparent",
                                  backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${accentHex}, transparent)`,
                                  backgroundOrigin: "border-box",
                                  backgroundClip: "padding-box, border-box",
                                }
                          }
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <h4
                                className={`font-bold text-xs sm:text-sm leading-tight ${nameStyle ? "" : ""}`}
                                style={nameStyle ?? (isPackageCard ? { color: accentHex } : undefined)}
                              >
                                {promoEnhancedPlan?.name || "No package selected"}
                              </h4>
                              <p
                                className={`text-xs sm:text-sm leading-tight ${!isPackageCard ? "text-gray-600 dark:text-neutral-400" : ""}`}
                                style={
                                  isPackageCard && pkgScheme.textGradientStyle
                                    ? { ...pkgScheme.textGradientStyle, opacity: 0.9 }
                                    : isPackageCard
                                      ? { color: accentHex }
                                      : undefined
                                }
                              >
                                {promoEnhancedPlan?.features && promoEnhancedPlan.features.length > 0
                                  ? promoEnhancedPlan.features[0].text
                                  : promoEnhancedPlan?.subtitle || "No package selected"}
                              </p>
                              {selectedEntriesCount > 0 ? (
                                <p
                                  className={`text-xs sm:text-sm leading-tight ${!isPackageCard ? "text-gray-600 dark:text-neutral-400" : ""}`}
                                  style={
                                    isPackageCard && pkgScheme.textGradientStyle
                                      ? { ...pkgScheme.textGradientStyle, opacity: 0.85 }
                                      : isPackageCard
                                        ? { color: accentHex }
                                        : undefined
                                  }
                                >
                                  {promoEnhancedPlan?.period === "mo"
                                    ? `${selectedEntriesCount} free entries every month`
                                    : `${selectedEntriesCount} free entries`}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-col gap-0.5 items-end shrink-0">
                              <div
                                className={`font-bold text-xs sm:text-sm leading-tight ${pkgScheme.textGradientStyle ? "" : ""}`}
                                style={
                                  isPackageCard && pkgScheme.textGradientStyle
                                    ? pkgScheme.textGradientStyle
                                    : isPackageCard
                                      ? { color: accentHex }
                                      : undefined
                                }
                              >
                                {promoEnhancedPlan?.price && promoEnhancedPlan?.period
                                  ? promoEnhancedPlan.period === "one-time"
                                    ? `$${promoEnhancedPlan.price} One Time Payment`
                                    : `$${promoEnhancedPlan.price} Per Giveaway`
                                  : "No price"}
                              </div>
                              {promoEnhancedPlan?.metadata?.isUpsellOffer !== true && (
                                <button
                                  onClick={handlePackageChange}
                                  type="button"
                                  className="relative z-10 text-xs sm:text-sm leading-tight text-white underline decoration-white underline-offset-2 hover:no-underline hover:text-white transition-all duration-200 cursor-pointer"
                                >
                                  Change
                                </button>
                              )}
                            </div>
                          </div>
                          {promoEnhancedPlan?.metadata?.isPromoActive &&
                            promoEnhancedPlan?.metadata?.promoMultiplier && (
                              <div
                                className="mt-3 pt-3 border-t"
                                style={{ borderColor: bonusBorderColor }}
                              >
                                <div className="flex items-center justify-center gap-2">
                                  <span className="text-xs sm:text-sm font-semibold" style={{ color: bonusTextColor }}>
                                    <HexagonalPromoBadge
                                      multiplier={promoEnhancedPlan.metadata.promoMultiplier as PromoMultiplier}
                                      size="xs"
                                    />
                                  </span>
                                  <span className="text-xs sm:text-sm text-white font-bold">
                                    {promoEnhancedPlan.metadata.promoMultiplier}x Bonus entries have been applied
                                  </span>
                                </div>
                              </div>
                            )}
                        </div>
                      </>
                    );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Security Section - Only visible in payment step (no border) */}
            {currentStep === 2 && (
              <div className="mt-4 sm:mt-6">
                <div className="flex justify-center w-full">
                  <div className="w-full max-w-full bg-[#ffffff] rounded-lg p-2">
                    <Image
                      src="/images/safe-checkout-stripe.webp"
                      alt="Guaranteed safe & secure checkout powered by Stripe"
                      width={600}
                      height={160}
                      className="w-full h-auto"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Major draw winners: two per slide; tap opens FullscreenImageViewer (not a route) */}
            {currentStep !== 2 && (
              <div className="mt-3 sm:mt-4">
                {majorDrawWinnersLoading || majorDrawWinners.length > 0 ? (
                  majorDrawWinnersLoading ? (
                    <div className="grid h-[92px] sm:h-[104px] w-full grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-200 dark:bg-neutral-800">
                      <div className="animate-pulse bg-gray-100 dark:bg-neutral-900" />
                      <div className="animate-pulse bg-gray-100 dark:bg-neutral-900" />
                    </div>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onWinnerStripClick();
                        }
                      }}
                      className="group block cursor-pointer rounded-xl outline-none transition-opacity hover:opacity-[0.98] focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-red-500 dark:focus-visible:ring-offset-neutral-950"
                      aria-label="View winner photos full screen"
                      title="View full screen"
                    >
                      <div
                        ref={winnerCarouselRef}
                        onPointerDown={onWinnerStripPointerDown}
                        onPointerMove={onWinnerStripPointerMove}
                        onPointerUp={onWinnerStripPointerEnd}
                        onPointerCancel={onWinnerStripPointerEnd}
                        onClick={onWinnerStripClick}
                        className="flex w-full overflow-x-auto snap-x snap-mandatory rounded-xl border border-gray-200 dark:border-neutral-700 shadow-sm dark:shadow-black/20 [scrollbar-width:thin] scroll-smooth group-hover:border-gray-300 dark:group-hover:border-neutral-600"
                      >
                        {majorDrawWinnerPairs.map(([left, right]) => (
                          <div
                            key={`${left.id}-${right?.id ?? "single"}`}
                            className="grid h-[92px] sm:h-[104px] w-full min-w-full flex-shrink-0 snap-center grid-cols-2 gap-px overflow-hidden bg-neutral-800 dark:bg-neutral-900"
                          >
                            {renderMajorDrawWinnerTile(left)}
                            {right ? (
                              renderMajorDrawWinnerTile(right)
                            ) : (
                              <div className="h-full min-h-0 bg-neutral-900/80 dark:bg-neutral-950" aria-hidden />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
      </ModalContent>

      {/* Package Selection Modal */}
      <PackageSelectionModal
        isOpen={isPackageSelectionOpen}
        onClose={() => setIsPackageSelectionOpen(false)}
        currentPlan={activePlan}
        onPlanSelect={handlePackageSelect}
      />

      {/* Existing Account Modal - shown when user tries to register with existing account that has purchases */}
      <ExistingAccountModal
        isOpen={showExistingAccountModal}
        onClose={() => {
          setShowExistingAccountModal(false);
          setExistingAccountEmail(undefined); // Reset email when modal closes
          // ✅ FIX: Don't close main modal when sub-modal closes
        }}
        conflictField={existingAccountConflictField}
        email={existingAccountEmail || formData.email}
      />

      {/* Payment Processing Screen */}
      {showPaymentProcessing && paymentIntentId && (
        <PaymentProcessingScreen
          paymentIntentId={paymentIntentId}
          packageName={processingPackageName}
          packageType={processingPackageType}
          packageId={catalogPackageIdForBenefits}
          isVisible={showPaymentProcessing}
          onSuccess={handlePaymentProcessingSuccess}
          onError={handlePaymentProcessingError}
          onTimeout={handlePaymentProcessingTimeout}
          onStillProcessingDismiss={handlePaymentProcessingTimeout}
        />
      )}

      {/* Payment Confirmation Modal removed - subscription confirmation now handled directly in handleSubmit */}
    </ModalContainer>

    <FullscreenImageViewer
      nested
      isOpen={winnerViewerOpen}
      images={winnerFullscreenImages}
      initialIndex={winnerViewerInitialIndex}
      onClose={() => setWinnerViewerOpen(false)}
      title="Major draw winners"
    />
    </>
  );
};

export default MembershipModal;
