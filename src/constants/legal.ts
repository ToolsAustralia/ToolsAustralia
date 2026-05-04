/**
 * Legal Constants
 * 
 * Centralized legal identifiers and license numbers.
 * Update these values when legal requirements change.
 * 
 * @module legal
 */

/**
 * NSW Trade Promotion Notification Number
 * Required for major giveaways in NSW
 */
export const NTP_NUMBER = "NTP/16579";

/**
 * NSW Trade Promotion License Number
 * Required for operating trade promotions in NSW
 */
export const NSW_LICENSE = "TP/04720";

/**
 * Full notification text for major giveaway
 */
export const MAJOR_GIVEAWAY_NOTIFICATION = `Notification Number: ${NTP_NUMBER} (Major Giveaway)`;

/**
 * Full license text for NSW compliance
 */
export const NSW_LICENSE_TEXT = `Authorised under NSW License ${NSW_LICENSE}`;

/**
 * Combined legal text for terms and conditions
 */
export const LEGAL_COMPLIANCE_TEXT = `${NSW_LICENSE_TEXT}. Notification Number: ${NTP_NUMBER}`;
