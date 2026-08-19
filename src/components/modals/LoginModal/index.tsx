"use client";

import React, { useState, useEffect, useRef } from "react";
import { signIn, useSession, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Clipboard, ClipboardCheck } from "lucide-react";
import { ModalContainer, ModalContent, Button, Input } from "../ui";
import Hero from "./Hero";
import { authenticateWithPopup } from "@/utils/auth/popupAuth";
import { useToast } from "@/components/ui/Toast";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { usePermissions } from "@/hooks/usePermissions";
import { usePurchaseInvalidation } from "@/hooks/usePurchaseInvalidation";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  /**
   * Where to send them once signed in.
   *
   * Defaults to the dashboard, which is right when signing in IS the errand.
   * Pass `null` when it is not — signing in to finish buying something, for
   * instance, where being thrown to /my-account abandons the product they
   * were on and the cart they were building.
   */
  redirectTo?: string | null;
  /** Fires after the session is live, before any navigation. */
  onSignedIn?: () => void;
}

// Google Icon Component
function GoogleIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, email, redirectTo, onSignedIn }) => {
  const router = useRouter();

  // Single place that decides where a successful sign-in lands, so the four
  // success paths (password, Google popup, emailed code, already-signed-in)
  // cannot drift apart.
  const finishSignIn = React.useCallback(() => {
    onSignedIn?.();
    if (redirectTo === null) return; // stay exactly where we are
    router.push(redirectTo ?? "/my-account");
    router.refresh();
  }, [onSignedIn, redirectTo, router]);
  const { data: session, status } = useSession();
  const { isStaff } = usePermissions();
  const invalidateForUser = usePurchaseInvalidation();
  const { showToast } = useToast();
  const { identify } = useKlaviyoTracking();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [codeDigits, setCodeDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [isPasteClicked, setIsPasteClicked] = useState(false);
  const [loginCodeFlow, setLoginCodeFlow] = useState(false);
  const [loginCodeSent, setLoginCodeSent] = useState(false);

  // Ref to prevent double submission of send verification (handles double-click before setState flushes)
  const isSendingVerificationRef = useRef(false);

  // Reset state when modal closes (do NOT auto-send verification on open - wait for user to click)
  useEffect(() => {
    if (!isOpen) {
      setNeedsEmailVerification(false);
      setPassword("");
      setError("");
      setCodeSent(false);
      setLoginCodeFlow(false);
      setLoginCodeSent(false);
      setCodeDigits(["", "", "", "", "", ""]);
    }
  }, [isOpen]);

  // If the user opens this modal while already signed in, send them to the right dashboard.
  // When the modal is closed we must NOT redirect — parent pages (e.g. /dev/modals) mount this
  // component with isOpen=false and would otherwise always bounce logged-in users to /my-account.
  useEffect(() => {
    if (!isOpen) return;
    if (status === "authenticated" && session) {
      if (redirectTo === null) { onClose(); return; }
      const dest = isStaff ? "/admin" : redirectTo ?? "/my-account";
      router.push(dest);
      onClose();
    }
  }, [isOpen, status, session, isStaff, router, onClose, redirectTo]);

  // Clear error when a valid 6-digit code is entered
  useEffect(() => {
    const currentCode = codeDigits.join("");
    const codeError =
      error === "Please enter the 6-digit verification code" || error === "Please enter the 6-digit sign-in code";
    if (currentCode.length === 6 && codeError) {
      setError("");
    }
  }, [codeDigits, error]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Check if error is related to email verification
        const errorMessage = result.error.toLowerCase();
        if (result.error === "ACCOUNT_DEACTIVATED") {
          // Deactivated accounts are rejected at login (auth.ts authorize) —
          // show the real reason instead of "invalid credentials".
          setError("This account has been deactivated. Please contact an administrator.");
        } else if (errorMessage.includes("email") && errorMessage.includes("verify")) {
          setNeedsEmailVerification(true);
          setError("Please verify your email address to continue.");
          // Show verification UI - user must click "Send Verification Code" to receive email
        } else {
          setError("Invalid email or password");
        }
      } else {
        // Login successful - show success toast
        showToast({
          type: "success",
          title: "Login Successful",
          message: "Welcome back! Redirecting to your account...",
          duration: 3000,
        });

        // signIn() has already refreshed the client session, but the closure
        // `session` is still the pre-login value — read it fresh.
        const fresh = await getSession();
        if (fresh?.user?.id) {
          invalidateForUser(fresh.user.id);
          if (fresh.user.email) {
            identify({
              email: fresh.user.email,
              first_name: fresh.user.firstName,
              last_name: fresh.user.lastName,
            });
          }
        }
        // Redirect will happen via useEffect
        finishSignIn();
      }
    } catch (error) {
      console.error("Login error:", error);
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Use popup authentication for better UX
      const result = await authenticateWithPopup({
        provider: "google",
        callbackUrl: `${window.location.origin}/my-account`,
      });

      if (result.success) {
        // Refresh session after successful popup authentication
        // The popup handles the OAuth callback and sets the session cookie
        // We need to wait a moment for NextAuth to process the callback, then refresh session
        let attempts = 0;
        const maxAttempts = 10; // Try for up to 5 seconds (10 attempts × 500ms)

        const checkSession = setInterval(async () => {
          attempts++;
          const session = await getSession();

          if (session) {
            clearInterval(checkSession);
            // Session found - show success toast
            showToast({
              type: "success",
              title: "Login Successful",
              message: "Welcome back! Redirecting to your account...",
              duration: 3000,
            });

            // Invalidate queries to ensure fresh data
            if (session.user?.id) {
              invalidateForUser(session.user.id);

              // Identify user in Klaviyo after successful Google login
              if (session.user.email) {
                identify({
                  email: session.user.email,
                  first_name: session.user.firstName,
                  last_name: session.user.lastName,
                });
              }
            }
            // Redirect will happen via useEffect
            finishSignIn();
          } else if (attempts >= maxAttempts) {
            clearInterval(checkSession);
            setError("Authentication may have completed. Please refresh the page or try again.");
            setIsLoading(false);
          }
        }, 500);
      } else {
        setError(result.error || "Google sign-in failed. Please try again.");
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Google sign-in error:", error);
      setError("An error occurred with Google sign-in");
      setIsLoading(false);
    }
  };

  const handleSendVerificationCode = async () => {
    if (isSendingVerificationRef.current) return;

    isSendingVerificationRef.current = true;
    setIsSendingCode(true);
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
        setCodeSent(true);
        setError("");
        // Reset code digits
        setCodeDigits(["", "", "", "", "", ""]);
      } else {
        setError(data.error || "Failed to send verification code");
      }
    } catch (error) {
      console.error("Send verification code error:", error);
      setError("Network error. Please try again.");
    } finally {
      isSendingVerificationRef.current = false;
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    // Calculate code from codeDigits array to ensure we have the latest value
    // This avoids issues with React state updates being asynchronous
    const currentCode = codeDigits.join("").toUpperCase();

    // Clear error first before validation check
    setError("");

    if (currentCode.length !== 6) {
      setError("Please enter the 6-digit verification code");
      return;
    }

    setIsVerifyingCode(true);
    // Error already cleared above, but ensure it stays cleared
    setError("");

    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          verificationCode: currentCode,
        }),
      });

      const data = await response.json();

      if (data.success && data.user) {
        // Email verified. /api/auth/verify-email mints the short-lived auto-login
        // bridge token off the just-verified code (when the user has membership),
        // so we sign in directly with it — no separate unauthenticated call.
        try {
          if (data.token) {
            // Use the bridge token to create the NextAuth session
            const autoLoginResult = await signIn("auto-login", {
              token: data.token,
              redirect: false,
            });

            if (!autoLoginResult?.error) {
              // Get session to invalidate queries
              const newSession = await getSession();
              if (newSession?.user?.id) {
                // Invalidate queries to ensure fresh data
                invalidateForUser(newSession.user.id);
              }

              // Show success toast
              showToast({
                type: "success",
                title: "Login Successful",
                message: "Welcome back! Redirecting to your account...",
                duration: 3000,
              });

              // Success - redirect will happen via useEffect
              finishSignIn();
            } else {
              // If auto-login fails (e.g., no active membership), show password field
              setNeedsEmailVerification(false);
              setError("Email verified! Please enter your password to continue.");
            }
          } else {
            // If auto-login fails, show password field
            setNeedsEmailVerification(false);
            setError("Email verified! Please enter your password to continue.");
          }
        } catch (authError) {
          console.error("Authentication error:", authError);
          // If auto-login fails, show password field
          setNeedsEmailVerification(false);
          setError("Email verified! Please enter your password to continue.");
        }
      } else {
        setError(data.error || "Invalid verification code");
      }
    } catch (error) {
      console.error("Verify code error:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsVerifyingCode(false);
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

    // Clear error immediately when code is entered
    // If we have a full 6-character code, clear error right away
    if (cleanText.length === 6) {
      setError("");
    } else {
      // Clear error when user starts entering code
      setError("");
    }

    // Focus on the next empty input or the last input
    const nextEmptyIndex = newDigits.findIndex((digit) => !digit);
    const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
    const nextInput = document.getElementById(`code-digit-${focusIndex}`);
    nextInput?.focus();

    // Auto-submit when all 6 digits are entered - handled by useEffect-like call
    if (cleanText.length === 6) {
      setTimeout(() => {
        if (loginCodeFlow) handleVerifyLoginCode();
        else handleVerifyCode();
      }, 100);
    }
  };

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

    // Clear error immediately when user types - especially if we now have 6 digits
    // This ensures the error disappears as soon as a valid code is entered
    if (fullCode.length === 6) {
      setError(""); // Clear error immediately when 6 digits are present
    } else {
      setError(""); // Also clear error when user is typing to give immediate feedback
    }

    // Auto-advance to next input if value entered
    if (cleanValue && index < 5) {
      const nextInput = document.getElementById(`code-digit-${index + 1}`);
      nextInput?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (fullCode.length === 6) {
      setTimeout(() => {
        if (loginCodeFlow) handleVerifyLoginCode();
        else handleVerifyCode();
      }, 100);
    }
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

  const handleSendLoginCode = async () => {
    setIsSendingCode(true);
    setError("");

    try {
      const response = await fetch("/api/auth/send-login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setLoginCodeSent(true);
        setError("");
        setCodeDigits(["", "", "", "", "", ""]);
      } else {
        // If user needs to verify email first, switch to verification flow
        if (data.error?.toLowerCase().includes("verify your email first")) {
          setNeedsEmailVerification(true);
          setLoginCodeFlow(false);
          setError("Please verify your email first before using sign-in codes.");
        } else {
          setError(data.error || "Failed to send sign-in code");
        }
      }
    } catch (err) {
      console.error("Send login code error:", err);
      setError("Network error. Please try again.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyLoginCode = async () => {
    const currentCode = codeDigits.join("").toUpperCase();
    setError("");

    if (currentCode.length !== 6) {
      setError("Please enter the 6-digit sign-in code");
      return;
    }

    setIsVerifyingCode(true);

    try {
      const response = await fetch("/api/auth/verify-login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, loginCode: currentCode }),
      });

      const data = await response.json();

      if (data.success && data.token) {
        const result = await signIn("auto-login", {
          token: data.token,
          redirect: false,
        });

        if (!result?.error) {
          const newSession = await getSession();
          if (newSession?.user?.id) {
            invalidateForUser(newSession.user.id);
          }

          showToast({
            type: "success",
            title: "Login Successful",
            message: "Welcome back! Redirecting to your account...",
            duration: 3000,
          });

          if (data.user?.email) {
            identify({
              email: data.user.email,
              first_name: data.user.firstName,
              last_name: data.user.lastName,
            });
          }

          finishSignIn();
        } else {
          // result.error is a machine code (e.g. "CredentialsSignin"), not
          // display copy — map it instead of rendering it raw.
          setError(
            result.error === "ACCOUNT_DEACTIVATED"
              ? "This account has been deactivated. Please contact an administrator."
              : "Sign-in failed. Please try again."
          );
        }
      } else {
        setError(data.error || "Invalid sign-in code");
      }
    } catch (err) {
      console.error("Verify login code error:", err);
      setError("Network error. Please try again.");
    } finally {
      setIsVerifyingCode(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      closeOnBackdrop={true}
      height="fixed"
      fixedHeight="max-h-[82dvh] max-xs:max-h-[88dvh]"
    >
      <Hero onClose={onClose} />

      <ModalContent padding="lg">
        <div className="w-full max-w-md space-y-6">
          {/* Email Display */}
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-neutral-400">Signing in as</p>
            <p className="text-base font-semibold text-gray-900 dark:text-neutral-100">{email}</p>
          </div>

          {/* Error Message - hidden for password form when Input shows it inline; shown for verification, login code, and non-password errors (e.g. Google) */}
          {error &&
            (needsEmailVerification ||
              loginCodeFlow ||
              !error.toLowerCase().includes("password")) && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-[10px] text-sm">
                {error}
              </div>
            )}

          <>
              {/* Email Verification Flow */}
              {needsEmailVerification ? (
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 dark:text-neutral-400 mb-4">
                      {codeSent
                        ? "Enter the 6-digit code sent to your email"
                        : "Your email needs to be verified. We'll send you a verification code."}
                    </p>
                  </div>

                  {codeSent ? (
                    <>
                      {/* Verification Code Input */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200">Verification Code</label>
                          <button
                            type="button"
                            onClick={handlePasteButtonClick}
                            disabled={isVerifyingCode}
                            className="flex items-center space-x-1 text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                              className="w-12 h-14 border-2 border-[#d9d9d9] rounded-[10px] focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-2xl font-bold text-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              maxLength={1}
                              disabled={isVerifyingCode}
                              autoComplete="off"
                              autoFocus={index === 0 && codeDigits.join("").length === 0}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-neutral-500 text-center">
                          Enter the code exactly as shown in your email
                        </p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          onClick={handleVerifyCode}
                          variant="metallic"
                          fullWidth
                          size="lg"
                          className="rounded-[10px]"
                          loading={isVerifyingCode}
                          disabled={codeDigits.join("").length !== 6}
                        >
                          Verify Code
                        </Button>
                        <Button
                          onClick={handleSendVerificationCode}
                          variant="outline"
                          fullWidth
                          size="lg"
                          className="rounded-[10px]"
                          loading={isSendingCode}
                          disabled={isSendingCode}
                        >
                          Resend Code
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Button
                      onClick={handleSendVerificationCode}
                      variant="metallic"
                      fullWidth
                      size="lg"
                      className="rounded-[10px]"
                      loading={isSendingCode}
                    >
                      Send Verification Code
                    </Button>
                  )}
                </div>
              ) : loginCodeFlow ? (
                /* Login Code Flow (passwordless sign-in) */
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 dark:text-neutral-400 mb-4">
                      {loginCodeSent
                        ? "Enter the 6-digit code sent to your email"
                        : "We'll send a one-time code to your email to sign in."}
                    </p>
                  </div>

                  {loginCodeSent ? (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200">Sign-in Code</label>
                          <button
                            type="button"
                            onClick={handlePasteButtonClick}
                            disabled={isVerifyingCode}
                            className="flex items-center space-x-1 text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                              className="w-12 h-14 border-2 border-[#d9d9d9] rounded-[10px] focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-2xl font-bold text-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              maxLength={1}
                              disabled={isVerifyingCode}
                              autoComplete="off"
                              autoFocus={index === 0 && codeDigits.join("").length === 0}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-neutral-500 text-center">Enter the code exactly as shown in your email</p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          onClick={handleVerifyLoginCode}
                          variant="metallic"
                          fullWidth
                          size="lg"
                          className="rounded-[10px]"
                          loading={isVerifyingCode}
                          disabled={codeDigits.join("").length !== 6}
                        >
                          Sign In
                        </Button>
                        <Button
                          onClick={handleSendLoginCode}
                          variant="outline"
                          fullWidth
                          size="lg"
                          className="rounded-[10px]"
                          loading={isSendingCode}
                          disabled={isSendingCode}
                        >
                          Resend Code
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setLoginCodeFlow(false);
                            setLoginCodeSent(false);
                            setCodeDigits(["", "", "", "", "", ""]);
                            setError("");
                          }}
                          className="text-sm font-medium text-red-600 hover:underline"
                        >
                          Use password instead
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={handleSendLoginCode}
                        variant="metallic"
                        fullWidth
                        size="lg"
                        className="rounded-[10px]"
                        loading={isSendingCode}
                      >
                        Send Code
                      </Button>
                      <button
                        type="button"
                        onClick={() => setLoginCodeFlow(false)}
                        className="text-sm font-medium text-red-600 hover:underline"
                      >
                        Use password instead
                      </button>
                    </>
                  )}
                </div>
              ) : (
                /* Password Login Form */
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      label="Password"
                      size="lg"
                      className="rounded-[10px] border-[#d9d9d9]"
                      required
                      icon={showPassword ? EyeOff : Eye}
                      onIconClick={() => setShowPassword(!showPassword)}
                      error={error && error.includes("password") ? error : undefined}
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setLoginCodeFlow(true)}
                        className="text-sm font-medium text-red-600 hover:underline"
                      >
                        Send code to sign in instead
                      </button>
                    </div>
                  </div>

                  <Button type="submit" variant="metallic" fullWidth size="lg" className="rounded-[10px]" loading={isLoading} disabled={!password}>
                    Sign In
                  </Button>
                </form>
              )}

              {/* Divider and Google - show when in password form (not verification, not login code) */}
              {!needsEmailVerification && !loginCodeFlow && (
                <>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-px bg-[#d9d9d9]"></div>
                    <span className="text-sm font-medium text-[#6e6e6e]">or</span>
                    <div className="flex-1 h-px bg-[#d9d9d9]"></div>
                  </div>

                  <Button
                    onClick={handleGoogleSignIn}
                    variant="outline"
                    fullWidth
                    size="lg"
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 rounded-[10px]"
                  >
                    <GoogleIcon />
                    Sign in with Google
                  </Button>
                </>
              )}
            </>
        </div>
      </ModalContent>
    </ModalContainer>
  );
};

export default LoginModal;
