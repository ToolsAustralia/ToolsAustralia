"use client";

/**
 * MembershipModal — decomposed from a 5891-LOC flat file into the canonical
 * orchestrator-folder pattern.
 *
 * Public API (props) is preserved byte-identically — all callers continue to
 * work without modification because the folder/index.tsx resolves as the same
 * import path.
 *
 * STRIPE PRESERVATION INVARIANTS:
 * 1. `getStripePromise()` resolves at module scope (Stripe prohibits
 *    re-instantiation per render). Stored as `stripePromise` and passed down
 *    transitively via PaymentMethodSelector (which has its own module-scope
 *    singleton — both call the same memoized factory).
 * 2. `cardFormRef` is owned at the orchestrator level and forwarded to
 *    PaymentMethodSelector. The orchestrator's confirmStripeIntent() call
 *    sites continue to work unchanged.
 * 3. All payment intent / setup intent state, recovery flows, finalize-invoice
 *    timing, subscription cancel/recreate logic, sessionStorage caching keys,
 *    and 3DS confirmation paths are byte-identical to the original.
 * 4. All useEffect dependency arrays are preserved exactly to keep render-time
 *    behavior unchanged.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import PackageSelectionModal from "../PackageSelectionModal";
import { formatNamePart } from "@/utils/display-name";
import ExistingAccountModal from "../ExistingAccountModal";
import { ModalContainer, ModalHeader, ModalContent } from "../ui";
import { useLoading } from "@/contexts/LoadingContext";
import { type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useStripeSubscription } from "@/hooks/useStripeSubscription";
import { getStripePromise } from "@/lib/stripe-client";
import { useMemberships } from "@/hooks/useMemberships";
import { cn } from "@/utils/cn";

// Module-scope Stripe singleton — Stripe prohibits re-instantiation per render.
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
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { convertUpsellToLocalPlan } from "@/utils/membership/membership-adapters";
import { UpsellOffer, UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";
import { getPackageBaseEntries } from "@/utils/payment/package-base-entries";
import { PaymentProcessingScreen } from "@/components/loading";
import { type PaymentStatusResponse } from "@/hooks/queries";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";
import { useToast } from "@/components/ui/Toast";
import { trackCompleteRegistration, trackFacebookEvent } from "@/components/FacebookPixel";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { buildCheckoutResumeUrl } from "@/utils/integrations/klaviyo/checkout-resume-url";
import { useSetupIntent } from "@/hooks/useSetupIntent";
import { usePaymentIntent } from "@/hooks/usePaymentIntent";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import { useReferralCode } from "@/hooks/useReferralCode";
import { useAffiliateLink } from "@/hooks/useAffiliateLink";
import { usePromoLink } from "@/hooks/usePromoLink";
import { extractAttributionParams } from "@/utils/tracking/utm-helpers";
import { getStoredUTMParams } from "@/utils/tracking/utm-storage";
import { getFBCFromURL, getFBPFromCookie } from "@/utils/tracking/facebook-helpers";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { useMajorDrawWinners } from "@/hooks/queries/useWinnersQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { rewardsEnabled } from "@/config/featureFlags";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { getReceiptLabelByPackageId } from "@/utils/membership/getReceiptLabel";
import { getPartnerDiscountBenefitTextForPackageId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { hasBundledMultiplierAssets, isPromoMultiplier } from "@/types/promo-multiplier";
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
import { isStripeNoiseError } from "@/utils/payment/stripe/is-stripe-noise-error";
import { markErrorHandled, isErrorHandled } from "@/utils/payment/stripe/error-handled-marker";
import { recoverSetupIntent } from "@/utils/payment/stripe/setup-intent-recovery";
import { getStatePreservationInstructions } from "@/utils/payment/stripe/payment-state-preservation";

import StepIndicator from "./StepIndicator";
import WinnerStrip from "./WinnerStrip";
import RegistrationStep from "./RegistrationStep";
import PaymentStep from "./PaymentStep";

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
  const [isRegistering, setIsRegistering] = useState(false);
  const [upsellTriggered, setUpsellTriggered] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  /** Code that arrived via the `openMembershipModal` prefill event and should be AUTO-applied
   *  (campaign coupons from the rewards unlock flow) — a prefill-only code the user must manually
   *  "Apply" loses the coupon carry entirely if they pay without clicking Apply. */
  const [pendingAutoApplyCode, setPendingAutoApplyCode] = useState<string | null>(null);
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

  const [registrationErrors, setRegistrationErrors] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    general?: string;
  }>({});

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SavedPaymentMethod | null>(null);
  const [useSavedPaymentMethod, setUseSavedPaymentMethod] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [isCreatingSubscription, setIsCreatingSubscription] = useState(false);
  const [paymentMethodTypeFromElement, setPaymentMethodTypeFromElement] = useState<string | null>(null);
  // Gates the Purchase button on the Stripe PaymentElement's `ready` event.
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);

  // Stripe Elements state
  const [setupIntentClientSecret, setSetupIntentClientSecret] = useState<string | null>(null);
  const [paymentIntentClientSecret, setPaymentIntentClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [cardFormError, setCardFormError] = useState<string | null>(null);
  // Reset readiness whenever the PaymentElement will remount (new client secret
  // or the card form (re)opens) so the button re-gates until `ready` fires again.
  useEffect(() => {
    setIsPaymentElementReady(false);
  }, [paymentIntentClientSecret, setupIntentClientSecret, showCardForm]);
  const lastPaymentIntentAmountRef = useRef<number | null>(null);
  const isCreatingPaymentIntentRef = useRef<boolean>(false);
  const isCreatingSetupIntentRef = useRef<boolean>(false);
  const checkoutSubmitLockRef = useRef(false);
  /** Fires-once guard for Meta InitiateCheckout per active plan lifetime; prevents double-fire on rapid clicks. Reset when activePlan changes or modal closes. */
  const initiateCheckoutFiredRef = useRef(false);
  const isCreatingSubscriptionRef = useRef<boolean>(false);
  const SUBSCRIPTION_CHECKOUT_STORAGE_KEY = "membership_subscription_checkout";
  const SUBSCRIPTION_CHECKOUT_STALE_MS = 60 * 60 * 1000;
  const subscriptionCreatedRef = useRef<string | null>(null);
  const subscriptionPackageIdRef = useRef<string | null>(null);
  const previousSubscriptionToCancelRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const lastChargedStaticPackageIdRef = useRef<string | null>(null);
  const [pendingFirstSubscriptionConfirm, setPendingFirstSubscriptionConfirm] = useState(false);
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
  const [processingPackageName, setProcessingPackageName] = useState<string>("");
  const [processingPackageType, setProcessingPackageType] = useState<
    "one-time" | "membership" | "upsell" | "mini-draw"
  >("membership");

  const [originalPurchaseContext, setOriginalPurchaseContext] = useState<OriginalPurchaseContext | null>(null);

  const [showExistingAccountModal, setShowExistingAccountModal] = useState(false);
  const [existingAccountConflictField, setExistingAccountConflictField] = useState<"email" | "mobile">("email");
  const [existingAccountEmail, setExistingAccountEmail] = useState<string | undefined>(undefined);

  const { data: majorDrawWinners = [], isLoading: majorDrawWinnersLoading } = useMajorDrawWinners();
  const [winnerViewerOpen, setWinnerViewerOpen] = useState(false);
  const [winnerViewerInitialIndex, setWinnerViewerInitialIndex] = useState(0);

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

  const packageSelectionAutoOpenedRef = useRef<boolean>(false);

  const placeholderPlan = React.useMemo<LocalMembershipPlan>(
    () => ({
      id: "placeholder",
      name: "Select a package",
      price: 0,
      period: "one-time",
      features: [],
      subtitle: "Please select a package to continue",
      isAdditional: false,
      buttonText: "Select",
      buttonStyle: "primary",
      metadata: {
        entriesCount: 0,
      },
    }),
    []
  );

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

  const isPlaceholderPlan =
    !activePlan || activePlan.id === "placeholder" || activePlan.id.startsWith("placeholder-");

  // Hooks for API integration
  const { createSubscription, createOneTimePurchase, createSubscriptionExistingUser } = useStripeSubscription();
  const { subscriptionPackages, oneTimePackages } = useMemberships();
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

  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedMiniMultiplier = useResolvedMultiplier("mini-packages", "display");

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
  const { trackKlaviyoStartedCheckout } = useKlaviyoTracking();
  const { data: userMajorDrawStats } = useUserMajorDrawStats(userData?._id);
  const { savePaymentMethod } = useSavedPaymentMethods();
  const purchaseMembership = usePurchaseMembership();
  const purchaseUpsell = usePurchaseUpsell();
  const createSetupIntent = useSetupIntent();
  const createPaymentIntent = usePaymentIntent();
  const { showLoading, hideLoading, showSuccess } = useLoading();

  const queryClient = useQueryClient();

  const invalidateUserCaches = useCallback(
    (userId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rewards.user(userId) });
    },
    [queryClient]
  );

  const handleClose = useCallback(async () => {
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
      }
    }

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

  useEffect(() => {
    if (isOpen) {
      setUpsellTriggered(false);
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);
      setProcessingPackageName("");
      setProcessingPackageType(undefined as unknown as "one-time" | "membership" | "upsell" | "mini-draw");
      subscriptionCreatedRef.current = null;
      subscriptionPackageIdRef.current = null;
      previousSubscriptionToCancelRef.current = null;
      // Reset Meta InitiateCheckout fires-once guard so a fresh modal session can fire again
      initiateCheckoutFiredRef.current = false;
      setIsCreatingSubscription(false);
      setPaymentMethodTypeFromElement(null);
      userIdRef.current = null;
    } else {
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);
      setProcessingPackageName("");
      setProcessingPackageType(undefined as unknown as "one-time" | "membership" | "upsell" | "mini-draw");
    }
  }, [isOpen]);

  // Reset Meta InitiateCheckout fires-once guard when the user changes their selected package.
  // Switching packages is a meaningful re-intent — let the next click fire again with the new value.
  useEffect(() => {
    initiateCheckoutFiredRef.current = false;
  }, [activePlan?.id]);

  const [currentStep, setCurrentStep] = useState(1); // Start neutral, will be updated by useEffect based on auth

  const hasCompletedRegistration = isAuthenticated || guestUserData !== null;

  useEffect(() => {
    const validatePromoLink = async () => {
      if (!promoLinkCode || !isOpen) {
        setPromoLinkInfo(null);
        return;
      }

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

  useEffect(() => {
    setUseSavedPaymentMethod(isAuthenticated);
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && userData && isOpen) {
      setFormData((prevFormData) => ({
        firstName: userData.firstName || prevFormData.firstName,
        lastName: userData.lastName || prevFormData.lastName,
        email: userData.email || prevFormData.email,
        phone: userData.mobile || prevFormData.phone,
        cardNumber: prevFormData.cardNumber,
        expiryDate: prevFormData.expiryDate,
        cvv: prevFormData.cvv,
      }));

      setCurrentStep(2);
    } else if (!isAuthenticated && isOpen) {
      setCurrentStep(1);
    }
  }, [isAuthenticated, userData, isOpen]);

  useEffect(() => {
    const isPromotionsPage = pathname?.match(/^\/promotions\/([^/?#]+)/) !== null;
    const shouldAutoOpen = finalMembershipModalConfig == null
      ? isPromotionsPage
      : (finalMembershipModalConfig.showPackageSelectionFirst !== false);

    if (
      isOpen &&
      currentStep === 2 &&
      shouldAutoOpen &&
      !packageSelectionAutoOpenedRef.current &&
      !isPackageSelectionOpen
    ) {
      // EXPLICIT selection-first (config.showPackageSelectionFirst === true, e.g. dashboard
      // "Become a member" with no plan): open the picker synchronously — selection IS the first
      // view. The 300ms timer made the placeholder payment step (grey skeletons) the guaranteed
      // first paint, and because callers pass the config as an inline object, every parent
      // re-render re-ran this effect and RESET the timer — starving the overlay indefinitely.
      if (finalMembershipModalConfig?.showPackageSelectionFirst === true) {
        setIsPackageSelectionOpen(true);
        packageSelectionAutoOpenedRef.current = true;
        return;
      }
      // Implicit promotions-page auto-open keeps its intentional 300ms delay (hero paints first).
      const timer = setTimeout(() => {
        setIsPackageSelectionOpen(true);
        packageSelectionAutoOpenedRef.current = true;
      }, 300);

      return () => clearTimeout(timer);
    }

    if (!isOpen) {
      packageSelectionAutoOpenedRef.current = false;
    }
  }, [isOpen, currentStep, pathname, isPackageSelectionOpen, finalMembershipModalConfig]);

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

  useEffect(() => {
    const handleUpsellPayment = (event: CustomEvent) => {
      const { offer } = event.detail;

      if (!offer) {
        console.error("❌ No upsell offer in event detail");
        return;
      }

      const upsellPlan = convertUpsellToLocalPlan(offer);

      if (onPlanChange) {
        onPlanChange(upsellPlan);
      }

      const openModalEvent = new CustomEvent("openMembershipModal", {
        detail: { plan: upsellPlan },
      });
      window.dispatchEvent(openModalEvent);
    };

    window.addEventListener("showUpsellPayment", handleUpsellPayment as EventListener);

    return () => {
      window.removeEventListener("showUpsellPayment", handleUpsellPayment as EventListener);
    };
  }, [onPlanChange]);

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
      // Auto-apply the incoming code once state settles (effect below) — mirrors
      // SpecialPackagesModal's initialCouponCode auto-apply, so the rewards unlock
      // flow's code is actually carried on the purchase without a manual Apply click.
      setPendingAutoApplyCode(incomingCode);
    };

    window.addEventListener("openMembershipModal", handleOpenMembershipModalPrefill as EventListener);
    return () => {
      window.removeEventListener("openMembershipModal", handleOpenMembershipModalPrefill as EventListener);
    };
  }, []);

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

  useEffect(() => {
    const isSubscription = activePlan?.period === "mo";
    const currentHasPaymentIntent = !!paymentIntentClientSecret;
    const currentHasSetupIntent = !!setupIntentClientSecret;
    const newAmount = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
    const lastAmount = lastPaymentIntentAmountRef.current;

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
        setShowCardForm(false);
      }
    }

    if (!isSubscription && currentHasSetupIntent) {
      console.log("🔄 Package type changed to one-time - clearing SetupIntent");
      setSetupIntentClientSecret(null);
      setShowCardForm(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan?.period, activePlan?.price, promoEnhancedPlan?.price]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const isSubscription = activePlan?.period === "mo";
    const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);

    const isInPaymentFlow = currentStep >= 2;
    const hasCompletedRegistration = isAuthenticated || guestUserData !== null;
    const isActualPlan = !isPlaceholderPlan;
    const _shouldCreatePaymentIntent =
      isInPaymentFlow && hasCompletedRegistration && isActualPlan && (showCardForm || isSubscription);

    if (currentStep === 2 && hasCompletedRegistration && isActualPlan) {
      const isSubscription = activePlan?.period === "mo";
      const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);

      if (isSubscription && !isCreatingSubscriptionRef.current) {
        const currentPackageId = packageId || null;

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
            // Background pre-warm: do NOT toast here. The purchase-click handler
            // ("Active Subscription Found") is the single source of this message,
            // so the user sees exactly one actionable toast.
            console.warn("[MembershipModal] pre-warm blocked by EXISTING_SUBSCRIPTION (toast deferred to purchase click)");
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

    const lastAmount = lastPaymentIntentAmountRef.current;
    const amountChanged = lastAmount !== null && lastAmount !== amountInCents;
    const _needsPaymentIntent = !paymentIntentClientSecret || amountChanged;

    if (showCardForm && (paymentIntentClientSecret || setupIntentClientSecret)) {
      const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
      const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
      const packageName = promoEnhancedPlan?.name || activePlan?.name;
      const isSubscription = activePlan?.period === "mo";

      if (isCreatingPaymentIntentRef.current) {
        return;
      }

      if (isSubscription) {
        return;
      }

      if (amountInCents > 0 && !isSubscription) {
        const lastAmount = lastPaymentIntentAmountRef.current;
        const shouldRecreate = !paymentIntentClientSecret || lastAmount === null || lastAmount !== amountInCents;

        if (shouldRecreate) {
          console.log("🔄 Recreating PaymentIntent for package change:", {
            oldAmount: lastAmount,
            newAmount: amountInCents,
            packageName,
            hasPaymentIntent: !!paymentIntentClientSecret,
          });

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
              onError: () => {
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
    activePlan?.id,
    promoEnhancedPlan?.price,
    promoEnhancedPlan?.name,
    paymentIntentClientSecret,
    setupIntentClientSecret,
    showCardForm,
    currentStep,
    isAuthenticated,
    guestUserData,
    userData?.email,
    guestUserData?.email,
    isOpen,
  ]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const formatMobileNumber = (value: string) => {
    if (!value || typeof value !== "string") {
      return "";
    }

    const v = value.replace(/[^\d+]/g, "");

    if (v.startsWith("+61")) {
      const digits = v.substring(3);
      if (digits.length <= 9) {
        if (digits.length === 9) {
          return "+61 " + digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
        }
        return "+61 " + digits;
      }
      return v;
    } else if (v.startsWith("61") && v.length > 2) {
      const digits = v.substring(2);
      if (digits.length <= 9) {
        if (digits.length === 9) {
          return "+61 " + digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
        }
        return "+61 " + digits;
      }
      return v;
    } else if (v.startsWith("0")) {
      if (v.length <= 10) {
        if (v.length === 10) {
          return v.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3");
        }
        return v;
      }
      return v;
    } else if (v.startsWith("4") || v.startsWith("5")) {
      if (v.length <= 9) {
        if (v.length === 9) {
          return "0" + v.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
        }
        return "0" + v;
      }
      return v;
    }

    return v;
  };

  const validateMobileNumber = (mobile: string): boolean => {
    const cleaned = mobile.replace(/\s+/g, "");

    const patterns = [
      /^\+61[4-5]\d{8}$/,
      /^61[4-5]\d{8}$/,
      /^0[4-5]\d{8}$/,
      /^[4-5]\d{8}$/,
    ];

    return patterns.some((pattern) => pattern.test(cleaned));
  };

  const getPhoneMaxLength = (value: string): number => {
    if (!value) return 16;

    const cleaned = value.replace(/[^\d+]/g, "");

    if (cleaned.startsWith("+61")) {
      return 15;
    } else if (cleaned.startsWith("61")) {
      return 15;
    } else if (cleaned.startsWith("0")) {
      return 12;
    } else if (cleaned.startsWith("4") || cleaned.startsWith("5")) {
      return 12;
    }

    return 16;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    if (registrationErrors[field as keyof typeof registrationErrors]) {
      setRegistrationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof typeof registrationErrors];
        return newErrors;
      });
    }
  };

  const handleRegistration = async () => {
    setIsRegistering(true);
    setRegistrationErrors({});

    // Track Meta InitiateCheckout for the new-user signup path BEFORE the network request.
    // This mirrors the existing fire in handleSubmit for logged-in users — new-user signups
    // previously bypassed it. Hybrid Pixel + CAPI (shared event_id); the guest's form PII is
    // attached as the 3rd arg so the CAPI event carries identity (hashed server-side).
    try {
      if (!initiateCheckoutFiredRef.current && activePlan) {
        initiateCheckoutFiredRef.current = true;
        const packagePrice = activePlan?.price || 0;
        trackInitiateCheckout(
          {
            value: packagePrice,
            currency: "AUD",
            numItems: 1,
          },
          undefined,
          {
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            phone: formData.phone,
            country: "AU",
          },
        );
      }
    } catch {
      // Non-blocking — never fail registration on tracking error
    }

    // NOTE: Klaviyo "Started Checkout" for the guest path is fired SERVER-SIDE
    // from /api/auth/register (after ensureUserProfileSynced), not here. That
    // avoids a race where klaviyo.track() on the client would fire before the
    // onsite cookie is set for a never-cookied guest — see spec §5 "Fire strategy"
    // and docs/tracking/KLAVIYO_INTEGRATION.md "Canonical property names".
    // The packageId is passed through the registration POST below so the server
    // can resolve the package and emit the event with the canonical schema.

    // Extract promotion slug from current URL if on promotions page
    // Format: /promotions/[slug] -> extract slug
    let promotionSlug: string | undefined;
    try {
      const currentPathname = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
      const promotionsMatch = currentPathname.match(/^\/promotions\/([^/?#]+)/);
      if (promotionsMatch && promotionsMatch[1]) {
        promotionSlug = promotionsMatch[1];
      }
    } catch {
      // Non-blocking
    }

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
      // Non-blocking
    }

    const fbc = typeof window !== "undefined" ? getFBCFromURL() : undefined;
    const fbp = typeof window !== "undefined" ? getFBPFromCookie() : undefined;

    // Resolve the selected packageId so the server can fire a canonical Klaviyo
    // `Started Checkout` (step="registered") event with the right package context.
    // Omitted gracefully on Google-OAuth / affiliate / other paths that don't
    // pass through the modal.
    const selectedPackageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);

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
          affiliateCode: affiliateCode || undefined,
          promotionSlug: promotionSlug,
          ...(selectedPackageId ? { packageId: selectedPackageId } : {}),
          ...(attributionParams.utm_source && { utm_source: attributionParams.utm_source }),
          ...(attributionParams.utm_medium && { utm_medium: attributionParams.utm_medium }),
          ...(attributionParams.utm_campaign && { utm_campaign: attributionParams.utm_campaign }),
          ...(attributionParams.utm_content && { utm_content: attributionParams.utm_content }),
          ...(attributionParams.utm_term && { utm_term: attributionParams.utm_term }),
          ...(attributionParams.campaign_id && { campaign_id: attributionParams.campaign_id }),
          ...(attributionParams.adset_id && { adset_id: attributionParams.adset_id }),
          ...(attributionParams.ad_id && { ad_id: attributionParams.ad_id }),
          ...(fbc && { fbc }),
          ...(fbp && { fbp }),
        }),
      });

      const result = await response.json();

      if (result.success) {
        try {
          if (result.data.pixelEventId) {
            trackFacebookEvent("CompleteRegistration", {
              eventID: result.data.pixelEventId,
              content_type: "user",
              registration_method: "email",
            });
          } else {
            trackCompleteRegistration();
          }
        } catch (pixelError) {
          console.error("❌ Error tracking CompleteRegistration client-side:", pixelError);
        }

        setGuestUserData({
          userId: result.data.userId,
          email: result.data.email,
          firstName: result.data.firstName,
          lastName: result.data.lastName,
          mobile: result.data.mobile,
        });

        showToast({
          type: "success",
          title: "Step 1 Completed!",
          message: `Welcome ${formatNamePart(formData.firstName)}! Now let's set up your payment method to complete your membership.`,
          duration: 8000,
        });

        setCurrentStep(2);

        setShowCardForm(true);

        const isSubscription = activePlan?.period === "mo";
        const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
        const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
        const packageName = promoEnhancedPlan?.name || activePlan?.name;

        try {
          if (isSubscription) {
            setCardFormError(null);
          } else if (amountInCents > 0) {
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
              setSetupIntentClientSecret(null);
              setCardFormError(null);
              lastPaymentIntentAmountRef.current = amountInCents;
            } else {
              throw new Error(paymentResult.error || "Failed to create PaymentIntent");
            }
          } else {
            const setupResult = await createSetupIntent.mutateAsync();

            if (setupResult.success && setupResult.client_secret) {
              setSetupIntentClientSecret(setupResult.client_secret);
              setPaymentIntentClientSecret(null);
              setCardFormError(null);
            } else {
              throw new Error(setupResult.error || "Failed to create SetupIntent");
            }
          }
        } catch (error: unknown) {
          console.error("Failed to create payment intent:", error);

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
        console.error("❌ Registration failed:", result.error);

        if (result.isExistingAccount || result.message?.includes("has made purchases")) {
          const conflictField = result.field === "email" ? "email" : "mobile";
          setExistingAccountConflictField(conflictField);
          setExistingAccountEmail(result.existingAccountEmail || formData.email);
          setShowExistingAccountModal(true);
          setRegistrationErrors({});
        } else {
          if (result.field) {
            setRegistrationErrors({
              [result.field]: result.message,
            });
          } else {
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

  const handleStepClick = (step: 1 | 2) => {
    if (step === 1) {
      setCurrentStep(1);
      return;
    }
    if (step === 2 && hasCompletedRegistration) {
      handleRegistration();
      setCurrentStep(2);
    }
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (hasCompletedRegistration) {
        handleRegistration();
        setCurrentStep(2);
        return;
      }

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

  // Auto-apply a code that arrived via the `openMembershipModal` prefill event (rewards unlock
  // flow). One-shot: the pending flag clears BEFORE applying so a failed validation surfaces its
  // error once and never loops; the user can still adjust + Apply manually.
  useEffect(() => {
    if (
      pendingAutoApplyCode &&
      couponCode.trim().toUpperCase() === pendingAutoApplyCode &&
      !couponApplied &&
      !isValidatingReferral
    ) {
      setPendingAutoApplyCode(null);
      handleCouponApply("auto");
    }
  }, [pendingAutoApplyCode, couponCode, couponApplied, isValidatingReferral, handleCouponApply]);

  const handlePackageChange = () => {
    const isMiniDrawPackage = activePlan.id.startsWith("mini-pack-");

    if (isMiniDrawPackage) {
      setIsPackageSelectionOpen(true);
    } else {
      setIsPackageSelectionOpen(true);
    }
  };

  const handlePackageSelect = (newPlan: LocalMembershipPlan) => {
    if (onPlanChange) {
      onPlanChange(newPlan);
    }

    setIsPackageSelectionOpen(false);
  };

  const handlePaymentMethodSelect = (paymentMethod: SavedPaymentMethod | null) => {
    setSelectedPaymentMethod(paymentMethod);
    setUseSavedPaymentMethod(paymentMethod !== null);
    setShowCardForm(false);
  };

  const handleAddNewPaymentMethod = async () => {
    try {
      setCardFormError(null);

      if (!isAuthenticated || !userData) {
        showToast({
          type: "error",
          title: "Profile Not Ready",
          message: "Please make sure you are logged in before adding a new payment method.",
          duration: 5000,
        });
        return;
      }

      if (!userData.email) {
        showToast({
          type: "error",
          title: "Missing Email",
          message: "This account does not have an email address. Please update the profile before saving a card.",
          duration: 6000,
        });
        return;
      }

      if (setupIntentClientSecret) {
        console.log("🔄 Clearing existing SetupIntent to allow new payment method selection...");
        setSetupIntentClientSecret(null);
        setShowCardForm(false);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const isSubscription = activePlan?.period === "mo";
      const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
      const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
      const packageName = promoEnhancedPlan?.name || activePlan?.name;

      if (isSubscription) {
        setUseSavedPaymentMethod(false);
        setSelectedPaymentMethod(null);
        setShowCardForm(true);
      } else if (amountInCents > 0) {
        const result = await createPaymentIntent.mutateAsync({
          amount: amountInCents,
          currency: "aud",
          packageId: packageId || undefined,
          packageName: packageName,
          userEmail: isAuthenticated ? userData?.email : guestUserData?.email,
          packageType: "one-time",
        });

        if (result.success && result.client_secret) {
          setPaymentIntentClientSecret(result.client_secret);
          if (result.payment_intent_id) {
            setPaymentIntentId(result.payment_intent_id);
          }
          setSetupIntentClientSecret(null);
          setUseSavedPaymentMethod(false);
          setSelectedPaymentMethod(null);
          setShowCardForm(true);
          lastPaymentIntentAmountRef.current = amountInCents;
        } else {
          throw new Error(result.error || "Failed to create PaymentIntent");
        }
      } else {
        if (isSubscription) {
          console.log("ℹ️ Subscription selected - will use invoice PaymentIntent from subscription creation");
          setPaymentIntentClientSecret(null);
          setSetupIntentClientSecret(null);
          setUseSavedPaymentMethod(false);
          setSelectedPaymentMethod(null);
          setShowCardForm(true);
        } else {
          throw new Error("Invalid flow: SetupIntent should not be created for subscriptions");
        }
      }
    } catch (error: unknown) {
      console.error("Failed to create SetupIntent:", error);

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

  const handleCardElementChange = (event: { error?: { message?: string } }) => {
    setCardFormError(event.error?.message || null);
  };

  const handlePaymentRecovery = useCallback(async (
    recoveryStrategy: RecoveryStrategy,
    originalError: unknown,
    options?: { skipToasts?: boolean }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      switch (recoveryStrategy) {
        case "setup_intent_recovery": {
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

          setSetupIntentClientSecret(recoveryResult.clientSecret);

          await new Promise((resolve) => setTimeout(resolve, 500));

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
          return {
            success: false,
            error: "PaymentIntent recovery requires payment details",
          };
        }

        case "api_retry":
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

  const handlePaymentError = useCallback(async (
    error: unknown,
    context: {
      preserveState?: boolean;
      showToast?: boolean;
      autoRetry?: boolean;
      packageId?: string;
      packageName?: string;
      isManualRetry?: boolean;
    } = {}
  ): Promise<void> => {
    const errorDetection = detectPaymentError(error);
    const formattedError = formatPaymentError(error);
    const statePreservation = getStatePreservationInstructions(error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (recoveryAttemptedRef.current && recoveryAttemptedRef.current.errorMessage !== errorMessage) {
      recoveryAttemptedRef.current = null;
    }

    if (context.preserveState !== false && statePreservation.shouldPreserveSetupIntent) {
      // Do NOT clear setupIntentClientSecret
      // Do NOT clear paymentMethodId
      // Do NOT reset form data
    }

    // Skip auto-log for Stripe.js client-side noise (incomplete / invalid
    // card fields, wallet sheet cancellation). These are user-input issues —
    // logging them buries real failures under "Anonymous" rows. The user-
    // facing toast still renders below.
    const isNoise = isStripeNoiseError(error);

    // Auto-log ALL real payment errors (not just recoverable ones).
    const amountInCents = activePlan?.price ? Math.round(activePlan.price * 100) : undefined;

    // Capture user email from form data if not authenticated — ensures we
    // log the user's email even if they haven't completed registration yet.
    const capturedUserEmail = isAuthenticated
      ? userData?.email
      : (guestUserData?.email || formData.email || undefined);

    if (!isNoise) {
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
    }

    const shouldAttemptRecovery =
      context.autoRetry !== false &&
      errorDetection.isRecoverable &&
      !context.isManualRetry &&
      (!recoveryAttemptedRef.current || recoveryAttemptedRef.current.errorMessage !== errorMessage);

    if (shouldAttemptRecovery) {
      recoveryAttemptedRef.current = { errorMessage, attempted: true };

      const recoveryResult = await handlePaymentRecovery(
        errorDetection.recoveryStrategy,
        error,
        { skipToasts: false }
      );

      if (recoveryResult.success) {
        return;
      }

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

    if (context.showToast !== false) {
      showToast({
        type: "error",
        title: formattedError.title,
        message: formattedError.message,
        duration: 5000,
      });
    }

    setCardFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handlePaymentProcessingSuccess = async (status: PaymentStatusResponse) => {
    setShowPaymentProcessing(false);

    // Fire browser-side Purchase pixel via the provider registry, deduped against
    // the server-side CAPI event (which the webhook fires with the same paymentIntentId
    // as event_id). Meta's eventID dedup mechanism is DESIGNED for both sides to fire —
    // skipping the browser side loses _fbc/_fbp cookies and tanks Event Match Quality.
    const membershipPaymentIntentId = status.data?.paymentIntentId;
    const membershipPrice = status.data?.price;
    if (membershipPaymentIntentId && typeof membershipPrice === "number" && membershipPrice > 0) {
      trackConversion(
        buildPurchaseEvent({
          value: membershipPrice,
          currency: status.data?.currency ?? "AUD",
          eventId: membershipPaymentIntentId,
          customData: {
            orderId: membershipPaymentIntentId,
            contentType: "product",
            contentIds: lastChargedStaticPackageIdRef.current
              ? [lastChargedStaticPackageIdRef.current]
              : undefined,
            numItems: 1,
            packageType: status.data?.packageType ?? "membership",
          },
          eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      );
    }

    // Build benefits array with entry information
    const benefits = [];

    benefits.push({
      text: `${processingPackageName} activated successfully`,
      icon: "gift" as const,
    });

    if (status.data?.entries && status.data.entries > 0) {
      benefits.push({
        text:
          processingPackageType === "membership"
            ? `${status.data.entries} free entries added every month`
            : `${status.data.entries} free entries added to your account`,
        icon: "star" as const,
      });
    }

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

    const purchaseProcessingSubtitle =
      processingPackageType === "membership"
        ? `${processingPackageName} membership activated`
        : `${processingPackageName} activated`;
    showSuccess("Purchase Successful!", purchaseProcessingSubtitle, benefits);

    let contextToPass: OriginalPurchaseContext | null = null;

    if (paymentIntentId && processingPackageName && processingPackageType && processingPackageType !== "upsell") {
      const isMiniDrawPackage = activePlan.id.startsWith("mini-pack-");
      const packageId = isMiniDrawPackage
        ? activePlan.id
        : lastChargedStaticPackageIdRef.current ??
          getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
          "";

      const packageTypeForUpsell = processingPackageType;

      let miniDrawId: string | undefined;
      let miniDrawName: string | undefined;
      if (processingPackageType === "mini-draw" && paymentIntentId) {
        try {
          const response = await fetch(`/api/payment-intent/${paymentIntentId}/metadata`);
          if (response.ok) {
            const metadata = await response.json();
            if (metadata.miniDrawId) {
              miniDrawId = metadata.miniDrawId;
              miniDrawName = metadata.miniDrawName;
            }
          }
        } catch {
          // ignore
        }
      }

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

      setOriginalPurchaseContext(contextToPass);
    }

    if (!upsellTriggered) {
      setUpsellTriggered(true);

      const finalContextToPass = contextToPass;

      setTimeout(() => {
        const isMiniDrawPackage = activePlan.id.startsWith("mini-pack-");
        const packageId = isMiniDrawPackage
          ? activePlan.id
          : lastChargedStaticPackageIdRef.current ??
            getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
            "";

        const triggerType = activePlan.period === "one-time" ? "one-time-purchase" : "membership-purchase";
        const packageType = activePlan.period === "mo" ? "membership" : "one-time";

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

    onClose();
  };

  const handlePaymentProcessingError = (error: string) => {
    console.error("❌ Payment processing failed:", error);
    setShowPaymentProcessing(false);
  };

  const handlePaymentProcessingTimeout = () => {
    setShowPaymentProcessing(false);

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

    // Fire browser-side Purchase pixel via the provider registry. This handler covers
    // the new-user-with-autologin flow AND the existing-user-without-PaymentProcessingScreen
    // flow, which together account for first-time membership and first-time one-time
    // purchases. eventId === paymentIntentId matches the server-side CAPI event for dedup.
    // If handlePaymentProcessingSuccess also fires for the same paymentIntent, Meta's
    // eventID dedup mechanism merges them — duplicate browser fires are safe.
    if (effectivePaymentIntentId && typeof activePlan?.price === "number" && activePlan.price > 0) {
      // Prefer the canonical static package id (e.g. "tradie-subscription") that the
      // payment API was actually charged with — this is what the server CAPI sends.
      // activePlan.id is only a tier slug ("tradie") and would mismatch the server's
      // content_ids, breaking Meta's "deduplication best practices" check.
      const trackingContentId = lastChargedStaticPackageIdRef.current ?? activePlan.id ?? null;
      trackConversion(
        buildPurchaseEvent({
          value: activePlan.price,
          currency: "AUD",
          eventId: effectivePaymentIntentId,
          customData: {
            orderId: effectivePaymentIntentId,
            contentType: "product",
            contentIds: trackingContentId ? [trackingContentId] : undefined,
            numItems: 1,
            packageType: activePlan.id.startsWith("mini-pack-")
              ? "mini-draw"
              : activePlan.period === "mo"
                ? "membership"
                : "one-time",
          },
          eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      );
    }

    // Check if this is a new user registration
    if (data?.user) {
      try {
        const autoLoginResponse = await fetch("/api/auth/auto-login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: data.user.id,
            email: data.user.email,
            // Subscription confirm responses omit the PaymentIntent id, so
            // effectivePaymentIntentId can be empty when the PI-id state wasn't
            // captured. Fall back to the invoice PaymentIntent derived from the
            // client secret we already hold — otherwise auto-login can't prove
            // payment and the user lands on "Account Created!" without being
            // logged in or redirected. Only engages when the id is otherwise
            // missing, so it never changes a flow that already works.
            paymentIntentId:
              effectivePaymentIntentId ||
              (paymentIntentClientSecret?.includes("_secret_")
                ? paymentIntentClientSecret.split("_secret_")[0]
                : undefined),
          }),
        });

        const autoLoginData = await autoLoginResponse.json();

        if (autoLoginData.success && autoLoginData.token) {
          const signInResult = await signIn("auto-login", {
            token: autoLoginData.token,
            redirect: false,
          });

          if (signInResult?.ok) {
            const triggerType = activePlan.period === "one-time" ? "one-time-purchase" : "membership-purchase";

            onClose();

            markPurchaseCompleted();

            if (userData?._id) {
              invalidateUserCaches(userData._id);
            }

            hideLoading();
            {
              const benefits = buildActivationBenefits();
              appendCodeBenefits(benefits);
              showSuccess("Successful!", purchaseSuccessSubtitle, benefits, 3000);
            }

            let contextToPass: OriginalPurchaseContext | null = null;

            if (effectivePaymentIntentId) {
              const packageId =
                lastChargedStaticPackageIdRef.current ??
                getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
                "";
              const entriesCount = activePlan.metadata?.entriesCount || 0;
              const packageType = activePlan.period === "mo" ? "membership" : "one-time";

              const baseEntries = getPackageBaseEntries({
                packageId: packageId || "",
                packageType,
              });

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

              contextToPass = {
                paymentIntentId: effectivePaymentIntentId,
                packageId: packageId || "",
                packageName: activePlan.name,
                packageType,
                price: activePlan.price,
                entries: entriesCount,
                baseEntries,
                promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined,
                ...upsellPmFields,
              };

              setOriginalPurchaseContext(contextToPass);
            }

            const finalContextToPass = contextToPass;

            setTimeout(() => {
              if (upsellTriggered) {
                return;
              }
              setUpsellTriggered(true);

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

              setTimeout(() => {
                router.push("/my-account");
              }, 2000);
            }, 1000);
            return;
          } else {
            hideLoading();
            {
              const benefits = buildActivationBenefits();
              appendCodeBenefits(benefits);
              showSuccess("Account Created!", purchaseSuccessSubtitle, benefits, 3000);
            }
          }
        } else {
          hideLoading();
          {
            const benefits = buildActivationBenefits();
            appendCodeBenefits(benefits);
            showSuccess("Account Created!", purchaseSuccessSubtitle, benefits, 3000);
          }
        }
      } catch (error) {
        console.error("❌ Auto-login error:", error);
        hideLoading();
        {
          const benefits = buildActivationBenefits();
          appendCodeBenefits(benefits);
          showSuccess("Account Created!", purchaseSuccessSubtitle, benefits, 3000);
        }
      }

      onClose();
      router.push("/login");
      return;
    } else {
      const triggerType = activePlan.period === "one-time" ? "one-time-purchase" : "membership-purchase";

      markPurchaseCompleted();

      if (userData?._id) {
        invalidateUserCaches(userData._id);
      }

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

      let contextToPass: OriginalPurchaseContext | null = null;

      if (effectivePaymentIntentId && activePlan.period === "one-time") {
        const packageId =
          lastChargedStaticPackageIdRef.current ??
          getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
          "";

        const baseEntries = getPackageBaseEntries({
          packageId: packageId || "",
          packageType: "one-time",
        });

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

        contextToPass = {
          paymentIntentId: effectivePaymentIntentId,
          packageId: packageId || "",
          packageName: activePlan.name,
          packageType: "one-time",
          price: activePlan.price,
          entries: entriesCount,
          baseEntries,
          promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined,
          ...upsellPmFields,
        };
        setOriginalPurchaseContext(contextToPass);
      } else if (effectivePaymentIntentId && activePlan.period === "mo") {
        const packageId =
          lastChargedStaticPackageIdRef.current ??
          getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ??
          "";

        const baseEntries = getPackageBaseEntries({
          packageId: packageId || "",
          packageType: "membership",
        });

        const multiplierFromMetadata = activePlan.metadata?.promoMultiplier;
        const multiplierValue = typeof multiplierFromMetadata === "number"
          ? multiplierFromMetadata
          : typeof multiplierFromMetadata === "string"
          ? parseFloat(multiplierFromMetadata)
          : undefined;
        const appliedMultiplier = (multiplierValue && multiplierValue > 0 && Number.isFinite(multiplierValue))
          ? multiplierValue
          : (resolvedMembershipMultiplier ?? 1);

        contextToPass = {
          paymentIntentId: effectivePaymentIntentId,
          packageId: packageId || "",
          packageName: activePlan.name,
          packageType: "membership",
          price: activePlan.price,
          ...upsellPmFields,
          entries: entriesCount,
          baseEntries,
          promoMultiplier: appliedMultiplier > 1 ? appliedMultiplier : undefined,
        };
        setOriginalPurchaseContext(contextToPass);
      }

      const finalContextToPass = contextToPass;

      setTimeout(() => {
        if (upsellTriggered) {
          return;
        }

        setUpsellTriggered(true);

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

        router.push("/my-account");
      }, 2000);

      onClose();
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting || checkoutSubmitLockRef.current) {
      console.warn("⚠️ Payment already in progress, ignoring duplicate submission");
      return;
    }

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

    try {
      // Track InitiateCheckout event (standard Meta Pixel event)
      // This replaces the non-standard ButtonClick event with the official InitiateCheckout event
      // InitiateCheckout fires when a user starts the checkout process
      // Guarded by initiateCheckoutFiredRef so rapid double-clicks (and new-user signup pre-fire) don't double-count
      if (!initiateCheckoutFiredRef.current) {
        initiateCheckoutFiredRef.current = true;
        const packagePrice = activePlan?.price || 0;

        trackInitiateCheckout(
          {
            value: packagePrice,
            currency: "AUD",
            numItems: 1,
          },
          undefined,
          isAuthenticated
            ? undefined
            : {
                email: formData.email,
                firstName: formData.firstName,
                lastName: formData.lastName,
                phone: formData.phone,
                country: "AU",
              },
        );

        // Canonical Klaviyo "Started Checkout" — GUEST-ONLY fallback fire.
        //
        // Authed users fire from MembershipSection.handlePlanSelect (the "Enter
        // Now" click — the true intent moment). They do NOT fire here, to avoid
        // double-counting.
        //
        // Guests primarily fire server-side from /api/auth/register (step-1
        // submit). This client-side block is the FALLBACK for the edge case
        // where `guestUserData` persisted across modal close/reopen — modal
        // jumps directly to step-2, handleRegistration never runs, the server
        // never gets a chance to fire. The `if (!isAuthenticated)` gate +
        // `initiateCheckoutFiredRef` together produce one fire across the
        // whole modal lifecycle.
        //
        // See docs/auth/gotchas.md "registration ≠ authenticated session" and
        // docs/shared-ui/gotchas.md "MembershipModal: Klaviyo Started Checkout
        // fires from BOTH server-side and client-side paths".
        if (!isAuthenticated) {
          try {
            const resolvedPackageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
            if (resolvedPackageId && activePlan) {
              const isSubscriptionPlan = activePlan.period === "mo";
              // Extract promo slug from URL (mirrors handleRegistration's local extraction)
              let resolvedPromoSlug: string | undefined;
              try {
                const currentPathname = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
                const promotionsMatch = currentPathname.match(/^\/promotions\/([^/?#]+)/);
                if (promotionsMatch && promotionsMatch[1]) {
                  resolvedPromoSlug = promotionsMatch[1];
                }
              } catch {
                // Non-blocking
              }
              const checkoutUrl = buildCheckoutResumeUrl({
                baseUrl: window.location.origin,
                packageId: resolvedPackageId,
                promoSlug: resolvedPromoSlug,
              });
              trackKlaviyoStartedCheckout({
                package_id: resolvedPackageId,
                package_name: promoEnhancedPlan?.name || activePlan.name,
                package_type: isSubscriptionPlan ? "membership" : "one-time",
                tier: (promoEnhancedPlan?.name || activePlan.name).toLowerCase(),
                price: packagePrice,
                checkout_url: checkoutUrl,
                ...(resolvedPromoSlug ? { promo_slug: resolvedPromoSlug } : {}),
                // Guest reaching payment-submit without ever logging in
                is_authenticated: false,
              });
            }
          } catch {
            // Non-blocking — never fail checkout on a tracking error
          }
        }
      }
    } catch {
      if (process.env.NODE_ENV === "development") {
        // ignore
      }
    }

    showLoading("Processing Purchase", "", [
      "Authorizing payment method",
      "Confirming transaction with Stripe",
      isAuthenticated ? "Activating your membership benefits" : "Creating your account",
      "Granting entries to major draw",
      "Updating your dashboard",
    ]);

    let packageId: string | null = null;
    let confirmedPaymentIntentId: string | undefined = undefined;

    try {
      lastChargedStaticPackageIdRef.current = null;

      const isUpsellOffer = activePlan?.metadata?.isUpsellOffer === true;

      if (isUpsellOffer) {
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

      const isMiniDrawPackage = activePlan.id.startsWith("mini-pack-");

      if (isMiniDrawPackage) {
        packageId = activePlan.id;
      } else {
        const allPackages = [...subscriptionPackages, ...oneTimePackages];
        packageId = getPackageId(activePlan, allPackages);

        if (!packageId) {
          throw new Error("Package not found. Please refresh and try again.");
        }
      }

      const isAdditionalPackage = packageId.startsWith("additional-");
      if (isAdditionalPackage && (!isAuthenticated || !hasAdditionalPackageAccess(userData, userMajorDrawStats))) {
        // Phase 8 Option B (2026-05-29) — replace the generic Error throw with
        // an actionable toast that surfaces the most useful next step instead
        // of leaving the user staring at a dead-end "Payment Error".
        //
        // The common path landing here is now a Klaviyo abandoned-checkout email
        // opened in a different browser where the original member isn't logged
        // in: the deep-link auto-opens MembershipModal with an `additional-*`
        // pack preselected, the user registers fresh (or hits the existing-
        // account flow), advances to step 2, enters card details, clicks
        // PURCHASE, and only NOW discovers they can't actually buy this pack.
        // The previous generic error toast wasted all of that effort.
        //
        // Note: /login currently always redirects to /my-account on success
        // (no callbackUrl support). A future enhancement would add returnTo
        // plumbing so the user lands back on the modal post-login. For now,
        // they re-click the email link or navigate back manually.
        const wantsLogin = !isAuthenticated;
        showToast({
          type: "error",
          title: wantsLogin ? "Log in to continue" : "Membership required",
          message: wantsLogin
            ? "This pack is for existing members and entry-holders. Log in to your account if you've purchased before — or subscribe to a membership tier first."
            : "This pack requires an active membership or entries in the current draw. Subscribe to a membership tier to unlock access.",
          duration: 12000,
          action: {
            label: wantsLogin ? "Log in" : "View memberships",
            onClick: () => {
              onClose();
              router.push(wantsLogin ? "/login" : "/membership");
            },
          },
        });
        // Clean up purchase-in-progress state so the user can interact with the
        // toast without the loading overlay blocking them.
        hideLoading();
        checkoutSubmitLockRef.current = false;
        setIsSubmitting(false);
        return;
      }

      if (isAuthenticated && hasAdditionalPackageAccess(userData, userMajorDrawStats)) {
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
          packageId = adjustedPackageId;
        }
      }

      lastChargedStaticPackageIdRef.current = packageId;

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
          throw markErrorHandled(new Error(result.error));
        }
        if (result.paymentIntentId) {
          setPaymentIntentId(result.paymentIntentId);
          try {
            sessionStorage.removeItem(SUBSCRIPTION_CHECKOUT_STORAGE_KEY);
          } catch {
            // ignore
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
        return;
      }

      let paymentMethodId: string;
      let isNewPaymentMethod = false;

      if (useSavedPaymentMethod && selectedPaymentMethod) {
        paymentMethodId = selectedPaymentMethod.paymentMethodId;
        console.log("💳 Using saved payment method:", paymentMethodId);
      } else if (showCardForm || !isAuthenticated) {
        const hasClientSecret = setupIntentClientSecret || paymentIntentClientSecret;

        if ((showCardForm || hasClientSecret) && cardFormRef.current) {
          console.log("💳 Confirming card setup...", {
            showCardForm,
            hasClientSecret,
            hasSetupIntent: !!setupIntentClientSecret,
            hasPaymentIntent: !!paymentIntentClientSecret,
            subscriptionExists: !!subscriptionCreatedRef.current,
          });
          const result = await cardFormRef.current.confirmStripeIntent();

          if (result.paymentMethodId) {
            console.log("✅ PaymentMethodId extracted from SetupIntent:", result.paymentMethodId);
          } else {
            console.warn("⚠️ No paymentMethodId in confirmStripeIntent result - this may cause issues on retry");
          }

          if (result.setupIntentAlreadySucceeded) {
            console.log("⚠️ SetupIntent already succeeded. User entered new card - creating new SetupIntent...");

            setSetupIntentClientSecret(null);

            if (!isCreatingSetupIntentRef.current) {
              isCreatingSetupIntentRef.current = true;
              try {
                const setupResult = await createSetupIntent.mutateAsync();
                if (setupResult.success && setupResult.client_secret) {
                  setSetupIntentClientSecret(setupResult.client_secret);
                  console.log("✅ New SetupIntent created for new card");

                  await new Promise((resolve) => setTimeout(resolve, 500));

                  if (cardFormRef.current) {
                    const retryResult = await cardFormRef.current.confirmStripeIntent();
                    if (retryResult.error) {
                      await handlePaymentError(retryResult.error, {
                        preserveState: true,
                        packageId,
                        packageName: activePlan.name,
                      });
                      throw markErrorHandled(new Error(retryResult.error));
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
                if (!isErrorHandled(recoveryError)) {
                  await handlePaymentError(recoveryError instanceof Error ? recoveryError.message : "Failed to create new SetupIntent", {
                    preserveState: true,
                    packageId,
                    packageName: activePlan.name,
                  });
                }
                throw recoveryError instanceof Error ? markErrorHandled(recoveryError) : recoveryError;
              } finally {
                isCreatingSetupIntentRef.current = false;
              }
            } else {
              throw new Error("SetupIntent creation already in progress");
            }
          } else if (result.error?.includes("SETUP_INTENT_CANCELED_RETRY") ||
                     result.needsRecovery) {
            console.log("⚠️ SetupIntent was canceled, triggering automatic recovery...");

            const recoveryResult = await handlePaymentRecovery("setup_intent_recovery", result.error);

            if (recoveryResult.success) {
              console.log("✅ SetupIntent recovery succeeded, retrying with new SetupIntent...");

              await new Promise((resolve) => setTimeout(resolve, 300));

              if (cardFormRef.current) {
                const retryResult = await cardFormRef.current.confirmStripeIntent();
                if (retryResult.error) {
                  await handlePaymentError(retryResult.error, {
                    preserveState: true,
                    packageId,
                    packageName: activePlan.name,
                  });
                  throw markErrorHandled(new Error(retryResult.error));
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
              await handlePaymentError(result.error || "Failed to recover SetupIntent", {
                preserveState: true,
                packageId,
                packageName: activePlan.name,
              });
              throw markErrorHandled(new Error(result.error || "SetupIntent recovery failed"));
            }
          } else if (result.error) {
            if (result.error.includes("PAYMENT_INTENT_CANCELED_RETRY") ||
                (result.error.includes("canceled") && result.error.includes("unexpected_state"))) {
              console.warn("⚠️ PaymentIntent was canceled - automatically creating new PaymentIntent and retrying...");

              setPaymentIntentClientSecret(null);
              setPaymentIntentId(null);
              setCardFormError(null);
              setShowCardForm(false);

              try {
                const isSubscription = activePlan?.period === "mo";

                if (isSubscription) {
                  throw new Error(
                    "Payment was interrupted. Please try subscribing again. The payment form will be reset."
                  );
                }

                const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
                const recoveryPackageId = packageId || getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
                const packageName = promoEnhancedPlan?.name || activePlan?.name;

                const newPaymentIntentResult = await createPaymentIntent.mutateAsync({
                  amount: amountInCents,
                  currency: "aud",
                  packageId: recoveryPackageId || undefined,
                  packageName: packageName,
                  userEmail: isAuthenticated ? userData?.email : guestUserData?.email,
                  packageType: "one-time",
                });

                if (newPaymentIntentResult.success && newPaymentIntentResult.client_secret) {
                  setPaymentIntentClientSecret(newPaymentIntentResult.client_secret);
                  if (newPaymentIntentResult.payment_intent_id) {
                    setPaymentIntentId(newPaymentIntentResult.payment_intent_id);
                  }
                  lastPaymentIntentAmountRef.current = amountInCents;

                  setShowCardForm(true);
                  setCardFormError(null);

                  await new Promise(resolve => setTimeout(resolve, 800));

                  if (!cardFormRef.current) {
                    throw new Error("Payment form was closed. Please try again.");
                  }

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
              if (result.error.includes("canceled") || result.error.includes("unexpected_state")) {
                console.warn("⚠️ PaymentIntent was canceled - checking if payment method was already extracted");
              }
              throw new Error(result.error);
            }
          } else if (result.paymentMethodId) {
            paymentMethodId = result.paymentMethodId;
            if (result.paymentIntentId) {
              const isSubscription = activePlan?.period === "mo";
              if (isSubscription) {
                console.log(`ℹ️ Upfront PaymentIntent ${result.paymentIntentId} confirmed for wallet display only - will be cancelled by backend`);
              }
              confirmedPaymentIntentId = result.paymentIntentId;
              setPaymentIntentId(result.paymentIntentId);
            }
          } else {
            throw new Error("Failed to confirm card details.");
          }
        } else if (selectedPaymentMethod) {
          paymentMethodId = selectedPaymentMethod.paymentMethodId;
        } else if (hasClientSecret && cardFormRef.current) {
          console.log("💳 Attempting to confirm with client secret even though showCardForm is false");
          const result = await cardFormRef.current.confirmStripeIntent();

          if (result.error?.includes("SETUP_INTENT_CANCELED_RETRY") ||
              result.needsRecovery) {
            console.log("⚠️ SetupIntent was canceled, triggering automatic recovery...");

            const recoveryResult = await handlePaymentRecovery("setup_intent_recovery", result.error);

            if (recoveryResult.success) {
              console.log("✅ SetupIntent recovery succeeded, retrying with new SetupIntent...");

              await new Promise((resolve) => setTimeout(resolve, 300));

              if (cardFormRef.current) {
                const retryResult = await cardFormRef.current.confirmStripeIntent();
                if (retryResult.error) {
                  await handlePaymentError(retryResult.error, {
                    preserveState: true,
                    packageId,
                    packageName: activePlan.name,
                  });
                  throw markErrorHandled(new Error(retryResult.error));
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
              await handlePaymentError(result.error || "Failed to recover SetupIntent", {
                preserveState: true,
                packageId,
                packageName: activePlan.name,
              });
              throw markErrorHandled(new Error(result.error || "SetupIntent recovery failed"));
            }
          } else if (result.error) {
            if (result.error.includes("PAYMENT_INTENT_CANCELED_RETRY") ||
                (result.error.includes("canceled") && result.error.includes("unexpected_state"))) {
              console.warn("⚠️ PaymentIntent was canceled - automatically creating new PaymentIntent and retrying...");

              setPaymentIntentClientSecret(null);
              setPaymentIntentId(null);
              setCardFormError(null);
              setShowCardForm(false);

              try {
                const isSubscription = activePlan?.period === "mo";

                if (isSubscription) {
                  throw new Error(
                    "Payment was interrupted. Please try subscribing again. The payment form will be reset."
                  );
                }

                const amountInCents = Math.round((promoEnhancedPlan?.price || activePlan?.price || 0) * 100);
                const recoveryPackageId = packageId || getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
                const packageName = promoEnhancedPlan?.name || activePlan?.name;

                const newPaymentIntentResult = await createPaymentIntent.mutateAsync({
                  amount: amountInCents,
                  currency: "aud",
                  packageId: recoveryPackageId || undefined,
                  packageName: packageName,
                  userEmail: isAuthenticated ? userData?.email : guestUserData?.email,
                  packageType: "one-time",
                });

                if (newPaymentIntentResult.success && newPaymentIntentResult.client_secret) {
                  setPaymentIntentClientSecret(newPaymentIntentResult.client_secret);
                  if (newPaymentIntentResult.payment_intent_id) {
                    setPaymentIntentId(newPaymentIntentResult.payment_intent_id);
                  }
                  lastPaymentIntentAmountRef.current = amountInCents;

                  setShowCardForm(true);
                  setCardFormError(null);

                  await new Promise(resolve => setTimeout(resolve, 800));

                  if (!cardFormRef.current) {
                    throw new Error("Payment form was closed. Please try again.");
                  }

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
        throw new Error("Please select a payment method or add a new one");
      }

      let result;

      const oneTimeCheckoutIdempotencyKey = crypto.randomUUID();

      if (isMiniDrawPackage) {
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
          let paymentIntentId: string | null = null;

          if (
            "paymentIntent" in miniDrawResult &&
            miniDrawResult.paymentIntent &&
            typeof miniDrawResult.paymentIntent === "object" &&
            "id" in miniDrawResult.paymentIntent
          ) {
            paymentIntentId = (miniDrawResult.paymentIntent as { id: string }).id || null;
          } else if ("data" in miniDrawResult && miniDrawResult.data && "paymentIntent" in miniDrawResult.data) {
            paymentIntentId = miniDrawResult.data.paymentIntent?.id || null;
          } else if ("paymentIntentId" in miniDrawResult && miniDrawResult.paymentIntentId) {
            paymentIntentId = miniDrawResult.paymentIntentId as string;
          }

          if (paymentIntentId) {
            markPurchaseCompleted();
            hideLoading();

            setPaymentIntentId(paymentIntentId);
            setProcessingPackageName(getReceiptLabelByPackageId(activePlan.id, { membership: getPackageById, mini: getMiniDrawPackageById }));
            setProcessingPackageType("mini-draw");
            setShowPaymentProcessing(true);
          } else {
            const triggerType = "one-time-purchase";

            markPurchaseCompleted();
            hideLoading();

            const benefits = [];

            benefits.push({
              text: `${activePlan.name} activated`,
              icon: "gift" as const,
            });

            const entriesCount = activePlan.metadata?.entriesCount || 0;
            if (entriesCount > 0) {
              benefits.push({
                text: `${entriesCount} free entries added to your account`,
                icon: "star" as const,
              });
            }

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

            setTimeout(() => {
              if (upsellTriggered) {
                return;
              }

              setUpsellTriggered(true);

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

        return;
      }

      if (isAuthenticated) {
        if (activePlan.period === "mo") {
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

        if (isNewPaymentMethod) {
          try {
            await savePaymentMethod(paymentMethodId, true);
          } catch {
            // ignore
          }
        }

        if (activePlan.period === "mo") {
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

          const stateUpdate = createSubscriptionStateUpdate(subscriptionData);

          if (stateUpdate.clientSecret) {
            setPaymentIntentClientSecret(stateUpdate.clientSecret);
            const invoicePIId = stateUpdate.clientSecret.split("_secret_")[0];
            console.log(`✅ Using invoice PaymentIntent ${invoicePIId} for subscription payment`);
          }

          setSetupIntentClientSecret(null);
          setPendingFirstSubscriptionConfirm(true);
          return;
        } else if (activePlan.period === "one-time") {
          let paymentIntentId: string | null = null;

          if ("paymentIntent" in result && result.paymentIntent) {
            paymentIntentId =
              typeof result.paymentIntent === "string" ? result.paymentIntent : result.paymentIntent.id || null;
          } else if ("data" in result && result.data && "paymentIntent" in result.data) {
            paymentIntentId = result.data.paymentIntent?.id || null;
          } else if ("data" in result && result.data && "paymentIntentId" in result.data) {
            paymentIntentId = result.data.paymentIntentId as string;
          } else if ("paymentIntentId" in result && result.paymentIntentId) {
            paymentIntentId = result.paymentIntentId as string;
          }

          if (paymentIntentId) {
            markPurchaseCompleted();
            hideLoading();

            setPaymentIntentId(paymentIntentId);
            setProcessingPackageName(getReceiptLabelByPackageId(activePlan.id, { membership: getPackageById, mini: getMiniDrawPackageById }));
            setProcessingPackageType("one-time");
            setShowPaymentProcessing(true);
          } else {
            const triggerType = activePlan.period === "one-time" ? "one-time-purchase" : "membership-purchase";

            markPurchaseCompleted();
            hideLoading();

            const benefits = [];

            benefits.push({
              text: `${activePlan.name} activated`,
              icon: "gift" as const,
            });

            const entriesCount = activePlan.metadata?.entriesCount || 0;
            if (entriesCount > 0) {
              benefits.push({
                text: `${entriesCount} free entries added to your account`,
                icon: "star" as const,
              });
            }

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
            }

            const finalFallbackContext = fallbackContext;
            setTimeout(() => {
              if (upsellTriggered) {
                return;
              }

              setUpsellTriggered(true);

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
            }, 2000);

            onClose();
          }
        } else {
          hideLoading();
          showSuccess(
            "Successful!",
            purchaseSuccessSubtitle,
            [{ text: "Free entries have been added to your wallet", icon: "gift" }],
            3000
          );

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

          onClose();
          return;
        }
      } else {
        if (!guestUserData) {
          throw new Error("User registration data not found. Please try registering again.");
        }

        if (activePlan.period === "mo" && subscriptionCreatedRef.current) {
          console.log("✅ Subscription already created, skipping duplicate creation:", subscriptionCreatedRef.current);
          console.log("💳 Current paymentMethodId from SetupIntent:", paymentMethodId);

          if (!paymentMethodId) {
            console.warn("⚠️ paymentMethodId is missing - confirmStripeIntent() may have been skipped. Attempting to confirm now...");

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

          result = {
            success: true,
            data: {
              subscriptionId: subscriptionCreatedRef.current,
              clientSecret: paymentIntentClientSecret || undefined,
              userId: userIdRef.current || undefined,
            },
          };
        } else {
          const subscriptionData = {
            userEmail: guestUserData.email,
            firstName: guestUserData.firstName,
            lastName: guestUserData.lastName,
            mobile: guestUserData.mobile,
            packageId,
            paymentMethodId,
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

          if (activePlan.period === "mo") {
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
              const idempotencyKey = `sub_${packageId}_${guestUserData.email}_${Date.now()}`;

              result = await createSubscription({
                ...subscriptionData,
                idempotencyKey,
              });

              if (result?.success && result.data?.subscriptionId) {
                subscriptionCreatedRef.current = result.data.subscriptionId;
                console.log("✅ Subscription created and tracked:", result.data.subscriptionId);
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
          if (activePlan.period === "mo") {
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

            const stateUpdate = createSubscriptionStateUpdate(subscriptionData);

            if (stateUpdate.clientSecret) {
              setPaymentIntentClientSecret(stateUpdate.clientSecret);
              const invoicePIId = stateUpdate.clientSecret.split("_secret_")[0];
              console.log(`✅ Using invoice PaymentIntent ${invoicePIId} for subscription payment`);
            }

            const subscriptionId = stateUpdate.subscriptionId!;
            const clientSecret = stateUpdate.clientSecret;
            const userId = subscriptionData.userId || result.data?.userId || userIdRef.current;

            if (!subscriptionCreatedRef.current && !clientSecret) {
              const error = handlePaymentIntentNotReadyError();
              console.warn(`⚠️ ${error.message}`);
              showToast({
                type: "warning",
                title: "Payment Processing",
                message: error.userMessage,
                duration: 4000,
              });
            }

            try {
              const confirmResponse = await fetch("/api/stripe/confirm-subscription-payment", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                credentials: "include",
              body: JSON.stringify({
                subscriptionId,
                clientSecret: clientSecret,
                userId: userId,
                paymentMethodId: paymentMethodId,
              }),
              });

              const confirmResult = await confirmResponse.json();

              if (confirmResult.requiresPaymentConfirmation && confirmResult.data?.paymentIntent?.clientSecret) {
                console.log("⏳ Payment requires 3DS authentication - handling redirect");

                const threeDSClientSecret = confirmResult.data.paymentIntent.clientSecret;

                const { getReturnUrlForPaymentTypeClient } = await import("@/utils/payment/stripe/payment-intent-config");

                const stripe = await stripePromise;
                if (!stripe) {
                  throw new Error("Stripe not loaded. Please refresh and try again.");
                }

                const { error: confirmError } = await stripe.confirmPayment({
                  clientSecret: threeDSClientSecret,
                  confirmParams: {
                    return_url: getReturnUrlForPaymentTypeClient("subscription"),
                  },
                });

                if (confirmError) {
                  throw new Error(confirmError.message || "3D Secure authentication failed");
                }

                return;
              }

              if (!confirmResponse.ok) {
                const formatted = formatPaymentError(confirmResult);
                throw new Error(formatted.message);
              }

              await handlePaymentSuccess(confirmResult.data);
              return;
            } catch (confirmError) {
              console.error("❌ New user subscription payment confirmation failed:", confirmError);

              console.warn("⚠️ Payment failed - creating new SetupIntent for retry (in catch block)");

              if (!isCreatingSetupIntentRef.current) {
                isCreatingSetupIntentRef.current = true;
                try {
                  const setupResult = await createSetupIntent.mutateAsync();
                  if (setupResult.success && setupResult.client_secret) {
                    setSetupIntentClientSecret(setupResult.client_secret);
                    console.log("✅ New SetupIntent created after payment failure (catch block) - ready for new card");
                  } else {
                    console.error("❌ SetupIntent creation returned no client_secret, keeping old SetupIntent");
                  }
                } catch (setupError) {
                  console.error("❌ Failed to create new SetupIntent after payment failure (catch block):", setupError);
                } finally {
                  isCreatingSetupIntentRef.current = false;
                }
              } else {
                console.warn("⚠️ SetupIntent creation already in progress, skipping duplicate creation");
              }

              throw confirmError;
            }
          } else if (activePlan.period === "one-time") {
            const oneTimeData = result.data as OneTimePurchaseData;
            if (oneTimeData?.user && (oneTimeData?.autoLogin || result.data?.userId)) {
              try {
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
                    paymentIntentId: oneTimeData?.paymentIntentId || result.data?.paymentIntentId,
                  }),
                });

                const autoLoginData = await autoLoginResponse.json();

                if (autoLoginData.success && autoLoginData.token) {
                  const signInResult = await signIn("auto-login", {
                    token: autoLoginData.token,
                    redirect: false,
                  });

                  if (signInResult?.ok) {
                    const triggerType = "one-time-purchase";

                    onClose();

                    markPurchaseCompleted();

                    if (userId) {
                      invalidateUserCaches(userId);
                    }

                    hideLoading();
                    const oneTimeEntries =
                      activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0;
                    const benefits = buildActivationBenefits({ entriesOverride: oneTimeEntries });
                    appendCodeBenefits(benefits);
                    showSuccess("Welcome!", purchaseSuccessSubtitle, benefits);

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

              } catch (authError) {
                console.error("? Error in one-time autologin:", authError);
              }
            }

          } else {
            const oneTimeData = result.data as OneTimePurchaseData;
            if (oneTimeData?.user && oneTimeData?.autoLogin) {
              try {
                const autoLoginResponse = await fetch("/api/auth/auto-login", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    userId: oneTimeData.user.id,
                    email: oneTimeData.user.email,
                    paymentIntentId: oneTimeData?.paymentIntentId || result.data?.paymentIntentId,
                  }),
                });

                const autoLoginData = await autoLoginResponse.json();

                if (autoLoginData.success && autoLoginData.token) {
                  const signInResult = await signIn("auto-login", {
                    token: autoLoginData.token,
                    redirect: false,
                  });

                  if (signInResult?.ok) {
                    hideLoading();
                    const oneTimeEntries2 =
                      activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0;
                    const benefits2 = buildActivationBenefits({ entriesOverride: oneTimeEntries2 });
                    appendCodeBenefits(benefits2);
                    showSuccess("Welcome!", purchaseSuccessSubtitle, benefits2, 3000);

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

                    setTimeout(() => {
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

                      setTimeout(() => {
                        router.push("/my-account");
                      }, 2000);
                    }, 1000);
                    return;
                  } else {
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
              hideLoading();
              {
                const benefits = buildActivationBenefits({
                  entriesOverride: oneTimeData?.totalEntries || 0,
                });
                appendCodeBenefits(benefits);
                showSuccess("Account Created!", purchaseSuccessSubtitle, benefits, 3000);
              }
            }

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
      // Short-circuit: an inner block already invoked handlePaymentError on
      // this error (toast + log already happened). Calling it again here
      // would produce duplicate toasts and (for non-noise errors) duplicate
      // auto-log attempts that collide on the dedup hash.
      if (isErrorHandled(error)) {
        hideLoading();
        checkoutSubmitLockRef.current = false;
        setIsSubmitting(false);
        return;
      }

      // ✅ Clean separation: Error handling using utility function
      const subscriptionError = handleSubscriptionError(error);
      console.error(`❌ Purchase failed: ${subscriptionError.message}`, subscriptionError.originalError);

      hideLoading();

      let errorMessage = subscriptionError.userMessage;
      const _errorTitle = isAuthenticated ? "Purchase Failed" : "Account Creation Failed";
      let errorCode = subscriptionError.code;
      let declineCode: string | undefined;

      const extractStripeErrorCode = (err: unknown): string | undefined => {
        if (err && typeof err === "object") {
          if ("code" in err) return err.code as string;
          if ("type" in err) return err.type as string;
          if ("error" in err && typeof err.error === "object" && err.error !== null) {
            if ("code" in err.error) return err.error.code as string;
            if ("type" in err.error) return err.error.type as string;
          }
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

      if (error && typeof error === "object" && "response" in error) {
        const apiError = error as { response?: { data?: { error?: string; details?: string; code?: string; decline_code?: string; message?: string }; status?: number } };

        if (apiError.response?.data) {
          console.error("🔍 API Error Response Structure:", JSON.stringify(apiError.response.data, null, 2));

          if (apiError.response.data.details) {
            errorMessage = apiError.response.data.details;
            errorCode = apiError.response.data.code;
            declineCode = apiError.response.data.decline_code;
          } else if (apiError.response.data.error) {
            errorMessage = apiError.response.data.error;
            errorCode = apiError.response.data.code;
            declineCode = apiError.response.data.decline_code;
          } else if (apiError.response.data.message) {
            errorMessage = apiError.response.data.message;
            errorCode = apiError.response.data.code;
            declineCode = apiError.response.data.decline_code;
          }

          if (apiError.response.data.error && apiError.response.data.details && apiError.response.data.details !== apiError.response.data.error) {
            errorMessage = `${apiError.response.data.details} (${apiError.response.data.error})`;
          }
        }
      } else if (error && typeof error === "object" && "message" in error) {
        const err = error as { message: string; code?: string; decline_code?: string; type?: string };
        errorMessage = err.message;
        errorCode = err.code || extractStripeErrorCode(error);
        declineCode = err.decline_code || extractStripeDeclineCode(error);

        console.error("🔍 Error Object Structure:", JSON.stringify(err, null, 2));
      } else if (typeof error === "string") {
        errorMessage = error;
      } else {
        console.error("❌ ERROR EXTRACTION FAILED - Full error object:", error);
        console.error("❌ Error type:", typeof error);
        console.error("❌ Error stringified:", JSON.stringify(error, null, 2));

        try {
          const errorStr = JSON.stringify(error);
          if (errorStr && errorStr !== "{}") {
            errorMessage = `Error details: ${errorStr.substring(0, 200)}`;
          }
        } catch {
          errorMessage = "A processing error occurred. Please check Vercel logs for details.";
        }
      }

      if (!errorCode) {
        errorCode = extractStripeErrorCode(error);
      }
      if (!declineCode) {
        declineCode = extractStripeDeclineCode(error);
      }

      if (errorMessage === "An unexpected error occurred" || errorMessage.includes("processing error occurred")) {
        console.error("⚠️ WARNING: Generic error message detected! Original error:", error);
        console.error("⚠️ This suggests error extraction failed. Check logs above for actual error details.");
      }

      if (errorMessage === "An unexpected error occurred" || errorMessage.includes("processing error occurred")) {
        console.error("⚠️ WARNING: Generic error message detected! Original error:", error);
        console.error("⚠️ This suggests error extraction failed. Check logs above for actual error details.");
      }

      if (errorCode === "EXISTING_SUBSCRIPTION") {
        showToast({
          type: "error",
          title: "Active Subscription Found",
          message: errorMessage,
          duration: 10000,
          action: {
            label: "Manage Subscription",
            onClick: () => {
              // Open the Manage-membership bottom sheet on arrival (the ?open=subscription
              // deep-link is handled in my-account/page.tsx), so the user lands straight on
              // update-payment / change-tier / cancel — not just the dashboard home.
              router.push("/my-account?open=subscription");
            },
          },
        });
      } else {
        await handlePaymentError(error, {
          preserveState: true,
          autoRetry: true,
          packageId: packageId || undefined,
          packageName: activePlan?.name,
        });
      }

      setCardFormError(null);

      console.error(`${isAuthenticated ? "Purchase" : "Account creation"} failed: ${errorMessage}`);
    } finally {
      checkoutSubmitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const triggerUpsellModal = async (
    triggerEvent: "membership-purchase" | "ticket-purchase" | "one-time-purchase",
    recentPurchase: string,
    purchaseAmount: number,
    packageId?: string,
    packageType?: "membership" | "one-time",
    originalPurchaseContextParam?: OriginalPurchaseContext | null
  ) => {
    try {
      if (userData?._id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods.all(userData._id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userData._id) });
        console.log("🔄 Invalidated payment methods cache before showing upsell modal");
      }
      if (packageId && packageType) {
        const isMiniDrawPackage = packageId.startsWith("mini-pack-");

        const isAdditionalPackage = packageId.startsWith("additional-");

        if (isAdditionalPackage && !hasAdditionalPackageAccess(userData, userMajorDrawStats)) {
          return;
        }

        const userType = isMiniDrawPackage ? "mini-draw-buyer" : isAuthenticated ? "returning-user" : "new-user";

        const hasAccessToAdditionalPackages = hasAdditionalPackageAccess(userData, userMajorDrawStats);

        const response = await fetch("/api/upsell/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId,
            packageType,
            userType,
            isMember: isMember,
            hasAccessToAdditionalPackages: hasAccessToAdditionalPackages,
            triggerEvent,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data?.offer) {
            const offer = result.data.offer;

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

            const userContext: UpsellUserContext = {
              userId: userData?._id || undefined,
              isAuthenticated: isAuthenticated,
              hasDefaultPayment: isAuthenticated && (userData?.savedPaymentMethods?.length ?? 0) > 0,
              recentPurchase: recentPurchase,
              userType: isAuthenticated ? "returning-user" : "new-user",
              totalSpent: purchaseAmount,
              upsellsShown: 0,
            };

            const finalOriginalPurchaseContext = originalPurchaseContextParam ?? originalPurchaseContext;

            if (!isAuthenticated) {
              const { setPendingUpsellAfterSetup } = useModalPriorityStore.getState();
              setPendingUpsellAfterSetup(true, {
                offer: upsellOffer,
                userContext,
                originalPurchaseContext: finalOriginalPurchaseContext || undefined,
              });
            } else {
              setTimeout(() => {
                const { requestModal } = useModalPriorityStore.getState();
                requestModal("upsell", false, {
                  offer: upsellOffer,
                  userContext,
                  originalPurchaseContext: finalOriginalPurchaseContext || undefined,
                });
              }, offer.showAfterDelay * 1000 || 2000);
            }

            return;
          }
        }
      }
    } catch (error) {
      console.error("Error triggering upsell:", error);
    }
  };

  const isFormValid = () => {
    const isCreatingIntent =
      createPaymentIntent.isPending || createSetupIntent.isPending || isCreatingPaymentIntentRef.current;

    if (isCreatingIntent) {
      return false;
    }

    const hasIntentClientSecret = paymentIntentClientSecret !== null || setupIntentClientSecret !== null;

    if (showCardForm && !hasIntentClientSecret) {
      return false;
    }

    if (isAuthenticated) {
      return useSavedPaymentMethod
        ? selectedPaymentMethod !== null
        : showCardForm
        ? !cardFormError && hasIntentClientSecret && isPaymentElementReady
        : false;
    } else {
      const registrationComplete = currentStep === 2 && guestUserData !== null;
      const cardFormReady = !cardFormError && hasIntentClientSecret && isPaymentElementReady;
      return Boolean(registrationComplete && cardFormReady);
    }
  };

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

  const handleWinnerTileClick = (index: number) => {
    setWinnerViewerInitialIndex(Math.max(0, Math.min(index, majorDrawWinners.length - 1)));
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
          <StepIndicator
            currentStep={currentStep}
            hasCompletedRegistration={hasCompletedRegistration}
            showHeaderPromoBadge={showHeaderPromoBadge}
            packageBadgeSrc={packageBadgeSrc}
            promoMultiplier={promoMultiplier}
            promoThemePrimary={promoTheme.primary}
            onStepClick={handleStepClick}
          />
        )}

        <div
          className={cn("px-3 sm:px-6 pb-3 sm:pb-6", !isAuthenticated ? "pt-3 sm:pt-4" : "pt-3 sm:pt-6")}
        >
          {/* Active promo for entries - bonus from link (below header, centered) */}
          <div className={cn("text-center", currentStep === 2 ? "hidden sm:block" : "")}>
          {promoLinkInfo?.isValid &&
            promoLinkInfo.bonusEntries > 0 &&
            activePlan.period !== "one-time" &&
            promoLinkInfo.appliesToMembership && (
              <p
                className="text-2xs sm:text-sm font-extrabold px-3 py-2 rounded-lg border-2 inline-block shadow-sm whitespace-nowrap max-w-full overflow-hidden text-ellipsis mb-2"
                style={{
                  color: "#FFFFFF",
                  backgroundColor: promoTheme.primary,
                  borderColor: "rgba(255, 255, 255, 0.45)",
                }}
              >
                Get <span className="text-2xs sm:text-base">{promoLinkInfo.bonusEntries}</span> extra entries when you join
              </p>
            )}
          {promoLinkInfo?.isValid &&
            promoLinkInfo.bonusEntries > 0 &&
            activePlan.period === "one-time" &&
            promoLinkInfo.appliesToOneTime && (
              <p
                className="text-2xs sm:text-sm font-extrabold px-3 py-2 rounded-lg border-2 inline-block shadow-sm whitespace-nowrap max-w-full overflow-hidden text-ellipsis"
                style={{
                  color: "#FFFFFF",
                  backgroundColor: promoTheme.primary,
                  borderColor: "rgba(255, 255, 255, 0.45)",
                }}
              >
                Get <span className="text-2xs sm:text-base">{promoLinkInfo.bonusEntries}</span> extra entries with this purchase
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
                      sizes="(max-width: 640px) 48px, 56px"
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
              <RegistrationStep
                formData={formData}
                registrationErrors={registrationErrors}
                isRegistering={isRegistering}
                hasCompletedRegistration={hasCompletedRegistration}
                onInputChange={handleInputChange}
                onNextStep={handleNextStep}
                formatMobileNumber={formatMobileNumber}
                validateMobileNumber={validateMobileNumber}
                getPhoneMaxLength={getPhoneMaxLength}
              />
            )}

            {/* Step 2: Billing Info */}
            {currentStep === 2 && (
              <PaymentStep
                isAuthenticated={isAuthenticated}
                activePlan={activePlan}
                promoEnhancedPlan={promoEnhancedPlan}
                isPlaceholderPlan={isPlaceholderPlan}
                subscriptionPackages={subscriptionPackages}
                oneTimePackages={oneTimePackages}
                promoThemePrimary={promoTheme.primary}
                selectedPaymentMethod={selectedPaymentMethod}
                showCardForm={showCardForm}
                setupIntentClientSecret={setupIntentClientSecret}
                paymentIntentClientSecret={paymentIntentClientSecret}
                cardFormRef={cardFormRef}
                cardFormError={cardFormError}
                isCreatingSetupIntentPending={createSetupIntent.isPending}
                isCreatingPaymentIntentPending={createPaymentIntent.isPending}
                isCreatingSubscription={isCreatingSubscription}
                resolvedBillingDetails={resolvedBillingDetails}
                paymentMethodTypeFromElement={paymentMethodTypeFromElement}
                promoLinkInfo={promoLinkInfo}
                couponCode={couponCode}
                couponApplied={couponApplied}
                showApplyingIndicator={showApplyingIndicator}
                isApplyDisabled={isApplyDisabled}
                referralInfo={referralInfo}
                referralError={referralError}
                isSubmitting={isSubmitting}
                isFormValid={isFormValid()}
                onPaymentMethodSelect={handlePaymentMethodSelect}
                onAddNewPaymentMethod={handleAddNewPaymentMethod}
                onCardElementChange={handleCardElementChange}
                onPaymentMethodTypeChange={setPaymentMethodTypeFromElement}
                onElementReady={setIsPaymentElementReady}
                onCouponCodeChange={(value) => {
                  setCouponCode(value);
                  setCouponApplied(false);
                  setCouponType(null);
                  setReferralInfo(null);
                  setReferralError(null);
                  if (!value.trim()) {
                    clearReferralCode();
                  }
                }}
                onApplyCoupon={() => handleCouponApply("manual")}
                onSubmit={handleSubmit}
                onPackageChange={handlePackageChange}
              />
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
                      sizes="(max-width: 768px) 100vw, 600px"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Major draw winners: two per slide; tap opens FullscreenImageViewer (not a route) */}
            {currentStep !== 2 && (
              <WinnerStrip
                majorDrawWinners={majorDrawWinners}
                majorDrawWinnersLoading={majorDrawWinnersLoading}
                onTileClick={handleWinnerTileClick}
              />
            )}
          </div>
        </div>
      </div>
      </ModalContent>

      {/* Package Selection Modal */}
      <PackageSelectionModal
        isOpen={isPackageSelectionOpen}
        onClose={() => {
          setIsPackageSelectionOpen(false);
          // Selection-first with nothing chosen yet: dismissing the picker must not strand the
          // user on the placeholder payment step (grey skeletons, no package) — close the whole
          // membership modal instead. Once a real plan is selected, dismissal behaves normally.
          if (showPackageSelectionFirst && isPlaceholderPlan) onClose();
        }}
        currentPlan={activePlan}
        onPlanSelect={handlePackageSelect}
      />

      {/* Existing Account Modal - shown when user tries to register with existing account that has purchases */}
      <ExistingAccountModal
        isOpen={showExistingAccountModal}
        onClose={() => {
          setShowExistingAccountModal(false);
          setExistingAccountEmail(undefined);
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
