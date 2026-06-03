import { z } from "zod";

// ─── Shared enums ────────────────────────────────────────────────────────────

const ErrorReportStatusSchema = z.enum(["new", "investigating", "resolved", "dismissed"]);
const ErrorReportCategorySchema = z.enum([
  "payment",
  "network",
  "api",
  "system",
  "recovery",
]);
const ErrorReportSeveritySchema = z.enum(["critical", "high", "medium"]);

// ─── PII redaction policy ────────────────────────────────────────────────────
// The ErrorReport document stores user-facing emails, console-error dumps,
// stack traces, hashed IPs, and full browser strings. Most are useful for
// debugging in the admin UI but are unnecessarily revealing for an external
// AI-agent surface. Norm's projection strips:
//   - userEmail, guestEmail            (PII; userId remains as opaque correlation key)
//   - errorStack                       (often leaks server paths / framework internals)
//   - consoleErrors[]                  (verbose dump of in-browser console)
//   - ipAddressHash                    (hashed but still a per-user signal)
//   - userAgent, browserInfo           (fingerprinting-class signal)
//   - referrer                         (off-site URL)
// Operational fields (errorName/Message, apiEndpoint, httpStatus, route,
// currentUrl, status, severity, category, adminNotes, resolvedBy) are kept —
// they are what Norm needs to triage and report on errors.

const ErrorReportRowSchema = z.object({
  id: z.string().describe("ErrorReport _id"),
  userId: z
    .string()
    .nullable()
    .describe("Mongo User._id of the authenticated reporter, null for guest reports"),
  isAuthenticated: z.boolean(),
  errorName: z.string().nullable(),
  errorMessage: z.string(),
  category: ErrorReportCategorySchema.nullable(),
  severity: ErrorReportSeveritySchema.nullable(),
  autoLogged: z.boolean(),
  apiEndpoint: z.string().nullable(),
  httpMethod: z.string().nullable(),
  httpStatus: z.number().int().nullable(),
  requestUrl: z.string().nullable(),
  currentUrl: z.string().nullable(),
  route: z.string().nullable(),
  status: ErrorReportStatusSchema,
  adminNotes: z.string().nullable(),
  resolvedAt: z.string().nullable().describe("ISO 8601 UTC; null when not yet resolved"),
  resolvedBy: z
    .string()
    .nullable()
    .describe("Mongo User._id of the admin who marked this resolved; null otherwise"),
  createdAt: z.string().describe("ISO 8601 UTC"),
  updatedAt: z.string().describe("ISO 8601 UTC"),
});

// ─── error-reports.list ──────────────────────────────────────────────────────

const ListStatisticsSchema = z.object({
  total: z.number().int().nonnegative(),
  byStatus: z.object({
    new: z.number().int().nonnegative(),
    investigating: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    dismissed: z.number().int().nonnegative(),
  }),
  recentCount: z
    .number()
    .int()
    .nonnegative()
    .describe("Count of matching reports created in the last 24 hours"),
  needsAttention: z
    .number()
    .int()
    .nonnegative()
    .describe("byStatus.new + byStatus.investigating"),
  criticalUnresolved: z
    .number()
    .int()
    .nonnegative()
    .describe("severity='critical' with status in {new, investigating}"),
});

export const NormErrorReportsListSchema = z.object({
  reports: z.array(ErrorReportRowSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
  statistics: ListStatisticsSchema,
});

// ─── error-reports.get ───────────────────────────────────────────────────────
// Detail-page projection. Same field set as list rows — no stack traces, no
// console dumps, no fingerprinting signals. The single-row endpoint adds no
// PII the list view withholds.

export const NormErrorReportDetailSchema = z.object({
  report: ErrorReportRowSchema,
});
