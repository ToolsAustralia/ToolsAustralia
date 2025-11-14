"use client";

import React from "react";

/**
 * Spinner Loader Components
 *
 * Use cases:
 * - Button clicks, quick API calls, simple operations
 * - When you don't know the duration
 * - For immediate feedback
 */

interface SpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  color?: "red" | "white" | "gray" | "blue";
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = "md", color = "red", className = "" }) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-12 h-12",
  };

  const colorClasses = {
    red: "text-red-600",
    white: "text-white",
    gray: "text-gray-600",
    blue: "text-blue-600",
  };

  return (
    <div className={`animate-spin ${sizeClasses[size]} ${colorClasses[color]} ${className}`}>
      <svg className="w-full h-full" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
};

/**
 * Button Spinner
 * For loading buttons
 */
interface ButtonSpinnerProps {
  loading: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export const ButtonSpinner: React.FC<ButtonSpinnerProps> = ({
  loading,
  children,
  className = "",
  disabled = false,
  onClick,
}) => {
  return (
    <button
      className={`
        relative inline-flex items-center justify-center px-6 py-3 
        border border-transparent text-sm font-medium rounded-full
        transition-all duration-200
        ${
          loading || disabled
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-red-600 hover:bg-red-700 text-white hover:scale-105"
        }
        ${className}
      `}
      disabled={loading || disabled}
      onClick={onClick}
    >
      {loading && <Spinner size="sm" color="white" className="mr-2" />}
      {children}
    </button>
  );
};

/**
 * Inline Spinner
 * For inline loading states
 */
export const InlineSpinner: React.FC<{ text?: string }> = ({ text = "Loading..." }) => (
  <div className="flex items-center space-x-2 text-gray-600">
    <Spinner size="sm" color="gray" />
    <span className="text-sm">{text}</span>
  </div>
);

/**
 * Page Spinner
 * For full page loading
 */
export const PageSpinner: React.FC<{ text?: string }> = ({ text = "Loading..." }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center space-y-4">
      <Spinner size="xl" color="red" />
      <p className="text-lg text-gray-600">{text}</p>
    </div>
  </div>
);

/**
 * Card Spinner
 * For loading content within cards
 */
export const CardSpinner: React.FC<{ text?: string }> = ({ text = "Loading content..." }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-8">
    <div className="flex flex-col items-center space-y-4">
      <Spinner size="lg" color="red" />
      <p className="text-gray-600">{text}</p>
    </div>
  </div>
);

