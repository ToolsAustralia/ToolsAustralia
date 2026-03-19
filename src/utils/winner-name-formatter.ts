import { formatNamePart } from "@/utils/display-name";

/**
 * Winner Name Formatter Utility
 * 
 * Provides privacy-compliant name formatting for winner displays.
 * Formats names as "First Name + First Letter of Last Name" (e.g., "John D.")
 * Name parts are displayed with first letter uppercase, rest lowercase.
 */

/**
 * Formats a winner's name for privacy-compliant display
 * Returns "First Name + First Letter of Last Name" (e.g., "John D.")
 * 
 * @param firstName - Winner's first name
 * @param lastName - Winner's last name (optional)
 * @returns Formatted name string
 */
export function formatWinnerName(firstName: string, lastName?: string): string {
  if (!firstName || firstName.trim().length === 0) {
    return "Anonymous";
  }

  const formattedFirst = formatNamePart(firstName);
  if (!lastName || lastName.trim().length === 0) {
    return formattedFirst;
  }

  const firstLetter = lastName.trim().charAt(0).toUpperCase();
  return `${formattedFirst} ${firstLetter}.`;
}

/**
 * Formats a full name string into privacy-compliant format
 * Handles cases where name might be "John Doe" or separate fields
 * 
 * @param fullName - Full name string
 * @returns Formatted name string
 */
export function formatWinnerNameFromString(fullName: string): string {
  if (!fullName || fullName.trim().length === 0) {
    return "Anonymous";
  }

  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return formatNamePart(parts[0]);
  }

  const firstName = formatNamePart(parts[0]);
  const lastName = parts[parts.length - 1];
  const firstLetter = lastName.charAt(0).toUpperCase();
  return `${firstName} ${firstLetter}.`;
}

