/**
 * Admin API: Search Users
 *
 * GET /api/admin/users/search?q=searchTerm&page=1&limit=20
 *
 * Allows admin to search users by name, email, mobile, or user ID.
 * Returns paginated results with user details and major draw entry counts.
 *
 * Thin handler — business logic lives in `UserAdminQueryService.searchAdminUsers`.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import { searchAdminUsers } from "@/services/admin/UserAdminQueryService";

const searchSchema = z.object({
  q: z
    .string()
    .max(100, "Search query too long")
    .transform((s) => s?.trim() ?? ""),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20)),
  majorDrawId: z.string().optional(),
  miniDrawId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("users.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const validated = searchSchema.parse({
      q: searchParams.get("q") || "",
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "20",
      majorDrawId: searchParams.get("majorDrawId") || undefined,
      miniDrawId: searchParams.get("miniDrawId") || undefined,
    });

    if (!validated.q && !validated.majorDrawId && !validated.miniDrawId) {
      return NextResponse.json(
        { error: "Search query or draw ID is required" },
        { status: 400 },
      );
    }
    if (validated.page < 1) {
      return NextResponse.json({ error: "Page must be at least 1" }, { status: 400 });
    }
    if (validated.limit < 1 || validated.limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 },
      );
    }

    const result = await searchAdminUsers({
      q: validated.q,
      page: validated.page,
      limit: validated.limit,
      majorDrawId: validated.majorDrawId,
      miniDrawId: validated.miniDrawId,
    });

    return NextResponse.json({
      success: true,
      data: {
        users: result.users.map((u) => ({
          _id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          mobile: u.mobile,
          state: u.state,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt,
          lastLogin: u.lastLogin,
          currentDrawEntries: u.currentDrawEntries,
        })),
        pagination: result.pagination,
        searchInfo: {
          query: validated.q,
          resultsFound: result.pagination.totalCount,
          currentDraw: result.currentDraw,
        },
      },
    });
  } catch (error) {
    console.error("Error searching users:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to search users",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
