"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AlertCircle, CheckCircle, Clipboard, ClipboardCheck } from "lucide-react";
import ModalHeader from "@/components/modals/ui/ModalHeader";
import ModalContent from "@/components/modals/ui/ModalContent";

interface EmailVerificationModalProps {
  isOpen: boolean;
  onCloseAction: () => void;
  email: string;
  userName?: string;
  onVerificationSuccessAction: (userData: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isEmailVerified: boolean;
    isMobileVerified?: boolean;
  }) => void;
  onSkipAction?: () => void;
  onWrongEmailAction?: () => void;
  isMandatory?: boolean;
}

export default function EmailVerificationModal({
  isOpen,
  onCloseAction,
  email,
  userName,
  onVerificationSuccessAction,
  onSkipAction,
  onWrongEmailAction,
  isMandatory = false,
}: EmailVerificationModalProps) {
  const [verificationCode, setVerificationCode] = useState("");
  const [codeDigits, setCodeDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30); // 30 seconds in seconds
  const [canResend, setCanResend] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(5);
  const [isPasteClicked, setIsPasteClicked] = useState(false);

  // SessionStorage key for persisting modal state
  const VERIFICATION_STATE_KEY = `emailVerificationModal_${email}`;

  // Save current state to sessionStorage
  const saveStateToStorage = useCallback(() => {
    if (typeof window === "undefined" || !isOpen) return;

    const state = {
      verificationCode,
      codeDigits,
      timeLeft,
      canResend,
      remainingAttempts,
      timestamp: Date.now(),
    };

    try {
      sessionStorage.setItem(VERIFICATION_STATE_KEY, JSON.stringify(state));
      console.log("💾 Saved verification modal state to sessionStorage");
    } catch (error) {
      console.error("Failed to save verification modal state:", error);
    }
  }, [verificationCode, codeDigits, timeLeft, canResend, remainingAttempts, isOpen, VERIFICATION_STATE_KEY]);

  // Restore state from sessionStorage
  const restoreStateFromStorage = useCallback(() => {
    if (typeof window === "undefined") return null;

    try {
      const stored = sessionStorage.getItem(VERIFICATION_STATE_KEY);
      if (!stored) return null;

      const state = JSON.parse(stored);

      // Check if state is not too old (10 minutes - same as code expiry)
      const tenMinutes = 10 * 60 * 1000;
      if (Date.now() - state.timestamp > tenMinutes) {
        sessionStorage.removeItem(VERIFICATION_STATE_KEY);
        return null;
      }

      // Ensure timeLeft doesn't exceed 30 seconds if restored
      if (state.timeLeft && state.timeLeft > 30) {
        state.timeLeft = 30;
      }

      console.log("🔄 Restored verification modal state from sessionStorage");
      return state;
    } catch (error) {
      console.error("Failed to restore verification modal state:", error);
      sessionStorage.removeItem(VERIFICATION_STATE_KEY);
      return null;
    }
  }, [VERIFICATION_STATE_KEY]);

  // Clear state from sessionStorage
  const clearStateFromStorage = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      sessionStorage.removeItem(VERIFICATION_STATE_KEY);
      console.log("🗑️ Cleared verification modal state from sessionStorage");
    } catch (error) {
      console.error("Failed to clear verification modal state:", error);
    }
  }, [VERIFICATION_STATE_KEY]);

  // Wrap close handler to clear state
  const handleClose = useCallback(() => {
    clearStateFromStorage();
    onCloseAction();
  }, [onCloseAction, clearStateFromStorage]);

  // Countdown timer for resend button (30 seconds)
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [timeLeft]);

  // Reset state when modal opens (with sessionStorage restore support)
  useEffect(() => {
    if (isOpen) {
      // Try to restore state from sessionStorage first
      const savedState = restoreStateFromStorage();

      if (savedState) {
        // Restore saved state (user is continuing after tab switch)
        const restoredCode = savedState.verificationCode || "";
        setVerificationCode(restoredCode);

        // Restore individual digits for card display (use saved codeDigits if available, otherwise parse from code)
        if (savedState.codeDigits && Array.isArray(savedState.codeDigits)) {
          setCodeDigits(savedState.codeDigits);
        } else {
          const digits: string[] = ["", "", "", "", "", ""];
          for (let i = 0; i < restoredCode.length && i < 6; i++) {
            digits[i] = restoredCode[i];
          }
          setCodeDigits(digits);
        }

        // Cap timeLeft at 30 seconds for new timer implementation
        const restoredTimeLeft = savedState.timeLeft ?? 30;
        setTimeLeft(Math.min(restoredTimeLeft, 30));
        setCanResend(savedState.canResend ?? false);
        setRemainingAttempts(savedState.remainingAttempts ?? 5);
        console.log("✅ Restored verification modal state from sessionStorage");
      } else {
        // Fresh start - reset to defaults
        setVerificationCode("");
        setCodeDigits(["", "", "", "", "", ""]);
        setTimeLeft(30);
        setCanResend(false);
        setRemainingAttempts(5);
        console.log("🆕 Starting fresh verification session");
      }

      // Always reset these
      setError("");
      setSuccess(false);
    }
  }, [isOpen, restoreStateFromStorage]);

  // Auto-save state when critical fields change
  useEffect(() => {
    if (isOpen && !success) {
      saveStateToStorage();
    }
  }, [isOpen, verificationCode, timeLeft, canResend, remainingAttempts, success, saveStateToStorage]);

  // Format time display - for 30 seconds, just show seconds
  const formatTime = (seconds: number) => {
    // For timer <= 60 seconds, just show seconds
    if (seconds <= 60) {
      return `${seconds}s`;
    }
    // For longer times, show minutes:seconds
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) {
      setError("Please enter a 6-character verification code");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          verificationCode: verificationCode.toUpperCase(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        clearStateFromStorage(); // Clear the saved state on successful verification
        setTimeout(() => {
          onVerificationSuccessAction(data.user);
          onCloseAction();
        }, 1500);
      } else {
        setError(data.error || "Verification failed");
        if (data.remainingAttempts !== undefined) {
          setRemainingAttempts(data.remainingAttempts);
        }
      }
    } catch (error) {
      console.error("Email verification error:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSendCode = async () => {
    setIsSending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/send-email-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setTimeLeft(30);
        setCanResend(false);
        // Reset verification code and digits for new code
        setVerificationCode("");
        setCodeDigits(["", "", "", "", "", ""]);
        // Show success message briefly, then clear it
        setError("Verification code sent! Please check your email.");
        setTimeout(() => {
          setError("");
        }, 3000);
        // Focus on first input
        const firstInput = document.getElementById("code-digit-0");
        firstInput?.focus();
      } else {
        // Show simple error message without rate limit details
        setError(data.error || "Failed to send verification code");
      }
    } catch (error) {
      console.error("Send verification code error:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // Handle individual digit input for card-based inputs
  const handleDigitChange = (index: number, value: string) => {
    // Only allow alphanumeric characters
    const cleanValue = value
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 1);

    const newDigits = [...codeDigits];
    newDigits[index] = cleanValue;
    setCodeDigits(newDigits);

    // Update the full code string
    const fullCode = newDigits.join("");
    setVerificationCode(fullCode);
    setError("");

    // Auto-advance to next input if value entered
    if (cleanValue && index < 5) {
      const nextInput = document.getElementById(`code-digit-${index + 1}`);
      nextInput?.focus();
    }
  };

  // Fill code digits from text (used by both paste event and paste button)
  const fillCodeFromText = (text: string) => {
    const cleanText = text
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6);
    const newDigits: string[] = ["", "", "", "", "", ""];

    for (let i = 0; i < cleanText.length && i < 6; i++) {
      newDigits[i] = cleanText[i];
    }

    setCodeDigits(newDigits);
    const fullCode = newDigits.join("");
    setVerificationCode(fullCode);
    setError("");

    // Focus on the next empty input or the last input
    const nextEmptyIndex = newDigits.findIndex((digit) => !digit);
    const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
    const nextInput = document.getElementById(`code-digit-${focusIndex}`);
    nextInput?.focus();
  };

  // Handle paste event to fill all digits at once
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    fillCodeFromText(pastedText);
  };

  // Handle paste button click
  const handlePasteButtonClick = async () => {
    try {
      // Check if Clipboard API is available
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        // Fallback for browsers that don't support Clipboard API
        setError("Paste functionality not available. Please paste using Ctrl+V (or Cmd+V on Mac) in the code fields.");
        return;
      }

      const text = await navigator.clipboard.readText();
      if (text) {
        fillCodeFromText(text);
        setIsPasteClicked(true);
        setTimeout(() => setIsPasteClicked(false), 2000);
      }
    } catch (error) {
      console.error("Failed to read clipboard:", error);
      setError("Could not read from clipboard. Please paste using Ctrl+V (or Cmd+V on Mac) in the code fields.");
    }
  };

  // Handle backspace to go to previous input
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
      const prevInput = document.getElementById(`code-digit-${index - 1}`);
      prevInput?.focus();
    }
  };

  // Sync codeDigits when verificationCode changes externally
  useEffect(() => {
    if (verificationCode.length === 0 && codeDigits.some((digit) => digit)) {
      setCodeDigits(["", "", "", "", "", ""]);
    }
  }, [verificationCode, codeDigits]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={isMandatory ? undefined : handleClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-hidden">
        {/* Header with Logo */}
        <div className={isMandatory && !success ? "[&_button]:hidden" : ""}>
          <ModalHeader
            title={success ? "Email Verified!" : ""}
            subtitle={success ? "Verification successful" : ""}
            onClose={handleClose}
            showLogo={true}
            logoSize="sm"
          />
        </div>

        {/* Content */}
        <ModalContent padding="lg">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2 font-['Poppins']">Email Verified!</h3>
              <p className="text-gray-600 font-['Poppins']">Your email address has been successfully verified.</p>
              <p className="mt-3 text-sm text-green-600 font-['Poppins']">
                If you used a friend&apos;s referral code, 100 bonus entries have just been added to both of your
                accounts.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="text-center">
                <p className="text-gray-600 font-['Poppins'] mb-2">
                  We&apos;ve sent a 6-character verification code to:
                </p>
                <p className="font-semibold text-gray-900 font-['Poppins']">{email}</p>
                {userName && <p className="text-sm text-gray-500 mt-1">Hi {userName}!</p>}
              </div>

              {/* Verification Code Input - 6 Card Inputs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 font-['Poppins']">Verification Code</label>
                  <button
                    type="button"
                    onClick={handlePasteButtonClick}
                    disabled={isVerifying}
                    className="flex items-center space-x-1 text-xs text-red-600 hover:text-red-700 font-medium font-['Poppins'] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Paste code from clipboard"
                  >
                    {isPasteClicked ? (
                      <>
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        <span>Pasted!</span>
                      </>
                    ) : (
                      <>
                        <Clipboard className="w-3.5 h-3.5" />
                        <span>Paste</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-center gap-2">
                  {codeDigits.map((digit, index) => (
                    <input
                      key={index}
                      id={`code-digit-${index}`}
                      type="text"
                      inputMode="text"
                      value={digit}
                      onChange={(e) => handleDigitChange(index, e.target.value)}
                      onPaste={handlePaste}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-12 h-14 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-2xl font-bold text-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      maxLength={1}
                      disabled={isVerifying}
                      autoComplete="off"
                      autoFocus={index === 0 && verificationCode.length === 0}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 font-['Poppins'] text-center">
                  Enter the code exactly as shown in your email
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-600 font-['Poppins']">{error}</p>
                </div>
              )}

              {/* Attempts Remaining */}
              {remainingAttempts < 5 && remainingAttempts > 0 && !error && (
                <div className="text-center">
                  <p className="text-sm text-orange-600 font-['Poppins']">
                    {remainingAttempts} attempt{remainingAttempts !== 1 ? "s" : ""} remaining
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleVerifyCode}
                  disabled={verificationCode.length !== 6 || isVerifying}
                  className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white py-3 px-4 rounded-lg font-semibold font-['Poppins'] disabled:opacity-50 disabled:cursor-not-allowed hover:from-red-700 hover:to-red-800 transition-all duration-200"
                >
                  {isVerifying ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Verifying...</span>
                    </div>
                  ) : (
                    "Verify Email"
                  )}
                </button>

                {/* Didn't Receive Code and Wrong Email Buttons */}
                <div className="text-center space-y-3">
                  {/* Didn't Receive Code Button - Always visible but disabled during timer */}
                  <div className="space-y-2">
                    <button
                      onClick={handleSendCode}
                      disabled={!canResend || isSending}
                      className={`font-medium font-['Poppins'] transition-all duration-200 ${
                        canResend && !isSending
                          ? "text-red-600 hover:text-red-700 cursor-pointer"
                          : "text-gray-400 cursor-not-allowed opacity-60"
                      }`}
                    >
                      {isSending ? (
                        <span className="flex items-center justify-center space-x-2">
                          <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          <span>Sending...</span>
                        </span>
                      ) : (
                        "Didn't receive code?"
                      )}
                    </button>

                    {/* Show timer when button is disabled */}
                    {!canResend && timeLeft > 0 && (
                      <p className="text-xs text-gray-400 font-['Poppins']">Available in {formatTime(timeLeft)}</p>
                    )}
                  </div>

                  {/* Wrong Email Button - Always clickable */}
                  {onWrongEmailAction && (
                    <div>
                      <button
                        onClick={() => {
                          clearStateFromStorage();
                          onWrongEmailAction();
                        }}
                        className="text-sm text-gray-600 hover:text-gray-800 font-medium font-['Poppins'] underline transition-colors"
                      >
                        Wrong email?
                      </button>
                    </div>
                  )}
                </div>

                {/* Skip Option - only show if not mandatory */}
                {onSkipAction && !isMandatory && (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300" />
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500 font-['Poppins']">or</span>
                      </div>
                    </div>
                    <button
                      onClick={onSkipAction}
                      className="w-full text-gray-600 hover:text-gray-800 py-2 px-4 rounded-lg font-medium font-['Poppins'] transition-colors"
                    >
                      Skip for now
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </ModalContent>
      </div>
    </div>
  );
}
