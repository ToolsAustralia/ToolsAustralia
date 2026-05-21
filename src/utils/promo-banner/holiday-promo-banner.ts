/**
 * Easter long weekend 2026 — left promo banner art under `public/images/promoBanner/{Brand}/Holiday/`.
 * Dates are evaluated in Australia/Sydney (AEST/AEDT), consistent with the rest of promo scheduling.
 */

import { formatInTimeZone } from "date-fns-tz";
import type { PromoBannerAssetBrand } from "./resolve-promo-banner-asset-brand";

const AEST_TIMEZONE = "Australia/Sydney";

/** Campaign year (user request: “this year” → site user-info 2026). */
export const HOLIDAY_PROMO_CAMPAIGN_YEAR = 2026;

const SESSION_STORAGE_KEY = "toolsau-promo-holiday-dev-slot";
const SESSION_STORAGE_TOOLBAR_HIDDEN_KEY = "toolsau-promo-holiday-dev-toolbar-hidden";

export type HolidayPromoSlot =
  | "good-friday"
  | "good-friday-extended"
  | "easter"
  | "easter-extended";

const SLOT_TO_FILE: Record<HolidayPromoSlot, string> = {
  "good-friday": "good-friday-promo.webp",
  "good-friday-extended": "good-friday-promo-extended.webp",
  easter: "easter-promo.webp",
  "easter-extended": "easter-promo-extended.webp",
};

const HOLIDAY_ALT: Record<HolidayPromoSlot, string> = {
  "good-friday": "Good Friday promotional bonus entries",
  "good-friday-extended": "Good Friday extended promotional bonus entries",
  easter: "Easter promotional bonus entries",
  "easter-extended": "Easter extended promotional bonus entries",
};

const DEFAULT_BRAND_FOLDER: PromoBannerAssetBrand = "Milwaukee";

/** Ordered URLs: active theme brand → Milwaukee (always has Holiday set in repo). */
export function buildHolidayPromoBannerPaths(
  brand: PromoBannerAssetBrand,
  slot: HolidayPromoSlot
): string[] {
  const file = SLOT_TO_FILE[slot];
  const primary = `/images/promoBanner/${brand}/Holiday/${file}`;
  const out: string[] = [primary];
  if (brand !== DEFAULT_BRAND_FOLDER) {
    out.push(`/images/promoBanner/${DEFAULT_BRAND_FOLDER}/Holiday/${file}`);
  }
  return out;
}

export function holidayPromoAltText(slot: HolidayPromoSlot): string {
  return HOLIDAY_ALT[slot];
}

/**
 * Apr 3–6 2026 (Australia/Sydney calendar date): GF → GF ext → Easter → Easter ext.
 * Uses the local calendar day in Sydney (handles AEDT), so each asset stays on-screen
 * for the whole day until the next Sydney midnight, then switches.
 */
export function getActiveHolidayPromoSlot(now: Date = new Date()): HolidayPromoSlot | null {
  try {
    const year = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
    const month = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
    const day = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
    if (year !== HOLIDAY_PROMO_CAMPAIGN_YEAR || month !== 4) return null;
    const byDay: Record<number, HolidayPromoSlot> = {
      3: "good-friday",
      4: "good-friday-extended",
      5: "easter",
      6: "easter-extended",
    };
    return byDay[day] ?? null;
  } catch {
    return null;
  }
}

/** Parse `promoHoliday` query / session value (dev preview). */
export function parseHolidayPromoDevParam(raw: string | null): HolidayPromoSlot | null {
  if (raw == null || raw === "") return null;
  const n = raw.trim().toLowerCase();
  const aliases: Record<string, HolidayPromoSlot> = {
    "good-friday": "good-friday",
    goodfriday: "good-friday",
    gf: "good-friday",
    "1": "good-friday",
    "good-friday-extended": "good-friday-extended",
    "goodfriday-extended": "good-friday-extended",
    gfe: "good-friday-extended",
    "2": "good-friday-extended",
    easter: "easter",
    e: "easter",
    "3": "easter",
    "easter-extended": "easter-extended",
    easterextended: "easter-extended",
    ee: "easter-extended",
    "4": "easter-extended",
  };
  return aliases[n] ?? null;
}

export function readHolidayPromoDevSessionSlot(): HolidayPromoSlot | null {
  if (typeof window === "undefined") return null;
  try {
    return parseHolidayPromoDevParam(sessionStorage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeHolidayPromoDevSessionSlot(slot: HolidayPromoSlot | null): void {
  if (typeof window === "undefined") return;
  try {
    if (slot) sessionStorage.setItem(SESSION_STORAGE_KEY, slot);
    else sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** First client paint: URL `promoHoliday=` wins and persists; else session. */
export function readInitialHolidayDevSlotForClient(): HolidayPromoSlot | null {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return null;
  const fromUrl = parseHolidayPromoDevParam(new URLSearchParams(window.location.search).get("promoHoliday"));
  if (fromUrl) {
    writeHolidayPromoDevSessionSlot(fromUrl);
    return fromUrl;
  }
  return readHolidayPromoDevSessionSlot();
}

export function readHolidayDevToolbarHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SESSION_STORAGE_TOOLBAR_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeHolidayDevToolbarHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (hidden) sessionStorage.setItem(SESSION_STORAGE_TOOLBAR_HIDDEN_KEY, "1");
    else sessionStorage.removeItem(SESSION_STORAGE_TOOLBAR_HIDDEN_KEY);
  } catch {
    /* ignore */
  }
}

export type PromoHolidayDevToolbarItem = {
  slot: HolidayPromoSlot;
  shortLabel: string;
  hint: string;
};

/** Dev toolbar: order matches calendar progression. */
export const PROMO_HOLIDAY_DEV_ITEMS: PromoHolidayDevToolbarItem[] = [
  { slot: "good-friday", shortLabel: "GF", hint: "3 Apr — Good Friday (standard)" },
  { slot: "good-friday-extended", shortLabel: "GF+", hint: "4 Apr — Good Friday extended" },
  { slot: "easter", shortLabel: "Easter", hint: "5 Apr — Easter" },
  { slot: "easter-extended", shortLabel: "E+", hint: "6 Apr — Easter extended" },
];
