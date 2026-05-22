import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormErrorReportsListSchema } from "@/lib/internal-norm/schemas/error-reports";
import { listErrorReports } from "@/services/error-reporting/ErrorReportQueryService";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["new", "investigating", "resolved", "dismissed"]).optional(),
  userId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().max(200).optional(),
  category: z.enum(["payment", "network", "api", "system", "recovery", "missing"]).optional(),
  severity: z.enum(["critical", "high", "medium", "missing"]).optional(),
  userEmail: z.string().max(255).optional(),
  autoLogged: z.enum(["true", "false"]).optional(),
  apiEndpoint: z.string().max(500).optional(),
  pageUrl: z.string().max(2000).optional(),
  sortBy: z.enum(["createdAt", "status", "errorMessage", "category", "severity"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
});

function projectRow(report: Record<string, unknown>) {
  const createdAt = report.createdAt as Date | string | undefined;
  const updatedAt = report.updatedAt as Date | string | undefined;
  const resolvedAt = report.resolvedAt as Date | string | null | undefined;
  return {
    id: String(report._id),
    userId: report.userId ? String(report.userId) : null,
    isAuthenticated: Boolean(report.isAuthenticated),
    errorName: (report.errorName as string | undefined) ?? null,
    errorMessage: String(report.errorMessage ?? ""),
    category: (report.category as
      | "payment"
      | "network"
      | "api"
      | "system"
      | "recovery"
      | undefined) ?? null,
    severity: (report.severity as "critical" | "high" | "medium" | undefined) ?? null,
    autoLogged: Boolean(report.autoLogged),
    apiEndpoint: (report.apiEndpoint as string | undefined) ?? null,
    httpMethod: (report.httpMethod as string | undefined) ?? null,
    httpStatus: typeof report.httpStatus === "number" ? report.httpStatus : null,
    requestUrl: (report.requestUrl as string | undefined) ?? null,
    currentUrl: (report.currentUrl as string | undefined) ?? null,
    route: (report.route as string | undefined) ?? null,
    status: report.status as "new" | "investigating" | "resolved" | "dismissed",
    adminNotes: (report.adminNotes as string | undefined) ?? null,
    resolvedAt: resolvedAt
      ? resolvedAt instanceof Date
        ? resolvedAt.toISOString()
        : String(resolvedAt)
      : null,
    resolvedBy: report.resolvedBy ? String(report.resolvedBy) : null,
    createdAt: createdAt
      ? createdAt instanceof Date
        ? createdAt.toISOString()
        : String(createdAt)
      : new Date(0).toISOString(),
    updatedAt: updatedAt
      ? updatedAt instanceof Date
        ? updatedAt.toISOString()
        : String(updatedAt)
      : new Date(0).toISOString(),
  };
}

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "error-reports.list",
    requiredPermission: "errorReports.view",
    responseSchema: NormErrorReportsListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(
      Object.fromEntries(ctx.url.searchParams.entries()),
    );
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const result = await listErrorReports({
      ...parsed.data,
      includeArchived: parsed.data.includeArchived === "true",
    });

    return ctx.ok({
      reports: result.reports.map(projectRow),
      pagination: result.pagination,
      statistics: {
        total: result.statistics.total,
        byStatus: result.statistics.byStatus,
        recentCount: result.statistics.recentCount,
        needsAttention: result.statistics.needsAttention,
        criticalUnresolved: result.statistics.criticalUnresolved,
      },
    });
  },
);
