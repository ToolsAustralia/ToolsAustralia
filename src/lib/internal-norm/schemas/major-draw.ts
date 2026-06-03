// src/lib/internal-norm/schemas/major-draw.ts
//
// Norm response schemas for the major-draw read endpoints. The MajorDraw model
// uses `activationDate` (start) and `drawDate` (end) — there is no
// `startDate` / `endDate` on the schema. Status enum:
//   "queued" | "active" | "frozen" | "completed" | "cancelled"
//
// PII discipline:
// - `participants`: omit lastName, email, mobile. Expose userId (opaque
//   correlation key), firstName, state, entries-by-source totals.
// - `export`: aggregate-only projection. Norm does NOT receive per-user rows
//   — only counts, totals, and per-state breakdowns. The admin CSV/Excel
//   download retains full PII for legal/operational reasons.
// - `select-winner.preview`: winner's `state` is exposed (operationally useful
//   to know "winner from VIC" etc.); name/email/mobile are NOT.
import { z } from "zod";

const MajorDrawStatusSchema = z.enum([
  "queued",
  "active",
  "frozen",
  "completed",
  "cancelled",
]);

// ─── current-and-last ───────────────────────────────────────────────────────

const CurrentAndLastDrawRangeSchema = z.object({
  activationDate: z.string(), // AEST YYYY-MM-DD
  drawDate: z.string(),       // AEST YYYY-MM-DD
  name: z.string(),
});

export const NormMajorDrawCurrentAndLastSchema = z.object({
  currentDraw: CurrentAndLastDrawRangeSchema.nullable(),
  lastDraw: CurrentAndLastDrawRangeSchema.nullable(),
});

// ─── scheduled-months ───────────────────────────────────────────────────────

const ScheduledRestrictedMonthSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(0).max(11), // 0-based
  monthName: z.string(),                  // English long month name
});

const ScheduledDrawListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  drawDate: z.string(),                   // ISO 8601 UTC
  status: z.enum(["queued", "active", "frozen", "completed"]),
});

export const NormMajorDrawScheduledMonthsSchema = z.object({
  restrictedMonths: z.array(ScheduledRestrictedMonthSchema),
  scheduledDraws: z.array(ScheduledDrawListItemSchema),
});

// ─── history ────────────────────────────────────────────────────────────────

const MajorDrawHistoryItemSchema = z.object({
  _id: z.string(),
  name: z.string(),
  description: z.string(),
  status: MajorDrawStatusSchema,
  drawDate: z.string(),                   // ISO 8601 UTC
  activationDate: z.string(),             // ISO 8601 UTC
  freezeEntriesAt: z.string(),            // ISO 8601 UTC
  configurationLocked: z.boolean(),
  lockedAt: z.string().nullable(),        // ISO 8601 UTC or null
  prize: z
    .object({
      name: z.string().nullable(),
      description: z.string().nullable(),
      value: z.number().nullable(),       // AUD dollars
      brand: z.string().nullable(),
    })
    .nullable(),
  totalEntries: z.number(),
  hasWinner: z.boolean(),
  winner: z
    .object({
      winnerId: z.string(),
      userId: z.string(),                 // opaque correlation key
      selectedDate: z.string(),           // ISO 8601 UTC
      selectionMethod: z.enum(["manual", "government-app"]).nullable(),
      selectedPrize: z.string().nullable(),
    })
    .nullable(),
  createdAt: z.string(),                  // ISO 8601 UTC
  updatedAt: z.string(),                  // ISO 8601 UTC
});

export const NormMajorDrawHistorySchema = z.object({
  draws: z.array(MajorDrawHistoryItemSchema),
  pagination: z.object({
    currentPage: z.number().int(),
    totalPages: z.number().int(),
    totalCount: z.number().int(),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
    limit: z.number().int(),
  }),
  stats: z.object({
    totalDraws: z.number().int(),
    totalEntries: z.number().int(),
    totalPrizeValue: z.number(),          // AUD dollars; sum of prize.value
    drawsWithWinners: z.number().int(),
    drawsWithoutWinners: z.number().int(),
    winnerSelectionRate: z.number().int().min(0).max(100), // percent
  }),
});

