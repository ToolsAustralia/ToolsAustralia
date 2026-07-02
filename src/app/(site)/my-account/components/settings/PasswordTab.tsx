"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/utils/cn";

interface PasswordTabProps {
  userEmail: string;
  hasPassword?: boolean;
}

const fieldClass =
  "w-full rounded-xl border border-token bg-page px-3.5 py-3 text-sm text-primary-token placeholder:text-muted-token focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/25 dark:text-white";

function strengthOf(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

/**
 * Minimal password section for the consolidated Account settings page (clean
 * Claude design). Change (or first-time set) password + strength meter + email
 * reset link. Same endpoints as before; the old score dial / 2FA placeholder /
 * requirements side-panel were dropped.
 */
export default function PasswordTab({ userEmail, hasPassword }: PasswordTabProps) {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const isPasswordless = hasPassword === false;
  const strength = strengthOf(newPassword);
  const strengthColors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500"];
  const strengthLabels = ["Weak", "Fair", "Good", "Strong"];
  const confirmMismatch = Boolean(newPassword) && Boolean(confirmNewPassword) && newPassword !== confirmNewPassword;

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showToast({ type: "error", title: "Password too short", message: "Your new password must be at least 6 characters long." });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast({ type: "error", title: "Passwords do not match", message: "New password and confirmation do not match." });
      return;
    }
    try {
      setIsUpdating(true);
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isPasswordless ? { newPassword } : { currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      showToast({
        type: "success",
        title: isPasswordless ? "Password set" : "Password changed",
        message: isPasswordless ? "You can now sign in with your email and this password." : "Your password has been updated.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error) {
      showToast({ type: "error", title: "Change failed", message: error instanceof Error ? error.message : "Could not change password" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRequestReset = async () => {
    try {
      setIsResetting(true);
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to request reset");
      showToast({ type: "success", title: "Reset email sent", message: "Check your inbox for the reset link." });
    } catch (error) {
      showToast({ type: "error", title: "Request failed", message: error instanceof Error ? error.message : "Could not send reset email" });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-token bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">
          {isPasswordless ? "Set a password" : "Password"}
        </p>
        <button
          type="button"
          onClick={handleRequestReset}
          disabled={isResetting}
          className="text-xs font-semibold text-red-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60 dark:text-red-500"
        >
          {isResetting ? "Sending…" : "Email me a reset link"}
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {!isPasswordless && (
          <div>
            <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-primary-token dark:text-white">
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className={fieldClass}
            />
          </div>
        )}

        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-primary-token dark:text-white">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              minLength={6}
              className={cn(fieldClass, "pr-10")}
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              tabIndex={-1}
              aria-label={showNew ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-token hover:text-primary-token"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {newPassword && (
            <div className="space-y-1.5 pt-2">
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-all duration-300",
                      i <= strength ? strengthColors[strength - 1] : "bg-black/[.08] dark:bg-white/[.10]",
                    )}
                  />
                ))}
              </div>
              {strength > 0 && <p className="text-xs font-medium text-muted-token">{strengthLabels[strength - 1]} password</p>}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-primary-token dark:text-white">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type={showNew ? "text" : "password"}
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            placeholder="Re-enter new password"
            minLength={6}
            className={fieldClass}
          />
          {confirmMismatch && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">Passwords don&apos;t match.</p>}
        </div>

        <button
          type="button"
          onClick={handleChangePassword}
          disabled={isUpdating}
          className="w-full rounded-xl bg-gradient-to-b from-red-500 to-red-700 py-3 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60 motion-safe:active:translate-y-px"
        >
          {isUpdating ? (isPasswordless ? "Setting…" : "Updating…") : isPasswordless ? "Set password" : "Update password"}
        </button>
      </div>
    </div>
  );
}
