"use client";

import React, { useState } from "react";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import LoginModal from "./LoginModal";

interface ExistingAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflictField?: "email" | "mobile";
  email?: string;
}

/**
 * Modal displayed when user tries to register with an email/mobile
 * that belongs to an existing account that has made purchases
 */
const ExistingAccountModal: React.FC<ExistingAccountModalProps> = ({
  isOpen,
  onClose,
  conflictField = "email",
  email,
}) => {
  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleGoToLogin = () => {
    if (email) {
      // Open login modal instead of redirecting
      setShowLoginModal(true);
      // Don't close this modal immediately - let LoginModal handle it
    }
  };

  const handleLoginModalClose = () => {
    setShowLoginModal(false);
    // Close the existing account modal when login modal closes
    onClose();
  };

  const fieldLabel = conflictField === "email" ? "email address" : "mobile number";

  return (
    <>
      <ModalContainer isOpen={isOpen && !showLoginModal} onClose={onClose} size="md" closeOnBackdrop={true}>
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
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-950/45 flex items-center justify-center">
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
              <h3 className="text-xl font-bold text-gray-900 dark:text-neutral-100">
                {conflictField === "email" ? "Email Already Exists" : "Mobile Number Already Exists"}
              </h3>
              <p className="text-gray-600 dark:text-neutral-400 text-sm leading-relaxed">
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
                Login
              </Button>
              <Button
                onClick={onClose}
                variant="outline"
                fullWidth
                size="lg"
                className="font-bold text-sm sm:text-base"
              >
                Cancel
              </Button>
            </div>
          </div>
        </ModalContent>
      </ModalContainer>

      {/* Login Modal - rendered outside to avoid nesting issues */}
      {email && <LoginModal isOpen={showLoginModal} onClose={handleLoginModalClose} email={email} />}
    </>
  );
};

export default ExistingAccountModal;
