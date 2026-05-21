import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import StaffActivity from "@/models/StaffActivity";
import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

/**
 * GET /api/admin/staff-activity
 *
 * Cursor-paginated list of audit-log rows. Filters:
 *   - actorId      : ObjectId (single staff member)
 *   - action       : permission string (e.g. "users.charge")
 *   - status       : HTTP status code integer (e.g. 200, 403)
 *   - resourceType : "User" | "Role" | "Promo" | ...
 *   - resourceId   : Mongo id of a specific resource
 *   - from, to     : ISO datetime strings (inclusive)
 *   - cursor       : opaque composite value "<isoTimestamp>_<objectId>" from
 *                    the previous page's `nextCursor`. Reads strictly OLDER
 *                    than the cursor using a (timestamp, _id) compound
 *                    predicate to avoid silent gaps on millisecond ties.
 *   - limit        : default 25, max 100
 *
 * This endpoint reads the audit log but does NOT write to it. It uses
 * plain `requirePermission` (not `requirePermissionWithAudit`).
 */
const QuerySchema = z.object({
  actorId: z.string().optional(),
  action: z.enum(PERMISSIONS as [Permission, ...Permission[]]).optional(),
  status: z.coerce.number().int().positive().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

function encodeCursor(timestamp: Date, id: string): string {
  return `${timestamp.toISOString()}_${id}`;
}

function decodeCursor(cursor: string): { ts: Date; id: string } | null {
  const idx = cursor.lastIndexOf("_");
  if (idx === -1) return null;
  const tsStr = cursor.slice(0, idx);
  const id = cursor.slice(idx + 1);
  const ts = new Date(tsStr);
  if (isNaN(ts.getTime()) || !isValidObjectId(id)) return null;
  return { ts, id };
}

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
  if (q.status) filter.status = q.status; // already a number via coerce
  if (q.resourceType) filter.resourceType = q.resourceType;

  if (q.resourceId) {
    if (!isValidObjectId(q.resourceId)) {
      return NextResponse.json(
        { error: "Invalid resourceId" },
        { status: 400 }
      );
    }
    filter.resourceId = q.resourceId;
  }

  // Build composite timestamp + cursor predicate
  const tsAnd: Record<string, unknown>[] = [];
  if (q.from) tsAnd.push({ timestamp: { $gte: new Date(q.from) } });
  if (q.to) tsAnd.push({ timestamp: { $lte: new Date(q.to) } });

  if (q.cursor) {
    const decoded = decodeCursor(q.cursor);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
    // Compound predicate: rows strictly older than (ts, id) when sorted by (timestamp:-1, _id:-1)
    tsAnd.push({
      $or: [
        { timestamp: { $lt: decoded.ts } },
        { timestamp: decoded.ts, _id: { $lt: decoded.id } },
      ],
    });
  }

  if (tsAnd.length > 0) {
    filter.$and = tsAnd;
  }

  const limit = q.limit ?? 25;

  const rows = await StaffActivity.find(filter)
    .sort({ timestamp: -1, _id: -1 })
    .limit(limit + 1) // fetch one extra to know whether another page exists
    .lean();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && page.length > 0
      ? encodeCursor(
          page[page.length - 1]!.timestamp,
          page[page.length - 1]!._id.toString()
        )
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
