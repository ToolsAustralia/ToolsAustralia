"use client";

import React from "react";
import { AlertCircle, LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

interface InputProps {
  id?: string;
  name?: string;
  type?: "text" | "email" | "password" | "number" | "tel" | "url" | "date";
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
  autoComplete?: string;
  size?: "md" | "lg";
  className?: string;
  wrapperClassName?: string;
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
      autoComplete,
      size = "md",
      className = "",
      wrapperClassName = "",
    },
    ref
  ) => {
    const sizeStyles = {
      md: "px-3 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 text-sm",
      lg: "px-4 py-3 sm:py-3.5 text-base",
    };

    return (
      <div className={cn("space-y-1.5 sm:space-y-2", wrapperClassName)}>
        {/* Label */}
        {label && (
          <label htmlFor={id} className={cn("block font-medium text-gray-700 dark:text-neutral-300", wrapperClassName ? "" : "text-xs sm:text-sm")}>
            {label} {required && <span className="text-red-500 dark:text-red-400">*</span>}
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
                aria-label="Toggle visibility"
                className="absolute right-1 sm:right-1.5 top-1/2 z-10 transform -translate-y-1/2 inline-flex items-center justify-center w-9 h-9 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 active:scale-95 transition-colors"
              >
                <Icon className="w-4 h-4 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
              </button>
            ) : (
              <Icon
                className="pointer-events-none absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-gray-400 dark:text-gray-500"
                aria-hidden
              />
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
            autoComplete={autoComplete}
            className={`w-full ${sizeStyles[size]} border rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
              Icon && !onIconClick ? "pl-10 sm:pl-11 lg:pl-12" : ""
            } ${Icon && onIconClick ? "pr-11 sm:pr-12" : ""} ${
              error ? "border-red-500 bg-red-50 dark:bg-red-950/30 dark:border-red-500" : "border-gray-300 dark:border-neutral-700"
            } ${
              disabled
                ? "bg-gray-100 dark:bg-neutral-800 cursor-not-allowed text-gray-900 dark:text-gray-100"
                : "bg-white dark:bg-neutral-800/80 text-gray-900 dark:text-neutral-100 placeholder-gray-500 dark:placeholder-neutral-500 hover:border-red-400 dark:hover:border-neutral-600 hover:shadow-sm"
            } ${className}`}
          />
        </div>

        {/* Error Message */}
        {error && (
          <p className="text-red-500 dark:text-red-400 text-xs sm:text-sm flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
