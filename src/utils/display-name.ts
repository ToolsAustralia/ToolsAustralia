/**
 * Display name formatting utilities.
 * Ensures first letter uppercase and rest lowercase for consistent display across the site.
 */

/**
 * Formats a single name part (e.g. first name or last name).
 * First character uppercase, rest lowercase.
 */
export function formatNamePart(s: string | undefined | null): string {
  if (s == null || typeof s !== "string") return "";
  const trimmed = s.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Formats full display name from first and last name.
 * Each part: first letter uppercase, rest lowercase.
 */
export function formatDisplayName(
  firstName: string | undefined | null,
  lastName?: string | undefined | null
): string {
  const first = formatNamePart(firstName);
  const last = formatNamePart(lastName);
  return [first, last].filter(Boolean).join(" ") || "";
}

/**
 * Two-letter monogram initials from first + last name (uppercase).
 * Falls back to "TA" when no usable letters are present.
 */
export function getInitials(
  firstName: string | undefined | null,
  lastName?: string | undefined | null
): string {
  const initials = `${firstName?.trim()?.[0] ?? ""}${lastName?.trim()?.[0] ?? ""}`.toUpperCase();
  return initials || "TA";
}
