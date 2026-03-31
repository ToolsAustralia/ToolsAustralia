"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

interface TextareaProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
  className?: string; // Applied to the textarea element itself
  wrapperClassName?: string; // Applied to the wrapper div
}

const Textarea: React.FC<TextareaProps> = ({
  id,
  name,
  value,
  onChange,
  placeholder,
  label,
  required = false,
  error,
  disabled = false,
  rows = 4,
  maxLength,
  className = "",
  wrapperClassName = "",
}) => {
  return (
    <div className={`space-y-2 ${wrapperClassName}`}>
      {/* Label */}
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-neutral-300">
          {label} {required && <span className="text-red-500 dark:text-red-400">*</span>}
        </label>
      )}

      {/* Textarea */}
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 resize-none text-gray-900 dark:text-neutral-100 placeholder:text-gray-500 dark:placeholder:text-neutral-500 ${
          error
            ? "border-red-500 bg-red-50 dark:bg-red-950/30 dark:border-red-500"
            : "border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
        } ${
          disabled
            ? "bg-gray-100 dark:bg-neutral-800 cursor-not-allowed text-gray-500 dark:text-neutral-500"
            : "hover:border-red-400 dark:hover:border-red-500/60 hover:shadow-sm"
        } ${className}`}
      />

      {/* Error Message */}
      {error && (
        <p className="text-red-500 dark:text-red-400 text-sm flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}
    </div>
  );
};

export default Textarea;
