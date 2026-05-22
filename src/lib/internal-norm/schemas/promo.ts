// src/lib/internal-norm/schemas/promo.ts
//
// Norm response schemas for the core Promo collection (toggle-system promos).
// These cover the "what multiplier is currently in effect, and what's its
// configuration / history" surface. Distinct from `promo-analytics` schemas,
// which describe per-page / per-UTM funnel metrics rather than promo config.
//
// Conservative projection — Mongo ObjectIds are exposed as opaque strings,
// `createdBy` is reduced to a {id, name, email} stub (the admin user who
// toggled the promo on), Date fields are serialized to ISO strings via
// `z.coerce.date().transform(...)` so the wire shape is plain JSON.
import { z } from "zod";

const PROMO_TYPES = ["membership-packages", "one-time-packages", "mini-packages"] as const;

// Match the resolver source enum from `PromoMultiplierResolverService`.
const PROMO_SOURCES = [
  "scheduled",
  "toggle",
  "alternating",
  "derived-from-membership",
  "none",
] as const;

// ─── promo.active ─────────────────────────────────────────────────────────────
//
// Returns all promo rows where `isActive=true`. In the toggle system,
// `startDate` / `endDate` / `duration` are legacy fields preserved for
// backward compatibility — they do NOT drive activation. `timeRemaining` is
// always 0 and `isExpired` is always false in this shape.

const ActivePromoRowSchema = z.object({
  id: z.string(),
  type: z.enum(PROMO_TYPES),
  multiplier: z.number(),
  startDate: z.string(),                         // ISO 8601
  endDate: z.string(),                           // ISO 8601
  duration: z.number(),                          // hours (legacy)
  isActive: z.literal(true),
  timeRemaining: z.literal(0),                   // always 0 in the toggle system
  isExpired: z.literal(false),                   // always false in the toggle system
  createdAt: z.string(),                         // ISO 8601
});

export const NormPromoActiveSchema = z.object({
  data: z.array(ActivePromoRowSchema),
  count: z.number().int().nonnegative(),
});

// ─── promo.effective ──────────────────────────────────────────────────────────
//
// Resolver output: for each package type, the currently-effective multiplier
// + its source (which promo mechanism won the priority chain). Used by QA,
// support, and Stripe reconciliation to answer "what multiplier is being
// applied right now to membership / one-time / mini-draw purchases?".

const EffectiveEntrySchema = z.object({
  multiplier: z.number().nullable(),             // null = no promo, payment uses 1x
  source: z.enum(PROMO_SOURCES),                 // which mechanism resolved
  promoId: z.string().optional(),                // opaque id; absent for alternating / none / derived
});

export const NormPromoEffectiveSchema = z.object({
  // Keys match the three full PromoType values. Recorded explicitly rather
  // than `z.record(...)` so the contract is enumerated.
  "membership-packages": EffectiveEntrySchema,
  "one-time-packages": EffectiveEntrySchema,
  "mini-packages": EffectiveEntrySchema,
});

// ─── promo.history ────────────────────────────────────────────────────────────
//
// Paged list of all promo rows (active + inactive). `createdBy` is projected
// to a minimal stub — the admin user who created/toggled the promo. Email is
// included since it's admin-internal metadata (not customer PII).

const PromoHistoryCreatedBySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  })
  .nullable();

const PromoHistoryRowSchema = z.object({
  id: z.string(),
  type: z.enum(PROMO_TYPES),
  multiplier: z.number(),
  startDate: z.string().optional(),              // ISO 8601, may be absent on legacy rows
  endDate: z.string().optional(),                // ISO 8601, may be absent on legacy rows
  duration: z.number().optional(),               // hours, may be absent on legacy rows
  isActive: z.boolean(),
  isExpired: z.boolean(),
  timeRemaining: z.number().nonnegative(),       // milliseconds; 0 when no endDate
  createdAt: z.string(),                         // ISO 8601
  updatedAt: z.string(),                         // ISO 8601
  createdBy: PromoHistoryCreatedBySchema,
});

export const NormPromoHistorySchema = z.object({
  data: z.array(PromoHistoryRowSchema),
  pagination: z.object({
    currentPage: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
  }),
});
