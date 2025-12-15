"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useToast } from "@/components/ui/Toast";

interface ResetPasswordPageProps {
  searchParams?: { token?: string };
}

export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const router = useRouter();
  const urlParams = useSearchParams();
  const { showToast } = useToast();

  const [email, setEmail] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const token = searchParams?.token || urlParams.get("token") || "";
  const hasToken = Boolean(token);

  useEffect(() => {
    // If already authenticated and we support redirect logic here, we could redirect to /my-account
    // For now, we just rely on the login page/session handling.
  }, []);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      setIsRequesting(true);
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Unable to send reset email");
      }

      showToast({
        type: "success",
        title: "Email sent",
        message: "Check your inbox for a link to reset your password.",
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Request failed",
        message: error instanceof Error ? error.message : "Could not send reset email. Please try again.",
      });
    } finally {
      setIsRequesting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      showToast({
        type: "error",
        title: "Password too short",
        message: "Your new password must be at least 6 characters long.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast({
        type: "error",
        title: "Passwords do not match",
        message: "New password and confirmation do not match. Please try again.",
      });
      return;
    }

    try {
      setIsResetting(true);
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to reset password");
      }

      showToast({
        type: "success",
        title: "Password updated",
        message: "Your password has been reset. You can now sign in with your new password.",
      });

      // Redirect to login after a short delay
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (error) {
      showToast({
        type: "error",
        title: "Reset failed",
        message: error instanceof Error ? error.message : "Unable to reset password. Please try again.",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-width-[420px] max-w-md bg-white rounded-2xl shadow-lg p-6 sm:p-8">
        {/* Brand Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="w-[40px] h-[42px] sm:w-[50px] sm:h-[52px] relative">
            <Image
              src="/images/Tools Australia Logo/Social Media Profile_Primary.png"
              alt="Tools Australia Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <span className="text-lg sm:text-xl font-semibold text-black tracking-[-0.8px]">Tools Australia</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
          {hasToken ? "Set a new password" : "Forgot your password?"}
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          {hasToken
            ? "Enter a new password for your Tools Australia account. Make sure it’s something secure and easy to remember."
            : "Enter your email address and we’ll send you a secure link to reset your password."}
        </p>

        {!hasToken ? (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              disabled={isRequesting}
              className="w-full rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-[#cc0000] hover:to-[#e60000] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRequesting ? "Sending link..." : "Send reset link"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                placeholder="Enter your new password"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="confirm-password">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                placeholder="Re-enter your new password"
              />
            </div>
            <button
              type="submit"
              disabled={isResetting}
              className="w-full rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-[#cc0000] hover:to-[#e60000] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResetting ? "Updating password..." : "Update password"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-gray-600">
          <span>Remembered your password? </span>
          <Link href="/login" className="font-semibold text-[#ee0000] hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
