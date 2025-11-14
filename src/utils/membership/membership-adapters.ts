import { MembershipPlan as APIMembershipPlan } from "@/hooks/useMemberships";
import { UpsellOffer } from "@/types/upsell";

// Local component interface (used by existing modals)
export interface LocalMembershipPlan {
  id: string;
  name: string;
  subtitle?: string;
  price: number;
  period: string;
  features: { text: string }[];
  isPopular?: boolean;
  buttonText: string;
  buttonStyle: "primary" | "secondary";
  originalPrice?: number;
  discount?: string;
  isMemberOnly?: boolean;
  // Support for upsell metadata
  metadata?: {
    entriesCount?: number;
    category?: string;
    isUpsellOffer?: boolean;
    validUntil?: string;
    [key: string]: string | number | boolean | undefined; // Allow additional metadata from upsell offers
  };
}

/**
 * Converts API MembershipPlan to local component format
 * This maintains backward compatibility with existing modal components
 */
export function convertToLocalPlan(apiPlan: APIMembershipPlan): LocalMembershipPlan {
  return {
    id: apiPlan.id, // Use the backward-compatible string ID
    name: apiPlan.name,
    subtitle: apiPlan.subtitle,
    price: apiPlan.price,
    period: apiPlan.period,
    features: apiPlan.features.map((feature) => ({ text: feature })),
    isPopular: apiPlan.isPopular,
    buttonText: apiPlan.buttonText,
    buttonStyle: apiPlan.buttonStyle,
    originalPrice: undefined, // Not available in MembershipPlan
    discount: undefined, // Not available in MembershipPlan
    isMemberOnly: apiPlan.isMemberOnly,
    metadata: {
      entriesCount: apiPlan.totalEntries || apiPlan.entriesPerMonth || 0,
    },
  };
}

/**
 * Converts local component plan to API format
 * Used when submitting to backend APIs that need the _id field
 */
export function convertToAPIPlan(
  localPlan: LocalMembershipPlan,
  apiPlans: APIMembershipPlan[]
): APIMembershipPlan | null {
  // First try to match by full exact ID first (most reliable)
  const exactMatch = apiPlans.find((plan) => plan.id === localPlan.id);
  if (exactMatch) {
    return exactMatch;
  }

  // If no exact ID match, try to match by name with correct membership status
  const nameMatches = apiPlans.filter((plan) => plan.name === localPlan.name);

  // If no matches found
  if (nameMatches.length === 0) {
    return null;
  }

  // If only one match found
  if (nameMatches.length === 1) {
    console.log("🔍 Single default match:", {
      selected: { id: nameMatches[0].id, _id: nameMatches[0]._id, isMemberOnly: nameMatches[0].isMemberOnly },
    });
    return nameMatches[0];
  }

  // Multiple matches exist, need to choose based on membership status
  console.log("🔍 Multiple API plans with same name found:", {
    localPlan: { id: localPlan.id, name: localPlan.name, isMemberOnly: localPlan.isMemberOnly },
    nameMatches: nameMatches.map((p) => ({ id: p.id, _id: p._id, name: p.name, isMemberOnly: p.isMemberOnly })),
  });

  // Choose based on matching isMemberOnly flag
  const membershipMatch = nameMatches.find((plan) => plan.isMemberOnly === localPlan.isMemberOnly);
  if (membershipMatch) {
    console.log("🔍 Found membership-status match:", {
      selected: { id: membershipMatch.id, _id: membershipMatch._id, isMemberOnly: membershipMatch.isMemberOnly },
    });
    return membershipMatch;
  }

  // Fallback: If we can't determine membership status, prefer based on LocalPlan ID containing `-member`
  if (localPlan.id.includes("-member")) {
    const memberVersion = nameMatches.find((p) => p.isMemberOnly === true);
    if (memberVersion) {
      console.log("🔍 Fallback to member version due to -member in ID:", {
        selected: { id: memberVersion.id, _id: memberVersion._id, isMemberOnly: memberVersion.isMemberOnly },
      });
      return memberVersion;
    }
  }

  // Look for exact non-member matches otherwise pass along to final
  const nonMemberVersion = nameMatches.find((p) => p.isMemberOnly === false);
  if (nonMemberVersion) {
    console.log("🔍 Fallback to non-member version:", {
      selected: { id: nonMemberVersion.id, _id: nonMemberVersion._id, isMemberOnly: nonMemberVersion.isMemberOnly },
    });
    return nonMemberVersion;
  }

  // Final fallback: Default to the first match if status can't be determined
  const defaultMatch = nameMatches[0];
  console.log("🔍 Final fallback - using first match:", {
    selected: { id: defaultMatch.id, _id: defaultMatch._id, isMemberOnly: defaultMatch.isMemberOnly },
  });
  return defaultMatch;
}

/**
 * Gets the MongoDB ObjectId for a local plan
 * This is what the backend APIs expect for packageId
 */
export function getPackageId(localPlan: LocalMembershipPlan, apiPlans: APIMembershipPlan[]): string | null {
  const apiPlan = convertToAPIPlan(localPlan, apiPlans);
  return apiPlan?._id || null;
}
/**
 * Converts UpsellOffer to LocalMembershipPlan format
 * This allows upsell offers to be processed by MembershipModal as if they were membership packages
 */
export function convertUpsellToLocalPlan(upsellOffer: UpsellOffer): LocalMembershipPlan {
  return {
    id: upsellOffer.id, // Use the upsell offer ID directly
    name: upsellOffer.title,
    subtitle: upsellOffer.description,
    price: upsellOffer.discountedPrice,
    period: "one-time" as const, // Upsells are always one-time
    features: upsellOffer.conditions.map((condition) => ({ text: condition })),
    buttonText: upsellOffer.buttonText,
    buttonStyle: "primary" as const, // Upsells are highlighted to drive conversion
    isMemberOnly: false, // Upsells can be purchased by anyone
    // Add upsell-specific tracking data that can be used by the purchase logic
    metadata: {
      entriesCount: upsellOffer.entriesCount,
      category: upsellOffer.category,
      isUpsellOffer: true, // Flag to identify this as an upsell purchase
      validUntil: upsellOffer.validUntil,
    },
  };
}
