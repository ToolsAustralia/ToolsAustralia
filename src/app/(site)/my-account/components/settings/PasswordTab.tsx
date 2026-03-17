"use client";

import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface PasswordTabProps {
  userEmail: string;
}

export default function PasswordTab({ userEmail }: PasswordTabProps) {
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showToast({
        type: "error",
        title: "Password too short",
        message: "Your new password must be at least 6 characters long.",
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      showToast({
        type: "error",
        title: "Passwords do not match",
        message: "New password and confirmation do not match. Please try again.",
      });
      return;
    }

    try {
      setIsUpdatingPassword(true);
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to change password");
      }
      showToast({
        type: "success",
        title: "Password changed",
        message: "Your password has been updated.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error) {
      showToast({
        type: "error",
        title: "Change failed",
        message: error instanceof Error ? error.message : "Could not change password",
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleRequestReset = async () => {
    try {
      setIsRequestingReset(true);
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to request reset");
      }
      showToast({
        type: "success",
        title: "Reset email sent",
        message: "Check your inbox for the reset link/code.",
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Request failed",
        message: error instanceof Error ? error.message : "Could not send reset email",
      });
    } finally {
      setIsRequestingReset(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Change Password</h3>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Minimum of 6 characters</p>

        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Current password</label>
            <input
              type="password"
              className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-red-500 dark:focus:border-red-500 focus:outline-none"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">New password</label>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white px-3 py-2 pr-10 text-sm focus:border-red-500 dark:focus:border-red-500 focus:outline-none w-full"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Confirm new password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white px-3 py-2 pr-10 text-sm focus:border-red-500 dark:focus:border-red-500 focus:outline-none w-full"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Re-enter new password"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={isUpdatingPassword}
              className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-[#cc0000] hover:to-[#e60000] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdatingPassword ? "Updating..." : "Update password"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentPassword("");
                setNewPassword("");
                setConfirmNewPassword("");
              }}
              className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-700"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Forgot password</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Send a password reset link to your email
        </p>
        <button
          type="button"
          onClick={handleRequestReset}
          disabled={isRequestingReset}
          className="rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRequestingReset ? "Sending..." : "Send reset email"}
        </button>
      </div>
    </div>
  );
}
