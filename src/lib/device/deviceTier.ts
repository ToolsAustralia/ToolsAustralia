export type ViewportTier = "mobile" | "tablet" | "desktop";

export interface CapabilityFlags {
  saveData: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
}

export function resolveViewportTier(width: number): ViewportTier {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function effectiveTier(
  viewport: ViewportTier,
  flags: Pick<CapabilityFlags, "saveData">
): ViewportTier {
  if (flags.saveData) return "mobile";
  return viewport;
}
