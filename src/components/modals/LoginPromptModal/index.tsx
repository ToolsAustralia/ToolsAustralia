"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LogIn, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import Shell from "./Shell";
import Hero from "./Hero";

interface LoginPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * LoginPromptModal — shown when a non-authenticated user tries to purchase
 * a mini-draw package. Mirrors the design language of the upgrade/cancel
 * suite: dark gradient hero with eyebrow pill, white/neutral body, Plan 4
 * Button primitives.
 *
 * Public API preserved from the prior monolith — consumers (ModalsGalleryClient,
 * MiniDrawPackages, etc.) continue importing the default export unchanged.
 */
const LoginPromptModal: React.FC<LoginPromptModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();

  const handleGoToLogin = () => {
    onClose();
    router.push("/login");
  };

  return (
    <Shell isOpen={isOpen} onClose={onClose} labelledBy="login-prompt-headline">
      <Hero
        titleId="login-prompt-headline"
        eyebrow="Login required"
        title="Login to continue"
        sub="Sign in to your account to purchase entries for mini draws."
        icon={LogIn}
      />

      {/* Body */}
      <div className="bg-white dark:bg-neutral-950 px-5 pt-4 pb-4 space-y-3">
        <p className="text-sm text-neutral-700 dark:text-neutral-200 leading-relaxed">
          You need to be logged in to purchase entries. Already have an account? Just
          sign in to pick up where you left off.
        </p>

        <div className="flex flex-col gap-2 pt-1">
          <Button
            variant="primary"
            tone="red"
            size="md"
            onClick={handleGoToLogin}
            className="w-full gap-1.5"
          >
            <LogIn className="h-4 w-4" />
            Go to login
            <ChevronRight className="h-4 w-4" />
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
  );
};

export default LoginPromptModal;
