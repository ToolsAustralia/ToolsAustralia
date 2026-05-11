"use client";
import { useEffect } from "react";
import { useDeviceProfile } from "@/hooks/useDeviceProfile";

export default function DeviceTierProvider() {
  const profile = useDeviceProfile();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tier = profile.tier;
    root.dataset.viewportTier = profile.viewportTier;
    root.dataset.saveData = profile.flags.saveData ? "true" : "false";
    root.dataset.reducedTransparency = profile.flags.reducedTransparency
      ? "true"
      : "false";
  }, [profile]);
  return null;
}
