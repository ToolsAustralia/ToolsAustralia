import type { FilterQuery, Types } from "mongoose";
import ChargeJobRun, {
  type IChargeJobRun,
  type ChargeJobRunStatus,
} from "@/models/ChargeJobRun";
import InvoiceChargeLog, { type IInvoiceChargeLog } from "@/models/InvoiceChargeLog";
import User from "@/models/User";

const VALID_RUN_STATUSES: ReadonlySet<ChargeJobRunStatus> = new Set([
  "running",
  "completed",
  "failed",
  "aborted",
]);

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
}

export function buildRunsFilter(input: RunsFilterInput): FilterQuery<IChargeJobRun> {
  const f: FilterQuery<IChargeJobRun> = {};
  if (input.startDate || input.endDate) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (input.startDate) range.$gte = input.startDate;
    if (input.endDate) range.$lte = input.endDate;
    f.startedAt = range;
  }
  if (input.adminId) f.adminId = input.adminId;
  if (input.status && VALID_RUN_STATUSES.has(input.status)) {
    f.status = input.status;
  }
  return f;
}

export function buildManualRetriesFilter(
  input: ManualRetriesFilterInput
): FilterQuery<IInvoiceChargeLog> {
  const f: FilterQuery<IInvoiceChargeLog> = { chargeRunId: null };
  if (input.startDate || input.endDate) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (input.startDate) range.$gte = input.startDate;
    if (input.endDate) range.$lte = input.endDate;
    f.attemptedAt = range;
  }
  if (input.adminId) f.adminId = input.adminId;
  if (input.status && ["success", "failed", "skipped"].includes(input.status)) {
    f.status = input.status;
  }
  return f;
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

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
  const filter = buildManualRetriesFilter(input);

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
      errorMessage: r.errorMessage,
      adminId: String(r.adminId),
      adminName: adminLabel(adminMap.get(String(r.adminId)) as AdminLookupRow | undefined),
    })),
    total,
  };
}
