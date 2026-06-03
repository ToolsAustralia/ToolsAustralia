import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormErrorReportDetailSchema } from "@/lib/internal-norm/schemas/error-reports";
import { getErrorReportById } from "@/services/error-reporting/ErrorReportQueryService";

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "error-reports.get",
    requiredPermission: "errorReports.view",
    responseSchema: NormErrorReportDetailSchema,
  },
  async (ctx) => {
    const id = ctx.param(0) ?? "";
    if (!id) return ctx.error(400, "bad_path", "Missing report id");

    const report = await getErrorReportById(id);
    if (!report) return ctx.error(404, "not_found", "Error report not found");

    const createdAt = report.createdAt as Date | string | undefined;
    const updatedAt = report.updatedAt as Date | string | undefined;
    const resolvedAt = report.resolvedAt as Date | string | null | undefined;

    return ctx.ok({
      report: {
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
      },
    });
  },
);
