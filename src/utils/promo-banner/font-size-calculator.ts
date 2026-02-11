/**
 * Font Size Calculator Utility
 * 
 * Calculates dynamic font size based on text length to ensure
 * perfect fit on both mobile and desktop devices.
 * 
 * Reference: "First 500 People" (16 chars) = 12px mobile / 16px desktop
 */

const BASE_MOBILE = 12;
const BASE_DESKTOP = 16;
const REFERENCE_LENGTH = 16;
const SCALE_FACTOR = 0.9; // Slight reduction for longer texts
const MIN_MOBILE = 8;
const MAX_MOBILE = 14;
const MAX_MOBILE_NARROW = 13; // 360px and below when scrolled (rounded banner)
const MIN_DESKTOP = 10;
const MAX_DESKTOP = 20;

/**
 * Calculate font size based on text length
 * @param text - The text to calculate font size for
 * @param isMobile - Whether the device is mobile
 * @param isNarrow - Optional: true when viewport is 360px or less (smaller badge text)
 * @returns Font size as CSS string (e.g., "12px")
 */
export function calculateFontSize(text: string, isMobile: boolean, isNarrow?: boolean): string {
  const textLength = text.length;
  const base = isMobile ? BASE_MOBILE : BASE_DESKTOP;
  const min = isMobile ? MIN_MOBILE : MIN_DESKTOP;
  const max =
    isMobile && isNarrow ? MAX_MOBILE_NARROW : isMobile ? MAX_MOBILE : MAX_DESKTOP;

  const size = base * (REFERENCE_LENGTH / textLength) * SCALE_FACTOR;
  const clamped = Math.max(min, Math.min(max, size));

  return `${clamped}px`;
}

