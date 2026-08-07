"use client";

import React from "react";
import { CheckCircle, Mail } from "lucide-react";
import { Input } from "../ui";

interface Step3EmailVerificationProps {
  isMandatory: boolean;
  hasReferralCode: boolean;
  currentEmail: string;
  isEditingEmail: boolean;
  newEmail: string;
  isUpdatingEmail: boolean;
  isEmailVerified: boolean;
  isSendingEmail: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onNewEmailChange: (value: string) => void;
  onUpdateEmail: () => void;
  onSendEmailVerification: () => void;
}

const Step3EmailVerification: React.FC<Step3EmailVerificationProps> = ({
  isMandatory,
  hasReferralCode,
  currentEmail,
  isEditingEmail,
  newEmail,
  isUpdatingEmail,
  isEmailVerified,
  isSendingEmail,
  onStartEdit,
  onCancelEdit,
  onNewEmailChange,
  onUpdateEmail,
  onSendEmailVerification,
}) => (
  <div className="space-y-3 text-center">
    {/* Hero already states the icon + "Confirm your email…" copy — don't duplicate. */}
    {hasReferralCode && (
      <p className="text-xs text-green-600 dark:text-green-400 font-semibold">
        Your referral bonus of 100 entries has been granted with your first purchase.
      </p>
    )}

    {currentEmail && !isEditingEmail && (
      <div className="space-y-1.5 pt-1">
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          We&apos;ll send a verification code to:
        </p>
        <p data-cs-mask className="font-semibold text-gray-900 dark:text-white break-all">
          {currentEmail}
        </p>
        <button
          onClick={onStartEdit}
          className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-semibold underline underline-offset-2"
        >
          Wrong email?
        </button>
      </div>
    )}

      {isEditingEmail && (
        <div className="space-y-2.5 pt-1">
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => onNewEmailChange(e.target.value)}
            placeholder="Enter your correct email"
            disabled={isUpdatingEmail}
          />
          <div className="flex gap-2">
            <button
              onClick={onUpdateEmail}
              disabled={isUpdatingEmail || !newEmail.trim()}
              className="flex-1 bg-gradient-to-b from-red-600 to-red-800 text-white py-2 px-4 rounded-lg font-semibold hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdatingEmail ? "Updating..." : "Update & verify"}
            </button>
            <button
              onClick={onCancelEdit}
              className="px-4 py-2 border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    {isEmailVerified ? (
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
        <CheckCircle className="w-5 h-5" />
        <span>Email verified!</span>
      </div>
    ) : !isEditingEmail ? (
      <div className="space-y-2">
        <button
          onClick={onSendEmailVerification}
          disabled={isSendingEmail}
          className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-b from-red-600 to-red-800 text-white py-3 px-4 rounded-xl font-bold shadow-[0_4px_12px_rgba(238,0,0,0.25)] hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSendingEmail ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" />
              Send verification code
            </>
          )}
        </button>
        {!isMandatory && (
          <p className="text-center text-xs text-gray-500 dark:text-neutral-400">
            You can skip this and verify later from your account settings.
          </p>
        )}
      </div>
    ) : null}
  </div>
);

export default Step3EmailVerification;
