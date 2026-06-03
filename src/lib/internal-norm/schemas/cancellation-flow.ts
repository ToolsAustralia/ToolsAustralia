import { z } from "zod";

const CANCELLATION_REASONS = [
  "too_expensive",
  "prefer_cheaper",
  "dont_use_benefits",
  "too_many_messages",
  "joined_for_giveaway",
  "havent_won",
  "other",
] as const;

const OFFER_TYPES = [
  "pause_30d",
  "discount_50_2mo",
  "tier_downgrade",
  "unsubscribe_marketing",
  "bonus_entries_100",
] as const;

const ReasonBreakdownSchema = z.object({
  count: z.number().int().nonnegative(),
  sharePct: z.number(),
  accepted: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  abandoned: z.number().int().nonnegative(),
});

const Retention90SplitSchema = z.object({
  retained: z.number().int().nonnegative(),
  churned: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
});

const FunnelSchema = z.object({
  reachedReason: z.number().int().nonnegative(),
  reachedOffer: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  abandoned: z.number().int().nonnegative(),
});

const OtherReasonEntrySchema = z.object({
  text: z.string(),
  startedAt: z.string(),
  outcome: z.enum(["in_progress", "saved", "cancelled"]),
});

export const NormCancellationFlowAnalyticsSchema = z.object({
  triggered: z.number().int().nonnegative(),
  byReason: z.object(
    Object.fromEntries(
      CANCELLATION_REASONS.map((r) => [r, ReasonBreakdownSchema])
    ) as Record<(typeof CANCELLATION_REASONS)[number], typeof ReasonBreakdownSchema>
  ),
  funnel: FunnelSchema,
  saveRate: z.number(),
  saveRatePct: z.number(),
  byOfferAccepted: z.object(
    Object.fromEntries(
      OFFER_TYPES.map((o) => [o, z.number().int().nonnegative()])
    ) as Record<(typeof OFFER_TYPES)[number], z.ZodNumber>
  ),
  pastDueExcludedFromOfferConversion: z.number().int().nonnegative(),
  retention90: Retention90SplitSchema,
  retention90ByOffer: z.object(
    Object.fromEntries(
      OFFER_TYPES.map((o) => [o, Retention90SplitSchema])
    ) as Record<(typeof OFFER_TYPES)[number], typeof Retention90SplitSchema>
  ),
  otherReasonTexts: z.array(OtherReasonEntrySchema),
});

/**
 * PII-safe Norm projection of the admin "users by reason" drill-down. Each row
 * is one CancellationFlowEvent. The underlying admin row carries
 * `userEmail` + `userLastName`; both are intentionally stripped here — Norm
 * user reads expose `firstName` + opaque `userId` ONLY.
 */
export const NormCancellationUsersByReasonSchema = z.object({
  rows: z.array(
    z.object({
      eventId: z.string(),
      userId: z.string().nullable().describe("Opaque user id; never email/PII."),
      firstName: z
        .string()
        .nullable()
        .describe("First name only — the only user PII Norm may see. email + lastName are intentionally stripped."),
      startedAt: z.string(),
      outcome: z.enum(["in_progress", "saved", "cancelled"]),
      reasonText: z.string().nullable(),
      // OfferType is a string union in @/models/CancellationFlowEvent, so a plain
      // nullable string is the correct shape here.
      offerAccepted: z.string().nullable(),
    }),
  ),
  totalCount: z.number().int().nonnegative(),
});
