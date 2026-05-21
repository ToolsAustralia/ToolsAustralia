"use client";

import React, { useState } from "react";
import { AlertCircle, LogIn } from "lucide-react";
import Button from "@/components/ui/Button";
import LoginModal from "../LoginModal";
import Shell from "./Shell";
import Hero from "./Hero";

interface ExistingAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflictField?: "email" | "mobile";
  email?: string;
}

/**
 * ExistingAccountModal — shown when a registration attempt collides with an
 * existing account. Mirrors the dark-hero design used by the upgrade/cancel/
 * refer suite. Public API preserved from the prior monolith.
 */
const ExistingAccountModal: React.FC<ExistingAccountModalProps> = ({
  isOpen,
  onClose,
  conflictField = "email",
  email,
}) => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const visible = isOpen && !showLoginModal;

  const handleGoToLogin = () => {
    if (email) setShowLoginModal(true);
  };

  const handleLoginModalClose = () => {
    setShowLoginModal(false);
    onClose();
  };

  const fieldLabel = conflictField === "email" ? "email address" : "mobile number";
  const titleText =
    conflictField === "email" ? "Email already exists" : "Mobile already exists";

  return (
    <>
      <Shell isOpen={visible} onClose={onClose} labelledBy="existing-account-headline">
        <Hero
          titleId="existing-account-headline"
          eyebrow="Account exists"
          title={titleText}
          sub="Sign in to the existing account to continue."
          icon={AlertCircle}
        />

        <div className="bg-white dark:bg-neutral-950 px-5 pt-4 pb-4 space-y-3">
          <p className="text-sm text-neutral-700 dark:text-neutral-200 leading-relaxed">
            This {fieldLabel} is already linked to an account that has made
            purchases. To continue, please log in to your existing account.
          </p>

          <div className="flex flex-col gap-2 pt-1">
            <Button
              variant="primary"
              tone="red"
              size="md"
              onClick={handleGoToLogin}
              disabled={!email}
              className="w-full gap-1.5"
            >
              <LogIn className="h-4 w-4" />
              Login
            </Button>
            <Button
              variant="outline"
              tone="neutral"
              size="md"
              onClick={onClose}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Shell>

      {/* Login modal — rendered outside Shell to avoid nesting issues */}
      {email && (
        <LoginModal
          isOpen={showLoginModal}
          onClose={handleLoginModalClose}
          email={email}
        />
      )}
    </>
  );
};

export default ExistingAccountModal;
