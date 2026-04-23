import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/api-auth";
import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import { getPackageById } from "@/data/membershipPackages";
import { buildCampaignAudienceMongoFilter } from "@/utils/redeemables/campaignAudienceFilter";
import { loadTopMajorDrawPercentileUserIds } from "@/utils/redeemables/topMajorDrawPercentile";

/** Cap bulk ID responses to avoid huge payloads / BSON limits on campaign.includeUserIds */
const MAX_MATCHING_USER_IDS = 50_000;

const filterBodySchema = z.object({
  subscriptionStatus: z.enum(["active", "inactive", "any"]).optional(),
  membershipTiers: z
    .array(z.enum(["tradie-subscription", "foreman-subscription", "boss-subscription"]))
    .optional(),
  states: z.array(z.string().trim().min(2).max(3)).optional(),
  requiresEmailVerified: z.boolean().optional(),
  topEntriesPercent: z.number().int().min(1).max(100).optional(),
  searchQuery: z.string().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  /** When true, returns every matching user id (same filters), ignoring page/limit */
  returnMatchingUserIds: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser();
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }

    await connectDB();
    const body = await request.json();
    const payload = filterBodySchema.parse(body);

    const page = payload.page ?? 1;
    const limit = payload.limit ?? 25;

    let restrictToUserIds: string[] | undefined;
    if (typeof payload.topEntriesPercent === "number") {
      restrictToUserIds = await loadTopMajorDrawPercentileUserIds(payload.topEntriesPercent);
      if (restrictToUserIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            users: [],
            pagination: {
              currentPage: page,
              totalPages: 0,
              totalCount: 0,
              limit,
              hasNextPage: false,
              hasPrevPage: false,
            },
            warning:
              "No users match the top % filter (no active major draw or no entries). Adjust or clear Top % entries.",
          },
        });
      }
    }

    const mongoFilter = buildCampaignAudienceMongoFilter({
      subscriptionStatus: payload.subscriptionStatus,
      membershipTiers: payload.membershipTiers,
      states: payload.states,
      requiresEmailVerified: payload.requiresEmailVerified ?? true,
      searchQuery: payload.searchQuery,
      restrictToUserIds,
    });

    if (payload.returnMatchingUserIds) {
      const totalCount = await User.countDocuments(mongoFilter);
      if (totalCount > MAX_MATCHING_USER_IDS) {
        return NextResponse.json(
          {
            success: false,
            error: `Too many matches (${totalCount.toLocaleString()}). Narrow filters (maximum ${MAX_MATCHING_USER_IDS.toLocaleString()} users per bulk add).`,
          },
          { status: 400 }
        );
      }
      const idDocs = await User.find(mongoFilter).select("_id").sort({ createdAt: -1 }).lean();
      const userIds = idDocs.map((d) => d._id.toString());
      return NextResponse.json({
        success: true,
        data: {
          userIds,
          totalCount,
        },
      });
    }

    const [totalCount, rawUsers] = await Promise.all([
      User.countDocuments(mongoFilter),
      User.find(mongoFilter)
        .select(
          "_id firstName lastName email state role isActive isEmailVerified createdAt lastLogin subscription.packageId subscription.isActive subscription.status"
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const currentMajorDraw = await MajorDraw.findOne({ status: "active" }).select("entries").lean();
    const userEntriesMap = new Map<string, number>();
    if (currentMajorDraw?.entries) {
      for (const entry of currentMajorDraw.entries as Array<{
        userId: { toString: () => string };
        totalEntries?: number;
        quantity?: number;
      }>) {
        const uid = entry.userId.toString();
        const c = entry.totalEntries || entry.quantity || 0;
        userEntriesMap.set(uid, (userEntriesMap.get(uid) || 0) + c);
      }
    }

    const users = rawUsers.map((user) => {
      const userId = user._id.toString();
      let packageName: string | null = null;
      const pkgId = user.subscription?.packageId;
      if (pkgId) {
        const packageData = getPackageById(pkgId.toString());
        packageName = packageData?.name ?? null;
      }
      return {
        id: userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        state: user.state,
        role: user.role,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        subscription: user.subscription?.packageId
          ? {
              packageId: user.subscription.packageId.toString(),
              packageName,
              isActive: Boolean(user.subscription.isActive),
              status: user.subscription.status ?? "",
            }
          : null,
        majorDrawEntries: userEntriesMap.get(userId) ?? 0,
      };
    });

    const totalPages = Math.ceil(totalCount / limit) || 0;

    return NextResponse.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }
    console.error("Error filtering campaign audience:", error);
    return NextResponse.json({ success: false, error: "Failed to filter audience" }, { status: 500 });
  }
}
