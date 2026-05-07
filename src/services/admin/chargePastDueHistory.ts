import type { FilterQuery, Types } from "mongoose";
import { fromZonedTime } from "date-fns-tz";
import ChargeJobRun, {
  type IChargeJobRun,
  type ChargeJobRunStatus,
} from "@/models/ChargeJobRun";
import InvoiceChargeLog, { type IInvoiceChargeLog } from "@/models/InvoiceChargeLog";
import User from "@/models/User";

const ADMIN_TIMEZONE = "Australia/Sydney";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const VALID_RUN_STATUSES: ReadonlySet<ChargeJobRunStatus> = new Set([
  "running",
  "completed",
  "failed",
  "aborted",
]);

/** Parse a `YYYY-MM-DD` AEST/AEDT calendar date into the UTC instant of its local midnight. */
export function parseAestDayStartUtc(s: string | null | undefined): Date | undefined {
  if (!s || !ISO_DATE_RE.test(s)) return undefined;
  const d = fromZonedTime(`${s}T00:00:00`, ADMIN_TIMEZONE);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Parse a `YYYY-MM-DD` AEST/AEDT calendar date into the UTC instant of the *next* day's
 * local midnight — used as an exclusive upper bound (`$lt`) so the entire local day is
 * included regardless of DST transitions.
 */
export function parseAestDayEndExclusiveUtc(s: string | null | undefined): Date | undefined {
  const start = parseAestDayStartUtc(s);
  if (!start) return undefined;
  const [y, m, d] = (s as string).split("-").map(Number);
  // Use Date.UTC to handle month/year rollover correctly (Dec 31 -> Jan 1, etc.)
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return fromZonedTime(`${yyyy}-${mm}-${dd}T00:00:00`, ADMIN_TIMEZONE);
}

/** Escape regex metacharacters so user search can't break out of a substring match. */
export function escapeUserSearchRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface DeclineCodeRow {
  code: string;
  count: number;
  pct: number;
}

export interface DeclineCodeSummary {
  totalFailed: number;
  topCodes: DeclineCodeRow[];
}

interface RawDeclineBucket {
  _id: string | null;
  count: number;
}

const DECLINE_TOP_N = 5;

/**
 * Bucket a sorted-desc list of decline-code aggregation rows into the top N plus
 * a single "other" row. Pure; tested in isolation. Input is expected to be
 * sorted descending by count; the function preserves that order.
 */
export function bucketDeclineCodeCounts(rows: readonly RawDeclineBucket[]): DeclineCodeSummary {
  const totalFailed = rows.reduce((sum, r) => sum + r.count, 0);
  if (totalFailed === 0) return { totalFailed: 0, topCodes: [] };

  const top = rows.slice(0, DECLINE_TOP_N).map<DeclineCodeRow>((r) => ({
    code: r._id ?? "unknown",
    count: r.count,
    pct: Math.round((r.count / totalFailed) * 100),
  }));

  const tail = rows.slice(DECLINE_TOP_N);
  if (tail.length > 0) {
    const otherCount = tail.reduce((sum, r) => sum + r.count, 0);
    top.push({
      code: "other",
      count: otherCount,
      pct: Math.round((otherCount / totalFailed) * 100),
    });
  }

  return { totalFailed, topCodes: top };
}

export interface DeclineSummaryFilterInput {
  startDate?: Date;
  endDate?: Date;
}

/**
 * Aggregate failed `InvoiceChargeLog` rows in the given AEST-anchored date range,
 * group by decline reason (declineCode → errorCode → "unknown"), bucket into top 5
 * + "other". Caller is expected to pass dates already parsed via
 * `parseAestDayStartUtc` / `parseAestDayEndExclusiveUtc`.
 */
export async function summariseDeclineCodes(
  input: DeclineSummaryFilterInput
): Promise<DeclineCodeSummary> {
  const match: Record<string, unknown> = { status: "failed" };
  if (input.startDate || input.endDate) {
    const range: { $gte?: Date; $lt?: Date } = {};
    if (input.startDate) range.$gte = input.startDate;
    if (input.endDate) range.$lt = input.endDate;
    match.attemptedAt = range;
  }

  const rows = await InvoiceChargeLog.aggregate<RawDeclineBucket>([
    { $match: match },
    {
      $group: {
        _id: {
          $ifNull: ["$declineCode", { $ifNull: ["$errorCode", "unknown"] }],
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  return bucketDeclineCodeCounts(rows);
}

export interface RunsFilterInput {
  startDate?: Date;
  endDate?: Date;
  adminId?: Types.ObjectId | string;
  status?: ChargeJobRunStatus;
}

export interface ManualRetriesFilterInput {
  startDate?: Date;
  endDate?: Date;
  adminId?: Types.ObjectId | string;
  status?: IInvoiceChargeLog["status"];
  /** Case-insensitive substring match against User.email; max ~120 chars. */
  userSearch?: string;
}

/** Filter builder for charge runs. endDate is exclusive (start of next AEST day). */
export function buildRunsFilter(input: RunsFilterInput): FilterQuery<IChargeJobRun> {
  const f: FilterQuery<IChargeJobRun> = {};
  if (input.startDate || input.endDate) {
    const range: { $gte?: Date; $lt?: Date } = {};
    if (input.startDate) range.$gte = input.startDate;
    if (input.endDate) range.$lt = input.endDate;
    f.startedAt = range;
  }
  if (input.adminId) f.adminId = input.adminId;
  if (input.status && VALID_RUN_STATUSES.has(input.status)) {
    f.status = input.status;
  }
  return f;
}

/** Filter builder for manual retries. endDate is exclusive (start of next AEST day). */
export function buildManualRetriesFilter(
  input: ManualRetriesFilterInput
): FilterQuery<IInvoiceChargeLog> {
  const f: FilterQuery<IInvoiceChargeLog> = { chargeRunId: null };
  if (input.startDate || input.endDate) {
    const range: { $gte?: Date; $lt?: Date } = {};
    if (input.startDate) range.$gte = input.startDate;
    if (input.endDate) range.$lt = input.endDate;
    f.attemptedAt = range;
  }
  if (input.adminId) f.adminId = input.adminId;
  if (input.status && ["success", "failed", "skipped"].includes(input.status)) {
    f.status = input.status;
  }
  return f;
}

export { formatDurationMs } from "@/utils/admin/chargePastDueFormat";

interface AdminLookupRow {
  _id: Types.ObjectId;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

function adminLabel(u: AdminLookupRow | null | undefined): string {
  if (!u) return "(unknown admin)";
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name || u.email || "(unknown admin)";
}

export interface ListedRun {
  _id: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  adminId: string;
  adminName: string;
  status: ChargeJobRunStatus;
  totals: IChargeJobRun["totals"];
}

export async function listChargeRuns(
  input: RunsFilterInput & { limit?: number; offset?: number }
): Promise<{ runs: ListedRun[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const filter = buildRunsFilter(input);

  const [runs, total] = await Promise.all([
    ChargeJobRun.find(filter).sort({ startedAt: -1 }).skip(offset).limit(limit).lean(),
    ChargeJobRun.countDocuments(filter),
  ]);

  const adminIds = [...new Set(runs.map((r) => String(r.adminId)))];
  const admins = await User.find({ _id: { $in: adminIds } })
    .select({ firstName: 1, lastName: 1, email: 1 })
    .lean();
  const adminMap = new Map(admins.map((a) => [String(a._id), a]));

  return {
    runs: runs.map((r) => ({
      _id: String(r._id),
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
      adminId: String(r.adminId),
      adminName: adminLabel(adminMap.get(String(r.adminId)) as AdminLookupRow | undefined),
      status: r.status,
      totals: r.totals,
    })),
    total,
  };
}

export interface RunDetailRow {
  invoiceId: string;
  customerId: string;
  userId: string;
  userEmail: string;
  status: IInvoiceChargeLog["status"];
  amount: number;
  attemptedAt: Date;
  errorCode?: string;
  declineCode?: string;
  errorMessage?: string;
}

export interface RunDetail {
  run: ListedRun;
  rows: RunDetailRow[];
}

export async function getChargeRunDetail(runId: string): Promise<RunDetail | null> {
  const run = await ChargeJobRun.findById(runId).lean();
  if (!run) return null;

  const [admin, logRows] = await Promise.all([
    User.findById(run.adminId).select({ firstName: 1, lastName: 1, email: 1 }).lean(),
    InvoiceChargeLog.find({ chargeRunId: run._id })
      .sort({ attemptedAt: 1 })
      .select({
        invoiceId: 1,
        customerId: 1,
        userId: 1,
        status: 1,
        amount: 1,
        attemptedAt: 1,
        errorCode: 1,
        declineCode: 1,
        errorMessage: 1,
      })
      .lean(),
  ]);

  const userIds = [...new Set(logRows.map((r) => String(r.userId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select({ email: 1 })
    .lean();
  const emailMap = new Map(users.map((u) => [String(u._id), u.email ?? ""]));

  return {
    run: {
      _id: String(run._id),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
      adminId: String(run.adminId),
      adminName: adminLabel(admin as AdminLookupRow | null),
      status: run.status,
      totals: run.totals,
    },
    rows: logRows.map((r) => ({
      invoiceId: r.invoiceId,
      customerId: r.customerId,
      userId: String(r.userId),
      userEmail: emailMap.get(String(r.userId)) ?? "",
      status: r.status,
      amount: r.amount,
      attemptedAt: r.attemptedAt,
      errorCode: r.errorCode,
      declineCode: r.declineCode,
      errorMessage: r.errorMessage,
    })),
  };
}

export interface ManualRetryRow extends RunDetailRow {
  adminId: string;
  adminName: string;
}

export async function listManualRetries(
  input: ManualRetriesFilterInput & { limit?: number; offset?: number }
): Promise<{ rows: ManualRetryRow[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  const trimmedSearch = input.userSearch?.trim().slice(0, 120) ?? "";

  let userIdConstraint: string[] | undefined;
  if (trimmedSearch) {
    const matchedUsers = await User.find({
      email: { $regex: escapeUserSearchRegex(trimmedSearch), $options: "i" },
    })
      .select({ _id: 1 })
      .limit(500)
      .lean();

    if (matchedUsers.length === 0) {
      return { rows: [], total: 0 };
    }
    userIdConstraint = matchedUsers.map((u) => String(u._id));
  }

  const filter = buildManualRetriesFilter(input);
  if (userIdConstraint) {
    filter.userId = { $in: userIdConstraint };
  }

  const [logRows, total] = await Promise.all([
    InvoiceChargeLog.find(filter)
      .sort({ attemptedAt: -1 })
      .skip(offset)
      .limit(limit)
      .select({
        invoiceId: 1,
        customerId: 1,
        userId: 1,
        adminId: 1,
        status: 1,
        amount: 1,
        attemptedAt: 1,
        errorCode: 1,
        declineCode: 1,
        errorMessage: 1,
      })
      .lean(),
    InvoiceChargeLog.countDocuments(filter),
  ]);

  const userIds = [...new Set(logRows.map((r) => String(r.userId)))];
  const adminIds = [...new Set(logRows.map((r) => String(r.adminId)))];
  const [users, admins] = await Promise.all([
    User.find({ _id: { $in: userIds } })
      .select({ email: 1 })
      .lean(),
    User.find({ _id: { $in: adminIds } })
      .select({ firstName: 1, lastName: 1, email: 1 })
      .lean(),
  ]);
  const emailMap = new Map(users.map((u) => [String(u._id), u.email ?? ""]));
  const adminMap = new Map(admins.map((a) => [String(a._id), a]));

  return {
    rows: logRows.map((r) => ({
      invoiceId: r.invoiceId,
      customerId: r.customerId,
      userId: String(r.userId),
      userEmail: emailMap.get(String(r.userId)) ?? "",
      status: r.status,
      amount: r.amount,
      attemptedAt: r.attemptedAt,
      errorCode: r.errorCode,
      declineCode: r.declineCode,
      errorMessage: r.errorMessage,
      adminId: String(r.adminId),
      adminName: adminLabel(adminMap.get(String(r.adminId)) as AdminLookupRow | undefined),
    })),
    total,
  };
}
