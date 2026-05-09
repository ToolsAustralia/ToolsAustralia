"use client";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  resolveViewportTier,
  effectiveTier,
  type ViewportTier,
  type CapabilityFlags,
} from "@/lib/device/deviceTier";

// Note: reducedMotion is exposed for JS-side branching only. CSS uses
// @media (prefers-reduced-motion: reduce) directly; <DeviceTierProvider>
// does NOT write data-reduced-motion to <html>.
export interface DeviceProfile {
  tier: ViewportTier;
  viewportTier: ViewportTier;
  flags: CapabilityFlags;
}

const initial: DeviceProfile = {
  tier: "desktop",
  viewportTier: "desktop",
  flags: { saveData: false, reducedMotion: false, reducedTransparency: false },
};

export function useDeviceProfile(): DeviceProfile {
  const reducedMotionFM = useReducedMotion();
  const [profile, setProfile] = useState<DeviceProfile>(initial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqlReducedTransparency = window.matchMedia(
      "(prefers-reduced-transparency: reduce)"
    );

    const compute = (): DeviceProfile => {
      const w = window.innerWidth;
      const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
      const flags: CapabilityFlags = {
        saveData: !!conn?.saveData,
        reducedMotion: !!reducedMotionFM,
        reducedTransparency: mqlReducedTransparency.matches,
      };
      const vt = resolveViewportTier(w);
      return { viewportTier: vt, tier: effectiveTier(vt, flags), flags };
    };

    setProfile(compute());

    let raf = 0;
    const onChange = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setProfile(compute());
      });
    };

    window.addEventListener("resize", onChange, { passive: true });
    mqlReducedTransparency.addEventListener("change", onChange);
    const conn = (navigator as unknown as { connection?: { addEventListener?: (e: string, h: () => void) => void; removeEventListener?: (e: string, h: () => void) => void } }).connection;
    conn?.addEventListener?.("change", onChange);

    return () => {
      window.removeEventListener("resize", onChange);
      mqlReducedTransparency.removeEventListener("change", onChange);
      conn?.removeEventListener?.("change", onChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reducedMotionFM]);

  return profile;
}
