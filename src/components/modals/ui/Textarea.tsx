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
  className = "",
  wrapperClassName = "",
}) => {
  return (
    <div className={`space-y-2 ${wrapperClassName}`}>
      {/* Label */}
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
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
        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 resize-none ${
          error ? "border-red-500 bg-red-50" : "border-gray-300"
        } ${disabled ? "bg-gray-100 cursor-not-allowed" : "hover:border-red-400 hover:shadow-sm"} ${className}`}
      />

      {/* Error Message */}
      {error && (
        <p className="text-red-500 text-sm flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}
    </div>
  );
};

export default Textarea;
