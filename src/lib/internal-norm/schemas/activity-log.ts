import { z } from "zod";

// ─── activity-log.list ───────────────────────────────────────────────────────
// PII-safe paginated activity feed projection:
//   - firstName only (NO lastName)
//   - opaque userId (Mongo User._id)
//   - NO email, NO mobile
// Mirrors the admin activity feed but stripped to what Norm needs to reason
// about volume + recency + breakdown. Distinct from `dashboard.recent-activities`
// in that this surface is time-windowed (90 days) and filterable by type + search,
// whereas recent-activities returns the latest N candidates without filters.

const NormActivityLogTypeSchema = z.enum([
  "user_signup",
  "membership_purchase",
  "one_time_purchase",
  "upsell_accepted",
  "draw_complete",
  "high_value_order",
  "shop_order",
  "system_alert",
  "membership_upgrade",
  "subscription_past_due",
  "cancellation_offer_accepted",
  "admin_role_update",
  "affiliate_payout",
]);

const NormActivityLogStatusSchema = z.enum(["success", "info", "warning", "error"]);

const NormActivityLogRowSchema = z.object({
  id: z.string().describe("Stable per-activity ID for dedup"),
  type: NormActivityLogTypeSchema,
  firstName: z
    .string()
    .nullable()
    .describe("Actor firstName only; null for System events. lastName is intentionally stripped."),
  userId: z
    .string()
    .nullable()
    .describe("Opaque Mongo User._id; null for System events"),
  action: z.string().describe(
    "Human-readable action label; may include the affiliate / referral code or the mini-draw name"
  ),
  time: z.string().describe('Relative time-ago label (e.g. "3 min ago")'),
  timestamp: z.string().describe("ISO 8601 UTC"),
  status: NormActivityLogStatusSchema,
  amount: z.number().nullable().describe("AUD; null when not a money-movement activity"),
  miniDrawId: z.string().nullable().describe("Mongo MiniDraw._id for mini-draw entries; null otherwise"),
});

export const NormActivityLogSchema = z.object({
  activities: z.array(NormActivityLogRowSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative().describe("Total matching rows across all pages, after type/search filters"),
    nextCursor: z
      .string()
      .nullable()
      .describe("Opaque keyset cursor; pass as `cursor` to fetch the next (older) page. null when no more rows."),
    hasMore: z.boolean().describe("Whether more (older) rows exist beyond this page"),
  }),
});
