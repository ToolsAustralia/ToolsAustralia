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
      className={`modal-panel-body flex-1 overflow-y-auto min-h-0 bg-white dark:bg-neutral-950 dark:border-t dark:border-neutral-800/80 text-gray-700 dark:text-neutral-200 antialiased ${scrollbarClass} ${paddingStyles[padding]} ${className}`}
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
