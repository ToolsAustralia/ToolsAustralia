"use client";

import { useState, useEffect } from "react";
import { grantPixelConsent, revokePixelConsent, hasPixelConsent } from "@/components/PixelTracker";
// X icon removed - no close button allowed

interface PixelConsentModalProps {
  isOpen: boolean;
  onCloseAction: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
}

export default function PixelConsentModal({ isOpen, onCloseAction, onAccept, onDecline }: PixelConsentModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // Prevent body scrolling when modal is open
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    } else {
      // Add delay for smooth exit animation
      const timer = setTimeout(() => {
        setIsVisible(false);
        // Restore body scrolling when modal is closed
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.width = "";
      }, 300);
      return () => clearTimeout(timer);
    }

    // Cleanup function to restore scrolling if component unmounts
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
  }, [isOpen]);

  const handleAccept = () => {
    grantPixelConsent();
    onAccept?.();
    onCloseAction();
  };

  const handleDecline = () => {
    revokePixelConsent();
    onDecline?.();
    onCloseAction();
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4 transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden", // Prevent scrolling
      }}
    >
      {/* Animated Backdrop - NOT clickable, prevents background interaction */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none", // Prevent clicking through backdrop
        }}
      />

      {/* Modal Content - matching your site's design system */}
      <div
        className={`relative bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-md mx-auto overflow-hidden transform transition-all duration-300 ease-out ${
          isOpen ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"
        }`}
      >
        {/* Header with Tools Australia brand colors - NO CLOSE BUTTON */}
        <div
          className="px-6 py-4 text-white relative"
          style={{
            background: `linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)`,
          }}
        >
          <div className="flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-bold font-['Poppins']">Privacy & Analytics</h2>
              <p className="text-sm text-white/80 mt-1">Please choose your preference</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-6">
            {/* Required Choice Notice */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-5 h-5 text-yellow-600">⚠️</div>
                <p className="text-sm text-yellow-800 font-medium">Please choose your preference to continue</p>
              </div>
            </div>

            <p className="text-gray-700 mb-4 leading-relaxed">
              We use analytics and advertising pixels to improve your experience and show you relevant content. This
              helps us understand how you use our website and personalize your experience.
            </p>

            <div className="space-y-4">
              <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0">
                  <div className="w-3 h-3 bg-blue-500 rounded-full mt-1"></div>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Facebook Pixel</h4>
                  <p className="text-sm text-gray-600">Tracks website interactions for advertising and analytics</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0">
                  <div className="w-3 h-3 bg-red-500 rounded-full mt-1"></div>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">TikTok Pixel</h4>
                  <p className="text-sm text-gray-600">Measures advertising effectiveness and user engagement</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-500 mt-4">
              You can change your preferences at any time in your browser settings or contact us for assistance.
            </p>
          </div>

          {/* Actions - matching your site's button styles */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleAccept}
              className="flex-1 bg-red-600 text-white px-6 py-3 rounded-full font-medium hover:bg-red-700 transition-colors duration-200"
            >
              Accept All
            </button>
            <button
              onClick={handleDecline}
              className="flex-1 border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-full font-medium hover:bg-gray-50 transition-colors duration-200"
            >
              Decline
            </button>
          </div>

          {/* Privacy Policy Link */}
          <div className="mt-4 text-center">
            <a href="/privacy-policy" className="text-sm text-red-600 hover:text-red-800 underline transition-colors">
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook to manage pixel consent
export function usePixelConsent() {
  const [showConsent, setShowConsent] = useState(false);
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    // Check if user has already given consent
    const consent = hasPixelConsent();
    setHasConsent(consent);

    // Show consent modal if no consent given and not in development
    if (!consent && process.env.NODE_ENV === "production") {
      setShowConsent(true);
    }
  }, []);

  const handleAccept = () => {
    setHasConsent(true);
    setShowConsent(false);
  };

  const handleDecline = () => {
    setHasConsent(false);
    setShowConsent(false);
  };

  const handleClose = () => {
    setShowConsent(false);
  };

  return {
    showConsent,
    hasConsent,
    handleAccept,
    handleDecline,
    handleClose,
  };
}
