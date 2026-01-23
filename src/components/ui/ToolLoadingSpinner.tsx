"use client";

import React from "react";

interface ToolLoadingSpinnerProps {
  message?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "wrench" | "gear" | "drill";
  className?: string;
}

/**
 * Tool-themed loading spinner with metallic red and metallic colors
 * Perfect for tool-related websites - shows rotating tool animation
 */
export const ToolLoadingSpinner: React.FC<ToolLoadingSpinnerProps> = ({
  message = "Loading payment form...",
  size = "md",
  variant = "wrench",
  className = "",
}) => {
  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-16 h-16",
    lg: "w-24 h-24",
    xl: "w-32 h-32",
  };

  const iconSizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-20 h-20",
    xl: "w-28 h-28",
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
    xl: "text-lg",
  };

  // Render different tool variants
  const renderTool = () => {
    switch (variant) {
      case "wrench":
        return (
          <svg
            className={`${iconSizeClasses[size]} text-[#ee0000] drop-shadow-[0_0_8px_rgba(238,0,0,0.6)]`}
            fill="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
          </svg>
        );
      case "gear":
        return (
          <svg
            className={`${iconSizeClasses[size]} text-[#ee0000] drop-shadow-[0_0_8px_rgba(238,0,0,0.6)]`}
            fill="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        );
      case "drill":
        return (
          <svg
            className={`${iconSizeClasses[size]} text-[#ee0000] drop-shadow-[0_0_8px_rgba(238,0,0,0.6)]`}
            fill="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M19.89 9.38c.08-.16.12-.33.12-.51 0-.18-.04-.35-.12-.51l-1.97-3.42c-.19-.33-.58-.47-.91-.28l-3.42 1.97c-.16.09-.33.12-.51.12s-.35-.04-.51-.12L8.91 4.66c-.33-.19-.72-.05-.91.28L6.03 8.36c-.08.16-.12.33-.12.51s.04.35.12.51l1.97 3.42c.19.33.58.47.91.28l3.42-1.97c.16-.09.33-.12.51-.12s.35.04.51.12l3.42 1.97c.33.19.72.05.91-.28l1.97-3.42zm-1.89 4.62c-.55 0-1 .45-1 1v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1zm-6 0c-.55 0-1 .45-1 1v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1zm-6 0c-.55 0-1 .45-1 1v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center space-y-4 py-8 relative ${className}`}>
      {/* Metallic outer ring with glow */}
      <div className="relative">
        {/* Outer metallic ring - rotating */}
        <div
          className={`${sizeClasses[size]} rounded-full border-4 border-transparent relative`}
          style={{
            background: `linear-gradient(white, white) padding-box,
                        linear-gradient(135deg, #1f2937 0%, #374151 25%, #4b5563 50%, #374151 75%, #1f2937 100%) border-box`,
            boxShadow: `
              inset 0 0 20px rgba(0, 0, 0, 0.3),
              0 0 20px rgba(31, 41, 55, 0.5),
              0 0 40px rgba(31, 41, 55, 0.3)
            `,
          }}
        >
          {/* Inner red metallic ring - counter-rotating */}
          <div
            className="absolute inset-2 rounded-full border-2 border-transparent"
            style={{
              background: `linear-gradient(white, white) padding-box,
                          linear-gradient(135deg, #ee0000 0%, #cc0000 25%, #b91c1c 50%, #cc0000 75%, #ee0000 100%) border-box`,
              boxShadow: `
                inset 0 0 15px rgba(238, 0, 0, 0.4),
                0 0 15px rgba(238, 0, 0, 0.5),
                0 0 30px rgba(238, 0, 0, 0.3)
              `,
              animation: "spin-reverse 2s linear infinite",
            }}
          />
        </div>

        {/* Tool icon - centered and rotating */}
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
          style={{
            animation: variant === "gear" ? "spin-fast 1.2s linear infinite" : "spin 1.5s linear infinite",
          }}
        >
          {renderTool()}
        </div>

        {/* Metallic shine effect - rotating overlay */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `linear-gradient(
              135deg,
              transparent 0%,
              rgba(255, 255, 255, 0.1) 25%,
              transparent 50%,
              rgba(255, 255, 255, 0.1) 75%,
              transparent 100%
            )`,
            animation: "spin-slow 3s linear infinite",
          }}
        />
      </div>

      {/* Loading message with metallic text effect */}
      <div className="text-center space-y-1">
        <p
          className={`${textSizeClasses[size]} font-semibold`}
          style={{
            background: "linear-gradient(135deg, #ee0000 0%, #cc0000 50%, #ee0000 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            textShadow: "0 0 20px rgba(238, 0, 0, 0.3)",
          }}
        >
          {message}
        </p>
        <p className={`${textSizeClasses[size]} text-gray-600 font-medium`}>Please wait...</p>
      </div>

      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes spin {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }

        @keyframes spin-reverse {
          from {
            transform: rotate(360deg);
          }
          to {
            transform: rotate(0deg);
          }
        }

        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes spin-fast {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default ToolLoadingSpinner;
