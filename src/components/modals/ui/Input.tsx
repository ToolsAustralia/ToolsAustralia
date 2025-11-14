"use client";

import React from "react";
import { AlertCircle, LucideIcon } from "lucide-react";

interface InputProps {
  id?: string;
  name?: string;
  type?: "text" | "email" | "password" | "number" | "tel" | "url";
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  icon?: LucideIcon;
  onIconClick?: () => void;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  className?: string; // Applied to the input element itself
  wrapperClassName?: string; // Applied to the wrapper div
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      id,
      name,
      type = "text",
      value,
      onChange,
      placeholder,
      label,
      required = false,
      error,
      disabled = false,
      icon: Icon,
      onIconClick,
      min,
      max,
      step,
      maxLength,
      className = "",
      wrapperClassName = "",
    },
    ref
  ) => {
    return (
      <div className={`space-y-2 ${wrapperClassName}`}>
        {/* Label */}
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}

        {/* Input Container */}
        <div className="relative">
          {/* Icon */}
          {Icon &&
            (onIconClick ? (
              <button
                type="button"
                onClick={onIconClick}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Icon className="w-5 h-5" />
              </button>
            ) : (
              <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            ))}

          {/* Input Field */}
          <input
            ref={ref}
            id={id}
            name={name}
            type={type}
            value={type === "number" && value === 0 ? "" : value}
            onChange={onChange}
            placeholder={type === "number" && !placeholder ? "Enter amount" : placeholder}
            disabled={disabled}
            min={min}
            max={max}
            step={step}
            maxLength={maxLength}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
              Icon && !onIconClick ? "pl-10" : ""
            } ${Icon && onIconClick ? "pr-10" : ""} ${error ? "border-red-500 bg-red-50" : "border-gray-300"} ${
              disabled ? "bg-gray-100 cursor-not-allowed" : "hover:border-red-400 hover:shadow-sm"
            } ${className}`}
          />
        </div>

        {/* Error Message */}
        {error && (
          <p className="text-red-500 text-sm flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
