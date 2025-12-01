"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";

interface ExistingAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflictField?: "email" | "mobile";
}

/**
 * Modal displayed when user tries to register with an email/mobile
 * that belongs to an existing account that has made purchases
 */
const ExistingAccountModal: React.FC<ExistingAccountModalProps> = ({ isOpen, onClose, conflictField = "email" }) => {
  const router = useRouter();

  const handleGoToLogin = () => {
    onClose(); // Close this modal first
    router.push("/login"); // Redirect to login page
  };

  if (!isOpen) return null;

  const fieldLabel = conflictField === "email" ? "email address" : "mobile number";

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={true}>
      <ModalHeader
        title="Existing Account Detected"
        onClose={onClose}
        showLogo={true}
        variant="metallic"
        accent="red"
      />

      <ModalContent padding="lg" className="flex flex-col items-center text-center">
        <div className="w-full max-w-md space-y-6">
          {/* Icon/Illustration */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          </div>

          {/* Message */}
          <div className="space-y-3">
            <h3 className="text-xl font-bold text-gray-900">
              {conflictField === "email" ? "Email Already Exists" : "Mobile Number Already Exists"}
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              This {fieldLabel} is already associated with an account that has made purchases. To continue, please log
              in to your existing account.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              onClick={handleGoToLogin}
              variant="metallic"
              fullWidth
              size="lg"
              className="font-bold text-sm sm:text-base"
            >
              Go to Login
            </Button>
            <Button onClick={onClose} variant="outline" fullWidth size="lg" className="font-bold text-sm sm:text-base">
              Cancel
            </Button>
          </div>
        </div>
      </ModalContent>
    </ModalContainer>
  );
};

export default ExistingAccountModal;
