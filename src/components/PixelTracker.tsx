"use client";

import { useEffect, useState } from "react";
import FacebookPixel from "./FacebookPixel";
import TikTokPixel from "./TikTokPixel";

interface PixelTrackerProps {
  facebookPixelId?: string;
  tiktokPixelId?: string;
  disabled?: boolean;
  enableConsent?: boolean;
}

export default function PixelTracker({
  facebookPixelId,
  tiktokPixelId,
  disabled = false,
  enableConsent = false,
}: PixelTrackerProps) {
  const [consentGiven, setConsentGiven] = useState(true); // Always true - auto-accept

  useEffect(() => {
    // ✅ AUTO-ACCEPT: Automatically grant pixel consent for all users
    if (typeof window !== "undefined") {
      // Always grant consent automatically
      localStorage.setItem("pixel-consent", "accepted");
      setConsentGiven(true);

      // Enable cookies for both pixels immediately
      if (window.fbq) {
        window.fbq("consent", "grant");
      }
      if (window.ttq) {
        window.ttq.grantConsent();
      }

      console.log("📊 Pixel consent automatically granted for all users");
    }
  }, []);

  // Always render pixels since consent is auto-granted

  return (
    <>
      {facebookPixelId && <FacebookPixel pixelId={facebookPixelId} disabled={disabled} />}
      {tiktokPixelId && <TikTokPixel pixelId={tiktokPixelId} disabled={disabled} />}
    </>
  );
}

// Consent management functions - AUTO-ACCEPT MODE
export const grantPixelConsent = () => {
  if (typeof window !== "undefined") {
    localStorage.setItem("pixel-consent", "accepted");

    // Enable cookies for both pixels
    if (window.fbq) {
      window.fbq("consent", "grant");
    }
    if (window.ttq) {
      window.ttq.grantConsent();
    }

    console.log("📊 Pixel consent granted (auto-accept mode)");
  }
};

export const revokePixelConsent = () => {
  // ✅ DISABLED: Consent cannot be revoked in auto-accept mode
  console.log("⚠️ Pixel consent revocation disabled - auto-accept mode enabled");
};

export const hasPixelConsent = (): boolean => {
  // ✅ AUTO-ACCEPT: Always return true
  return true;
};
