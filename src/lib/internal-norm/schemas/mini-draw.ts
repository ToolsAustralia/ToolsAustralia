// src/lib/internal-norm/schemas/mini-draw.ts
//
// Norm response schemas for the mini-draw read endpoints. The MiniDraw model
// uses status enum `{active | completed | cancelled}` and stores aggregated
// per-user `entries` rows with `entriesBySource` keyed by
// `mini-draw-package | free-entry | bonus-entry-promo`.
//
// PII discipline:
// - `get`: returns single-draw detail. No per-participant rows. Participant
//   counts are exposed via `totalEntries` / `minimumEntries` only.
// - `export`: aggregate-only projection — counts, totals, and per-state
//   breakdowns. The admin CSV/Excel route retains full PII (firstName,
//   lastName, email, mobile per row) for legal/operational reasons; Norm
//   does NOT receive those rows.
import { z } from "zod";

const MiniDrawStatusSchema = z.enum(["active", "completed", "cancelled"]);

// ─── full-capacity-count ────────────────────────────────────────────────────

export const NormMiniDrawFullCapacityCountSchema = z.object({
  count: z.number().int(),
});

// ─── list ───────────────────────────────────────────────────────────────────

const MiniDrawLatestWinnerSchema = z.object({
  _id: z.string(),
  userId: z.string(),                       // opaque correlation key
  entryNumber: z.number(),
  selectedDate: z.string(),                 // ISO 8601 UTC
  imageUrl: z.string().nullable(),
  drawResultUrl: z.string().nullable(),
  cycle: z.number().int(),
});

const MiniDrawListItemSchema = z.object({
  _id: z.string(),
  name: z.string(),
  description: z.string(),
  brandId: z.string(),
  prize: z.object({
    name: z.string(),
    description: z.string(),
    value: z.number(),                      // AUD dollars
    images: z.array(z.string()),
    category: z.string(),
  }),
  displayOrder: z.number(),
  isActive: z.boolean(),
  status: MiniDrawStatusSchema,
  configurationLocked: z.boolean(),
  lockedAt: z.string().nullable(),          // ISO 8601 UTC
  fullCapacityNotificationSentAt: z.string().nullable(),  // ISO 8601 UTC
  totalEntries: z.number(),
  minimumEntries: z.number(),
  entriesRemaining: z.number(),
  cycle: z.number().int(),
  createdAt: z.string(),                    // ISO 8601 UTC
  updatedAt: z.string(),                    // ISO 8601 UTC
  latestWinner: MiniDrawLatestWinnerSchema.nullable(),
});

export const NormMiniDrawListSchema = z.object({
  miniDraws: z.array(MiniDrawListItemSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

// ─── get (PII-safe — no per-user rows) ──────────────────────────────────────

export const NormMiniDrawGetSchema = z.object({
  _id: z.string(),
  name: z.string(),
  description: z.string(),
  brandId: z.string(),
  status: MiniDrawStatusSchema,
  cycle: z.number().int(),
  latestWinnerId: z.string().nullable(),
  winnerHistory: z.array(z.string()),
  configurationLocked: z.boolean(),
  lockedAt: z.string().nullable(),          // ISO 8601 UTC
  prize: z.object({
    name: z.string(),
    description: z.string(),
    value: z.number(),                      // AUD dollars
    images: z.array(z.string()),
    category: z.string(),
  }),
  totalEntries: z.number(),
  minimumEntries: z.number(),
  entriesRemaining: z.number(),
  createdAt: z.string(),                    // ISO 8601 UTC
  updatedAt: z.string(),                    // ISO 8601 UTC
});

// ─── export (aggregate-only) ────────────────────────────────────────────────

const MiniDrawStateBreakdownItemSchema = z.object({
  state: z.string(),                        // AU state full name or raw abbreviation; "" when blank
  participants: z.number().int(),
  entries: z.number().int(),
});

export const NormMiniDrawExportAggregateSchema = z.object({
  miniDraw: z.object({
    _id: z.string(),
    name: z.string(),
    status: MiniDrawStatusSchema,
    totalEntries: z.number(),
    minimumEntries: z.number(),
    entriesRemaining: z.number(),
    cycle: z.number().int(),
  }),
  participants: z.object({
    total: z.number().int(),                // distinct participants (users still exist)
    totalEntries: z.number().int(),         // sum of totalEntries across those participants
    stateBreakdown: z.array(MiniDrawStateBreakdownItemSchema),
  }),
  missingUsers: z.number().int(),           // entry rows whose User._id no longer resolves
});
