"use client";

import React, { useState, useEffect, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ModalContainer, ModalHeader, ModalContent, Button, Input } from "./ui";
import { authenticateWithPopup } from "@/utils/auth/popupAuth";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/components/ui/Toast";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
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

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, email }) => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [codeDigits, setCodeDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);

  const checkEmailVerificationStatus = useCallback(async () => {
    setIsCheckingVerification(true);
    setError("");
    try {
      // Try to send verification code - if email is already verified, API will return an error
      // This is a way to check verification status without requiring authentication
      const response = await fetch("/api/auth/send-email-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      // If email is already verified, API returns error "Email is already verified"
      if (!data.success && data.error?.includes("already verified")) {
        setNeedsEmailVerification(false);
      } else if (!data.success && data.error?.includes("not found")) {
        // User not found - shouldn't happen in this flow, but handle it
        setError("User account not found");
        setNeedsEmailVerification(false);
      } else {
        // Email is not verified - show verification flow
        setNeedsEmailVerification(true);
      }
    } catch (error) {
      console.error("Error checking email verification status:", error);
      // On error, assume email is verified and show password field
      setNeedsEmailVerification(false);
    } finally {
      setIsCheckingVerification(false);
    }
  }, [email]);

  // Check email verification status when modal opens
  useEffect(() => {
    if (isOpen && email) {
      checkEmailVerificationStatus();
    } else {
      // Reset state when modal closes
      setNeedsEmailVerification(false);
      setPassword("");
      setError("");
      setCodeSent(false);
      setVerificationCode("");
      setCodeDigits(["", "", "", "", "", ""]);
    }
  }, [isOpen, email, checkEmailVerificationStatus]);

  // Redirect if already authenticated
  useEffect(() => {
    if (status === "authenticated" && session) {
      router.push("/my-account");
      onClose();
    }
  }, [status, session, router, onClose]);

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
        if (errorMessage.includes("email") && errorMessage.includes("verify")) {
          setNeedsEmailVerification(true);
          setError("Please verify your email address to continue.");
          // Automatically send verification code
          handleSendVerificationCode();
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

        // Invalidate queries to ensure fresh data
        if (session?.user?.id) {
          queryClient.invalidateQueries({ queryKey: queryKeys.users.account(session.user.id) });
          queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(session.user.id) });
          queryClient.invalidateQueries({ queryKey: queryKeys.rewards.user(session.user.id) });
        }
        // Redirect will happen via useEffect
        router.push("/my-account");
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
          const { getSession } = await import("next-auth/react");
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
              queryClient.invalidateQueries({ queryKey: queryKeys.users.account(session.user.id) });
              queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(session.user.id) });
              queryClient.invalidateQueries({ queryKey: queryKeys.rewards.user(session.user.id) });
            }
            // Redirect will happen via useEffect
            router.push("/my-account");
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
        setVerificationCode("");
      } else {
        setError(data.error || "Failed to send verification code");
      }
    } catch (error) {
      console.error("Send verification code error:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) {
      setError("Please enter the 6-digit verification code");
      return;
    }

    setIsVerifyingCode(true);
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

      if (data.success && data.user) {
        // Email verified - now authenticate the user using auto-login API
        try {
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

          if (autoLoginResponse.ok && autoLoginData.token) {
            // Use auto-login to create NextAuth session
            const autoLoginResult = await signIn("auto-login", {
              token: autoLoginData.token,
              redirect: false,
            });

            if (!autoLoginResult?.error) {
              // Get session to invalidate queries
              const { getSession } = await import("next-auth/react");
              const newSession = await getSession();
              if (newSession?.user?.id) {
                // Invalidate queries to ensure fresh data
                queryClient.invalidateQueries({ queryKey: queryKeys.users.account(newSession.user.id) });
                queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(newSession.user.id) });
                queryClient.invalidateQueries({ queryKey: queryKeys.rewards.user(newSession.user.id) });
              }

              // Show success toast
              showToast({
                type: "success",
                title: "Login Successful",
                message: "Welcome back! Redirecting to your account...",
                duration: 3000,
              });

              // Success - redirect will happen via useEffect
              router.push("/my-account");
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

  const handleDigitChange = (index: number, value: string) => {
    const cleanValue = value
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 1);

    const newDigits = [...codeDigits];
    newDigits[index] = cleanValue;
    setCodeDigits(newDigits);

    const fullCode = newDigits.join("");
    setVerificationCode(fullCode);
    setError("");

    // Auto-advance to next input
    if (cleanValue && index < 5) {
      const nextInput = document.getElementById(`code-digit-${index + 1}`);
      nextInput?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (fullCode.length === 6) {
      handleVerifyCode();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData
      .getData("text")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6);
    const newDigits = pastedText.split("").concat(Array(6 - pastedText.length).fill(""));
    setCodeDigits(newDigits);
    setVerificationCode(pastedText);
    setError("");

    if (pastedText.length === 6) {
      handleVerifyCode();
    } else {
      // Focus on the next empty input
      const nextEmptyIndex = pastedText.length;
      const nextInput = document.getElementById(`code-digit-${nextEmptyIndex}`);
      nextInput?.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={true}>
      <ModalHeader title="Login to Your Account" onClose={onClose} showLogo={true} variant="metallic" accent="red" />

      <ModalContent padding="lg">
        <div className="w-full max-w-md space-y-6">
          {/* Email Display */}
          <div className="text-center">
            <p className="text-sm text-gray-600">Signing in as</p>
            <p className="text-base font-semibold text-gray-900">{email}</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          {/* Loading Spinner - Show while checking email verification status */}
          {isCheckingVerification ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
              <p className="text-sm text-gray-600">Checking account status...</p>
            </div>
          ) : (
            <>
              {/* Email Verification Flow */}
              {needsEmailVerification ? (
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-4">
                      {codeSent
                        ? "Enter the 6-digit code sent to your email"
                        : "Your email needs to be verified. We'll send you a verification code."}
                    </p>
                  </div>

                  {codeSent ? (
                    <>
                      {/* Verification Code Input */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Verification Code</label>
                        <div className="flex gap-2 justify-center">
                          {codeDigits.map((digit, index) => (
                            <input
                              key={index}
                              id={`code-digit-${index}`}
                              type="text"
                              inputMode="text"
                              maxLength={1}
                              value={digit}
                              onChange={(e) => handleDigitChange(index, e.target.value)}
                              onPaste={index === 0 ? handlePaste : undefined}
                              className="w-12 h-12 text-center text-lg font-semibold border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                              autoFocus={index === 0}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          onClick={handleVerifyCode}
                          variant="metallic"
                          fullWidth
                          size="lg"
                          loading={isVerifyingCode}
                          disabled={verificationCode.length !== 6}
                        >
                          Verify Code
                        </Button>
                        <Button
                          onClick={handleSendVerificationCode}
                          variant="outline"
                          fullWidth
                          size="md"
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
                      loading={isSendingCode}
                    >
                      Send Verification Code
                    </Button>
                  )}
                </div>
              ) : (
                /* Password Login Form */
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    label="Password"
                    required
                    icon={showPassword ? EyeOff : Eye}
                    onIconClick={() => setShowPassword(!showPassword)}
                    error={error && error.includes("password") ? error : undefined}
                  />

                  <Button type="submit" variant="metallic" fullWidth size="lg" loading={isLoading} disabled={!password}>
                    Sign In
                  </Button>
                </form>
              )}

              {/* Divider */}
              {!needsEmailVerification && (
                <>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-px bg-gray-300"></div>
                    <span className="text-sm font-medium text-gray-500">or</span>
                    <div className="flex-1 h-px bg-gray-300"></div>
                  </div>

                  {/* Google Sign In */}
                  <Button
                    onClick={handleGoogleSignIn}
                    variant="outline"
                    fullWidth
                    size="lg"
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2"
                  >
                    <GoogleIcon />
                    Sign in with Google
                  </Button>
                </>
              )}

              {/* Cancel Button */}
              <Button onClick={onClose} variant="ghost" fullWidth size="md">
                Cancel
              </Button>
            </>
          )}
        </div>
      </ModalContent>
    </ModalContainer>
  );
};

export default LoginModal;
