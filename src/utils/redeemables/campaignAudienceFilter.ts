import mongoose from "mongoose";

export type CampaignAudienceSubscriptionStatus = "active" | "inactive" | "any";

export interface CampaignAudienceFilterInput {
  subscriptionStatus?: CampaignAudienceSubscriptionStatus;
  membershipTiers?: string[];
  states?: string[];
  requiresEmailVerified?: boolean;
  searchQuery?: string;
  /** When set, restrict to these user IDs (e.g. top major draw percentile) */
  restrictToUserIds?: string[];
}

/**
 * Mongo filter for admin audience preview / picker. Aligns with TargetingService dynamic segment
 * (active account + subscription rules), plus optional subscriptionStatus widening.
 */
export function buildCampaignAudienceMongoFilter(input: CampaignAudienceFilterInput): Record<string, unknown> {
  const {
    subscriptionStatus = "active",
    membershipTiers = [],
    states = [],
    requiresEmailVerified = true,
    searchQuery,
    restrictToUserIds,
  } = input;

  const filter: Record<string, unknown> = {
    isActive: true,
  };

  if (subscriptionStatus === "active") {
    filter["subscription.isActive"] = true;
  } else if (subscriptionStatus === "inactive") {
    filter.$or = [
      { subscription: { $exists: false } },
      { subscription: null },
      { "subscription.isActive": { $ne: true } },
    ];
  }
  // "any": only isActive: true on user account

  if (requiresEmailVerified) {
    filter.isEmailVerified = true;
  }

  const normalizedStates = states.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (normalizedStates.length > 0) {
    filter.state = { $in: normalizedStates };
  }

  if (membershipTiers.length > 0) {
    filter["subscription.packageId"] = { $in: membershipTiers };
  }

  if (restrictToUserIds && restrictToUserIds.length > 0) {
    const objectIds = restrictToUserIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (objectIds.length > 0) {
      filter._id = { $in: objectIds };
    } else {
      filter._id = { $in: [] };
    }
  }

  const q = searchQuery?.trim();
  if (q) {
    const searchOr: Record<string, unknown>[] = [
      { email: { $regex: q, $options: "i" } },
      { firstName: { $regex: q, $options: "i" } },
      { lastName: { $regex: q, $options: "i" } },
      {
        $expr: {
          $regexMatch: {
            input: { $concat: ["$firstName", " ", "$lastName"] },
            regex: q,
            options: "i",
          },
        },
      },
    ];
    if (mongoose.Types.ObjectId.isValid(q)) {
      searchOr.push({ _id: new mongoose.Types.ObjectId(q) });
    }
    const and = (filter.$and as Record<string, unknown>[] | undefined) ?? [];
    filter.$and = [...and, { $or: searchOr }];
  }

  return filter;
}
