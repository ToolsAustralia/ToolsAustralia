"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, ShoppingBag } from "lucide-react";
import { ModalContainer, ModalContent, Button, Input } from "../ui";
import LoginModal from "../LoginModal";

/**
 * Sign in at the point of purchase.
 *
 * Replaces a native `alert("Please log in to add items to cart")`, which was a
 * browser dialog on top of a dark themed page, gave no way to actually sign in,
 * and lost whatever the customer had chosen the moment they dismissed it.
 *
 * Email-first by necessity: `LoginModal` takes an `email` prop and is a complete
 * in-place portal from there — password, Google, or a one-time code emailed to
 * that address. So this collects the address, hands over, and never navigates.
 *
 * Creating an ACCOUNT still leaves the site. `/api/auth/register` mints no
 * session, and all three existing session bridges refuse a brand-new non-member,
 * so signing someone up in place needs a new auth endpoint — an auth-surface
 * change that belongs in its own reviewed piece of work, not smuggled into a shop
 * ticket. Until then the new-customer path is an honest link that comes back here.
 */

interface SignInToBuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Runs once the session is live, still on this page. */
  onSignedIn?: () => void;
  /** What they were trying to do, e.g. "add this to your cart". */
  intent?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInToBuyModal({
  isOpen,
  onClose,
  onSignedIn,
  intent = "add this to your cart",
}: SignInToBuyModalProps) {
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  // Reopening after a failed sign-in should not show the previous error.
  useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen]);

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setEmail(trimmed);
    setShowLogin(true);
  };

  const handleLoginClose = () => {
    setShowLogin(false);
    onClose();
  };

  return (
    <>
      <ModalContainer isOpen={isOpen && !showLogin} onClose={onClose} size="sm">
        <ModalContent>
          <div className="px-1 py-2 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
              <ShoppingBag className="h-7 w-7 text-red-600 dark:text-red-400" />
            </div>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Sign in to {intent}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600 dark:text-neutral-400">
              Your cart is saved to your account, so it follows you between your phone and
              the ute.
            </p>

            <form onSubmit={handleContinue} className="mt-6 space-y-4 text-left">
              <Input
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" className="w-full">
                <LogIn className="mr-2 h-4 w-4" />
                Continue
              </Button>
            </form>

            <p className="mt-5 text-sm text-gray-600 dark:text-neutral-400">
              First time here?{" "}
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(pathname || "/shop")}`}
                className="font-semibold text-red-600 hover:underline dark:text-red-400"
                onClick={onClose}
              >
                Create an account
              </Link>
            </p>
          </div>
        </ModalContent>
      </ModalContainer>

      {/* redirectTo={null}: signing in here is a step INSIDE buying, not the
          errand itself. The default push to /my-account would abandon the
          product and the half-built cart at the worst possible moment. */}
      <LoginModal
        isOpen={showLogin}
        onClose={handleLoginClose}
        email={email}
        redirectTo={null}
        onSignedIn={onSignedIn}
      />
    </>
  );
}
