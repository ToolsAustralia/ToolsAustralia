"use client";

import React from "react";
import { CheckCircle, Mail, Smartphone } from "lucide-react";
import { Input } from "../ui";

/**
 * Setup step 3 — secure the account with ONE verified contact channel.
 *
 * Either email or mobile satisfies it. Registration is passwordless and step 1
 * is where the member chooses their password, so this channel is the recovery
 * credential for that password: without it, a mistyped email leaves them with no
 * self-service way back in (reset links and emailed sign-in codes all go to an
 * inbox they cannot read).
 *
 * Email leads because it costs nothing to send; SMS costs a credit per code, so
 * it is the alternative rather than the default.
 */
interface Step3VerifyContactProps {
  isMandatory: boolean;
  hasReferralCode: boolean;

  channel: "email" | "mobile";
  onChannelChange: (channel: "email" | "mobile") => void;

  // Email
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

  // Mobile
  currentMobile?: string;
  isMobileVerified: boolean;
  isSendingSms: boolean;
  smsCodeSent: boolean;
  smsCode: string;
  smsError: string;
  smsCooldown: number;
  onSmsCodeChange: (value: string) => void;
  onSendSmsVerification: () => void;
  onVerifySmsCode: () => void;
}

const VerifiedBanner: React.FC<{ label: string }> = ({ label }) => (
  <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
    <CheckCircle className="w-5 h-5" />
    <span>{label}</span>
  </div>
);

const Step3VerifyContact: React.FC<Step3VerifyContactProps> = ({
  isMandatory,
  hasReferralCode,
  channel,
  onChannelChange,
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
  currentMobile,
  isMobileVerified,
  isSendingSms,
  smsCodeSent,
  smsCode,
  smsError,
  smsCooldown,
  onSmsCodeChange,
  onSendSmsVerification,
  onVerifySmsCode,
}) => {
  const anyVerified = isEmailVerified || isMobileVerified;

  // Once either channel is done the requirement is met — collapse to a single
  // confirmation rather than continuing to offer the other one.
  if (anyVerified) {
    return (
      <div className="space-y-3 text-center">
        {hasReferralCode && (
          <p className="text-xs text-green-600 dark:text-green-400 font-semibold">
            Your referral bonus of 100 entries has been granted with your first purchase.
          </p>
        )}
        <VerifiedBanner label={isEmailVerified ? "Email verified!" : "Mobile verified!"} />
      </div>
    );
  }

  return (
    <div className="space-y-3 text-center">
      {hasReferralCode && (
        <p className="text-xs text-green-600 dark:text-green-400 font-semibold">
          Your referral bonus of 100 entries has been granted with your first purchase.
        </p>
      )}

      {/* Channel picker — only when there is a mobile to send to. */}
      {currentMobile && (
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-gray-100 dark:bg-neutral-800/70">
          {(["email", "mobile"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChannelChange(c)}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
                channel === c
                  ? "bg-white dark:bg-neutral-900 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200"
              }`}
            >
              {c === "email" ? <Mail className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
              {c === "email" ? "Email" : "Mobile"}
            </button>
          ))}
        </div>
      )}

      {channel === "email" ? (
        <>
          {currentEmail && !isEditingEmail && (
            <div className="space-y-1.5 pt-1">
              <p className="text-sm text-gray-500 dark:text-neutral-400">We&apos;ll send a code to:</p>
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

          {!isEditingEmail && (
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
          )}
        </>
      ) : (
        <>
          <div className="space-y-1.5 pt-1">
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              {smsCodeSent ? "We texted a code to:" : "We'll text a code to:"}
            </p>
            <p data-cs-mask className="font-semibold text-gray-900 dark:text-white">
              {currentMobile}
            </p>
          </div>

          {smsCodeSent && (
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Six-digit verification code"
              maxLength={6}
              value={smsCode}
              onChange={(e) => onSmsCodeChange(e.target.value.replace(/\D/g, ""))}
              placeholder="------"
              className="w-full rounded-xl border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 py-3 text-center text-2xl font-semibold tracking-[0.4em] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
            />
          )}

          <button
            onClick={smsCodeSent ? onVerifySmsCode : onSendSmsVerification}
            disabled={
              isSendingSms || (smsCodeSent ? smsCode.length !== 6 : smsCooldown > 0)
            }
            className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-b from-red-600 to-red-800 text-white py-3 px-4 rounded-xl font-bold shadow-[0_4px_12px_rgba(238,0,0,0.25)] hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSendingSms ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{smsCodeSent ? "Verifying..." : "Sending..."}</span>
              </>
            ) : smsCodeSent ? (
              "Verify code"
            ) : smsCooldown > 0 ? (
              `Try again in ${smsCooldown}s`
            ) : (
              <>
                <Smartphone className="h-4 w-4" />
                Text me a code
              </>
            )}
          </button>

          {smsCodeSent && (
            <button
              onClick={onSendSmsVerification}
              disabled={isSendingSms || smsCooldown > 0}
              className="w-full text-xs font-semibold text-red-600 dark:text-red-400 hover:underline disabled:text-gray-400 dark:disabled:text-neutral-500 disabled:no-underline disabled:cursor-not-allowed"
            >
              {smsCooldown > 0 ? `Resend in ${smsCooldown}s` : "Resend code"}
            </button>
          )}

          {smsError && (
            <p className="text-xs text-red-600 dark:text-red-400 text-left">{smsError}</p>
          )}
        </>
      )}

      {!isMandatory && (
        <p className="text-center text-xs text-gray-500 dark:text-neutral-400">
          You can skip this and verify later from your account settings.
        </p>
      )}
    </div>
  );
};

export default Step3VerifyContact;
