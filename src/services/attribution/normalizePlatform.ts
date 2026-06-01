// src/services/attribution/normalizePlatform.ts
// Maps a (dirty) utm_source [+ utm_medium] to a canonical ConvertingPlatform.
// Dirty-UTM casing/aliasing is the #1 DIY-attribution failure mode — normalize here.
import type { ConvertingPlatform } from "@/types/attribution";

const SOURCE_ALIASES: Record<string, ConvertingPlatform> = {
  facebook: "meta", fb: "meta", instagram: "meta", ig: "meta", meta: "meta", fbig: "meta",
  tiktok: "tiktok", tt: "tiktok",
  snapchat: "snapchat", snap: "snapchat",
  google: "google", adwords: "google", googleads: "google",
};

/** Returns null when no source is present; "other" when present but unrecognized. */
export function normalizeUtmToPlatform(
  utmSource?: string | null,
  utmMedium?: string | null
): ConvertingPlatform | null {
  if (!utmSource) return null;
  const src = utmSource.toLowerCase().trim();
  if (!src) return null;

  if (src === "klaviyo") {
    const med = (utmMedium ?? "").toLowerCase().trim();
    if (med === "email") return "klaviyo_email";
    if (med === "sms") return "klaviyo_sms";
    return "other"; // whatsapp/push/unknown channel — not modeled
  }
  return SOURCE_ALIASES[src] ?? "other";
}
