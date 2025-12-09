"use client";

import React from "react";

interface ModalContentProps {
  children: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
  scrollbar?: "metallic" | "default" | "none";
}

const ModalContent: React.FC<ModalContentProps> = ({
  children,
  padding = "lg",
  className = "",
  scrollbar = "metallic",
}) => {
  // Padding variants
  const paddingStyles = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-3 sm:p-6", // Responsive: small on mobile, large on sm and up
  };

  const scrollbarClass = scrollbar === "metallic" ? "modal-scrollbar" : scrollbar === "none" ? "scrollbar-hide" : "";

  return (
    <div
      className={`flex-1 overflow-y-auto ${scrollbarClass} ${paddingStyles[padding]} ${className}`}
      style={{
        // Ensure proper scrolling with flexbox
        minHeight: 0,
        // Smooth scrolling for better UX
        scrollBehavior: "smooth",
        // Enable touch scrolling on mobile
        touchAction: "pan-y",
      }}
    >
      {children}
    </div>
  );
};

export default ModalContent;
