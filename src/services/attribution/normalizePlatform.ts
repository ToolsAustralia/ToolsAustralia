// src/services/attribution/normalizePlatform.ts
// Maps a (dirty) utm_source [+ utm_medium] to a canonical ConvertingPlatform.
// Dirty-UTM casing/aliasing is the #1 DIY-attribution failure mode — normalize here.
import type { ConvertingPlatform } from "@/types/attribution";

const SOURCE_ALIASES: Record<string, ConvertingPlatform> = {
  // Meta — clean forms + the domain/referrer forms real ad traffic actually carries.
  // e.g. utm_source=facebook.com on paid CPC accounts for 7,300+ historical rows; without
  // these, Meta acquisition revenue is silently mis-bucketed to "other" and ROAS understated.
  facebook: "meta", fb: "meta", instagram: "meta", ig: "meta", meta: "meta", fbig: "meta",
  "facebook.com": "meta", "m.facebook.com": "meta", "l.facebook.com": "meta",
  "lm.facebook.com": "meta", "web.facebook.com": "meta", "business.facebook.com": "meta",
  "fb.com": "meta", "instagram.com": "meta", "m.instagram.com": "meta",
  "l.instagram.com": "meta", "ig.com": "meta",
  // TikTok
  tiktok: "tiktok", tt: "tiktok", "tiktok.com": "tiktok", "www.tiktok.com": "tiktok", "vm.tiktok.com": "tiktok",
  // Snapchat
  snapchat: "snapchat", snap: "snapchat", "snapchat.com": "snapchat",
  // Google (paid). NOTE: organic "google.com" is intentionally NOT mapped — that would credit
  // organic search to the paid Google channel (reserved for gclid). Only paid forms map here.
  google: "google", adwords: "google", googleads: "google", "googleadservices.com": "google",
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
