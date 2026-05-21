/**
 * Display formatters for promo analytics UTM values.
 * Preserves data accuracy while improving readability in the admin UI.
 *
 * - Campaign: humanizes snake_case (e.g. black_friday_ad -> Black Friday Ad)
 * - Medium: displays Email, SMS, CPC etc. clearly for Klaviyo/Facebook
 */

const MEDIUM_DISPLAY: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  cpc: "CPC",
  ppc: "PPC",
  paid: "Paid",
  social: "Social",
  organic: "Organic",
  referral: "Referral",
  "(none)": "—",
  "": "—",
};

/**
 * Format utm_medium for display.
 * Klaviyo: email vs sms. Facebook: cpc, etc.
 */
export function formatMediumDisplay(value: string | undefined | null): string {
  if (value == null || value === "") return "—";
  const key = value.toLowerCase().trim();
  return MEDIUM_DISPLAY[key] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Format utm_campaign for display.
 * Humanizes snake_case: black_friday_ad -> Black Friday Ad
 * Facebook campaign_id fallback (fb_12345) -> Campaign 12345
 * Preserves pipes and hyphens: "Draw 4 | March Giveaway | Email 1", "Bid Cap - Mar 2025"
 */
export function formatCampaignDisplay(value: string | undefined | null): string {
  if (value == null || value === "") return "—";
  if (value === "(none)") return "—";
  if (value.startsWith("fb_")) {
    const id = value.slice(3);
    return id ? `Campaign ${id}` : "—";
  }
  // Replace underscores only; preserve | and - in campaign names
  return value
    .replace(/_/g, " ")
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
