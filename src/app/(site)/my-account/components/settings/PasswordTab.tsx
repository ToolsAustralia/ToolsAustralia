"use client";

import React, { useState } from "react";
import { Eye, EyeOff, KeyRound, Fingerprint, Smartphone, Mail, CheckCircle2, Check } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/utils/cn";
import {
  Card,
  SectionHeader,
  Field,
  SettingsButton,
  SettingsBadge,
  SettingsInput,
} from "./ui/primitives";

interface PasswordTabProps {
  userEmail: string;
}

// ---------------------------------------------------------------------------
// Local password input with eye-toggle — mirrors design's PWInput2 pattern
// ---------------------------------------------------------------------------

interface PWInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  show: boolean;
  setShow: (v: boolean) => void;
}

const PWInput = ({ show, setShow, ...props }: PWInputProps) => (
  <div className="relative">
    <input
      type={show ? "text" : "password"}
      className={cn(
        "w-full rounded-xl border border-neutral-300 dark:border-neutral-700",
        "bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white",
        "px-3.5 py-3 pr-10 text-sm placeholder-neutral-400 dark:placeholder-neutral-500",
        "focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600 transition",
      )}
      {...props}
    />
    <button
      type="button"
      onClick={() => setShow(!show)}
      tabIndex={-1}
      aria-label={show ? "Hide password" : "Show password"}
      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
    >
      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// PasswordTab
// ---------------------------------------------------------------------------

export default function PasswordTab({ userEmail }: PasswordTabProps) {
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const calculatePasswordStrength = (password: string): number => {
    if (!password) return 0;
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password) && /[^a-zA-Z0-9]/.test(password)) strength++;
    return Math.min(strength, 4);
  };

  const passwordStrength = calculatePasswordStrength(newPassword);
  const strengthColors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500"];
  const strengthLabels = ["Weak", "Fair", "Good", "Strong"];

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

  // Live requirements derived from newPassword — pure client logic, no validation side effects
  const requirements = [
    { ok: newPassword.length >= 6,                             label: "6 or more characters" },
    { ok: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword), label: "Upper and lowercase letters" },
    { ok: /\d/.test(newPassword),                              label: "At least one number" },
    { ok: /[^a-zA-Z0-9]/.test(newPassword),                   label: "A special character (!@#$…)" },
  ];

  const confirmMismatch =
    Boolean(newPassword) && Boolean(confirmNewPassword) && newPassword !== confirmNewPassword;

  return (
    <div className="space-y-6">
      {/* ── Change password ───────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Change password"
          description="Use a passphrase or a password manager for best security. Minimum 6 characters."
          icon={KeyRound}
          accent="red"
        />

        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
          {/* Form column */}
          <div className="space-y-5">
            <Field label="Current password" htmlFor="current-password">
              <SettingsInput
                type="password"
                id="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </Field>

            <Field label="New password" htmlFor="new-password">
              <PWInput
                id="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                show={showNewPassword}
                setShow={setShowNewPassword}
                minLength={6}
              />
              {/* Strength bar — visible only when newPassword is non-empty */}
              {newPassword && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 flex-1 rounded-full transition-all duration-300",
                          i <= passwordStrength
                            ? strengthColors[passwordStrength - 1]
                            : "bg-neutral-200 dark:bg-neutral-800",
                        )}
                      />
                    ))}
                  </div>
                  {passwordStrength > 0 && (
                    <p
                      className={cn(
                        "text-xs font-medium",
                        passwordStrength === 1 && "text-red-600 dark:text-red-400",
                        passwordStrength === 2 && "text-orange-600 dark:text-orange-400",
                        passwordStrength === 3 && "text-yellow-600 dark:text-yellow-400",
                        passwordStrength === 4 && "text-green-600 dark:text-green-400",
                      )}
                    >
                      {strengthLabels[passwordStrength - 1]} password
                    </p>
                  )}
                </div>
              )}
            </Field>

            <Field
              label="Confirm new password"
              htmlFor="confirm-password"
              error={confirmMismatch ? "Passwords don't match." : undefined}
            >
              <PWInput
                id="confirm-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Re-enter new password"
                show={showConfirmPassword}
                setShow={setShowConfirmPassword}
                minLength={6}
              />
            </Field>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <SettingsButton
                variant="secondary"
                onClick={() => {
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmNewPassword("");
                }}
              >
                Clear
              </SettingsButton>
              <SettingsButton
                variant="primary"
                onClick={handleChangePassword}
                disabled={isUpdatingPassword}
              >
                {isUpdatingPassword ? "Updating..." : "Update password"}
              </SettingsButton>
            </div>
          </div>

          {/* Requirements panel — always visible alongside form */}
          <div className="lg:order-none order-first">
            <Card className="p-4 bg-neutral-50 dark:bg-neutral-950/40 border-dashed border-neutral-300 dark:border-neutral-700">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-neutral-500 dark:text-neutral-400 mb-3">
                Requirements
              </p>
              <ul className="space-y-2">
                {requirements.map((req) => (
                  <li key={req.label} className="flex items-center gap-2 text-sm">
                    <span
                      className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center shrink-0",
                        req.ok
                          ? "bg-emerald-500 text-white"
                          : "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600",
                      )}
                    >
                      <Check className="w-2.5 h-2.5" strokeWidth={3} />
                    </span>
                    <span
                      className={
                        req.ok
                          ? "text-emerald-700 dark:text-emerald-300 line-through opacity-70"
                          : "text-neutral-700 dark:text-neutral-300"
                      }
                    >
                      {req.label}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Two-factor & recovery ─────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Two-factor & recovery"
          description="An extra layer of protection for your account."
          icon={Fingerprint}
          accent="emerald"
        />

        <div className="grid sm:grid-cols-2 gap-3">
          {/* SMS verification — static placeholder, no backend */}
          <Card className="p-3.5 sm:p-5 relative overflow-hidden">
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-red-600/5 pointer-events-none" />
            <div className="relative">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" strokeWidth={2} />
                </div>
                <SettingsBadge tone="warning">Coming soon</SettingsBadge>
              </div>
              <p className="font-poppins font-bold text-base text-neutral-900 dark:text-white mt-3">
                SMS verification
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Get a one-time code on your phone when signing in from a new device.
              </p>
              <SettingsButton
                variant="dark"
                size="sm"
                className="mt-3"
                disabled
              >
                Coming soon
              </SettingsButton>
            </div>
          </Card>

          {/* Email recovery — wired to existing handleRequestReset */}
          <Card className="p-3.5 sm:p-5 relative overflow-hidden">
            <div className="relative">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" strokeWidth={2} />
                </div>
                <SettingsBadge tone="success" icon={CheckCircle2}>
                  Active
                </SettingsBadge>
              </div>
              <p className="font-poppins font-bold text-base text-neutral-900 dark:text-white mt-3">
                Email recovery
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                A reset link will be sent to your registered email address.
              </p>
              <SettingsButton
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={handleRequestReset}
                disabled={isRequestingReset}
              >
                {isRequestingReset ? "Sending..." : "Send reset email"}
              </SettingsButton>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
