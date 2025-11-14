"use client";

import React from "react";

interface ModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full";
  height?: "auto" | "screen" | "fixed";
  fixedHeight?: string;
  closeOnBackdrop?: boolean;
  className?: string;
}

const ModalContainer: React.FC<ModalContainerProps> = ({
  isOpen,
  onClose,
  children,
  size = "lg",
  height = "auto",
  fixedHeight,
  closeOnBackdrop = true,
  className = "",
}) => {
  // Size variants
  const sizeStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    full: "max-w-full",
  };

  // Height variants
  const heightStyles = {
    auto: "max-h-[95dvh]",
    screen: "h-screen-dvh",
    fixed: fixedHeight || "h-[90dvh]",
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={closeOnBackdrop ? onClose : undefined} />

      {/* Modal */}
      <div
        className={`
        relative bg-white rounded-2xl shadow-2xl w-full mx-auto overflow-hidden flex flex-col
        ${sizeStyles[size]}
        ${heightStyles[height]}
        ${className}
      `}
      >
        {children}
      </div>
    </div>
  );
};

export default ModalContainer;
