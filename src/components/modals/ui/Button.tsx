"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost" | "metallic";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  className?: string;
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  icon: Icon,
  iconPosition = "left",
  className = "",
  fullWidth = false,
}) => {
  // Base styles
  const baseStyles =
    "inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ee0000]/40 overflow-hidden";

  // Size variants
  const sizeStyles = {
    sm: "px-3 py-2 text-sm",
    md: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base",
  };

  // Color variants
  const variantStyles = {
    primary: "bg-gradient-to-r from-[#ee0000] via-[#ff3333] to-[#ff4444] text-white hover:shadow-lg hover:scale-105",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    danger: "bg-red-600 text-white hover:bg-red-700",
    outline: "border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-white",
    ghost: "text-gray-700 hover:bg-gray-100",
    metallic:
      // Metallic primary inspired by components/ui/MetallicButton primary variant
      "relative bg-gradient-to-r from-[#ee0000] to-[#cc0000] text-white shadow-lg shadow-[#ee0000]/40 " +
      "hover:shadow-xl hover:shadow-[#ee0000]/50 transition-all duration-300 " +
      "before:absolute before:inset-0 before:rounded-lg before:bg-gradient-to-r " +
      "before:from-white/0 before:via-white/20 before:to-white/0 before:-translate-x-full hover:before:translate-x-full " +
      "before:transition-transform before:duration-700",
  };

  // Disabled styles
  const disabledStyles = "opacity-50 cursor-not-allowed hover:scale-100 hover:shadow-none";

  // Combine styles
  const buttonClasses = `
    ${baseStyles}
    ${sizeStyles[size]}
    ${variantStyles[variant]}
    ${disabled || loading ? disabledStyles : ""}
    ${fullWidth ? "w-full" : ""}
    ${className}
  `.trim();

  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={buttonClasses}>
      {/* Loading Spinner */}
      {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />}

      {/* Left Icon */}
      {Icon && iconPosition === "left" && !loading && <Icon className={`w-4 h-4 ${children ? "mr-2" : ""}`} />}

      {/* Button Text */}
      {children}

      {/* Right Icon */}
      {Icon && iconPosition === "right" && !loading && <Icon className={`w-4 h-4 ${children ? "ml-2" : ""}`} />}
    </button>
  );
};

export default Button;
