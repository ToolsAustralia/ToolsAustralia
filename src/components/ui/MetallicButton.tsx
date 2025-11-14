"use client";

import Link from "next/link";

interface MetallicButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  borderRadius?: "sm" | "md" | "lg" | "full";
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  // Allow secondary button to use different border colors
  borderColor?: "red" | "white";
}

export default function MetallicButton({
  children,
  href,
  onClick,
  variant = "primary",
  size = "md",
  borderRadius = "lg",
  className = "",
  icon,
  disabled = false,
  borderColor = "red",
}: MetallicButtonProps) {
  // Size classes
  const sizeClasses = {
    sm: "px-6 py-2 text-sm",
    md: "px-8 py-4 text-lg",
    lg: "px-10 py-5 text-xl",
  };

  // Border radius classes
  const radiusClasses = {
    sm: "rounded-lg",
    md: "rounded-xl",
    lg: "rounded-2xl",
    full: "rounded-full",
  };

  // Variant classes
  const variantClasses = {
    primary: `
      group relative
      bg-gradient-to-r from-[#ee0000] to-[#cc0000]
      text-white shadow-lg shadow-[#ee0000]/50
      hover:bg-red-700 hover:shadow-xl hover:shadow-[#ee0000]/60
      transition-all duration-300
      before:absolute before:inset-0 before:${radiusClasses[borderRadius]}
      before:bg-gradient-to-r before:from-white/0 before:via-white/20 before:to-white/0
      before:translate-x-[-100%] hover:before:translate-x-[100%]
      before:transition-transform before:duration-700
      overflow-hidden
    `,
    secondary: `
      group
      ${borderColor === "white" ? "border-2 border-white" : "border-2 border-[#ee0000]/50"}
      bg-white/10 backdrop-blur-sm
      text-white
      ${borderColor === "white" ? "hover:bg-white hover:text-black" : "hover:bg-[#ee0000]/20 hover:border-[#ee0000]"}
      transition-all duration-300
      shadow-lg shadow-black/20
    `,
  };

  const baseClasses = `
    inline-flex items-center justify-center gap-2
    font-semibold
    disabled:opacity-50 disabled:cursor-not-allowed
    focus:outline-none focus:ring-2 focus:ring-[#ee0000]/50 focus:ring-offset-2 focus:ring-offset-transparent
    ${sizeClasses[size]}
    ${radiusClasses[borderRadius]}
    ${variantClasses[variant]}
    ${className}
  `
    .trim()
    .replace(/\s+/g, " ");

  const content = (
    <>
      {icon && <span className={variant === "primary" ? "relative z-10" : ""}>{icon}</span>}
      <span className={variant === "primary" ? "relative z-10" : ""}>{children}</span>
    </>
  );

  // If href is provided, render as Link
  if (href && !disabled) {
    return (
      <Link href={href} className={baseClasses} onClick={onClick}>
        {content}
      </Link>
    );
  }

  // Otherwise render as button
  return (
    <button type="button" className={baseClasses} onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}
