"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { PROFESSIONS } from "@/data/professions";
import { GENDERS } from "@/data/genders";
import { useUserContext } from "@/contexts/UserContext";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useReferralCode } from "@/hooks/useReferralCode";
import type { DropdownOption } from "../ui/Dropdown";
import { ModalContainer, ModalContent } from "../ui";
import EmailVerificationModal from "@/components/auth/EmailVerificationModal";
import { environmentFlags } from "@/lib/environment";
import { formatNamePart } from "@/utils/display-name";
import Step1Password from "./Step1Password";
import Step2Demographics from "./Step2Demographics";
import Step3EmailVerification from "./Step3EmailVerification";
import SuccessScreen from "./SuccessScreen";
import ActionFooter from "./ActionFooter";
import ProgressHero from "./ProgressHero";

interface UserSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  initialStep?: number; // Allow starting at a specific step (1, 2, or 3)
}

const UserSetupModal: React.FC<UserSetupModalProps> = ({ isOpen, onClose, onComplete, initialStep = 1 }) => {
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
    birthdate?: string;
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
  const [selectedBirthdate, setSelectedBirthdate] = useState("");
  // Optional. Deliberately NOT part of `stepsNeeded` and NOT checked by step-2 validation —
  // collected here for coverage only, so a member can always continue without answering.
  const [selectedGender, setSelectedGender] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Dropdown open state tracking
  const [isStateDropdownOpen, setIsStateDropdownOpen] = useState(false);
  const [isProfessionDropdownOpen, setIsProfessionDropdownOpen] = useState(false);
  const [isGenderDropdownOpen, setIsGenderDropdownOpen] = useState(false);
  const [isBirthdatePickerOpen, setIsBirthdatePickerOpen] = useState(false);

  const handleStateDropdownChange = useCallback((isOpen: boolean) => {
    setIsStateDropdownOpen(isOpen);
  }, []);

  const handleProfessionDropdownChange = useCallback((isOpen: boolean) => {
    setIsProfessionDropdownOpen(isOpen);
  }, []);

  const handleGenderDropdownChange = useCallback((isOpen: boolean) => {
    setIsGenderDropdownOpen(isOpen);
  }, []);

  const handleBirthdateOpenChange = useCallback((open: boolean) => {
    setIsBirthdatePickerOpen(open);
  }, []);

  // Step 2: extra scrollable room when a dropdown or the birthdate calendar is open.
  // Gender is included so the last field on the step isn't clipped when its menu opens.
  const isStep2OverlayOpen =
    isStateDropdownOpen || isProfessionDropdownOpen || isGenderDropdownOpen || isBirthdatePickerOpen;

  // Refs for focusing on error fields
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  // Ref to prevent multiple auto-completions of step 3
  const hasAutoCompletedRef = useRef(false);

  // Ref to prevent double submission of email verification (handles double-click before setState flushes)
  const isSendingEmailRef = useRef(false);

  const birthdateSectionRef = useRef<HTMLDivElement>(null);

  // Ref to store handleComplete function for use in useEffect
  const handleCompleteRef = useRef<((bypassEmailCheck?: boolean) => Promise<void>) | null>(null);

  // Ref to track if we've already determined and set the initial step
  const stepDeterminedRef = useRef(false);

  // Password validation
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  const { refetch, userData, loading: userDataLoading } = useUserContext();
  const { hasReferralCode } = useReferralCode();

  const stepsNeeded = useMemo(() => {
    if (!userData) return [1, 2, 3];
    const steps: number[] = [];
    if (!userData.hasPassword) steps.push(1);
    const hasState = !!(userData.state && typeof userData.state === "string" && userData.state.trim().length > 0);
    const hasProfession = !!(userData.profession && typeof userData.profession === "string" && userData.profession.trim().length > 0);
    const hasBirthdate = !!(userData.birthdate && (typeof userData.birthdate === "string" ? userData.birthdate.trim() : String(userData.birthdate).trim()).length > 0);
    if (!hasState || !hasProfession || !hasBirthdate) steps.push(2);
    if (!userData.isEmailVerified) steps.push(3);
    return steps;
  }, [userData]);

  useEffect(() => {
    if (isOpen && userData && stepsNeeded.length === 0 && !userData.profileSetupCompleted) {
      const completeAndClose = async () => {
        setIsLoading(true);
        try {
          await fetch("/api/user/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completeSetupOnly: true }),
          });
          await refetch();
          onComplete();
          onClose();
        } catch {
          setIsLoading(false);
        }
      };
      void completeAndClose();
    }
  }, [isOpen, userData, stepsNeeded.length, onComplete, onClose, refetch]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const clampedIndex = Math.min(currentStepIndex, Math.max(0, stepsNeeded.length - 1));
  const activeStep = stepsNeeded[clampedIndex] ?? null;

  const SETUP_STATE_KEY = "userSetupModalState";

  const clearStateFromStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.removeItem(SETUP_STATE_KEY);
      console.log("🗑️ Cleared modal state from sessionStorage");
    } catch (error) {
      console.error("Failed to clear modal state:", error);
    }
  }, []);

  const handleClose = useCallback(() => {
    if (!environmentFlags.userSetupModalClosable()) {
      console.log("🚫 User setup modal cannot be closed in production environment");
      return;
    }

    clearStateFromStorage();

    const { pendingUpsellAfterSetup, pendingUpsellData, setPendingUpsellAfterSetup } = useModalPriorityStore.getState();
    if (pendingUpsellAfterSetup && pendingUpsellData) {
      console.log("🎯 User setup modal closed, triggering pending upsell");
      setPendingUpsellAfterSetup(false);
      setTimeout(() => {
        const { requestModal } = useModalPriorityStore.getState();
        requestModal("upsell", false, pendingUpsellData);
        console.log("🎯 Triggered pending upsell after modal close");
      }, 1000);
    }

    onClose();
  }, [onClose, clearStateFromStorage]);

  const saveStateToStorage = useCallback(() => {
    if (typeof window === "undefined") return;

    const state = {
      currentStep: activeStep,
      password,
      confirmPassword,
      selectedState,
      selectedProfession,
      customProfession,
      selectedBirthdate,
      selectedGender,
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
    activeStep,
    password,
    confirmPassword,
    selectedState,
    selectedProfession,
    customProfession,
    selectedBirthdate,
    selectedGender,
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

  const stateOptions: DropdownOption[] = AUSTRALIAN_STATES.map((state) => ({
    value: state.code,
    label: state.name,
  }));

  const professionOptions: DropdownOption[] = PROFESSIONS.map((profession) => ({
    value: profession.value,
    label: profession.label,
  }));

  const genderOptions: DropdownOption[] = GENDERS.map((gender) => ({
    value: gender.value,
    label: gender.label,
  }));

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";

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

  useEffect(() => {
    if (isOpen && userData?.email) {
      setCurrentEmail(userData.email);
    }
  }, [isOpen, userData?.email]);

  useEffect(() => {
    if (isOpen && !userDataLoading) {
      const savedState = restoreStateFromStorage();

      if (userData) {
        const hasState = !!(userData.state && typeof userData.state === "string" && userData.state.trim().length > 0);
        const hasProfession = !!(userData.profession && typeof userData.profession === "string" && userData.profession.trim().length > 0);
        const hasBirthdate = !!(userData.birthdate && String(userData.birthdate).trim().length > 0);
        const isEmailVerified = !!userData.isEmailVerified;

        const steps: number[] = [];
        if (!userData.hasPassword) steps.push(1);
        if (!hasState || !hasProfession || !hasBirthdate) steps.push(2);
        if (!isEmailVerified) steps.push(3);

        if (steps.length === 0) {
          if (userData.profileSetupCompleted && hasState && isEmailVerified) {
            onClose();
            return;
          }
        }

        let targetIndex = 0;
        if (savedState) {
          const savedStep = savedState.currentStep;
          const idx = steps.indexOf(savedStep);
          targetIndex = idx >= 0 ? idx : 0;
          setCurrentStepIndex(targetIndex);
          setPassword(savedState.password || "");
          setConfirmPassword(savedState.confirmPassword || "");
          setSelectedState(savedState.selectedState || userData.state || "");
          setSelectedProfession(savedState.selectedProfession || userData.profession || "");
          setSelectedGender(savedState.selectedGender || userData.gender || "");
          setCustomProfession(savedState.customProfession || "");
          setSelectedBirthdate(
            savedState.selectedBirthdate ||
              (userData.birthdate ? String(userData.birthdate).slice(0, 10) : "")
          );
          setIsEmailVerified(savedState.isEmailVerified || userData.isEmailVerified || false);
          setCurrentEmail(savedState.currentEmail || userData.email || "");
          setShowEmailVerification(savedState.showEmailVerification || false);
        } else {
          if (!stepDeterminedRef.current) {
            const idx = steps.indexOf(initialStep);
            targetIndex = idx >= 0 ? idx : 0;
            setCurrentStepIndex(targetIndex);
            stepDeterminedRef.current = true;
          }
          setPassword("");
          setConfirmPassword("");
          setSelectedState(userData.state || "");
          setSelectedProfession(userData.profession || "");
          setCustomProfession("");
          setSelectedBirthdate(userData.birthdate ? String(userData.birthdate).slice(0, 10) : "");
          setIsEmailVerified(userData.isEmailVerified || false);
          setCurrentEmail(userData.email || "");
          setShowEmailVerification(false);
        }

        setError(null);
        setSuccess(false);
        setPasswordErrors([]);
        setInlineErrors({});
        setIsSendingEmail(false);
        setIsEditingEmail(false);
        setNewEmail("");
        setIsUpdatingEmail(false);
      }
    }

    if (!isOpen) {
      stepDeterminedRef.current = false;
    }
  }, [isOpen, initialStep, onClose, restoreStateFromStorage, userData, userDataLoading]);

  useEffect(() => {
    if (isOpen && activeStep) {
      saveStateToStorage();
    }
  }, [
    isOpen,
    activeStep,
    password,
    confirmPassword,
    selectedState,
    selectedProfession,
    customProfession,
    selectedBirthdate,
    isEmailVerified,
    currentEmail,
    showEmailVerification,
    saveStateToStorage,
  ]);

  useEffect(() => {
    if (isOpen && activeStep === 3 && !isEmailVerified && !hasAutoCompletedRef.current) {
      if (userData?.isEmailVerified === true) {
        console.log("🔄 Syncing email verification state from userData (provider-verified)");
        setIsEmailVerified(true);
      }
    }
  }, [isOpen, activeStep, userData?.isEmailVerified, isEmailVerified]);

  useEffect(() => {
    if (!isOpen || activeStep !== 3) {
      hasAutoCompletedRef.current = false;
    }
  }, [isOpen, activeStep]);

  useEffect(() => {
    if (!isOpen || activeStep !== 2 || !isBirthdatePickerOpen) return;
    const t = window.setTimeout(() => {
      birthdateSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }, 100);
    return () => clearTimeout(t);
  }, [isOpen, activeStep, isBirthdatePickerOpen]);

  useEffect(() => {
    if (!isOpen || activeStep !== 2) {
      setIsBirthdatePickerOpen(false);
    }
  }, [isOpen, activeStep]);

  const validatePassword = useCallback((pwd: string) => {
    const errors: string[] = [];
    if (pwd.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }
    return errors;
  }, []);

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
    if (inlineErrors.password) {
      setInlineErrors((prev) => ({ ...prev, password: undefined }));
    }
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    setError(null);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, savePasswordOnly: true }),
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

      const professionValue =
        selectedProfession === "Other" ? customProfession.trim() : selectedProfession;

      const response = await fetch("/api/user/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: selectedState,
          profession: professionValue,
          birthdate: selectedBirthdate || undefined,
          // Omitted entirely when unanswered, so the route leaves any existing value alone.
          gender: selectedGender || undefined,
          saveStateProfessionOnly: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save state and profession");
      }

      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save state, profession, and birthdate. Please try again."
      );
      return false;
    } finally {
      setIsSavingStateProfession(false);
    }
  };

  const handleNext = async () => {
    if (activeStep === 1) {
      setInlineErrors({});

      if (!password) {
        setInlineErrors({ password: "Please enter a password" });
        setTimeout(() => passwordRef.current?.focus(), 100);
        return;
      }

      if (passwordErrors.length > 0) {
        setInlineErrors({ password: "Password must be at least 8 characters long" });
        setTimeout(() => passwordRef.current?.focus(), 100);
        return;
      }

      if (password !== confirmPassword) {
        setInlineErrors({ confirmPassword: "Passwords do not match" });
        setTimeout(() => confirmPasswordRef.current?.focus(), 100);
        return;
      }

      const saved = await savePassword();
      if (!saved) return;
    }

    if (activeStep === 2) {
      if (!selectedState) {
        setError("Please select your state");
        return;
      }

      if (!selectedProfession) {
        setInlineErrors({ profession: "Please select your profession" });
        setError("Please select your profession");
        return;
      }

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

      if (!selectedBirthdate || !selectedBirthdate.trim()) {
        setInlineErrors({ birthdate: "Please enter your date of birth" });
        setError("Please enter your date of birth");
        return;
      }
      const birthdate = new Date(selectedBirthdate);
      if (isNaN(birthdate.getTime()) || birthdate.getTime() > Date.now()) {
        setInlineErrors({
          birthdate: "Please enter a valid date of birth (cannot be in the future)",
        });
        setError("Please enter a valid date of birth");
        return;
      }

      const saved = await saveStateAndProfession();
      if (!saved) return;

      if (currentStepIndex + 1 >= stepsNeeded.length) {
        setIsLoading(true);
        setError(null);
        try {
          const response = await fetch("/api/user/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completeSetupOnly: true }),
          });
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to complete setup");
          }
          setSuccess(true);
          await refetch();
          const { pendingUpsellAfterSetup, pendingUpsellData, setPendingUpsellAfterSetup } =
            useModalPriorityStore.getState();
          if (pendingUpsellAfterSetup && pendingUpsellData) {
            setPendingUpsellAfterSetup(false);
            setTimeout(() => {
              const { requestModal } = useModalPriorityStore.getState();
              requestModal("upsell", false, pendingUpsellData);
            }, 2000);
          }
          try {
            sessionStorage.setItem("showReferFriendAfterSetup", "true");
          } catch {
            // ignore
          }
          setTimeout(() => {
            onComplete();
            onClose();
            sessionStorage.setItem("setupJustCompleted", "true");
            clearStateFromStorage();
            window.location.reload();
          }, 1500);
        } catch (err) {
          setError(err instanceof Error ? err.message : "An error occurred");
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    setCurrentStepIndex((i) => i + 1);
    setError(null);
    setInlineErrors({});
  };

  const handleBack = () => {
    setCurrentStepIndex((i) => Math.max(0, i - 1));
    setError(null);
    setInlineErrors({});
  };

  const handleComplete = async (bypassEmailCheck = false) => {
    if (activeStep === 3) {
      if (environmentFlags.emailVerificationMandatory() && !isEmailVerified && !bypassEmailCheck) {
        setError(
          "Email verification is required to complete your account setup. Please verify your email address first."
        );
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const hasState = userData?.state || selectedState;
        const hasProfession =
          userData?.profession ||
          selectedProfession ||
          (selectedProfession === "Other" ? customProfession : "");

        if (
          initialStep === 3 ||
          (userData?.profileSetupCompleted && userData?.state) ||
          (activeStep === 3 && hasState && hasProfession)
        ) {
          const response = await fetch("/api/user/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completeSetupOnly: true }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Failed to complete setup");
          }
        } else {
          const response = await fetch("/api/user/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              password,
              state: selectedState,
              profession:
                selectedProfession === "Other" ? customProfession.trim() : selectedProfession,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Failed to complete setup");
          }
        }

        setSuccess(true);

        await refetch();

        const { pendingUpsellAfterSetup, pendingUpsellData, setPendingUpsellAfterSetup } =
          useModalPriorityStore.getState();
        if (pendingUpsellAfterSetup && pendingUpsellData) {
          console.log("🎯 User setup completed, triggering pending upsell");
          setPendingUpsellAfterSetup(false);

          setTimeout(() => {
            const { requestModal } = useModalPriorityStore.getState();
            requestModal("upsell", false, pendingUpsellData);
            console.log("🎯 Triggered pending upsell with stored data");
          }, 2000);
        }

        try {
          sessionStorage.setItem("showReferFriendAfterSetup", "true");
        } catch (storageError) {
          console.error("Unable to persist refer-a-friend modal flag:", storageError);
        }

        setTimeout(() => {
          onComplete();
          onClose();

          sessionStorage.setItem("setupJustCompleted", "true");
          clearStateFromStorage();
          console.log("✅ Setup completion flag set and modal state cleared");

          console.log("🔄 Reloading page to sync session after profile setup");
          window.location.reload();
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    } else {
      handleNext();
    }
  };

  handleCompleteRef.current = handleComplete;

  useEffect(() => {
    if (
      isOpen &&
      activeStep === 3 &&
      !isEmailVerified &&
      !isLoading &&
      !hasAutoCompletedRef.current &&
      handleCompleteRef.current &&
      userData?.isEmailVerified === true
    ) {
      console.log("✅ Email already verified (e.g., OAuth provider), auto-completing step 3...");
      setIsEmailVerified(true);
      hasAutoCompletedRef.current = true;

      setTimeout(() => {
        handleCompleteRef.current?.(true);
      }, 500);
    }
  }, [isOpen, activeStep, userData?.isEmailVerified, isEmailVerified, isLoading]);

  const handleEmailVerificationSuccess = async () => {
    console.log("✅ Email verified successfully, auto-completing setup...");
    setIsEmailVerified(true);
    setShowEmailVerification(false);
    setIsLoading(true);

    await handleComplete(true);
  };

  const handleSkipEmailVerification = () => {
    void handleComplete();
  };

  const handleSendEmailVerification = async () => {
    if (isSendingEmailRef.current) return;
    if (!currentEmail) {
      setError("No email address found");
      return;
    }

    isSendingEmailRef.current = true;
    setIsSendingEmail(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/send-email-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentEmail }),
      });

      const data = await response.json();

      if (data.success) {
        setShowEmailVerification(true);
      } else if (data.error?.toLowerCase().includes("already verified")) {
        setError(null);
        setIsEmailVerified(true);
      } else {
        setError(data.error || "Failed to send verification email");
      }
    } catch (error) {
      console.error("Send email verification error:", error);
      setError("Network error. Please try again.");
    } finally {
      isSendingEmailRef.current = false;
      setIsSendingEmail(false);
    }
  };

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: newEmail.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        console.log("✅ Email updated successfully to:", data.user.email);

        setCurrentEmail(data.user.email);

        setShowEmailVerification(true);
        setIsEditingEmail(false);
        setNewEmail("");
        setError(null);
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

  const handleProfessionChangeFromStep2 = useCallback(
    (value: string) => {
      setSelectedProfession(value);
      if (value !== "Other") {
        setCustomProfession("");
      }
      setError(null);
      setInlineErrors((prev) => ({
        ...prev,
        profession: undefined,
        customProfession: undefined,
      }));
    },
    []
  );

  const handleCustomProfessionChangeFromStep2 = useCallback((value: string) => {
    setCustomProfession(value);
    setError(null);
    setInlineErrors((prev) => ({ ...prev, customProfession: undefined }));
  }, []);

  const handleBirthdateChangeFromStep2 = useCallback((val: string) => {
    setSelectedBirthdate(val);
    setError(null);
    setInlineErrors((prev) => ({ ...prev, birthdate: undefined }));
  }, []);

  const primaryDisabled =
    isLoading ||
    isSavingPassword ||
    isSavingStateProfession ||
    (activeStep === 2 &&
      (!selectedState ||
        !selectedProfession ||
        (selectedProfession === "Other" && !customProfession.trim()) ||
        !selectedBirthdate?.trim())) ||
    (activeStep === 3 && environmentFlags.emailVerificationMandatory() && !isEmailVerified);

  const primaryLabel = isLoading
    ? "Saving..."
    : isSavingPassword
    ? "Saving password..."
    : isSavingStateProfession
    ? "Saving..."
    : activeStep === 3
    ? "Complete Setup"
    : "Next";

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      height="auto"
      closeOnBackdrop={environmentFlags.userSetupModalClosable()}
      className="flex flex-col max-h-[95dvh] sm:max-h-[90dvh]"
    >
      <ProgressHero
        stepsNeeded={stepsNeeded}
        clampedIndex={clampedIndex}
        activeStep={activeStep}
        success={success}
      />

      <div className="flex flex-col justify-between flex-1 min-h-0">
        <ModalContent padding="lg" className="overflow-y-auto">
          {success ? (
            <SuccessScreen hasReferralCode={hasReferralCode} />
          ) : (
            <>
              {activeStep === 1 && (
                <Step1Password
                  password={password}
                  confirmPassword={confirmPassword}
                  showPassword={showPassword}
                  showConfirmPassword={showConfirmPassword}
                  inlineErrors={{
                    password: inlineErrors.password,
                    confirmPassword: inlineErrors.confirmPassword,
                  }}
                  passwordRef={passwordRef}
                  confirmPasswordRef={confirmPasswordRef}
                  onPasswordChange={handlePasswordChange}
                  onConfirmPasswordChange={handleConfirmPasswordChange}
                  onTogglePassword={() => setShowPassword((v) => !v)}
                  onToggleConfirmPassword={() => setShowConfirmPassword((v) => !v)}
                />
              )}

              {activeStep === 2 && (
                <Step2Demographics
                  selectedState={selectedState}
                  selectedProfession={selectedProfession}
                  customProfession={customProfession}
                  selectedBirthdate={selectedBirthdate}
                  stateOptions={stateOptions}
                  professionOptions={professionOptions}
                  selectedGender={selectedGender}
                  genderOptions={genderOptions}
                  inlineErrors={{
                    profession: inlineErrors.profession,
                    customProfession: inlineErrors.customProfession,
                    birthdate: inlineErrors.birthdate,
                  }}
                  error={error}
                  isStep2OverlayOpen={isStep2OverlayOpen}
                  isBirthdatePickerOpen={isBirthdatePickerOpen}
                  birthdateSectionRef={birthdateSectionRef}
                  onStateChange={setSelectedState}
                  onProfessionChange={handleProfessionChangeFromStep2}
                  onCustomProfessionChange={handleCustomProfessionChangeFromStep2}
                  onBirthdateChange={handleBirthdateChangeFromStep2}
                  onGenderChange={setSelectedGender}
                  onStateDropdownChange={handleStateDropdownChange}
                  onProfessionDropdownChange={handleProfessionDropdownChange}
                  onGenderDropdownChange={handleGenderDropdownChange}
                  onBirthdateOpenChange={handleBirthdateOpenChange}
                />
              )}

              {activeStep === 3 && (
                <Step3EmailVerification
                  isMandatory={environmentFlags.emailVerificationMandatory()}
                  hasReferralCode={hasReferralCode}
                  currentEmail={currentEmail}
                  isEditingEmail={isEditingEmail}
                  newEmail={newEmail}
                  isUpdatingEmail={isUpdatingEmail}
                  isEmailVerified={isEmailVerified}
                  isSendingEmail={isSendingEmail}
                  onStartEdit={() => setIsEditingEmail(true)}
                  onCancelEdit={() => {
                    setIsEditingEmail(false);
                    setNewEmail("");
                    setError(null);
                  }}
                  onNewEmailChange={setNewEmail}
                  onUpdateEmail={handleUpdateEmail}
                  onSendEmailVerification={handleSendEmailVerification}
                />
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg p-4">
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}
            </>
          )}
        </ModalContent>

        {!success && (
          <ActionFooter
            showBack={currentStepIndex > 0 && environmentFlags.userSetupModalClosable()}
            primaryDisabled={primaryDisabled}
            primaryLabel={primaryLabel}
            isFinalStep={activeStep === 3}
            onBack={handleBack}
            onPrimary={activeStep === 3 ? () => void handleComplete() : () => void handleNext()}
          />
        )}
      </div>

      {showEmailVerification && currentEmail && (
        <EmailVerificationModal
          isOpen={showEmailVerification}
          onCloseAction={() => setShowEmailVerification(false)}
          email={currentEmail}
          userName={formatNamePart(userData?.firstName)}
          onVerificationSuccessAction={handleEmailVerificationSuccess}
          onSkipAction={
            environmentFlags.emailVerificationMandatory() ? undefined : handleSkipEmailVerification
          }
          onWrongEmailAction={() => {
            setShowEmailVerification(false);
            setIsEditingEmail(true);
          }}
          isMandatory={environmentFlags.emailVerificationMandatory()}
        />
      )}
    </ModalContainer>
  );
};

export default UserSetupModal;
