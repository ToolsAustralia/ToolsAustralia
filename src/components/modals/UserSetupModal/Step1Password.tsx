"use client";

import React from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "../ui";

interface Step1PasswordProps {
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  inlineErrors: { password?: string; confirmPassword?: string };
  passwordRef: React.Ref<HTMLInputElement>;
  confirmPasswordRef: React.Ref<HTMLInputElement>;
  onPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTogglePassword: () => void;
  onToggleConfirmPassword: () => void;
}

const Step1Password: React.FC<Step1PasswordProps> = ({
  password,
  confirmPassword,
  showPassword,
  showConfirmPassword,
  inlineErrors,
  passwordRef,
  confirmPasswordRef,
  onPasswordChange,
  onConfirmPasswordChange,
  onTogglePassword,
  onToggleConfirmPassword,
}) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/10 dark:bg-red-500/15">
        <Lock className="h-4 w-4 text-red-600 dark:text-red-400" />
      </div>
      <h3 className="text-sm font-bold text-gray-900 dark:text-white">
        Choose a password
      </h3>
    </div>
    <p className="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed">
      At least 8 characters. We&apos;ll use this to sign you in next time.
    </p>
    <div className="space-y-2.5">
      <Input
        ref={passwordRef}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={onPasswordChange}
        placeholder="Enter your password"
        error={inlineErrors.password}
        icon={showPassword ? EyeOff : Eye}
        onIconClick={onTogglePassword}
      />
      <Input
        ref={confirmPasswordRef}
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={onConfirmPasswordChange}
        placeholder="Confirm your password"
        error={inlineErrors.confirmPassword}
        icon={showConfirmPassword ? EyeOff : Eye}
        onIconClick={onToggleConfirmPassword}
      />
    </div>
  </div>
);

export default Step1Password;