// ─── update.get ─────────────────────────────────────────────────────────────

export const NormMajorDrawUpdateGetSchema = z.object({
  _id: z.string(),
  name: z.string(),
  description: z.string(),
  status: MajorDrawStatusSchema,
  drawDate: z.string(),                   // ISO 8601 UTC
  activationDate: z.string(),             // ISO 8601 UTC
  freezeEntriesAt: z.string(),            // ISO 8601 UTC
  configurationLocked: z.boolean(),
  lockedAt: z.string().nullable(),        // ISO 8601 UTC or null
  prize: z
    .object({
      name: z.string().nullable(),
      description: z.string().nullable(),
      value: z.number().nullable(),       // AUD dollars
      brand: z.string().nullable(),
      images: z.array(z.string()),
      terms: z.array(z.string()),
    })
    .nullable(),
  totalEntries: z.number(),
  createdAt: z.string(),                  // ISO 8601 UTC
  updatedAt: z.string(),                  // ISO 8601 UTC
});

// ─── participants (PII-safe) ────────────────────────────────────────────────

const EntriesBySourceSchema = z.object({
  membership: z.number(),
  "one-time-package": z.number(),
  upsell: z.number(),
  "mini-draw": z.number(),
  referral: z.number(),
  "bonus-entry-promo": z.number(),
  "cancellation-upsell": z.number(),
});

const MajorDrawParticipantSafeSchema = z.object({
  userId: z.string(),                     // opaque correlation key
  firstName: z.string(),                  // last name intentionally NOT projected
  state: z.string().nullable(),           // AU 2-letter abbreviation (e.g. "VIC"); null when blank
  totalEntries: z.number(),
  entriesBySource: EntriesBySourceSchema,
  firstAddedDate: z.string(),             // ISO 8601 UTC
  lastUpdatedDate: z.string(),            // ISO 8601 UTC
});

export const NormMajorDrawParticipantsSchema = z.object({
  majorDraw: z.object({
    _id: z.string(),
    name: z.string(),
    totalEntries: z.number(),
  }),
  participants: z.array(MajorDrawParticipantSafeSchema),
  pagination: z.object({
    currentPage: z.number().int(),
    totalPages: z.number().int(),
    totalCount: z.number().int(),
    limit: z.number().int(),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
  }),
});

// ─── export (aggregate-only) ────────────────────────────────────────────────

const StateBreakdownItemSchema = z.object({
  state: z.string(),                      // AU state full name or raw abbreviation
  participants: z.number().int(),
  entries: z.number().int(),
});

export const NormMajorDrawExportAggregateSchema = z.object({
  majorDraw: z.object({
    _id: z.string(),
    name: z.string(),
    status: MajorDrawStatusSchema,
    totalEntries: z.number(),
    activationDate: z.string().nullable(),  // ISO 8601 UTC
    drawDate: z.string().nullable(),        // ISO 8601 UTC
  }),
  exclusions: z.object({
    repeatWinnersExcluded: z.number().int(),
    ineligibleStateExcluded: z.number().int(),
  }),
  eligible: z.object({
    participants: z.number().int(),
    totalEntries: z.number().int(),
    stateBreakdown: z.array(StateBreakdownItemSchema),
  }),
});

// ─── select-winner.preview ──────────────────────────────────────────────────

export const NormMajorDrawSelectWinnerPreviewSchema = z.object({
  hasWinner: z.boolean(),
  majorDraw: z.object({
    id: z.string(),
    name: z.string(),
    status: MajorDrawStatusSchema,
    totalEntries: z.number(),
  }),
  winner: z
    .object({
      userId: z.string(),
      user: z.object({ state: z.string().nullable() }).nullable(),
      entryNumber: z.number().nullable(),
      selectedDate: z.string(),
      selectionMethod: z.enum(["manual", "government-app"]).nullable(),
      imageUrl: z.string().nullable(),
      testimony: z.string().nullable(),
      selectedPrize: z.string().nullable(),
      drawResultUrl: z.string().nullable(),
    })
    .nullable(),
});
