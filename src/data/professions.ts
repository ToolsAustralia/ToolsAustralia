/**
 * Profession Options for User Profile
 *
 * List of available professions that users can select during profile setup.
 * When "Other" is selected, users can input a custom profession value.
 */

export interface ProfessionOption {
  value: string;
  label: string;
}

/**
 * Available profession options
 * These match the predefined list of professions for the user setup modal
 */
export const PROFESSIONS: ProfessionOption[] = [
  { value: "Builder", label: "Builder" },
  { value: "Electrician", label: "Electrician" },
  { value: "Plumber", label: "Plumber" },
  { value: "Construction", label: "Construction" },
  { value: "Mechanic", label: "Mechanic" },
  { value: "Landscaper", label: "Landscaper" },
  { value: "Welder", label: "Welder" },
  { value: "Bricklayer", label: "Bricklayer" },
  { value: "Concreter", label: "Concreter" },
  { value: "Fitter & Turner", label: "Fitter & Turner" },
  { value: "Painter", label: "Painter" },
  { value: "Other", label: "Other" },
];

/**
 * Check if a profession value is a predefined option (not a custom "Other" value)
 * @param profession - The profession value to check
 * @returns true if the profession is a predefined option, false if it's a custom value
 */
export function isPredefinedProfession(profession: string | undefined): boolean {
  if (!profession) return false;
  return PROFESSIONS.some((p) => p.value === profession && p.value !== "Other");
}

/**
 * Check if a profession is the "Other" option
 * @param profession - The profession value to check
 * @returns true if the profession is "Other"
 */
export function isOtherProfession(profession: string | undefined): boolean {
  return profession === "Other";
}

/**
 * Get the display label for a profession
 * @param profession - The profession value
 * @returns The display label or the profession value itself if not found
 */
export function getProfessionLabel(profession: string | undefined): string {
  if (!profession) return "";
  const option = PROFESSIONS.find((p) => p.value === profession);
  return option ? option.label : profession;
}
