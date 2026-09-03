// src/lib/internal-norm/schemas/monthly-coupon.ts
//
// Norm response schemas for the monthly-coupon admin domain.
//
// Two endpoint families:
//   1. campaigns.list + campaign.redemptions — operator-facing reads on
//      MonthlyEntryCampaign + RedeemableIssuance.
//   2. target-users.{manual,csv,filter,dynamic} — POST-body "compute target set"
//      reads. By design these endpoints return user identity arrays — that's
//      their literal purpose. The Norm projections collapse to OPAQUE userId
//      strings + aggregate counts; no email / firstName / lastName / mobile is
//      ever exposed. The admin UI gets richer rows (for operator verification);
//      Norm doesn't need them and shouldn't see them.
import { z } from "zod";

const CAMPAIGN_MODES = ["global", "unique", "both"] as const;
const TARGETING_MODES = [
  "all-active-subscribers",
  "manual-users",
  "csv-users",
  "dynamic-segment",
] as const;
const PURCHASE_REQUIREMENTS = ["none", "membership", "one-time", "any"] as const;

const SegmentConfigProjectionSchema = z
  .object({
    minInactiveDays: z.number().int().nonnegative().optional(),
    maxInactiveDays: z.number().int().nonnegative().optional(),
    requiresEmailVerified: z.boolean().optional(),
    requiresRecentPurchaseDays: z.number().int().positive().optional(),
    includeUserIdsCount: z.number().int().nonnegative().optional(),
    excludeUserIdsCount: z.number().int().nonnegative().optional(),
    states: z.array(z.string()).optional(),
    membershipTiers: z.array(z.string()).optional(),
    topEntriesPercent: z.number().int().min(1).max(100).optional(),
  })
  .optional();

// Exported so the route can validate row-by-row and drop a malformed campaign instead of
// letting withNorm's whole-response validation 500 the entire list. See the route comment.
export const MonthlyCampaignRowSchema = z.object({
  id: z.string(),
  monthKey: z.string(), // YYYY-MM
  name: z.string(),
  displayLabel: z.string().optional(),
  entriesAmount: z.number().int().positive(),
  campaignMode: z.enum(CAMPAIGN_MODES),
  targetingMode: z.enum(TARGETING_MODES),
  startsAt: z.string(), // ISO 8601
  // ISO 8601, or null when unset. A value in year 9999 is the OPEN-ENDED sentinel:
  // the campaign has no minting backstop and keeps issuing until an admin disables
  // it. Treat it as "no end date", not as a real business date.
  endsAt: z.string().nullable(),
  neverExpires: z.boolean(),
  // Per-customer window in HOURS; when set, each issuance expires exactly validForHours
  // after the instant it was issued (the marketing flow's webhook call), not at campaign
  // endsAt. Optional — a legacy/fixed-end campaign never has this set, and it's mutually
  // exclusive with neverExpires.
  validForHours: z.number().int().positive().optional(),
  isActive: z.boolean(),
  code: z.string(),
  requiresPurchase: z.boolean(),
  purchaseRequirement: z.enum(PURCHASE_REQUIREMENTS),
  segmentConfig: SegmentConfigProjectionSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  redeemedCount: z.number().int().nonnegative(),
  // Total issuances (any status), not just redeemed — lets Norm see the same "this campaign
  // already has issuances" signal the admin UI warns on when validForHours is being enabled.
  issuanceCount: z.number().int().nonnegative(),
});

export const NormMonthlyCouponCampaignsListSchema = z.object({
  data: z.array(MonthlyCampaignRowSchema),
  count: z.number().int().nonnegative(),
});

// ─── campaign.redemptions ─────────────────────────────────────────────────────

const RedemptionRowSchema = z.object({
  issuanceId: z.string(),
  userId: z.string(), // opaque User._id; no email/name projected
  redeemedAt: z.string(), // ISO 8601
  code: z.string().optional(), // unique-code rows; omitted on global mode
  entriesAmount: z.number().int().positive(),
});

export const NormMonthlyCouponCampaignRedemptionsSchema = z.object({
  items: z.array(RedemptionRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});

// ─── target-users.{manual,csv,dynamic} — flat list shape ──────────────────────
// All three POST-body reads collapse to: { userIds, count }
// CSV adds the row-level parse-error array as a strict aggregate (no raw strings
// echoed — that's just the row index + the original cell + a reason).

const InvalidCsvRowSchema = z.object({
  row: z.number().int().positive(),
  value: z.string(),
  reason: z.string(),
});

export const NormMonthlyCouponTargetUsersOpaqueSchema = z.object({
  userIds: z.array(z.string()), // opaque User._id strings only
  count: z.number().int().nonnegative(),
});

export const NormMonthlyCouponTargetUsersCsvSchema =
  NormMonthlyCouponTargetUsersOpaqueSchema.extend({
    invalidRows: z.array(InvalidCsvRowSchema),
  });

// ─── target-users.filter — paged OR bulk projection ───────────────────────────
// The admin route serves both modes from the same handler; Norm receives the
// same two-mode union. In `page` mode the user mini-rows are opaque-id only —
// the admin's firstName/lastName/email/state/role are stripped. The
// `majorDrawEntries` count + per-user subscription tier are retained because
// those drive the "is this the right audience" decision Norm helps with.

const FilteredAudienceOpaqueUserSchema = z.object({
  userId: z.string(),
  state: z.string().optional(),
  subscription: z
    .object({
      packageId: z.string(),
      isActive: z.boolean(),
      status: z.string(),
    })
    .nullable(),
  majorDrawEntries: z.number().int().nonnegative(),
});

const FilteredAudiencePaginationSchema = z.object({
  currentPage: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});

export const NormMonthlyCouponTargetUsersFilterSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("page"),
    users: z.array(FilteredAudienceOpaqueUserSchema),
    pagination: FilteredAudiencePaginationSchema,
    warning: z.string().optional(),
  }),
  z.object({
    mode: z.literal("bulk"),
    userIds: z.array(z.string()),
    totalCount: z.number().int().nonnegative(),
  }),
]);
