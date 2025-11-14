"use client";

import React, { useState, useEffect } from "react";
import { ModalContainer, ModalHeader, ModalContent, Input, Button } from "../modals/ui";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isMobileVerified?: boolean;
  hasActiveMembership?: boolean;
}

interface OTPVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  mobile: string;
  onVerificationSuccess: (user: User) => void;
  onResendOTP: () => Promise<void>;
}

export default function OTPVerificationModal({
  isOpen,
  onClose,
  email,
  mobile,
  onVerificationSuccess,
  onResendOTP,
}: OTPVerificationModalProps) {
  const [otpCode, setOtpCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [canResend, setCanResend] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [timeLeft]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setOtpCode("");
      setError("");
      setTimeLeft(600);
      setCanResend(false);
    }
  }, [isOpen]);

  const handleVerifyOTP = async () => {
    if (otpCode.length !== 6) {
      setError("Please enter a 6-digit OTP code");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          otpCode,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onVerificationSuccess(data.user);
        onClose();
      } else {
        setError(data.error || "Verification failed");
      }
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendOTP = async () => {
    setIsResending(true);
    setError("");

    try {
      await onResendOTP();
      setTimeLeft(600);
      setCanResend(false);
      setOtpCode("");
    } catch (error) {
      console.error("Resend OTP error:", error);
      setError("Failed to resend OTP. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader title="Verify Your Mobile" subtitle={`We've sent a 6-digit code to ${mobile}`} onClose={onClose} />

      <ModalContent>
        <div className="space-y-4">
          <div>
            <Input
              type="text"
              name="otpCode"
              value={otpCode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                setOtpCode(value);
                setError("");
              }}
              label="Enter Verification Code"
              placeholder="123456"
              className="text-center text-2xl tracking-widest"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div className="text-center">
            {timeLeft > 0 ? (
              <p className="text-sm text-gray-500">Code expires in {formatTime(timeLeft)}</p>
            ) : (
              <p className="text-sm text-red-500">Code has expired</p>
            )}
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              onClick={handleVerifyOTP}
              disabled={otpCode.length !== 6 || isVerifying}
              variant="primary"
              fullWidth
              size="lg"
              className="font-bold"
            >
              {isVerifying ? "Verifying..." : "Verify Code"}
            </Button>

            <Button
              type="button"
              onClick={handleResendOTP}
              disabled={!canResend || isResending}
              variant="secondary"
              fullWidth
              size="md"
            >
              {isResending ? "Sending..." : "Resend Code"}
            </Button>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-500">Didn&apos;t receive the code? Check your spam folder or try again.</p>
          </div>
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
