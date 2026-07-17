/**
 * Shared Zod schema for attribution params in API request bodies.
 *
 * @see docs/PAYMENT_ATTRIBUTION.md
 */

import { z } from "zod";

export const attributionSchema = z
  .object({
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_content: z.string().optional(),
    utm_term: z.string().optional(),
    campaign_id: z.string().optional(),
    adset_id: z.string().optional(),
    ad_id: z.string().optional(),
    packages_focus: z.literal("one-time").optional(),
  })
  .optional();
