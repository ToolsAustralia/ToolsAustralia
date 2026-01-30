"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Eye, EyeOff, CheckCircle } from "lucide-react";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { PROFESSIONS } from "@/data/professions";
import { useUserContext } from "@/contexts/UserContext";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useReferralCode } from "@/hooks/useReferralCode";
import { DropdownOption } from "./ui/Dropdown";
import Dropdown from "./ui/Dropdown";
import { ModalContainer, ModalHeader, ModalContent, Button, Input, Select } from "./ui";
import EmailVerificationModal from "@/components/auth/EmailVerificationModal";
import { environmentFlags } from "@/lib/environment";

interface UserSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  initialStep?: number; // Allow starting at a specific step (1, 2, or 3)
}

const UserSetupModal: React.FC<UserSetupModalProps> = ({ isOpen, onClose, onComplete, initialStep = 1 }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingStateProfession, setIsSavingStateProfession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inlineErrors, setInlineErrors] = useState<{
    password?: string;
    confirmPassword?: string;
    profession?: string;
    customProfession?: string;
  }>({});

  // Email verification state
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Email correction state
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  // Local state for current email being displayed/verified (prevents modal reset on refetch)
  const [currentEmail, setCurrentEmail] = useState("");

  // Form state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedProfession, setSelectedProfession] = useState("");
  const [customProfession, setCustomProfession] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Dropdown open state tracking
  const [isStateDropdownOpen, setIsStateDropdownOpen] = useState(false);
  const [isProfessionDropdownOpen, setIsProfessionDropdownOpen] = useState(false);

  // Handlers for dropdown open state changes
  const handleStateDropdownChange = useCallback((isOpen: boolean) => {
    setIsStateDropdownOpen(isOpen);
  }, []);

  const handleProfessionDropdownChange = useCallback((isOpen: boolean) => {
    setIsProfessionDropdownOpen(isOpen);
  }, []);

  // Determine if any dropdown is open
  const isAnyDropdownOpen = isStateDropdownOpen || isProfessionDropdownOpen;

  // Refs for focusing on error fields
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  // Ref to prevent multiple auto-completions of step 3
  const hasAutoCompletedRef = useRef(false);

  // Ref to store handleComplete function for use in useEffect
  const handleCompleteRef = useRef<((bypassEmailCheck?: boolean) => Promise<void>) | null>(null);

  // Ref to track if we've already determined and set the initial step
  const stepDeterminedRef = useRef(false);

  // Password validation
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  const { refetch, userData, loading: userDataLoading } = useUserContext();
  const { hasReferralCode } = useReferralCode();

  // SessionStorage key for persisting modal state
  const SETUP_STATE_KEY = "userSetupModalState";

  // Clear state from sessionStorage
  const clearStateFromStorage = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      sessionStorage.removeItem(SETUP_STATE_KEY);
      console.log("🗑️ Cleared modal state from sessionStorage");
    } catch (error) {
      console.error("Failed to clear modal state:", error);
    }
  }, []);

  // Custom close handler that checks for pending upsell and environment restrictions
  const handleClose = useCallback(() => {
    // Prevent closing in production
    if (!environmentFlags.userSetupModalClosable()) {
      console.log("🚫 User setup modal cannot be closed in production environment");
      return;
    }

    // Clear the saved modal state when user intentionally closes
    clearStateFromStorage();

    // Check if upsell should be shown after modal close (for first-time users who skip setup)
    const { pendingUpsellAfterSetup, pendingUpsellData, setPendingUpsellAfterSetup } = useModalPriorityStore.getState();
    if (pendingUpsellAfterSetup && pendingUpsellData) {
      console.log("🎯 User setup modal closed, triggering pending upsell");
      setPendingUpsellAfterSetup(false); // Clear the flag

      // Trigger the upsell modal after a short delay
      setTimeout(() => {
        const { requestModal } = useModalPriorityStore.getState();
        requestModal("upsell", false, pendingUpsellData);
        console.log("🎯 Triggered pending upsell after modal close");
      }, 1000); // 1 second delay after modal close
    }

    // Call the original onClose
    onClose();
  }, [onClose, clearStateFromStorage]);

  // SessionStorage helpers to persist modal state across tab switches
  const saveStateToStorage = useCallback(() => {
    if (typeof window === "undefined") return;

    const state = {
      currentStep,
      password,
      confirmPassword,
      selectedState,
      selectedProfession,
      customProfession,
      isEmailVerified,
      currentEmail,
      showEmailVerification,
      timestamp: Date.now(),
    };

    try {
      sessionStorage.setItem(SETUP_STATE_KEY, JSON.stringify(state));
      console.log("💾 Saved modal state to sessionStorage");
    } catch (error) {
      console.error("Failed to save modal state:", error);
    }
  }, [
    currentStep,
    password,
    confirmPassword,
    selectedState,
    selectedProfession,
    customProfession,
    isEmailVerified,
    currentEmail,
    showEmailVerification,
  ]);

  const restoreStateFromStorage = useCallback(() => {
    if (typeof window === "undefined") return null;

    try {
      const stored = sessionStorage.getItem(SETUP_STATE_KEY);
      if (!stored) return null;

      const state = JSON.parse(stored);

      // Check if state is not too old (30 minutes)
      const thirtyMinutes = 30 * 60 * 1000;
      if (Date.now() - state.timestamp > thirtyMinutes) {
        sessionStorage.removeItem(SETUP_STATE_KEY);
        return null;
      }

      console.log("🔄 Restored modal state from sessionStorage");
      return state;
    } catch (error) {
      console.error("Failed to restore modal state:", error);
      sessionStorage.removeItem(SETUP_STATE_KEY);
      return null;
    }
  }, []);

  // Convert Australian states to dropdown options
  const stateOptions: DropdownOption[] = AUSTRALIAN_STATES.map((state) => ({
    value: state.code,
    label: state.name,
  }));

  // Convert professions to dropdown options
  const professionOptions: DropdownOption[] = PROFESSIONS.map((profession) => ({
    value: profession.value,
    label: profession.label,
  }));

  // ModalContainer handles mount/unmount visuals; explicit visibility state removed

  // Handle escape key and body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";

      // Only allow escape key to close in development
      if (environmentFlags.userSetupModalClosable()) {
        const handleEscape = (e: KeyboardEvent) => {
          if (e.key === "Escape") {
            handleClose();
          }
        };

        document.addEventListener("keydown", handleEscape);
        return () => {
          document.removeEventListener("keydown", handleEscape);
          document.body.style.overflow = "unset";
        };
      }
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleClose]);

  // Initialize current email when modal opens or userData changes
  useEffect(() => {
    if (isOpen && userData?.email) {
      setCurrentEmail(userData.email);
    }
  }, [isOpen, userData?.email]);

  // Reset form when modal opens (with sessionStorage restore support)
  useEffect(() => {
    if (isOpen && !userDataLoading) {
      // Wait for userData to load before determining step
      // Try to restore state from sessionStorage first
      const savedState = restoreStateFromStorage();

      if (savedState) {
        // Restore saved state (user is continuing after tab switch)
        // Check if user has state and profession - if so, override saved step
        let restoredStep = savedState.currentStep;
        if (userData) {
          const hasState = !!(userData.state && typeof userData.state === 'string' && userData.state.trim().length > 0);
          const hasProfession = !!(userData.profession && typeof userData.profession === 'string' && userData.profession.trim().length > 0);
          
          // If user has both state and profession, they should be on step 3
          if (hasState && hasProfession) {
            restoredStep = 3;
          } else if (hasState || hasProfession) {
            restoredStep = 2;
          }
        }
        
        setCurrentStep(restoredStep);
        setPassword(savedState.password || "");
        setConfirmPassword(savedState.confirmPassword || "");
        setSelectedState(savedState.selectedState || "");
        setSelectedProfession(savedState.selectedProfession || "");
        setCustomProfession(savedState.customProfession || "");
        // Check userData.isEmailVerified as fallback (e.g., Gmail users who logged in after modal was opened)
        setIsEmailVerified(savedState.isEmailVerified || userData?.isEmailVerified || false);
        setCurrentEmail(savedState.currentEmail || userData?.email || "");
        setShowEmailVerification(savedState.showEmailVerification || false);
      } else {
        // Fresh start - detect initial step and reset
        let targetStep = initialStep;

        if (userData) {
          // Check what data the user already has
          // Note: password is not included in UserData for security
          const hasCompletedSetup = !!userData.profileSetupCompleted;
          
          // Direct access to check values
          const stateValue = userData.state;
          const professionValue = userData.profession;
          // Check if values exist and are non-empty strings
          const hasState = !!(stateValue && typeof stateValue === 'string' && stateValue.trim().length > 0);
          const hasProfession = !!(professionValue && typeof professionValue === 'string' && professionValue.trim().length > 0);
          const isEmailVerified = !!userData.isEmailVerified;

          // If user has completed setup and verified email, don't show modal at all
          if (hasCompletedSetup && hasState && isEmailVerified) {
            // User setup is already complete, close modal
            onClose();
            return;
          }

          // Determine which step to start at based on what data exists:
          // - If user has both state and profession, they've completed steps 1 and 2, skip to step 3
          // - If user has state or profession (but not both), they're in step 2 (they have password from step 1)
          // - If user has neither, they need to start from step 1 (password)
          // Note: If user has state/profession, they must have completed step 1 (password) to get there
          if (hasState && hasProfession) {
            // User has both state and profession, skip to step 3 (email verification)
            targetStep = 3;
          } else if (hasState || hasProfession) {
            // User has one of state/profession but not both, go to step 2 to complete it
            // They must have password since they got to step 2
            targetStep = 2;
          } else {
            // User has neither state nor profession
            // Check if they have password by checking if setup API allows password-only operations
            // Since we can't check password from UserData, we'll check via API
            // For now, default to step 1 - if they have password, the save will fail and we can handle it
            targetStep = 1;
          }
        }

        // Only set step if we haven't already determined it, or if we need to update it
        if (!stepDeterminedRef.current || targetStep !== currentStep) {
          setCurrentStep(targetStep);
          stepDeterminedRef.current = true;
        }
        setPassword("");
        setConfirmPassword("");
        setSelectedState("");
        setSelectedProfession("");
        setCustomProfession("");
        // Initialize isEmailVerified from userData (e.g., Gmail users already have verified emails)
        setIsEmailVerified(userData?.isEmailVerified || false);
        setCurrentEmail(userData?.email || "");
        setShowEmailVerification(false);
      }

      // Always reset these (error/loading states only)
      setError(null);
      setSuccess(false);
      setPasswordErrors([]);
      setInlineErrors({});
      setIsSendingEmail(false);
      setIsEditingEmail(false);
      setNewEmail("");
      setIsUpdatingEmail(false);
    }

    // Reset stepDeterminedRef when modal closes
    if (!isOpen) {
      stepDeterminedRef.current = false;
    }
  }, [isOpen, initialStep, onClose, restoreStateFromStorage, userData, userDataLoading]); // Wait for userData to load
  // Note: userData is intentionally excluded from affecting reset logic
  // This allows the modal to maintain its state during email update process

  // Auto-save state when critical fields change
  useEffect(() => {
    if (isOpen && currentStep > 0) {
      saveStateToStorage();
    }
  }, [
    isOpen,
    currentStep,
    password,
    confirmPassword,
    selectedState,
    isEmailVerified,
    currentEmail,
    showEmailVerification,
    saveStateToStorage,
  ]);

  // Sync isEmailVerified state when userData updates while modal is open at step 3
  // Also check for purchase indicators (packages/entries) to handle race condition
  useEffect(() => {
    if (isOpen && currentStep === 3 && !isEmailVerified && !hasAutoCompletedRef.current) {
      const hasVerifiedEmail = userData?.isEmailVerified === true;
      const hasPackages = 
        (userData?.oneTimePackages && userData.oneTimePackages.length > 0) ||
        (userData?.subscription && userData.subscription.isActive);
      const hasEntries = (userData?.accumulatedEntries || 0) > 0 || (userData?.entryWallet || 0) > 0;
      
      if (hasVerifiedEmail || hasPackages || hasEntries) {
        console.log("🔄 Syncing email verification state from userData (email verified or purchase completed)");
        setIsEmailVerified(true);
      }
    }
  }, [
    isOpen, 
    currentStep, 
    userData?.isEmailVerified, 
    userData?.oneTimePackages, 
    userData?.subscription,
    userData?.accumulatedEntries,
    userData?.entryWallet,
    isEmailVerified
  ]);

  // Reset auto-completion ref when modal closes or step changes away from 3
  useEffect(() => {
    if (!isOpen || currentStep !== 3) {
      hasAutoCompletedRef.current = false;
    }
  }, [isOpen, currentStep]);

  // Password validation
  const validatePassword = useCallback((pwd: string) => {
    const errors: string[] = [];

    if (pwd.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }

    return errors;
  }, []);

  // Update password errors when password changes
  useEffect(() => {
    if (password) {
      setPasswordErrors(validatePassword(password));
    } else {
      setPasswordErrors([]);
    }
  }, [password, validatePassword]);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setError(null);
    // Clear inline error when user starts typing
    if (inlineErrors.password) {
      setInlineErrors((prev) => ({ ...prev, password: undefined }));
    }
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    setError(null);
    // Clear inline error when user starts typing
    if (inlineErrors.confirmPassword) {
      setInlineErrors((prev) => ({ ...prev, confirmPassword: undefined }));
    }
  };

  const savePassword = async (): Promise<boolean> => {
    try {
      setIsSavingPassword(true);
      setError(null);

      const response = await fetch("/api/user/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password,
          savePasswordOnly: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save password");
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save password. Please try again.");
      return false;
    } finally {
      setIsSavingPassword(false);
    }
  };

  const saveStateAndProfession = async (): Promise<boolean> => {
    try {
      setIsSavingStateProfession(true);
      setError(null);

      const professionValue = selectedProfession === "Other" ? customProfession.trim() : selectedProfession;

      const response = await fetch("/api/user/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state: selectedState,
          profession: professionValue,
          saveStateProfessionOnly: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save state and profession");
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save state and profession. Please try again.");
      return false;
    } finally {
      setIsSavingStateProfession(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      // Clear previous inline errors
      setInlineErrors({});

      // Validate password
      if (!password) {
        setInlineErrors({ password: "Please enter a password" });
        // Focus on password field
        setTimeout(() => passwordRef.current?.focus(), 100);
        return;
      }

      if (passwordErrors.length > 0) {
        setInlineErrors({ password: "Password must be at least 8 characters long" });
        // Focus on password field
        setTimeout(() => passwordRef.current?.focus(), 100);
        return;
      }

      if (password !== confirmPassword) {
        setInlineErrors({ confirmPassword: "Passwords do not match" });
        // Focus on confirm password field
        setTimeout(() => confirmPasswordRef.current?.focus(), 100);
        return;
      }

      // Save password before proceeding to step 2
      const saved = await savePassword();
      if (!saved) {
        return; // Don't proceed if save failed
      }
    }

    if (currentStep === 2) {
      // Check if state is selected
      if (!selectedState) {
        setError("Please select your state");
        return;
      }

      // Check if profession is selected
      if (!selectedProfession) {
        setInlineErrors({ profession: "Please select your profession" });
        setError("Please select your profession");
        return;
      }

      // If "Other" is selected, validate custom profession input
      if (selectedProfession === "Other") {
        const trimmedCustom = customProfession.trim();
        if (!trimmedCustom) {
          setInlineErrors({ customProfession: "Please enter your profession" });
          setError("Please enter your profession");
          return;
        }
        if (trimmedCustom.length < 2) {
          setInlineErrors({ customProfession: "Profession must be at least 2 characters" });
          setError("Profession must be at least 2 characters");
          return;
        }
        if (trimmedCustom.length > 100) {
          setInlineErrors({ customProfession: "Profession cannot exceed 100 characters" });
          setError("Profession cannot exceed 100 characters");
          return;
        }
      }

      // Save state and profession before proceeding to step 3
      const saved = await saveStateAndProfession();
      if (!saved) {
        return; // Don't proceed if save failed
      }
    }

    setCurrentStep(currentStep + 1);
    setError(null);
    setInlineErrors({});
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
    setError(null);
    setInlineErrors({});
  };

  const handleComplete = async (bypassEmailCheck = false) => {
    if (currentStep === 3) {
      // Check if email verification is mandatory and not completed
      // Bypass check if called from handleEmailVerificationSuccess
      if (environmentFlags.emailVerificationMandatory() && !isEmailVerified && !bypassEmailCheck) {
        setError(
          "Email verification is required to complete your account setup. Please verify your email address first."
        );
        return;
      }

      // Final step - complete setup
      setIsLoading(true);
      setError(null);

      try {
        // Check if password, state, and profession are already saved
        // If we're on step 3, it means we successfully saved password in step 1 (otherwise we wouldn't be here)
        // So we just need to check if state/profession exist (either from userData if saved in step 2, or from form state)
        const hasState = userData?.state || selectedState;
        const hasProfession = userData?.profession || selectedProfession || (selectedProfession === "Other" ? customProfession : "");

        // If user started at step 3 (email verification only), they already have password and state
        // Or if we've already saved password and state/profession incrementally (we're on step 3 with state/profession), just mark as complete
        if (initialStep === 3 || (userData?.profileSetupCompleted && userData?.state) || (currentStep === 3 && hasState && hasProfession)) {
          // Just mark setup as complete without sending password/state/profession
          const response = await fetch("/api/user/setup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              // Don't send password and state if user already has them
              completeSetupOnly: true,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Failed to complete setup");
          }
        } else {
          // Fallback: Normal flow - user is completing full setup (shouldn't happen with incremental saving)
          const response = await fetch("/api/user/setup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              password,
              state: selectedState,
              profession: selectedProfession === "Other" ? customProfession.trim() : selectedProfession,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Failed to complete setup");
          }
        }

        setSuccess(true);

        // Refresh user data
        await refetch();

        // Check if upsell should be shown after setup completion
        const { pendingUpsellAfterSetup, pendingUpsellData, setPendingUpsellAfterSetup } =
          useModalPriorityStore.getState();
        if (pendingUpsellAfterSetup && pendingUpsellData) {
          console.log("🎯 User setup completed, triggering pending upsell");
          setPendingUpsellAfterSetup(false); // Clear the flag

          // Trigger the upsell modal after a short delay
          setTimeout(() => {
            const { requestModal } = useModalPriorityStore.getState();
            requestModal("upsell", false, pendingUpsellData);
            console.log("🎯 Triggered pending upsell with stored data");
          }, 2000); // 2 second delay after setup completion
        }

        // Flag refer-a-friend modal to appear next for onboarding
        try {
          sessionStorage.setItem("showReferFriendAfterSetup", "true");
        } catch (storageError) {
          console.error("Unable to persist refer-a-friend modal flag:", storageError);
        }

        // Close modal and reload page after a short delay
        setTimeout(() => {
          onComplete();
          onClose();

          // Set session storage flag to prevent modal from re-appearing after reload
          sessionStorage.setItem("setupJustCompleted", "true");
          clearStateFromStorage(); // Clear the saved modal state
          console.log("✅ Setup completion flag set and modal state cleared");

          // Reload page to sync session with updated email and ensure clean state
          // This triggers JWT callback to fetch fresh user data from database
          console.log("🔄 Reloading page to sync session after profile setup");
          window.location.reload();
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    } else {
      // Continue to next step
      handleNext();
    }
  };

  // Store handleComplete in ref for use in useEffect
  handleCompleteRef.current = handleComplete;

  // Auto-complete step 3 if email is already verified OR user has completed a purchase
  // This handles race condition where webhook hasn't fired yet but user has paid
  useEffect(() => {
    if (
      isOpen &&
      currentStep === 3 &&
      !isEmailVerified &&
      !isLoading &&
      !hasAutoCompletedRef.current &&
      handleCompleteRef.current
    ) {
      // ✅ Check multiple indicators that email should be verified:
      // 1. userData.isEmailVerified is true (webhook already processed)
      // 2. User has packages (oneTimePackages or subscription) - indicates successful payment
      // 3. User has entries/points - indicates webhook processed benefits
      const hasVerifiedEmail = userData?.isEmailVerified === true;
      const hasPackages = 
        (userData?.oneTimePackages && userData.oneTimePackages.length > 0) ||
        (userData?.subscription && userData.subscription.isActive);
      const hasEntries = (userData?.accumulatedEntries || 0) > 0 || (userData?.entryWallet || 0) > 0;
      const hasPoints = (userData?.rewardsPoints || 0) > 0;
      
      // If user has made a purchase (has packages/entries/points), email is verified
      // This handles race condition where webhook hasn't updated isEmailVerified yet
      const shouldAutoVerify = hasVerifiedEmail || hasPackages || hasEntries || hasPoints;
      
      if (shouldAutoVerify) {
        const reason = hasVerifiedEmail 
          ? "Email already verified (e.g., Gmail login)" 
          : hasPackages 
            ? "User has completed purchase - email verified via payment"
            : "User has entries/points - email verified via webhook processing";
        
        console.log(`✅ ${reason}, auto-completing step 3...`);
        setIsEmailVerified(true);
        hasAutoCompletedRef.current = true;

        // Auto-complete after a brief delay to show verified state
        setTimeout(() => {
          handleCompleteRef.current?.(true); // bypassEmailCheck=true since email is already verified
        }, 500);
      }
    }
  }, [
    isOpen, 
    currentStep, 
    userData?.isEmailVerified, 
    userData?.oneTimePackages, 
    userData?.subscription, 
    userData?.accumulatedEntries,
    userData?.entryWallet,
    userData?.rewardsPoints,
    isEmailVerified, 
    isLoading
  ]);

  // Email verification handlers
  const handleEmailVerificationSuccess = async () => {
    console.log("✅ Email verified successfully, auto-completing setup...");
    setIsEmailVerified(true);
    setShowEmailVerification(false);
    setIsLoading(true); // Show loading during auto-completion

    // CRITICAL FIX: Pass bypassEmailCheck=true to avoid state race condition
    // React setState is async, so isEmailVerified might not be updated yet
    await handleComplete(true);
  };

  const handleSkipEmailVerification = () => {
    setCurrentStep(4); // Skip to completion
  };

  const handleSendEmailVerification = async () => {
    if (!currentEmail) {
      setError("No email address found");
      return;
    }

    setIsSendingEmail(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/send-email-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: currentEmail }),
      });

      const data = await response.json();

      if (data.success) {
        // Email sent successfully, now show the verification modal
        setShowEmailVerification(true);
      } else if (data.error?.toLowerCase().includes("already verified")) {
        // User is already verified (e.g. OAuth) — don't show error; treat as verified so they can complete the flow
        setError(null);
        setIsEmailVerified(true);
      } else {
        setError(data.error || "Failed to send verification email");
      }
    } catch (error) {
      console.error("Send email verification error:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Email update handler
  const handleUpdateEmail = async () => {
    if (!newEmail.trim()) {
      setError("Please enter a new email address");
      return;
    }

    if (newEmail.toLowerCase() === userData?.email?.toLowerCase()) {
      setError("New email must be different from current email");
      return;
    }

    setIsUpdatingEmail(true);
    setError(null);

    try {
      const response = await fetch("/api/user/update-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newEmail: newEmail.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        // Email updated successfully in database
        console.log("✅ Email updated successfully to:", data.user.email);

        // Update local state with the new email (for immediate UI update without refetch)
        setCurrentEmail(data.user.email);

        // Show verification modal without calling refetch() to prevent modal reset
        setShowEmailVerification(true);
        setIsEditingEmail(false);
        setNewEmail("");
        setError(null);

        // Note: We don't call refetch() or updateSession() here to prevent page reload/modal reset
        // The displayed email is updated via local state (currentEmail)
        // The session will sync naturally after verification completes and user navigates
      } else {
        setError(data.error || "Failed to update email address");
      }
    } catch (error) {
      console.error("Update email error:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  if (!isOpen) return null;

  const headerTitle = success ? "Setup Complete!" : initialStep === 3 ? "Verify Your Email" : "Complete Your Profile";
  const headerSubtitle = success
    ? "Your account is ready to use"
    : initialStep === 3
    ? "Verify your email address to complete your account"
    : `Step ${currentStep} of 3 - ${
        currentStep === 1 ? "Set Password" : currentStep === 2 ? "Select State" : "Verify Email"
      }`;

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      height="auto"
      closeOnBackdrop={environmentFlags.userSetupModalClosable()}
      className="flex flex-col max-h-[95dvh] sm:max-h-[90dvh]"
    >
      <ModalHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        onClose={handleClose}
        showLogo={false}
        variant="auto"
        showCloseButton={false}
      />

      <div className="flex flex-col justify-between flex-1 min-h-0">
        <ModalContent padding="lg" className="overflow-y-auto">
          {success ? (
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Profile Setup Complete!</h3>
              <p className="text-gray-600">
                You can now log in with your email and password, and we&apos;ve recorded your state for better service.
              </p>
              {hasReferralCode && (
                <p className="text-sm text-green-600">
                  Next up, we&apos;ll walk you through sharing your referral code so you can lock in 100 bonus entries
                  with your mates.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Step 1: Password Setup */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <Input
                        ref={passwordRef}
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={handlePasswordChange}
                        placeholder="Enter your password"
                        error={inlineErrors.password}
                        icon={showPassword ? EyeOff : Eye}
                        onIconClick={() => setShowPassword(!showPassword)}
                      />
                    </div>

                    <div>
                      <Input
                        ref={confirmPasswordRef}
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={handleConfirmPasswordChange}
                        placeholder="Confirm your password"
                        error={inlineErrors.confirmPassword}
                        icon={showConfirmPassword ? EyeOff : Eye}
                        onIconClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: State and Profession Selection */}
              {currentStep === 2 && (
                <div className={`space-y-4 ${isAnyDropdownOpen ? "pb-48" : ""}`}>
                  <Select
                    options={stateOptions}
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                    placeholder="Select your state or territory"
                    label="Australian State or Territory"
                    required
                    error={error && !selectedState ? "Please select your state" : undefined}
                    onOpenChange={handleStateDropdownChange}
                  />
                  <Dropdown
                    options={professionOptions}
                    value={selectedProfession}
                    onChange={(value) => {
                      setSelectedProfession(value);
                      // Clear custom profession when switching away from "Other"
                      if (value !== "Other") {
                        setCustomProfession("");
                      }
                      // Clear errors when user makes a selection
                      setError(null);
                      setInlineErrors((prev) => ({ ...prev, profession: undefined, customProfession: undefined }));
                    }}
                    placeholder="Select your profession"
                    label="Profession"
                    required
                    error={inlineErrors.profession}
                    onOpenChange={handleProfessionDropdownChange}
                    showCustomInput={true}
                    customInputValue={customProfession}
                    onCustomInputChange={(value) => {
                      setCustomProfession(value);
                      // Clear error when user starts typing
                      setError(null);
                      setInlineErrors((prev) => ({ ...prev, customProfession: undefined }));
                    }}
                    customInputPlaceholder="Enter your profession"
                    customInputError={inlineErrors.customProfession}
                  />
                </div>
              )}

              {/* Step 3: Email Verification */}
              {currentStep === 3 && (
                <div className="space-y-6 text-center">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 font-['Poppins']">
                      Verify Your Email {environmentFlags.emailVerificationMandatory() ? "" : "(Optional)"}
                    </h3>
                    <p className="text-gray-600 font-['Poppins'] mb-4">
                      {environmentFlags.emailVerificationMandatory()
                        ? "Email verification is required to complete your account setup and ensure account security."
                        : "Verify your email address to enhance account security and receive important updates."}
                    </p>
                    {hasReferralCode && (
                      <p className="text-xs text-green-600 font-['Poppins']">
                        Complete verification to unlock the 100 bonus entries tied to your referral code.
                      </p>
                    )}

                    {currentEmail && !isEditingEmail && (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-500 font-['Poppins']">
                          We&apos;ll send a verification code to: <span className="font-semibold">{currentEmail}</span>
                        </p>
                        <button
                          onClick={() => setIsEditingEmail(true)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium font-['Poppins'] underline"
                        >
                          Wrong email?
                        </button>
                      </div>
                    )}

                    {/* Email correction input */}
                    {isEditingEmail && (
                      <div className="space-y-3">
                        <div>
                          <Input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="Enter your correct email"
                            disabled={isUpdatingEmail}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleUpdateEmail}
                            disabled={isUpdatingEmail || !newEmail.trim()}
                            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-2 px-4 rounded-lg font-semibold font-['Poppins'] hover:from-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isUpdatingEmail ? "Updating..." : "Update & Verify Email"}
                          </button>
                          <button
                            onClick={() => {
                              setIsEditingEmail(false);
                              setNewEmail("");
                              setError(null);
                            }}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Verification Status */}
                  {isEmailVerified ? (
                    <div className="flex items-center justify-center space-x-2 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium font-['Poppins']">Email verified!</span>
                    </div>
                  ) : !isEditingEmail ? (
                    <div className="space-y-3">
                      <button
                        onClick={handleSendEmailVerification}
                        disabled={isSendingEmail}
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-4 rounded-lg font-semibold font-['Poppins'] hover:from-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSendingEmail ? (
                          <div className="flex items-center justify-center space-x-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Sending...</span>
                          </div>
                        ) : (
                          "Send Verification Code"
                        )}
                      </button>
                      {!environmentFlags.emailVerificationMandatory() && (
                        <p className="text-xs text-gray-500 font-['Poppins']">
                          You can skip this step and verify later from your account settings.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </>
          )}
        </ModalContent>

        {/* Action Buttons Section */}
        {!success && (
          <div className="border-t border-gray-200 p-6">
            <div className="flex gap-3">
              {currentStep > 1 && environmentFlags.userSetupModalClosable() && (
                <Button onClick={handleBack} variant="secondary" size="md" className="flex-1">
                  Back
                </Button>
              )}
              <Button
                onClick={currentStep === 3 ? () => void handleComplete() : () => void handleNext()}
                disabled={
                  isLoading ||
                  isSavingPassword ||
                  isSavingStateProfession ||
                  (currentStep === 2 &&
                    (!selectedState ||
                      !selectedProfession ||
                      (selectedProfession === "Other" && !customProfession.trim()))) ||
                  (currentStep === 3 && environmentFlags.emailVerificationMandatory() && !isEmailVerified)
                }
                variant="metallic"
                size="md"
                className="flex-1"
              >
                {isLoading
                  ? "Saving..."
                  : isSavingPassword
                    ? "Saving password..."
                    : isSavingStateProfession
                      ? "Saving..."
                      : currentStep === 3
                        ? "Complete Setup"
                        : "Next"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Email Verification Modal */}
      {showEmailVerification && currentEmail && (
        <EmailVerificationModal
          isOpen={showEmailVerification}
          onCloseAction={() => setShowEmailVerification(false)}
          email={currentEmail}
          userName={userData?.firstName}
          onVerificationSuccessAction={handleEmailVerificationSuccess}
          onSkipAction={environmentFlags.emailVerificationMandatory() ? undefined : handleSkipEmailVerification}
          onWrongEmailAction={() => {
            // Close email verification modal and navigate back to step 3
            setShowEmailVerification(false);
            setCurrentStep(3);
            // Optionally, allow user to edit email immediately
            setIsEditingEmail(true);
          }}
          isMandatory={environmentFlags.emailVerificationMandatory()}
        />
      )}
    </ModalContainer>
  );
};

export default UserSetupModal;
