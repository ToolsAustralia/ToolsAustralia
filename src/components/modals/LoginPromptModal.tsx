"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import { LogIn } from "lucide-react";

interface LoginPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal displayed when non-authenticated users try to purchase mini draw packages
 * Prompts them to log in to continue with their purchase
 */
const LoginPromptModal: React.FC<LoginPromptModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();

  const handleGoToLogin = () => {
    onClose(); // Close this modal first
    router.push("/login"); // Redirect to login page
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={true}>
      <ModalHeader
        title="Login Required"
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
              <LogIn className="w-10 h-10 text-red-600" />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-3">
            <h3 className="text-xl font-bold text-gray-900">Please Login to Continue</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              You need to be logged in to your account to purchase entries for mini draws. Please log in to continue.
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
              icon={LogIn}
              iconPosition="left"
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

export default LoginPromptModal;




