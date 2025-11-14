"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Eye, EyeOff, CheckCircle } from "lucide-react";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { useUserContext } from "@/contexts/UserContext";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { DropdownOption } from "./ui/Dropdown";
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inlineErrors, setInlineErrors] = useState<{
    password?: string;
    confirmPassword?: string;
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Refs for focusing on error fields
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  // Password validation
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  const { refetch, userData } = useUserContext();

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
  }, [currentStep, password, confirmPassword, selectedState, isEmailVerified, currentEmail, showEmailVerification]);

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
    if (isOpen) {
      // Try to restore state from sessionStorage first
      const savedState = restoreStateFromStorage();

      if (savedState) {
        // Restore saved state (user is continuing after tab switch)
        setCurrentStep(savedState.currentStep);
        setPassword(savedState.password || "");
        setConfirmPassword(savedState.confirmPassword || "");
        setSelectedState(savedState.selectedState || "");
        setIsEmailVerified(savedState.isEmailVerified || false);
        setCurrentEmail(savedState.currentEmail || userData?.email || "");
        setShowEmailVerification(savedState.showEmailVerification || false);
        console.log("✅ Restored modal state from sessionStorage");
      } else {
        // Fresh start - detect initial step and reset
        let targetStep = initialStep;

        if (userData) {
          // Check if user has password and state
          // Note: password is not included in UserData for security, so we check profileSetupCompleted
          // If profileSetupCompleted is false, user needs to set password and state
          // If profileSetupCompleted is true but email not verified, user needs email verification
          const hasCompletedSetup = !!userData.profileSetupCompleted;
          const hasState = !!userData.state;
          const isEmailVerified = !!userData.isEmailVerified;

          // If user has completed setup (password + state) but email is not verified, start at step 3
          if (hasCompletedSetup && hasState && !isEmailVerified) {
            targetStep = 3;
          }
          // If user has completed setup and verified email, don't show modal at all
          else if (hasCompletedSetup && hasState && isEmailVerified) {
            // User setup is already complete, close modal
            onClose();
            return;
          }
          // If user hasn't completed setup, start at step 1
          else if (!hasCompletedSetup) {
            targetStep = 1;
          }
        }

        setCurrentStep(targetStep);
        setPassword("");
        setConfirmPassword("");
        setSelectedState("");
        setIsEmailVerified(false);
        setCurrentEmail(userData?.email || "");
        setShowEmailVerification(false);
        console.log("🆕 Starting fresh modal session");
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
  }, [isOpen, initialStep, onClose, restoreStateFromStorage, userData]); // Removed userData dependency to prevent reset on refetch
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

  const handleNext = () => {
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
    }

    if (currentStep === 2) {
      // Check if state is selected
      if (!selectedState) {
        setError("Please select your state");
        return;
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
        // If user started at step 3 (email verification only), they already have password and state
        if (initialStep === 3 || (userData?.profileSetupCompleted && userData?.state)) {
          // Just mark setup as complete without sending password/state
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
          // Normal flow - user is completing full setup
          const response = await fetch("/api/user/setup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              password,
              state: selectedState,
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
              <p className="text-sm text-green-600">
                Next up, we&apos;ll walk you through sharing your referral code so you can lock in 100 bonus entries
                with your mates.
              </p>
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

              {/* Step 2: State Selection */}
              {currentStep === 2 && (
                <div className="space-y-4 pb-48">
                  <Select
                    options={stateOptions}
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                    placeholder="Select your state or territory"
                    label="Australian State or Territory"
                    required
                    error={error && !selectedState ? "Please select your state" : undefined}
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
                    <p className="text-xs text-green-600 font-['Poppins']">
                      Complete verification to unlock the 100 bonus entries tied to your referral code.
                    </p>

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
                onClick={currentStep === 3 ? () => void handleComplete() : handleNext}
                disabled={
                  isLoading ||
                  (currentStep === 2 && !selectedState) ||
                  (currentStep === 3 && environmentFlags.emailVerificationMandatory() && !isEmailVerified)
                }
                variant="metallic"
                size="md"
                className="flex-1"
              >
                {isLoading ? "Saving..." : currentStep === 3 ? "Complete Setup" : "Next"}
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
