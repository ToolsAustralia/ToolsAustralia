/**
 * Shared date formatting for gap period / gates closed display.
 * Used by PromoBanner and GateClosedModal.
 */

/**
 * Format activation date for display (e.g. "Tuesday, 28 January 2025 at 5:30pm")
 * @param dateString - ISO date string or null
 * @returns Formatted string in en-AU locale, or empty string if invalid
 */
export function formatActivationDate(dateString: string | null): string {
  if (!dateString) return "";

  try {
    const date = new Date(dateString);

    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };

    return date.toLocaleDateString("en-AU", options);
  } catch (error) {
    console.error("Error formatting activation date:", error);
    return dateString;
  }
}
