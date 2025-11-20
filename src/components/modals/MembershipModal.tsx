"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { Check, Loader2 } from "lucide-react";
import { top5Winners } from "@/data";
import PackageSelectionModal from "./PackageSelectionModal";
import PaymentMethodSelector from "./PaymentMethodSelector";
import { ModalContainer, ModalHeader, ModalContent, Input, Button } from "./ui";
import { useLoading } from "@/contexts/LoadingContext";
import { type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useStripeSubscription } from "@/hooks/useStripeSubscription";
import { useMemberships } from "@/hooks/useMemberships";
import { usePurchaseMembership } from "@/hooks/queries/useMembershipQueries";
import { usePurchaseUpsell } from "@/hooks/queries/useUpsellQueries";
import { useSavedPaymentMethods, type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { getPackageId } from "@/utils/membership/membership-adapters";
import { useUserContext } from "@/contexts/UserContext";
import { markPurchaseCompleted } from "@/utils/tracking/purchase-tracking";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
// Upsell store removed - using unified modal priority system
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { convertUpsellToLocalPlan } from "@/utils/membership/membership-adapters";
import { UpsellOffer, UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";
import { PaymentProcessingScreen } from "@/components/loading";
import { type PaymentStatusResponse } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { useSetupIntent } from "@/hooks/useSetupIntent";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import PromoBadge from "@/components/ui/PromoBadge";
import { useReferralCode } from "@/hooks/useReferralCode";
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
}

const MembershipModal: React.FC<MembershipModalProps> = ({ isOpen, onClose, selectedPlan, onPlanChange }) => {
  const router = useRouter();
  const { showToast } = useToast();
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
  const {
    referralCode: storedReferralCode,
    setReferralCode: persistReferralCode,
    clearReferralCode,
  } = useReferralCode();
  const [isValidatingReferral, setIsValidatingReferral] = useState(false);
  const [referralInfo, setReferralInfo] = useState<{ referrerName: string } | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [isPackageSelectionOpen, setIsPackageSelectionOpen] = useState(false);

  const normalizedCouponCode = couponCode.trim().toUpperCase();
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

  // Stripe Elements state
  const [setupIntentClientSecret, setSetupIntentClientSecret] = useState<string | null>(null);
  const [cardFormError, setCardFormError] = useState<string | null>(null);
  const cardFormRef = useRef<{ confirmSetup: () => Promise<{ paymentMethodId?: string; error?: string }> } | null>(
    null
  );
  const [guestUserData, setGuestUserData] = useState<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    mobile: string;
  } | null>(null);

  // Payment processing state
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [processingPackageName, setProcessingPackageName] = useState<string>("");
  const [processingPackageType, setProcessingPackageType] = useState<
    "one-time" | "subscription" | "upsell" | "mini-draw"
  >("subscription");

  // Original purchase context for combined invoice (invoice finalization)
  const [originalPurchaseContext, setOriginalPurchaseContext] = useState<OriginalPurchaseContext | null>(null);

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

  const activePlan = selectedPlan || placeholderPlan;

  // Hooks for API integration
  const { createSubscription, createOneTimePurchase, createSubscriptionExistingUser } = useStripeSubscription();
  const { subscriptionPackages, oneTimePackages } = useMemberships();

  // Get active promos for different package types
  const { data: oneTimePromo } = usePromoByType("one-time-packages");
  const { data: miniPromo } = usePromoByType("mini-packages");

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

    if (activePlan.period === "one-time" && oneTimePromo) {
      return applyMultiplier(oneTimePromo.multiplier);
    }

    if (activePlan.id.startsWith("mini-pack-") && miniPromo) {
      return applyMultiplier(miniPromo.multiplier);
    }

    return activePlan;
  }, [activePlan, oneTimePromo, miniPromo]);
  const { isAuthenticated, userData, isMember } = useUserContext();
  const { savePaymentMethod } = useSavedPaymentMethods();
  const purchaseMembership = usePurchaseMembership();
  const purchaseUpsell = usePurchaseUpsell();
  const createSetupIntent = useSetupIntent();
  // Upsell functionality now handled through modal priority system
  const { showLoading, hideLoading, showSuccess } = useLoading();

  // Add query client for UI updates
  const queryClient = useQueryClient();

  // Helper function to invalidate user-related caches
  const invalidateUserCaches = useCallback(
    (userId: string) => {
      console.log("🔄 Invalidating user caches for:", userId);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rewards.user(userId) });
    },
    [queryClient]
  );

  // Custom close handler that resets payment processing state
  const handleClose = useCallback(() => {
    console.log("🔄 MembershipModal: Resetting payment processing state on close");
    setShowPaymentProcessing(false);
    setPaymentIntentId(null);
    setProcessingPackageName("");
    setProcessingPackageType(undefined as unknown as "one-time" | "subscription" | "upsell" | "mini-draw");
    onClose();
  }, [onClose]);

  // Reset upsell trigger guard and payment processing state when modal reopens for a new purchase
  useEffect(() => {
    if (isOpen) {
      setUpsellTriggered(false);
      // Reset payment processing state to prevent infinite polling
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);
      setProcessingPackageName("");
      setProcessingPackageType(undefined as unknown as "one-time" | "subscription" | "upsell" | "mini-draw");
      // Success state is now handled by global LoadingContext
      console.log("🔄 Reset upsell trigger guard and payment processing state for new purchase");
    } else {
      // Ensure payment processing is cancelled when modal closes
      console.log("🔄 MembershipModal: Cancelling payment processing on modal close");
      setShowPaymentProcessing(false);
      setPaymentIntentId(null);
      setProcessingPackageName("");
      setProcessingPackageType(undefined as unknown as "one-time" | "subscription" | "upsell" | "mini-draw");
    }
  }, [isOpen]);

  const [currentStep, setCurrentStep] = useState(1); // Start neutral, will be updated by useEffect based on auth

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
      console.log(`?? Pre-populating form for authenticated user:`, userData.email);
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
      console.log("🎯 Received upsell payment event:", event.detail);
      const { offer } = event.detail;

      if (!offer) {
        console.error("❌ No upsell offer in event detail");
        return;
      }

      // Convert upsell offer to LocalMembershipPlan format using the new helper
      const upsellPlan = convertUpsellToLocalPlan(offer);
      console.log("🎯 Converted upsell offer to membership plan:", upsellPlan);

      // Set the upsell plan and notify parent component to change it
      if (onPlanChange) {
        onPlanChange(upsellPlan);
      }

      // Dispatch openMembershipModal event to trigger parent components to open the membership modal
      const openModalEvent = new CustomEvent("openMembershipModal", {
        detail: { plan: upsellPlan },
      });
      window.dispatchEvent(openModalEvent);

      console.log("🎯 Upsell plan converted, selected and dispatched openMembershipModal");
    };

    window.addEventListener("showUpsellPayment", handleUpsellPayment as EventListener);

    return () => {
      window.removeEventListener("showUpsellPayment", handleUpsellPayment as EventListener);
    };
  }, [onPlanChange]);

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
        return "+61 " + digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3").trim();
      }
    } else if (v.startsWith("61") && v.length > 2) {
      // Country code without +: 61 4XX XXX XXX
      const digits = v.substring(2);
      if (digits.length <= 9) {
        return "+61 " + digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3").trim();
      }
    } else if (v.startsWith("0")) {
      // Domestic format: 04XX XXX XXX
      if (v.length <= 10) {
        return v.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3").trim();
      }
    } else if (v.startsWith("4") || v.startsWith("5")) {
      // Mobile without leading 0: 4XX XXX XXX
      if (v.length <= 9) {
        return "0" + v.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3").trim();
      }
    }

    return v;
  };

  const validateMobileNumber = (mobile: string): boolean => {
    // Remove spaces and formatting
    const cleaned = mobile.replace(/\s+/g, "");

    // Australian mobile number patterns
    const patterns = [
      /^(\+61|61)?[4-5]\d{8}$/, // +61412345678, 61412345678, 412345678
      /^0[4-5]\d{8}$/, // 0412345678
    ];

    return patterns.some((pattern) => pattern.test(cleaned));
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
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log("✅ User registered successfully:", result.data);

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
          title: "Account Created Successfully!",
          message: `Welcome ${formData.firstName}! Now let's set up your payment method to complete your membership.`,
          duration: 8000,
        });

        // Registration successful, proceed to step 2
        setCurrentStep(2);

        // Show card form by default for new users
        setShowCardForm(true);

        // Create SetupIntent for guest user payment method collection
        try {
          const setupResult = await createSetupIntent.mutateAsync();

          if (setupResult.success && setupResult.client_secret) {
            setSetupIntentClientSecret(setupResult.client_secret);
            setCardFormError(null); // Clear any previous errors
          } else {
            throw new Error(setupResult.error || "Failed to create SetupIntent");
          }
        } catch (error: unknown) {
          console.error("Failed to create SetupIntent:", error);

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
    } catch (error) {
      console.error("❌ Registration error:", error);
      setRegistrationErrors({
        general: "Registration failed. Please check your connection and try again.",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
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
        setReferralError("Enter a referral code before applying.");
        setCouponApplied(false);
        setReferralInfo(null);
        return;
      }

      setIsValidatingReferral(true);
      setReferralError(null);

      try {
        const inviteeUserId = isAuthenticated ? userData?._id : guestUserData?.userId;
        const rawEmail = isAuthenticated ? userData?.email : guestUserData?.email ?? formData.email ?? undefined;
        const inviteeEmail = rawEmail?.trim() ? rawEmail.trim() : undefined;

        const payload: Record<string, unknown> = {
          referralCode: normalizedCode,
        };

        if (inviteeUserId) {
          payload.inviteeUserId = inviteeUserId;
        }
        if (inviteeEmail) {
          payload.inviteeEmail = inviteeEmail;
        }

        const response = await fetch("/api/referrals/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "This referral code is not valid right now.");
        }

        setCouponCode(normalizedCode);
        setCouponApplied(true);
        setReferralInfo({ referrerName: data.data.referrerName });
        setReferralError(null);
        persistReferralCode(normalizedCode);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "We couldn't validate that referral code. Please try again.";
        setReferralError(message);
        setCouponApplied(false);
        setReferralInfo(null);
        if (source === "auto") {
          clearReferralCode();
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
    console.log("🔄 Package Change clicked:", {
      activePlanId: activePlan.id,
      activePlanName: activePlan.name,
      isMiniDrawPackage: activePlan.id.startsWith("mini-pack-"),
    });

    // Check if current plan is a mini draw package
    const isMiniDrawPackage = activePlan.id.startsWith("mini-pack-");

    if (isMiniDrawPackage) {
      console.log("📦 Mini draw packages now use SpecialPackagesModal");
      // Mini draw packages are handled through SpecialPackagesModal
      setIsPackageSelectionOpen(true);
    } else {
      console.log("📦 Opening PackageSelectionModal");
      setIsPackageSelectionOpen(true);
    }
  };

  const handlePackageSelect = (newPlan: LocalMembershipPlan) => {
    console.log("✅ Package selected:", {
      newPlanId: newPlan.id,
      newPlanName: newPlan.name,
      onPlanChange: !!onPlanChange,
    });

    // Update the selected plan by calling the parent callback
    if (onPlanChange) {
      onPlanChange(newPlan);
    } else {
      console.warn("⚠️ onPlanChange callback is not provided!");
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

      // Create SetupIntent for payment method creation
      const result = await createSetupIntent.mutateAsync();

      if (result.success && result.client_secret) {
        setSetupIntentClientSecret(result.client_secret);
        setUseSavedPaymentMethod(false);
        setSelectedPaymentMethod(null);
        setShowCardForm(true);
      } else {
        throw new Error(result.error || "Failed to create payment method setup");
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

  // Payment processing handlers
  const handlePaymentProcessingSuccess = async (status: PaymentStatusResponse) => {
    console.log("🎉 Payment processing completed:", status);
    setShowPaymentProcessing(false);

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
        text: `${status.data.entries} entries added to your account`,
        icon: "star" as const,
      });
    }

    // Add reward points if available
    if (status.data?.points && status.data.points > 0) {
      benefits.push({
        text: `${status.data.points} reward points earned`,
        icon: "zap" as const,
      });
    }

    // Show success modal with entry information
    showSuccess("Purchase Successful!", `${processingPackageName} activated`, benefits, 3000);

    // ✅ Store original purchase context for combined invoice (if needed for upsells)
    // CRITICAL FIX: Create local variable to avoid React state closure issue
    let contextToPass: OriginalPurchaseContext | null = null;

    console.log("🔍 Checking invoice context storage:", {
      hasPaymentIntentId: !!paymentIntentId,
      hasProcessingPackageName: !!processingPackageName,
      hasProcessingPackageType: !!processingPackageType,
      processingPackageType,
      isUpsell: processingPackageType === "upsell",
    });
    if (paymentIntentId && processingPackageName && processingPackageType && processingPackageType !== "upsell") {
      const isMiniDrawPackage = activePlan.id.startsWith("mini-pack-");
      const packageId = isMiniDrawPackage
        ? activePlan.id
        : getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);

      const packageTypeForUpsell = processingPackageType === "mini-draw" ? "one-time" : processingPackageType;

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
              console.log("📧 Retrieved miniDrawId from payment intent metadata:", miniDrawId);
            }
          }
        } catch (error) {
          console.warn("⚠️ Could not fetch miniDrawId from payment intent metadata:", error);
        }
      }

      // Create context object in local variable to pass directly (avoids closure issue)
      contextToPass = {
        paymentIntentId,
        packageId: packageId || "",
        packageName: processingPackageName,
        packageType: packageTypeForUpsell,
        price: activePlan.price,
        entries: status.data?.entries || 0,
        miniDrawId,
        miniDrawName,
      };

      // Also update state for other component uses
      setOriginalPurchaseContext(contextToPass);
      console.log("📧 Stored original purchase context for invoice finalization", {
        miniDrawId,
        miniDrawName,
      });
    } else {
      console.log("⚠️ Invoice context NOT stored - condition failed");
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
          : getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);

        const triggerType = activePlan.period === "one-time" ? "one-time-purchase" : "membership-purchase";
        const packageType = activePlan.period === "mo" ? "subscription" : "one-time";

        console.log("🎯 Triggering upsell from PaymentProcessingScreen:", {
          packageName: processingPackageName || activePlan.name,
          packageType: processingPackageType || packageType,
          packageId,
          triggerType,
          hasContext: !!finalContextToPass,
        });

        triggerUpsellModal(
          triggerType,
          processingPackageName || activePlan.name,
          activePlan.price,
          packageId || undefined,
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
    console.warn("⏰ Payment processing timed out - showing fallback success");
    setShowPaymentProcessing(false);

    // Show fallback success message since payment was successful
    showSuccess(
      "Purchase Complete!",
      `${processingPackageName} activated`,
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
  }) => {
    // Payment confirmation state removed - handled directly in handleSubmit

    // Check if this is a new user registration
    if (data?.user) {
      console.log("🔄 New user registration completed:", data.user);

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
            console.log("✅ Auto-login successful");
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
            showSuccess(
              "Successful!",
              `${activePlan.name} activated`,
              [{ text: `${activePlan.name} membership activated`, icon: "gift" }],
              3000
            );

            // Success is now handled by global success screen above

            // Store original purchase context for combined invoice (if paymentIntentId is available)
            // CRITICAL FIX: Create local variable to avoid React state closure issue
            let contextToPass: OriginalPurchaseContext | null = null;

            if (paymentIntentId) {
              const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
              const entriesCount = activePlan.metadata?.entriesCount || 0;

              // Create context object in local variable to pass directly (avoids closure issue)
              contextToPass = {
                paymentIntentId,
                packageId: packageId || "",
                packageName: activePlan.name,
                packageType: activePlan.period === "mo" ? "subscription" : "one-time",
                price: activePlan.price,
                entries: entriesCount,
              };

              // Also update state for other component uses
              setOriginalPurchaseContext(contextToPass);
              console.log("📧 Stored original purchase context for invoice finalization (new user)");
            }

            // Add delay to allow authentication to complete before triggering upsell
            // Capture contextToPass in closure to ensure it's available when setTimeout executes
            const finalContextToPass = contextToPass;

            setTimeout(() => {
              // Prevent duplicate upsell calls for new users too
              if (upsellTriggered) {
                console.log("?? Upsell already triggered for new user, skipping to prevent duplicate API calls");
                return;
              }
              setUpsellTriggered(true); // Mark that we've triggered this once

              // Trigger upsell modal for new user AFTER authentication is complete
              triggerUpsellModal(
                triggerType,
                activePlan.name,
                activePlan.price,
                getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) || undefined,
                activePlan.period === "mo" ? "subscription" : "one-time",
                finalContextToPass
              );

              // Add delay to allow upsell modal to show before redirecting
              setTimeout(() => {
                router.push("/my-account");
              }, 2000); // 2 second delay
            }, 1000); // 1 second delay for authentication
            return;
          } else {
            console.log("❌ Auto-login failed:", signInResult?.error);
            // Show global success screen for account creation
            hideLoading();
            showSuccess(
              "Account Created!",
              `${activePlan.name} activated`,
              [{ text: `${activePlan.name} membership activated`, icon: "gift" }],
              3000
            );
          }
        } else {
          console.log("❌ Failed to get auto-login token:", autoLoginData.error);
          // Show global success screen for account creation
          hideLoading();
          showSuccess(
            "Account Created!",
            `${activePlan.name} activated`,
            [{ text: `${activePlan.name} membership activated`, icon: "gift" }],
            3000
          );
        }
      } catch (error) {
        console.error("❌ Auto-login error:", error);
        // Show global success screen for account creation
        hideLoading();
        showSuccess(
          "Account Created!",
          `${activePlan.name} activated`,
          [{ text: `${activePlan.name} membership activated`, icon: "gift" }],
          3000
        );
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

      // Build benefits array with entry and reward information
      const benefits = [];

      // Add package activation message
      benefits.push({
        text: `${activePlan.name} activated`,
        icon: "gift" as const,
      });

      // Add entries if available (with "every month" for subscriptions)
      const entriesCount = activePlan.metadata?.entriesCount || 0;
      if (entriesCount > 0) {
        const entryText =
          activePlan.period === "mo"
            ? `${entriesCount} entries added every month`
            : `${entriesCount} entries added to your account`;
        benefits.push({
          text: entryText,
          icon: "star" as const,
        });
      }

      // Add reward points if available (with "every month" for subscriptions)
      const rewardPoints = Math.floor(activePlan.price);
      if (rewardPoints > 0) {
        const pointsText =
          activePlan.period === "mo"
            ? `${rewardPoints} reward points earned every month`
            : `${rewardPoints} reward points earned`;
        benefits.push({
          text: pointsText,
          icon: "gift" as const,
        });
      }

      showSuccess("Successful!", `${activePlan.name} activated`, benefits, 3000);

      // Store original purchase context for combined invoice (if needed for upsells)
      // CRITICAL FIX: Create local variable to avoid React state closure issue
      let contextToPass: OriginalPurchaseContext | null = null;

      if (paymentIntentId && activePlan.period === "one-time") {
        const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
        // Create context object in local variable to pass directly (avoids closure issue)
        contextToPass = {
          paymentIntentId,
          packageId: packageId || "",
          packageName: activePlan.name,
          packageType: "one-time",
          price: activePlan.price,
          entries: entriesCount,
        };
        // Also update state for other component uses
        setOriginalPurchaseContext(contextToPass);
        console.log("📧 Stored original purchase context for invoice finalization (from handlePaymentSuccess)");
      } else if (paymentIntentId && activePlan.period === "mo") {
        const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
        // Create context object in local variable to pass directly (avoids closure issue)
        contextToPass = {
          paymentIntentId,
          packageId: packageId || "",
          packageName: activePlan.name,
          packageType: "subscription",
          price: activePlan.price,
          entries: entriesCount,
        };
        // Also update state for other component uses
        setOriginalPurchaseContext(contextToPass);
        console.log("📧 Stored original purchase context for invoice finalization (subscription)");
      }

      // Trigger upsell modal for existing user after a delay with duplicate prevention
      // Capture contextToPass in closure to ensure it's available when setTimeout executes
      const finalContextToPass = contextToPass;

      setTimeout(() => {
        // Prevent duplicate upsell calls
        if (upsellTriggered) {
          console.log("?? Upsell already triggered for this purchase, skipping to prevent duplicate API calls");
          return;
        }

        console.log("?? TRIGGERING UPSELL for existing user:", {
          triggerType,
          activePlanName: activePlan.name,
          activePlanPeriod: activePlan.period,
          activePlanPrice: activePlan.price,
          subscriptionPackagesCount: subscriptionPackages?.length || 0,
          oneTimePackagesCount: oneTimePackages?.length || 0,
          packageId: getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]),
          hasContext: !!finalContextToPass,
        });

        setUpsellTriggered(true); // Mark that we've triggered this once

        triggerUpsellModal(
          triggerType,
          activePlan.name,
          activePlan.price,
          getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) || undefined,
          activePlan.period === "mo" ? "subscription" : "one-time",
          finalContextToPass
        );
      }, 2000); // 2 second delay

      // Close modal after triggering upsell
      onClose();
    }
  };

  // handlePaymentError removed - errors now handled directly in handleSubmit

  const handleSubmit = async () => {
    setIsSubmitting(true);

    // Show global loading screen
    showLoading("Processing Purchase", "", [
      "Verifying payment method",
      "Processing transaction",
      isAuthenticated ? "Activating your membership" : "Creating your account",
    ]);

    try {
      // Check if this is an upsell purchase using metadata flag
      const isUpsellOffer = activePlan?.metadata?.isUpsellOffer === true;

      if (isUpsellOffer) {
        // Handle upsell plan purchase via upsell API
        console.log("🎯 Handling upsell purchase:", activePlan.name, {
          entriesCount: activePlan.metadata?.entriesCount,
          category: activePlan.metadata?.category,
        });

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
        });

        if (result.success) {
          const entriesAdded = activePlan.metadata?.entriesCount || 0;
          // Show global success screen for upsell purchase
          hideLoading();
          showSuccess(
            "Successful!",
            `${entriesAdded} entries added to your account`,
            [{ text: `${entriesAdded} entries added to your wallet`, icon: "gift" }],
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

      let packageId: string | null = null;

      if (isMiniDrawPackage) {
        // For mini draw packages, use the ID directly
        packageId = activePlan.id;
        console.log("🎲 Mini draw package detected:", packageId);
      } else {
        // Get the real MongoDB ObjectId for regular membership packages
        const allPackages = [...subscriptionPackages, ...oneTimePackages];
        packageId = getPackageId(activePlan, allPackages);

        if (!packageId) {
          throw new Error("Package not found. Please refresh and try again.");
        }
      }

      // Safety check: Prevent non-members from purchasing member-exclusive packages
      const isMemberExclusivePackage = packageId.startsWith("additional-");
      if (isMemberExclusivePackage && (!isAuthenticated || !userData?.subscription?.isActive)) {
        throw new Error(
          "This package is exclusive to members. Please subscribe to a membership first to access member-exclusive packages."
        );
      }

      // Safety check: Auto-adjust non-member packages to member packages for existing members
      if (isAuthenticated && userData?.subscription?.isActive) {
        // Simple mapping for non-member to member packages
        const packageMapping: Record<string, string> = {
          "apprentice-pack": "additional-apprentice-pack",
          "tradie-pack": "additional-tradie-pack",
          "foreman-pack": "additional-foreman-pack",
          "boss-pack": "additional-boss-pack",
          "power-pack": "additional-power-pack",
        };

        const adjustedPackageId = packageMapping[packageId] || packageId;
        if (adjustedPackageId !== packageId) {
          console.log(`🔄 Package auto-adjustment: ${packageId} → ${adjustedPackageId}`);
          console.log(
            `📢 User message: As a member, you've been upgraded to the member-exclusive package with better benefits!`
          );

          // Update the packageId to the adjusted one
          packageId = adjustedPackageId;
        }
      }

      // Determine payment method to use
      let paymentMethodId: string;
      let isNewPaymentMethod = false;

      if (useSavedPaymentMethod && selectedPaymentMethod) {
        // Use saved payment method
        paymentMethodId = selectedPaymentMethod.paymentMethodId;
        console.log("�'� Using saved payment method:", paymentMethodId);
      } else if (showCardForm || !isAuthenticated) {
        // For new payment methods or new users, confirm the card form first
        if (showCardForm && cardFormRef.current) {
          console.log("💳 Confirming card setup...");
          const result = await cardFormRef.current.confirmSetup();

          if (result.error) {
            throw new Error(result.error);
          } else if (result.paymentMethodId) {
            paymentMethodId = result.paymentMethodId;
            console.log("✅ Card confirmed successfully:", paymentMethodId);
          } else {
            throw new Error("Failed to confirm card details.");
          }
        } else if (selectedPaymentMethod) {
          paymentMethodId = selectedPaymentMethod.paymentMethodId;
        } else {
          throw new Error("Please complete the card details to add a new payment method.");
        }
        isNewPaymentMethod = true;
        console.log("�'� Using new payment method:", paymentMethodId);
      } else {
        // For authenticated users: No payment method selected and card form not shown
        throw new Error("Please select a payment method or add a new one");
      }

      let result;

      // Handle mini draw package purchase
      if (isMiniDrawPackage) {
        console.log("🎲 Processing mini draw package purchase:", activePlan.name);

        // Use the mini draw purchase hook
        const miniDrawResult = await purchaseMembership.mutateAsync({
          packageId: packageId,
          userId: userData?._id || "",
          paymentMethodId,
        });

        if (miniDrawResult) {
          console.log("✅ Mini draw purchase successful:", miniDrawResult);

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
            console.log("🎯 Using PaymentProcessingScreen for mini draw purchase");

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
                text: `${entriesCount} entries added to your account`,
                icon: "star" as const,
              });
            }

            // Add reward points if available
            const rewardPoints = Math.floor(activePlan.price);
            if (rewardPoints > 0) {
              benefits.push({
                text: `${rewardPoints} reward points earned`,
                icon: "gift" as const,
              });
            }

            showSuccess("Successful!", `${activePlan.name} activated`, benefits, 3000);

            // Trigger upsell modal after a delay with duplicate prevention
            setTimeout(() => {
              if (upsellTriggered) {
                console.log("🎯 Upsell already triggered for mini draw purchase, skipping");
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
        console.log("🚀 Creating purchase for existing user:", userData?.email);

        if (activePlan.period === "mo") {
          // Subscription for existing user
          result = await createSubscriptionExistingUser({
            packageId,
            paymentMethodId,
            referralCode: couponApplied ? couponCode.trim().toUpperCase() : undefined,
          });
        } else {
          // One-time purchase for existing user using optimistic updates
          result = await purchaseMembership.mutateAsync({
            packageId,
            userId: userData?._id || "",
            paymentMethodId,
            referralCode: couponApplied ? couponCode.trim().toUpperCase() : undefined,
          });
        }

        console.log("✅ Purchase successful for existing user:", result);

        // Automatically save payment method if it's new and user is authenticated
        if (isNewPaymentMethod) {
          try {
            await savePaymentMethod(paymentMethodId, true); // Set as default
            console.log("💾 Payment method saved automatically");
          } catch (error) {
            console.warn("Could not save payment method:", error);
          }
        }

        // Handle subscription payment confirmation directly for existing users
        if (activePlan.period === "mo") {
          console.log("🚀 Confirming subscription payment directly for existing user");

          // Extract subscription ID and client secret
          let subscriptionId = "";
          let clientSecret = "pending";

          const resultAny = result as {
            subscription?: { id: string; clientSecret?: string };
            data?: {
              subscription?: { id: string; clientSecret?: string };
              subscriptionId?: string;
              clientSecret?: string;
            };
          };

          // Existing user format: result.subscription.id exists
          if (resultAny.subscription?.id) {
            subscriptionId = resultAny.subscription.id;
            clientSecret = resultAny.subscription.clientSecret || "pending";
            console.log("? Found subscription in existing user format");
          }
          // New user format: result.data.subscription.id or result.data.subscriptionId
          else if (resultAny.data) {
            if (resultAny.data.subscription?.id) {
              subscriptionId = resultAny.data.subscription.id;
              clientSecret = resultAny.data.subscription.clientSecret || "pending";
              console.log("? Found subscription in nested data format");
            } else if (resultAny.data.subscriptionId) {
              subscriptionId = resultAny.data.subscriptionId;
              clientSecret = resultAny.data.clientSecret || "pending";
              console.log("? Found subscriptionId in data format");
            }
          }

          if (!subscriptionId) {
            console.error("? WARNING: No subscription ID found! Full result was:", result);
            throw new Error("Failed to get subscription ID. Please try again.");
          }

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
                clientSecret: clientSecret === "pending" ? null : clientSecret,
                userId: undefined, // Existing user - no userId needed
              }),
            });

            const confirmResult = await confirmResponse.json();

            if (!confirmResponse.ok) {
              throw new Error(confirmResult.error || "Failed to confirm payment");
            }

            console.log("? Subscription payment confirmed successfully");

            // Extract paymentIntentId for invoice context
            let extractedPaymentIntentId: string | null = null;
            if (confirmResult.data?.paymentIntentId) {
              extractedPaymentIntentId = confirmResult.data.paymentIntentId;
            } else if (confirmResult.data?.latestInvoice?.payment_intent) {
              extractedPaymentIntentId =
                typeof confirmResult.data.latestInvoice.payment_intent === "string"
                  ? confirmResult.data.latestInvoice.payment_intent
                  : confirmResult.data.latestInvoice.payment_intent.id;
            }

            // Store for invoice finalization
            if (extractedPaymentIntentId) {
              setPaymentIntentId(extractedPaymentIntentId);
              console.log("📧 Stored paymentIntentId from subscription confirmation");
            }

            // Handle success directly
            await handlePaymentSuccess(confirmResult.data);
            return;
          } catch (confirmError) {
            console.error("? Subscription payment confirmation failed:", confirmError);
            throw confirmError;
          }
        } else if (activePlan.period === "one-time") {
          console.log("🚀 One-time purchase completed for existing user");

          // Check if we have paymentIntentId for PaymentProcessingScreen
          let paymentIntentId: string | null = null;

          // Handle different response structures
          // Priority 1: Check root level paymentIntent (one-time packages from create-one-time-purchase-existing-user)
          if ("paymentIntent" in result && result.paymentIntent) {
            // Handle API response with paymentIntent at root level
            paymentIntentId =
              typeof result.paymentIntent === "string" ? result.paymentIntent : result.paymentIntent.id || null;
            console.log("🔍 Extracted paymentIntentId from result.paymentIntent:", paymentIntentId);
          }
          // Priority 2: Check nested data.paymentIntent (some response formats)
          else if ("data" in result && result.data && "paymentIntent" in result.data) {
            paymentIntentId = result.data.paymentIntent?.id || null;
            console.log("🔍 Extracted paymentIntentId from result.data.paymentIntent:", paymentIntentId);
          }
          // Priority 3: Check data.paymentIntentId (mini-draw packages)
          else if ("data" in result && result.data && "paymentIntentId" in result.data) {
            paymentIntentId = result.data.paymentIntentId as string;
            console.log("🔍 Extracted paymentIntentId from result.data.paymentIntentId:", paymentIntentId);
          }
          // Priority 4: Check root level paymentIntentId (legacy format)
          else if ("paymentIntentId" in result && result.paymentIntentId) {
            paymentIntentId = result.paymentIntentId as string;
            console.log("🔍 Extracted paymentIntentId from result.paymentIntentId:", paymentIntentId);
          } else {
            console.log("⚠️ Could not extract paymentIntentId from result. Result structure:", {
              hasPaymentIntent: "paymentIntent" in result,
              hasData: "data" in result,
              hasPaymentIntentId: "paymentIntentId" in result,
              resultKeys: Object.keys(result || {}),
            });
          }

          if (paymentIntentId) {
            console.log(
              "🎯 Using PaymentProcessingScreen for one-time purchase with paymentIntentId:",
              paymentIntentId
            );

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
                text: `${entriesCount} entries added to your account`,
                icon: "star" as const,
              });
            }

            // Add reward points if available (using a default calculation)
            // For one-time packages, reward points are typically 1 point per dollar spent
            const rewardPoints = Math.floor(activePlan.price); // Price is already in dollars
            if (rewardPoints > 0) {
              benefits.push({
                text: `${rewardPoints} reward points earned`,
                icon: "gift" as const,
              });
            }

            showSuccess("Successful!", `${activePlan.name} activated`, benefits, 3000);

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
              const packageId = getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]);
              const entriesCount = activePlan.metadata?.entriesCount || 0;

              fallbackContext = {
                paymentIntentId: fallbackPaymentIntentId,
                packageId: packageId || "",
                packageName: activePlan.name,
                packageType: "one-time",
                price: activePlan.price,
                entries: entriesCount,
              };

              setOriginalPurchaseContext(fallbackContext);
              console.log("📧 Stored original purchase context for invoice finalization (fallback path)");
            } else {
              console.warn("⚠️ Fallback path could not extract paymentIntentId - invoice finalization may be delayed");
            }

            // Trigger upsell modal for existing user after a delay with duplicate prevention
            const finalFallbackContext = fallbackContext;
            setTimeout(() => {
              // Prevent duplicate upsell calls
              if (upsellTriggered) {
                console.log("?? Upsell already triggered for this purchase, skipping to prevent duplicate API calls");
                return;
              }

              console.log("?? TRIGGERING UPSELL for existing user:", {
                triggerType,
                activePlanName: activePlan.name,
                activePlanPeriod: activePlan.period,
                activePlanPrice: activePlan.price,
                subscriptionPackagesCount: subscriptionPackages?.length || 0,
                oneTimePackagesCount: oneTimePackages?.length || 0,
                packageId: getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]),
              });

              setUpsellTriggered(true); // Mark that we've triggered this once

              triggerUpsellModal(
                triggerType,
                activePlan.name,
                activePlan.price,
                getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) || undefined,
                activePlan.period === "mo" ? "subscription" : "one-time",
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
            `${activePlan.name} activated`,
            [{ text: "Entries have been added to your wallet", icon: "gift" }],
            3000
          );

          // Trigger upsell modal
          triggerUpsellModal(
            activePlan.period === "mo" ? "membership-purchase" : "one-time-purchase",
            activePlan.name,
            activePlan.price,
            getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) || undefined,
            activePlan.period === "mo" ? "subscription" : "one-time",
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

        console.log("🚀 Creating purchase for newly registered user:", guestUserData.email);

        // Prepare subscription data for new user
        const subscriptionData = {
          userEmail: guestUserData.email,
          firstName: guestUserData.firstName,
          lastName: guestUserData.lastName,
          mobile: guestUserData.mobile,
          packageId,
          paymentMethodId,
          referralCode: couponApplied ? couponCode.trim().toUpperCase() : undefined,
        };

        console.log("📦 Subscription data:", subscriptionData);

        // Create subscription or one-time purchase based on plan type
        result =
          activePlan.period === "mo"
            ? await createSubscription(subscriptionData)
            : await createOneTimePurchase(subscriptionData);

        if (result) {
          console.log("✅ Account created successfully:", result);
          console.log("🔍 Debug - result.data:", result.data);
          console.log("🔍 Debug - clientSecret:", result.data?.clientSecret);
          console.log("🔍 Debug - activePlan.period:", activePlan.period);

          // Payment method is automatically saved during user creation in the API
          console.log("💾 Payment method saved automatically during user creation");

          // Handle subscription payment confirmation directly for new users
          if (activePlan.period === "mo") {
            console.log("🚀 Confirming subscription payment directly for new user");

            const subscriptionId = result.data?.subscriptionId || "";
            const clientSecret = result.data?.clientSecret || "pending";
            const userId = result.data?.userId;

            if (!subscriptionId) {
              console.error("? WARNING: No subscription ID found for new user!");
              throw new Error("Failed to get subscription ID. Please try again.");
            }

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
                  clientSecret: clientSecret === "pending" ? null : clientSecret,
                  userId: userId, // New user - include userId
                }),
              });

              const confirmResult = await confirmResponse.json();

              if (!confirmResponse.ok) {
                throw new Error(confirmResult.error || "Failed to confirm payment");
              }

              console.log("? New user subscription payment confirmed successfully");

              // Handle success directly with user data for auto-login
              await handlePaymentSuccess(confirmResult.data);
              return;
            } catch (confirmError) {
              console.error("? New user subscription payment confirmation failed:", confirmError);
              throw confirmError;
            }
          } else if (activePlan.period === "one-time") {
            // Check if we can handle one-time purchase with autologin directly first
            const oneTimeData = result.data as OneTimePurchaseData;
            if (oneTimeData?.user && (oneTimeData?.autoLogin || result.data?.userId)) {
              console.log("?? One-time purchase with user data - handling autologin directly");

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
                    console.log("? Auto-login successful for one-time purchase");
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
                    // Build benefits array with entry and reward information
                    const benefits = [];

                    // Add package activation message
                    benefits.push({
                      text: `${activePlan.name} activated`,
                      icon: "gift" as const,
                    });

                    // Add entries if available (use activePlan metadata first, then fallback to oneTimeData)
                    const entriesCount = activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0;
                    if (entriesCount > 0) {
                      benefits.push({
                        text: `${entriesCount} entries added to your account`,
                        icon: "star" as const,
                      });
                    }

                    // Add reward points if available
                    const rewardPoints = Math.floor(activePlan.price);
                    if (rewardPoints > 0) {
                      benefits.push({
                        text: `${rewardPoints} reward points earned`,
                        icon: "gift" as const,
                      });
                    }

                    showSuccess("Welcome!", `${activePlan.name} activated`, benefits, 3000);

                    // Extract paymentIntentId and set originalPurchaseContext for invoice finalization
                    const oneTimePaymentIntentId = oneTimeData?.paymentIntentId || result.data?.paymentIntentId || null;
                    const oneTimeOriginalContext: OriginalPurchaseContext | null = oneTimePaymentIntentId
                      ? {
                          paymentIntentId: oneTimePaymentIntentId,
                          packageId: getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) || "",
                          packageName: activePlan.name,
                          packageType: "one-time",
                          price: activePlan.price,
                          entries: activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0,
                        }
                      : null;

                    // Add delay to allow authentication to complete before triggering upsell
                    setTimeout(() => {
                      triggerUpsellModal(
                        triggerType,
                        activePlan.name,
                        activePlan.price,
                        getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) || undefined,
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
                console.log("?? Auto-login attempted but failed, continuing to payment confirmation");
              } catch (authError) {
                console.error("? Error in one-time autologin:", authError);
              }
            }

            console.log("🚀 Showing payment confirmation modal for one-time purchase");
            // Show payment confirmation modal for one-time purchases too
            // One-time purchase confirmation removed - handled directly in handleSubmit
          } else {
            console.log("📦 One-time purchase - handling success");
            // One-time purchase - handle auto-login if user data is provided
            const oneTimeData = result.data as OneTimePurchaseData;
            if (oneTimeData?.user && oneTimeData?.autoLogin) {
              console.log("🔄 One-time purchase with auto-login:", oneTimeData.user);

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
                    console.log("✅ Auto-login successful for one-time purchase");
                    // Show global success screen
                    hideLoading();
                    showSuccess(
                      "Welcome!",
                      `${activePlan.name} activated`,
                      [{ text: `${oneTimeData.user.entryWallet || 0} entries ready to use`, icon: "gift" }],
                      3000
                    );

                    // Extract paymentIntentId and set originalPurchaseContext for invoice finalization
                    const oneTimePaymentIntentId2 =
                      oneTimeData?.paymentIntentId || result.data?.paymentIntentId || null;
                    const oneTimeOriginalContext2: OriginalPurchaseContext | null = oneTimePaymentIntentId2
                      ? {
                          paymentIntentId: oneTimePaymentIntentId2,
                          packageId: getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) || "",
                          packageName: activePlan.name,
                          packageType: activePlan.period === "mo" ? "subscription" : "one-time",
                          price: activePlan.price,
                          entries: activePlan.metadata?.entriesCount || oneTimeData.totalEntries || 0,
                        }
                      : null;

                    onClose();

                    // Add delay to allow authentication to complete before triggering upsell
                    setTimeout(() => {
                      // Trigger upsell modal for new user AFTER authentication is complete
                      triggerUpsellModal(
                        "one-time-purchase",
                        activePlan.name,
                        activePlan.price,
                        getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) || undefined,
                        activePlan.period === "mo" ? "subscription" : "one-time",
                        oneTimeOriginalContext2 || originalPurchaseContext
                      );

                      // Add delay to allow upsell modal to show before redirecting
                      setTimeout(() => {
                        router.push("/my-account");
                      }, 2000); // 2 second delay
                    }, 1000); // 1 second delay for authentication
                    return;
                  } else {
                    console.log("❌ Auto-login failed:", signInResult?.error);
                    // Show global success screen for account creation
                    hideLoading();
                    showSuccess(
                      "Account Created!",
                      `${activePlan.name} activated`,
                      [{ text: `${activePlan.name} membership activated`, icon: "gift" }],
                      3000
                    );
                  }
                } else {
                  console.log("❌ Failed to get auto-login token:", autoLoginData.error);
                  // Show global success screen for account creation
                  hideLoading();
                  showSuccess(
                    "Account Created!",
                    `${activePlan.name} activated`,
                    [{ text: `${activePlan.name} membership activated`, icon: "gift" }],
                    3000
                  );
                }
              } catch (autoLoginError) {
                console.error("❌ Auto-login error:", autoLoginError);
                // Show global success screen for account creation
                hideLoading();
                showSuccess(
                  "Account Created!",
                  `${activePlan.name} activated`,
                  [{ text: `${activePlan.name} membership activated`, icon: "gift" }],
                  3000
                );
              }
            } else {
              // Fallback for cases without auto-login data
              // Show global success screen for account creation
              hideLoading();
              showSuccess(
                "Account Created!",
                `${oneTimeData?.totalEntries || 0} entries added`,
                [{ text: `${oneTimeData?.totalEntries || 0} entries added to your wallet`, icon: "gift" }],
                3000
              );
            }

            // Extract paymentIntentId and set originalPurchaseContext for invoice finalization
            const finalPaymentIntentId = oneTimeData?.paymentIntentId || result.data?.paymentIntentId || null;
            const finalOriginalContext: OriginalPurchaseContext | null = finalPaymentIntentId
              ? {
                  paymentIntentId: finalPaymentIntentId,
                  packageId: getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) || "",
                  packageName: activePlan.name,
                  packageType: activePlan.period === "mo" ? "subscription" : "one-time",
                  price: activePlan.price,
                  entries: activePlan.metadata?.entriesCount || oneTimeData?.totalEntries || 0,
                }
              : null;

            // Trigger upsell modal
            triggerUpsellModal(
              "one-time-purchase",
              activePlan.name,
              activePlan.price,
              getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) || undefined,
              activePlan.period === "mo" ? "subscription" : "one-time",
              finalOriginalContext || originalPurchaseContext
            );

            onClose();
          }
        } else {
          throw new Error("Failed to create account. Please try again.");
        }
      }
    } catch (error: unknown) {
      console.error("❌ Purchase failed:", error);

      // Hide loading screen immediately
      hideLoading();

      // Extract detailed error message from API response
      let errorMessage = "An unexpected error occurred";
      const errorTitle = isAuthenticated ? "Purchase Failed" : "Account Creation Failed";
      let errorCode: string | undefined;

      if (error && typeof error === "object" && "response" in error) {
        const apiError = error as { response?: { data?: { error?: string; details?: string; code?: string } } };
        if (apiError.response?.data?.error) {
          errorMessage = apiError.response.data.error;
          errorCode = apiError.response.data.code;
          if (apiError.response.data.details) {
            errorMessage += `: ${apiError.response.data.details}`;
          }
        }
      } else if (error && typeof error === "object" && "message" in error) {
        const err = error as { message: string; code?: string };
        errorMessage = err.message;
        errorCode = err.code; // Check for code directly on error object
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      // Debug logging for error handling
      console.log("🔍 Error handling debug:", {
        error,
        errorCode,
        errorMessage,
        errorTitle,
        hasResponse: error && typeof error === "object" && "response" in error,
        hasCode: error && typeof error === "object" && "code" in error,
        errorKeys: error && typeof error === "object" ? Object.keys(error) : [],
        errorStringified: JSON.stringify(error, null, 2),
      });

      // Handle EXISTING_SUBSCRIPTION error with special toast and navigation
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
        // Show detailed error toast for other errors
        showToast({
          type: "error",
          title: errorTitle,
          message: errorMessage,
          duration: 8000, // Longer duration for detailed errors
        });
      }

      // Clear card form errors and allow user to retry
      setCardFormError(null);

      console.error(`${isAuthenticated ? "Purchase" : "Account creation"} failed: ${errorMessage}`);
    } finally {
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
    packageType?: "subscription" | "one-time",
    originalPurchaseContextParam?: OriginalPurchaseContext | null
  ) => {
    try {
      // If we have package information, use the new trigger API
      if (packageId && packageType) {
        console.log(`🎯 Triggering targeted upsell for package: ${packageId} (${packageType})`);

        // Determine correct userType based on package ID and type
        // Mini draw packages (mini-pack-1, mini-pack-2, etc.) should use "mini-draw-buyer"
        // Regular one-time packages should use "returning-user" or "new-user"
        const isMiniDrawPackage = packageId.startsWith("mini-pack-");

        // Check if this is a member-exclusive package (additional- packages)
        const isMemberExclusivePackage = packageId.startsWith("additional-");

        // If non-member is trying to trigger upsell for member-exclusive package, skip it
        if (isMemberExclusivePackage && !isMember) {
          console.log("⚠️ Skipping upsell trigger: Non-member cannot access member-exclusive package upsells");
          return;
        }

        const userType = isMiniDrawPackage ? "mini-draw-buyer" : isAuthenticated ? "returning-user" : "new-user";

        const response = await fetch("/api/upsell/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId,
            packageType,
            userType, // Correctly determined based on package type
            isMember: isMember, // Pass membership status
            triggerEvent,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data?.offer) {
            const offer = result.data.offer;
            console.log(`✅ Found targeted upsell offer: ${offer.name}`);

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
              console.log("🎯 Set pending upsell IMMEDIATELY for first-time user (before navigation)");
            } else {
              // For existing users, show upsell with a delay
              setTimeout(() => {
                const { requestModal } = useModalPriorityStore.getState();
                requestModal("upsell", false, {
                  offer: upsellOffer,
                  userContext,
                  originalPurchaseContext: finalOriginalPurchaseContext || undefined,
                });
                console.log("🎯 Showing upsell for existing user (after delay)");
              }, offer.showAfterDelay * 1000 || 2000);
            }

            return;
          }
        }
      }

      // Fallback: No upsell available
      console.log(`🎯 No upsell available for: ${recentPurchase}`);
    } catch (error) {
      console.error("Error triggering upsell:", error);
      // No fallback available - upsell system removed
    }
  };

  const isFormValid = () => {
    if (isAuthenticated) {
      // For authenticated users, need either saved payment method or new card details (when card form is shown)
      return useSavedPaymentMethod
        ? selectedPaymentMethod !== null
        : showCardForm
        ? !cardFormError && setupIntentClientSecret !== null // Card form is valid if no errors and SetupIntent is ready
        : false; // If no saved payment method and card form is not shown, form is invalid
    } else {
      // For new users (guest checkout), check if registration is complete and card form is ready
      const registrationComplete = currentStep === 2 && guestUserData !== null;
      const cardFormReady = !cardFormError && setupIntentClientSecret !== null;
      return Boolean(registrationComplete && cardFormReady);
    }
  };

  if (!isOpen) return null;

  // Loading and success screens are now handled by global LoadingContext

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="lg" closeOnBackdrop={false}>
      <ModalHeader title="" onClose={handleClose} showLogo={true} />

      <ModalContent>
        <div className="text-center ">
          <h1 className="text-base sm:text-lg font-bold text-black mb-1">
            JOIN <span className="text-[#ee0000]">TOOLS AUSTRALIA</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-600">
            {activePlan.period === "one-time"
              ? "Get your name into the draw"
              : "Get Your Name in EVERY Draw Automatically"}
          </p>
        </div>
        <div className="w-full max-w-sm mx-auto sm:max-w-lg md:max-w-xl lg:max-w-2xl">
          <div className="bg-white rounded-lg sm:rounded-xl shadow-xl p-3 sm:p-6">
            {/* Step 1: Personal Details for new users */}
            {currentStep === 1 && (
              <div className="space-y-3 sm:space-y-4">
                {/* General error message */}
                {registrationErrors.general && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-600">{registrationErrors.general}</p>
                  </div>
                )}

                <Input
                  name="firstName"
                  value={formData.firstName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange("firstName", e.target.value)}
                  label="First Name"
                  placeholder="Enter your first name"
                  error={registrationErrors.firstName}
                />

                <Input
                  name="lastName"
                  value={formData.lastName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange("lastName", e.target.value)}
                  label="Last Name"
                  placeholder="Enter your last name"
                  error={registrationErrors.lastName}
                />

                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange("email", e.target.value)}
                  label="Email"
                  placeholder="Enter your email address"
                  error={registrationErrors.email}
                />

                <div>
                  <Input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleInputChange("phone", formatMobileNumber(e.target.value))
                    }
                    label="Phone Number"
                    placeholder="0412 345 678"
                    error={registrationErrors.mobile}
                    maxLength={10}
                  />
                  <p className="text-xs sm:text-sm text-gray-500 mt-1">
                    Australian mobile number. We&apos;ll call this number if you win.
                  </p>
                  {formData.phone && !validateMobileNumber(formData.phone) && !registrationErrors.mobile && (
                    <p className="text-xs sm:text-sm text-red-500 mt-1">
                      Please enter a valid Australian mobile number
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  onClick={handleNextStep}
                  disabled={Boolean(
                    !formData.firstName ||
                      !formData.lastName ||
                      !formData.email ||
                      formData.phone === "" ||
                      !validateMobileNumber(formData.phone) ||
                      isRegistering
                  )}
                  variant="primary"
                  fullWidth
                  size="lg"
                  loading={isRegistering}
                  className="font-bold text-sm sm:text-base"
                >
                  {isRegistering ? (
                    "Creating Account..."
                  ) : (
                    <>
                      <span className="sm:hidden">REGISTER</span>
                      <span className="hidden sm:inline">REGISTER</span>
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Step 2: Payment Details */}
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
                    cardFormRef={cardFormRef}
                    onCardElementChange={handleCardElementChange}
                    cardFormError={cardFormError}
                    isCreatingSetupIntent={createSetupIntent.isPending}
                    billingDetails={resolvedBillingDetails}
                  />
                )}

                {/* Payment Section - Always show package info and payment button */}
                <div className="space-y-2 sm:space-y-3 border-t border-gray-200 pt-3 sm:pt-4">
                  {/* Payment Method Selector for non-authenticated users */}
                  {!isAuthenticated && (
                    <PaymentMethodSelector
                      onPaymentMethodSelect={handlePaymentMethodSelect}
                      onAddNewPaymentMethod={handleAddNewPaymentMethod}
                      selectedPaymentMethod={selectedPaymentMethod}
                      isAuthenticated={isAuthenticated}
                      showCardForm={showCardForm}
                      setupIntentClientSecret={setupIntentClientSecret}
                      cardFormRef={cardFormRef}
                      onCardElementChange={handleCardElementChange}
                      cardFormError={cardFormError}
                      isCreatingSetupIntent={createSetupIntent.isPending}
                      billingDetails={resolvedBillingDetails}
                    />
                  )}

                  {/* Coupon Code - Only show for regular packages, not upsells */}
                  {promoEnhancedPlan?.metadata?.isUpsellOffer !== true && (
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Coupon Code</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponCode}
                          onChange={(e) => {
                            const value = e.target.value.toUpperCase();
                            setCouponCode(value);
                            setCouponApplied(false);
                            setReferralInfo(null);
                            setReferralError(null);
                            if (!value.trim()) {
                              clearReferralCode();
                            }
                          }}
                          className="flex-1 px-2 sm:px-3 py-2 sm:py-3 border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-[#ee0000] focus:border-transparent transition-all duration-300 text-sm sm:text-base"
                          placeholder="Enter coupon code"
                        />
                        {couponApplied ? (
                          <div className="bg-green-500 text-white px-2 sm:px-3 py-2 sm:py-3 rounded-lg sm:rounded-xl flex items-center gap-1 sm:gap-2">
                            <Check size={12} />
                            <span className="text-xs font-bold">APPLIED</span>
                          </div>
                        ) : showApplyingIndicator ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500 px-2 sm:px-3 py-2 sm:py-3">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Applying...</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCouponApply("manual")}
                            disabled={isApplyDisabled}
                            className="bg-gray-500 text-white px-2 sm:px-3 py-2 sm:py-3 rounded-lg sm:rounded-xl hover:bg-gray-600 transition-colors text-xs sm:text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            Apply
                          </button>
                        )}
                      </div>
                      {referralInfo && (
                        <p className="mt-2 text-xs text-green-600">
                          Code confirmed! {referralInfo.referrerName} will receive 100 bonus entries when you complete
                          your purchase and verify your email.
                        </p>
                      )}
                      {referralError && <p className="mt-2 text-xs text-red-600">{referralError}</p>}
                    </div>
                  )}

                  {/* Selected Package */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl p-2 sm:p-3">
                    {!promoEnhancedPlan || promoEnhancedPlan.id === "placeholder" ? (
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
                    ) : (
                      <>
                        <h3
                          className={`text-xs sm:text-sm font-bold mb-1 sm:mb-2 ${
                            promoEnhancedPlan?.metadata?.isUpsellOffer === true ? "text-red-600" : "text-gray-800"
                          }`}
                        >
                          {promoEnhancedPlan?.metadata?.isUpsellOffer === true ? "Limited Offer" : "Selected Package"}
                        </h3>
                        <div
                          className={"rounded-lg sm:rounded-xl p-2 sm:p-3"}
                          style={{
                            border: "2px solid transparent",
                            backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${
                              promoEnhancedPlan?.metadata?.isUpsellOffer === true
                                ? "#dc2626"
                                : promoEnhancedPlan?.id?.includes("apprentice")
                                ? "#94a3b8"
                                : promoEnhancedPlan?.id?.includes("tradie")
                                ? "#3b82f6"
                                : promoEnhancedPlan?.id?.includes("foreman")
                                ? "#10b981"
                                : promoEnhancedPlan?.id?.includes("boss")
                                ? "#fbbf24"
                                : promoEnhancedPlan?.id?.includes("power-pack")
                                ? "#f97316"
                                : "#6b7280"
                            }, transparent)`,
                            backgroundOrigin: "border-box",
                            backgroundClip: "padding-box, border-box",
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4
                                  className={`font-bold text-xs sm:text-sm ${
                                    promoEnhancedPlan?.id?.includes("apprentice")
                                      ? "text-gray-300"
                                      : promoEnhancedPlan?.id?.includes("tradie")
                                      ? "text-blue-400"
                                      : promoEnhancedPlan?.id?.includes("foreman")
                                      ? "text-green-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                                      : promoEnhancedPlan?.id?.includes("boss")
                                      ? "text-yellow-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                                      : promoEnhancedPlan?.id?.includes("power-pack")
                                      ? "text-orange-400 drop-shadow-[0_0_6px_rgba(249,115,22,0.6)]"
                                      : "text-white"
                                  }`}
                                >
                                  {promoEnhancedPlan?.name || "No package selected"}
                                </h4>
                                {/* Promo Badge */}
                                {promoEnhancedPlan?.metadata?.isPromoActive &&
                                  promoEnhancedPlan?.metadata?.promoMultiplier && (
                                    <PromoBadge
                                      multiplier={promoEnhancedPlan.metadata.promoMultiplier as 2 | 3 | 5 | 10}
                                      size="small"
                                    />
                                  )}
                              </div>
                              <p
                                className={`text-xs sm:text-sm ${
                                  promoEnhancedPlan?.id &&
                                  (promoEnhancedPlan.metadata?.isUpsellOffer === true ||
                                    promoEnhancedPlan.id.startsWith("mini-pack-") ||
                                    promoEnhancedPlan.id.includes("tradie") ||
                                    promoEnhancedPlan.id.includes("apprentice-pack") ||
                                    promoEnhancedPlan.id.includes("tradie-pack") ||
                                    promoEnhancedPlan.id.includes("foreman") ||
                                    promoEnhancedPlan.id.includes("foreman-pack") ||
                                    promoEnhancedPlan.id.includes("boss-pack") ||
                                    promoEnhancedPlan.id.includes("boss") ||
                                    promoEnhancedPlan.id.includes("power-pack"))
                                    ? "text-gray-100"
                                    : "text-gray-600"
                                }`}
                              >
                                {promoEnhancedPlan?.features && promoEnhancedPlan.features.length > 0
                                  ? promoEnhancedPlan.features[0].text
                                  : promoEnhancedPlan?.subtitle || "No package selected"}
                              </p>
                            </div>
                            <div className="text-right">
                              <div
                                className={`font-bold text-xs sm:text-sm ${
                                  promoEnhancedPlan?.id?.includes("apprentice")
                                    ? "text-gray-300"
                                    : promoEnhancedPlan?.id?.includes("tradie")
                                    ? "text-blue-400"
                                    : promoEnhancedPlan?.id?.includes("foreman")
                                    ? "text-green-300 drop-shadow-[0_0_4px_rgba(16,185,129,0.6)]"
                                    : promoEnhancedPlan?.id?.includes("boss") ||
                                      promoEnhancedPlan?.id?.includes("power-pack")
                                    ? "text-yellow-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]"
                                    : "text-white"
                                }`}
                              >
                                {promoEnhancedPlan?.price && promoEnhancedPlan?.period
                                  ? promoEnhancedPlan.period === "one-time"
                                    ? `$${promoEnhancedPlan.price} One Time Payment`
                                    : `$${promoEnhancedPlan.price} Per Giveaway`
                                  : "No price"}
                              </div>
                              {/* Only show change button if it's not a limited upsell offer */}
                              {promoEnhancedPlan?.metadata?.isUpsellOffer !== true && (
                                <button
                                  onClick={handlePackageChange}
                                  className={`relative z-10 mt-1 text-xs sm:text-sm hover:underline transition-all duration-200 cursor-pointer ${
                                    promoEnhancedPlan?.id &&
                                    (promoEnhancedPlan.id.startsWith("mini-pack-") ||
                                      promoEnhancedPlan.id.includes("tradie") ||
                                      promoEnhancedPlan.id.includes("apprentice-pack") ||
                                      promoEnhancedPlan.id.includes("tradie-pack") ||
                                      promoEnhancedPlan.id.includes("foreman") ||
                                      promoEnhancedPlan.id.includes("foreman-pack") ||
                                      promoEnhancedPlan.id.includes("boss-pack") ||
                                      promoEnhancedPlan.id.includes("boss") ||
                                      promoEnhancedPlan.id.includes("power-pack"))
                                      ? "text-gray-200 hover:text-white"
                                      : "text-blue-600 hover:text-blue-800"
                                  }`}
                                >
                                  Change
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {!activePlan || activePlan.id === "placeholder" ? (
                    // Payment Button Skeleton
                    <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!isFormValid() || isSubmitting}
                      variant="metallic"
                      fullWidth
                      size="lg"
                      loading={isSubmitting}
                      className="font-bold text-sm sm:text-base"
                    >
                      {isSubmitting ? (
                        "Processing..."
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
                </div>
              </div>
            )}

            {/* Security Section - Only visible in payment step */}
            {currentStep === 2 && (
              <div className="mt-4 sm:mt-6 border border-gray-700">
                <div className="flex justify-center w-full">
                  <Image
                    src="/images/safe-checkout-stripe.png"
                    alt="Guaranteed safe & secure checkout - Powered by Stripe"
                    width={300}
                    height={75}
                    className="w-full h-auto max-w-full object-contain"
                  />
                </div>
              </div>
            )}

            {/* Winner Announcement Section */}
            <div className="mt-4 sm:mt-6">
              <div className="flex justify-between w-full mb-3 sm:mb-4">
                {/* Winner Images */}
                {top5Winners.slice(0, 5).map((winner) => (
                  <div
                    key={winner.id}
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-[#ee0000] overflow-hidden flex-shrink-0"
                  >
                    <Image
                      src={winner.image}
                      alt={winner.name}
                      width={70}
                      height={70}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>

              <blockquote className="text-center ">
                <p className="text-xs sm:text-sm text-gray-700 italic">
                  &quot;We are on the hunt for our first lucky winner! will it be you?&quot; Good luck!
                </p>
              </blockquote>

              <div className="text-center">
                <p className="bg-gradient-to-r from-[#ee0000] to-[#cc0000] bg-clip-text text-transparent">
                  - Tools Australia
                </p>
              </div>
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

      {/* Payment Processing Screen */}
      {showPaymentProcessing && paymentIntentId && (
        <PaymentProcessingScreen
          paymentIntentId={paymentIntentId}
          packageName={processingPackageName}
          packageType={processingPackageType}
          isVisible={showPaymentProcessing}
          onSuccess={handlePaymentProcessingSuccess}
          onError={handlePaymentProcessingError}
          onTimeout={handlePaymentProcessingTimeout}
        />
      )}

      {/* Payment Confirmation Modal removed - subscription confirmation now handled directly in handleSubmit */}
    </ModalContainer>
  );
};

export default MembershipModal;
