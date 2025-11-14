"use client";

import React, { useState } from "react";
import { ModalContainer, ModalHeader, ModalContent, Input, Button } from "../modals/ui";
import OTPVerificationModal from "./OTPVerificationModal";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isMobileVerified?: boolean;
  hasActiveMembership?: boolean;
}

interface PasswordlessLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

export default function PasswordlessLoginModal({ isOpen, onClose, onLoginSuccess }: PasswordlessLoginModalProps) {
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [error, setError] = useState("");
  const [showOTPVerification, setShowOTPVerification] = useState(false);

  const handleSendOTP = async () => {
    if (!email || !mobile) {
      setError("Please enter both email and mobile number");
      return;
    }

    setIsSendingOTP(true);
    setError("");

    try {
      const response = await fetch("/api/auth/passwordless-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          mobile,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setShowOTPVerification(true);
      } else {
        setError(data.error || "Failed to send OTP");
      }
    } catch (error) {
      console.error("Passwordless login error:", error);
      setError("Network error. Please try again.");
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          mobile,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to resend OTP");
      }
    } catch (error) {
      console.error("Resend OTP error:", error);
      throw error;
    }
  };

  const handleOTPVerificationSuccess = (user: User) => {
    onLoginSuccess(user);
    onClose();
  };

  const handleClose = () => {
    setEmail("");
    setMobile("");
    setError("");
    setShowOTPVerification(false);
    onClose();
  };

  if (!isOpen) return null;

  if (showOTPVerification) {
    return (
      <OTPVerificationModal
        isOpen={showOTPVerification}
        onClose={() => setShowOTPVerification(false)}
        email={email}
        mobile={mobile}
        onVerificationSuccess={handleOTPVerificationSuccess}
        onResendOTP={handleResendOTP}
      />
    );
  }

  return (
    <ModalContainer isOpen={isOpen} onClose={handleClose} size="md">
      <ModalHeader
        title="Passwordless Login"
        subtitle="Enter your email and mobile number to receive a verification code"
        onClose={handleClose}
      />

      <ModalContent>
        <div className="space-y-4">
          <div>
            <Input
              type="email"
              name="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              label="Email Address"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <Input
              type="tel"
              name="mobile"
              value={mobile}
              onChange={(e) => {
                setMobile(e.target.value);
                setError("");
              }}
              label="Mobile Number"
              placeholder="0412 345 678 or +61 412 345 678"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Australian mobile number. We&apos;ll send a verification code to this number.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <Button
              type="button"
              onClick={handleSendOTP}
              disabled={!email || !mobile || isSendingOTP}
              variant="primary"
              fullWidth
              size="lg"
              className="font-bold"
            >
              {isSendingOTP ? "Sending Code..." : "Send Verification Code"}
            </Button>

            <Button type="button" onClick={handleClose} variant="secondary" fullWidth size="md">
              Cancel
            </Button>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-500">
              Don&apos;t have an account?{" "}
              <button onClick={handleClose} className="text-blue-600 hover:text-blue-800 underline">
                Purchase a membership to get started
              </button>
            </p>
          </div>
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
