import { z } from "zod";

// ─── health.dashboard-stats-snapshot ─────────────────────────────────────────

export const NormDashboardStatsSnapshotHealthSchema = z.object({
  expectedCount: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Number of AEST date keys from website launch up to (but excluding) today.",
    ),
  presentCount: z
    .number()
    .int()
    .nonnegative()
    .describe("Number of expected dates that have a snapshot row."),
  missingCount: z
    .number()
    .int()
    .nonnegative()
    .describe("Number of expected dates with NO snapshot row (expectedCount - presentCount)."),
  missingDates: z
    .array(z.string())
    .describe("AEST YYYY-MM-DD keys with no snapshot row."),
  latestPresent: z
    .array(z.string())
    .describe("Up to 3 most-recent present keys, ascending AEST YYYY-MM-DD."),
});

// ─── health.membership-snapshot ──────────────────────────────────────────────

export const NormMembershipSnapshotHealthSchema = z.object({
  ok: z
    .boolean()
    .describe(
      "True when every subscription package has a snapshot row for every checked day.",
    ),
  checked: z
    .array(z.string())
    .describe(
      "AEST YYYY-MM-DD keys inspected — the 7 days preceding today (yesterday → 7 days ago).",
    ),
  missingDays: z
    .array(
      z.object({
        date: z.string().describe("AEST YYYY-MM-DD"),
        missingPackages: z
          .array(z.string())
          .describe("packageId values with no snapshot row for this date."),
      }),
    )
    .describe("One entry per checked day that has at least one missing package."),
});
