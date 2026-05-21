import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import StaffActivity from "@/models/StaffActivity";
import { z } from "zod";
import { isValidObjectId } from "mongoose";

/**
 * GET /api/admin/staff-activity
 *
 * Cursor-paginated list of audit-log rows. Filters:
 *   - actorId      : ObjectId (single staff member)
 *   - action       : permission string (e.g. "users.charge")
 *   - status       : "200" | "201" | "403"
 *   - resourceType : "User" | "Role" | "Promo" | ...
 *   - resourceId   : Mongo id of a specific resource
 *   - from, to     : ISO date strings (inclusive)
 *   - cursor       : opaque value (the `timestamp` of the last row from the
 *                    previous page, ISO string). Reads strictly OLDER than
 *                    the cursor.
 *   - limit        : default 25, max 100
 *
 * This endpoint reads the audit log but does NOT write to it. It uses
 * plain `requirePermission` (not `requirePermissionWithAudit`).
 */
const QuerySchema = z.object({
  actorId: z.string().optional(),
  action: z.string().optional(),
  status: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

export async function GET(req: NextRequest) {
  await connectDB();
  const guard = await requirePermission("audit.view");
  if (guard instanceof NextResponse) return guard;

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query params", details: parsed.error.format() },
      { status: 400 }
    );
  }
  const q = parsed.data;

  const filter: Record<string, unknown> = {};
  if (q.actorId) {
    if (!isValidObjectId(q.actorId)) {
      return NextResponse.json({ error: "Invalid actorId" }, { status: 400 });
    }
    filter.actorId = q.actorId;
  }
  if (q.action) filter.action = q.action;
  if (q.status) {
    const s = Number(q.status);
    if (Number.isFinite(s)) filter.status = s;
  }
  if (q.resourceType) filter.resourceType = q.resourceType;
  if (q.resourceId) filter.resourceId = q.resourceId;

  // Date range
  const tsFilter: Record<string, Date> = {};
  if (q.from) {
    const d = new Date(q.from);
    if (!isNaN(d.getTime())) tsFilter.$gte = d;
  }
  if (q.to) {
    const d = new Date(q.to);
    if (!isNaN(d.getTime())) tsFilter.$lte = d;
  }
  if (q.cursor) {
    const d = new Date(q.cursor);
    if (!isNaN(d.getTime())) {
      // Strictly older than the cursor (cursor is the last seen row's timestamp).
      tsFilter.$lt = d;
    }
  }
  if (Object.keys(tsFilter).length > 0) filter.timestamp = tsFilter;

  const limit = Math.min(Number(q.limit ?? 25) || 25, 100);

  const rows = await StaffActivity.find(filter)
    .sort({ timestamp: -1 })
    .limit(limit + 1) // fetch one extra to know whether another page exists
    .lean();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && page.length > 0
      ? page[page.length - 1]!.timestamp.toISOString()
      : null;

  return NextResponse.json({
    success: true,
    data: {
      rows: page.map((r) => ({
        id: r._id.toString(),
        actorId: r.actorId.toString(),
        actorEmail: r.actorEmail,
        actorRoleName: r.actorRoleName,
        action: r.action,
        method: r.method,
        path: r.path,
        resourceType: r.resourceType ?? null,
        resourceId: r.resourceId ?? null,
        status: r.status,
        timestamp: r.timestamp.toISOString(),
      })),
      nextCursor,
    },
  });
}
