"use client";

import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordTabProps {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmNewPasswordChange: (value: string) => void;
  onChangePassword: () => void;
  onClearPasswords: () => void;
  onRequestReset: () => void;
  isUpdatingPassword: boolean;
  isRequestingReset: boolean;
}

const PasswordTab: React.FC<PasswordTabProps> = ({
  currentPassword,
  newPassword,
  confirmNewPassword,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmNewPasswordChange,
  onChangePassword,
  onClearPasswords,
  onRequestReset,
  isUpdatingPassword,
  isRequestingReset,
}) => {
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/85">
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-neutral-100">Change Password</h3>
        <p className="text-2xs sm:text-xs text-gray-500 dark:text-neutral-400">Minimum of 6 characters</p>
        <div className="mt-2 sm:mt-3 space-y-2 sm:space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200">Current password</label>
            <input
              type="password"
              className="rounded-lg border border-gray-300 px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:border-red-500 focus:outline-none"
              value={currentPassword}
              onChange={(e) => onCurrentPasswordChange(e.target.value)}
              placeholder="Enter current password"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200">New password</label>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 sm:py-2 pr-10 text-xs sm:text-sm text-gray-900 placeholder:text-gray-500 focus:border-red-500 focus:outline-none w-full dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                value={newPassword}
                onChange={(e) => onNewPasswordChange(e.target.value)}
                placeholder="Enter new password"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 focus:outline-none"
                tabIndex={-1}
              >
                {showNewPassword ? (
                  <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200">Confirm new password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                className="rounded-lg border border-gray-300 px-3 py-1.5 sm:py-2 pr-10 text-xs sm:text-sm focus:border-red-500 focus:outline-none w-full"
                value={confirmNewPassword}
                onChange={(e) => onConfirmNewPasswordChange(e.target.value)}
                placeholder="Re-enter new password"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 focus:outline-none"
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </button>
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onChangePassword}
              disabled={isUpdatingPassword}
              className="rounded-lg bg-gradient-to-r from-red-600 to-red-400 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:from-red-675 hover:to-red-650 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdatingPassword ? "Updating..." : "Update password"}
            </button>
            <button
              type="button"
              onClick={onClearPasswords}
              className="rounded-lg border border-gray-300 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-gray-700 dark:border-neutral-600 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/85">
        <h3 className="text-base font-semibold text-gray-900 dark:text-neutral-100">Forgot password</h3>

        <button
          type="button"
          onClick={onRequestReset}
          disabled={isRequestingReset}
          className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 dark:border-neutral-600 dark:text-neutral-100 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRequestingReset ? "Sending..." : "Send reset email"}
        </button>
      </div>
    </div>
  );
};

export default PasswordTab;
