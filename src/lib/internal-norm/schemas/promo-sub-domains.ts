// src/lib/internal-norm/schemas/promo-sub-domains.ts
//
// Norm response schemas for the promo sub-domain collections — distinct from
// the core toggle-system `Promo` rows in `schemas/promo.ts`:
//
//   - AlternatingPromoMultiplier  (rotating 2-multiplier configs per type)
//   - PromoBannerText             (left-column banner image schedules)
//   - BonusEntryPromo             (date-bounded bonus-entry campaigns)
//   - PromoLink                   (shareable bonus-entry codes)
//   - ScheduledPromo              (date-bounded multiplier phases)
//
// Conservative projection — Mongo ObjectIds expose as opaque strings,
// `createdBy` collapses to `{id, name, email}` (admin-internal metadata,
// not customer PII), Date fields serialise to ISO 8601 strings.
import { z } from "zod";

const PROMO_TYPES = ["membership-packages", "one-time-packages", "mini-packages"] as const;

const CreatedByStubSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  })
  .nullable();

// ─── promo.alternating-multiplier.list ────────────────────────────────────────
//
// One config per package type (the model enforces `unique: true` on `type`).
// `multipliers` is a fixed-length tuple of exactly two values; the resolver
// alternates between them based on the daily cadence.

const AlternatingMultiplierRowSchema = z.object({
  id: z.string(),
  type: z.enum(PROMO_TYPES),
  multipliers: z.tuple([z.number(), z.number()]),
  isEnabled: z.boolean(),
  description: z.string().optional(),
  createdAt: z.string(),                         // ISO 8601
  updatedAt: z.string(),                         // ISO 8601
  createdBy: CreatedByStubSchema,
});

export const NormPromoAlternatingMultiplierListSchema = z.object({
  data: z.array(AlternatingMultiplierRowSchema),
  count: z.number().int().nonnegative(),
});

// ─── promo.banner-text.list / promo.banner-text.active ───────────────────────
//
// `startDate` / `endDate` are AEST-converted at the service boundary, so the
// ISO strings on the wire reflect AEST clock-time (not UTC). Recurring schedules
// may omit start/end entirely.

const RECURRENCE_PATTERNS = [
  "weekdays",
  "weekends",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const PromoBannerTextRowSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  altText: z.string().optional(),
  scheduleType: z.enum(["one-time", "recurring"]),
  startDate: z.string().nullable(),              // ISO 8601 (AEST-shifted) or null for recurring schedules without bounds
  endDate: z.string().nullable(),                // ISO 8601 (AEST-shifted) or null
  recurrencePattern: z.enum(RECURRENCE_PATTERNS).optional(),
  isActive: z.boolean(),
  description: z.string().optional(),
  createdAt: z.string(),                         // ISO 8601
  updatedAt: z.string(),                         // ISO 8601
  createdBy: CreatedByStubSchema,
});

export const NormPromoBannerTextListSchema = z.object({
  data: z.array(PromoBannerTextRowSchema),
  count: z.number().int().nonnegative(),
});

export const NormPromoBannerTextActiveSchema = z.object({
  data: PromoBannerTextRowSchema.nullable(),
});

// ─── promo.bonus-entry.list / promo.bonus-entry.active ───────────────────────
//
// `isCurrentlyActive` / `isUpcoming` / `isExpired` are derived server-side
// from `isActive` ∧ `startDate ≤ now ≤ endDate` etc., so Norm doesn't need to
// recompute date logic.

const BonusEntryPromoRowSchema = z.object({
  id: z.string(),
  type: z.enum(PROMO_TYPES),
  bonusEntries: z.number().int().positive(),
  startDate: z.string(),                         // ISO 8601 (UTC; represents AEST clock time)
  endDate: z.string(),                           // ISO 8601 (UTC; represents AEST clock time)
  isActive: z.boolean(),
  isCurrentlyActive: z.boolean(),
  isUpcoming: z.boolean(),
  isExpired: z.boolean(),
  description: z.string().optional(),
  createdAt: z.string(),                         // ISO 8601
  updatedAt: z.string(),                         // ISO 8601
  createdBy: CreatedByStubSchema,
});

export const NormPromoBonusEntryListSchema = z.object({
  data: z.array(BonusEntryPromoRowSchema),
  count: z.number().int().nonnegative(),
});

export const NormPromoBonusEntryActiveSchema = z.object({
  data: BonusEntryPromoRowSchema.nullable(),
});

// ─── promo.link.list ──────────────────────────────────────────────────────────
//
// `usedByCount` is the cardinality of the `usedBy` array (one-time-use
// enforcement) and is bounded by `usageCount`. `eligibilityRules` may be absent
// entirely on legacy rows.

const PromoLinkRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  bonusEntries: z.number().int().positive(),
  expiresAt: z.string().nullable(),              // ISO 8601 or null
  isActive: z.boolean(),
  appliesToMembership: z.boolean(),
  appliesToOneTime: z.boolean(),
  campaignType: z.enum(["general", "cancelled-membership-comeback"]),
  eligibilityAudience: z.enum(["all", "cancelled-members"]),
  eligibilityRules: z
    .object({
      requireInactiveSubscription: z.boolean().optional(),
      cancelledWithinDays: z.number().int().positive().optional(),
    })
    .optional(),
  isExpired: z.boolean(),
  description: z.string().optional(),
  usageCount: z.number().int().nonnegative(),
  usedByCount: z.number().int().nonnegative(),
  createdAt: z.string(),                         // ISO 8601
  updatedAt: z.string(),                         // ISO 8601
  createdBy: CreatedByStubSchema,
});

export const NormPromoLinkListSchema = z.object({
  data: z.array(PromoLinkRowSchema),
  count: z.number().int().nonnegative(),
});

// ─── promo.scheduled.list ────────────────────────────────────────────────────
//
// Soft-deleted rows are excluded by default (the service mirrors the admin
// `includeDeleted=false` default). Within the resolver priority chain,
// scheduled promos beat the toggle system.

const ScheduledPromoRowSchema = z.object({
  id: z.string(),
  type: z.enum(PROMO_TYPES),
  multiplier: z.number(),
  startDate: z.string(),                         // ISO 8601
  endDate: z.string(),                           // ISO 8601
  isActive: z.boolean(),
  isCurrentlyActive: z.boolean(),
  isUpcoming: z.boolean(),
  isExpired: z.boolean(),
  name: z.string().optional(),
  description: z.string().optional(),
  deletedAt: z.string().nullable(),              // ISO 8601 or null
  createdAt: z.string(),                         // ISO 8601
  updatedAt: z.string(),                         // ISO 8601
  createdBy: CreatedByStubSchema,
});

export const NormPromoScheduledListSchema = z.object({
  data: z.array(ScheduledPromoRowSchema),
  count: z.number().int().nonnegative(),
});
