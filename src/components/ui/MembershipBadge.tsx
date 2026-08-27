"use client";

import Image from "next/image";
import { getPackageIconByName, getPackageIconWrapperScaleClass, type PackageIconData } from "@/utils/images/package-icons";
import { derivePlanIdFromPackage } from "@/utils/package-colors/packageColorScheme";
import { getRemappedPackageScheme } from "@/utils/package-colors/packageCardSurface";
import { cn } from "@/utils/cn";

// Type alias for consistency with existing code
type StaticImageData = PackageIconData;

// Helper function to get package icon based on package name and type
// Uses centralized utility for consistency
const getPackageIcon = (packageName: string, membershipType?: "subscription" | "one-time"): StaticImageData | null => {
  return getPackageIconByName(packageName, membershipType);
};

// Short tier label only (no "Pack", "Additional", etc.) — matches package icon tiers
const getBadgeText = (packageName: string): string => {
  const lowerName = packageName.toLowerCase();

  if (lowerName.includes("vip")) return "VIP";
  if (lowerName.includes("power")) return "Power";
  if (lowerName.includes("boss")) return "Boss";
  if (lowerName.includes("foreman")) return "Foreman";
  if (lowerName.includes("tradie")) return "Tradie";
  if (lowerName.includes("apprentice")) return "Apprentice";

  const stripped = packageName
    .replace(/\badditional\b/gi, "")
    .replace(/\bpack\b/gi, "")
    .replace(/\bmember\b/gi, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return packageName;
  return stripped
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.toUpperCase() === "VIP" ? "VIP" : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
};

interface MembershipBadgeProps {
  /**
   * Package data containing name, type, and optional _id (from API)
   */
  packageData?: { _id?: string; name: string; type?: "subscription" | "one-time" };
  /**
   * Whether the membership is currently active
   */
  isActive?: boolean;
  /**
   * Type of membership (subscription or one-time)
   * Takes precedence over packageData.type if provided
   */
  membershipType?: "subscription" | "one-time";
  /**
   * When true, only the tier label is shown (no icon). Used in the site header/nav.
   */
  textOnly?: boolean;
  /**
   * Optional className to add to the badge
   */
  className?: string;
  /**
   * Optional click handler. When provided, the badge is rendered as a button (cursor-pointer, focus ring).
   * Use to open PackageDetailModal or other package explainer.
   */
  onClick?: () => void;
}

/**
 * MembershipBadge Component
 *
 * A reusable badge component that displays membership package information
 * with design consistency matching the membership package cards.
 *
 * Features:
 * - Uses the same background gradient as membership cards
 * - Displays package icon images (not Lucide icons)
 * - Uses package-specific text colors from the color scheme
 * - Gradient border matching package colors
 *
 * @example
 * <MembershipBadge
 *   packageData={{ name: "Boss", type: "subscription" }}
 *   isActive={true}
 *   membershipType="subscription"
 * />
 */
export default function MembershipBadge({
  packageData,
  isActive,
  membershipType,
  textOnly = false,
  className = "",
  onClick,
}: MembershipBadgeProps) {
  // Don't render if not active or no package data
  if (!isActive || !packageData || !packageData.name) {
    return null;
  }

  // Determine membership type (prefer prop over packageData.type)
  const finalMembershipType = membershipType || packageData.type;

  // Get package icon
  const packageIcon = getPackageIcon(packageData.name, finalMembershipType);

  const handleClick = onClick
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick();
      }
    : undefined;

  // Derive planId for package-themed styling
  const planId = derivePlanIdFromPackage(packageData, finalMembershipType);
  const iconScaleClass = getPackageIconWrapperScaleClass(planId, "badge");
  const isMembershipTab = finalMembershipType === "subscription";
  /*
    The SCHEME comes from the shared remapper, not from a getter directly.

    Three tiers deliberately paint a different tier's colour so no two adjacent cards
    repeat one. This badge skipped those remaps and rendered membership Tradie as
    #5ca9ec while its own card rendered #00E5FF — and since
    getMembershipSectionColorScheme returns the SAME value for tradie-subscription and
    tradie-pack, it read as the one-time pack's colour.

    It has to be the whole scheme, not just the accent: the fill below comes from
    `badgeStyle.background`, so remapping the accent alone left the badge filled from
    one tier and outlined from another.
  */
  const colorScheme = getRemappedPackageScheme(planId, isMembershipTab);
  /*
    The accent comes from the SHARED resolver, not from the scheme above.

    Three tiers deliberately paint a different tier's colour so no two adjacent cards
    repeat one, and this badge was skipping those remaps: membership Tradie rendered
    #5ca9ec here while its own card rendered #00E5FF. Worse,
    getMembershipSectionColorScheme returns the SAME value for tradie-subscription and
    tradie-pack, so the badge read as the one-time pack's colour to anyone comparing
    the two.
  */
  const accentHex = colorScheme.accentHex;
  const badgeStyle = colorScheme.badgeStyle ?? {};

  // Get badge text
  const badgeText = getBadgeText(packageData.name);

  // Check if this is a boss or power package (for special animation)
  const isPremiumPackage =
    packageData.name.toLowerCase().includes("boss") || packageData.name.toLowerCase().includes("power");

  const Wrapper = onClick ? "button" : "span";
  const fullBadgeStyle = badgeStyle.background
    ? {
        ...badgeStyle,
        border: `2px solid ${accentHex}${colorScheme.cardBorderOpacity || "CC"}`,
      }
    : {
        background: accentHex,
        border: `2px solid ${accentHex}`,
        boxShadow: `0 0 20px ${accentHex}66`,
      };
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={handleClick}
      className={`inline-flex items-center ${textOnly ? "gap-0 px-2.5" : "gap-1 px-2"} font-bold text-xs py-1 rounded-full shadow-lg relative overflow-hidden ${colorScheme.text} ${className} ${isPremiumPackage ? "animate-pulse" : ""} ${
        onClick ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1" : ""
      }`}
      style={fullBadgeStyle}
      aria-label={onClick ? `View details for ${packageData.name}` : undefined}
    >
      {/* Package Icon */}
      {!textOnly && packageIcon && (
        <div className={cn("relative w-5 h-5 flex-shrink-0", iconScaleClass)}>
          <Image
            src={packageIcon}
            alt={`${packageData.name} icon`}
            className="w-full h-full object-contain"
            width={20}
            height={20}
            sizes="20px"
          />
        </div>
      )}

      {/*
        ICON ONLY on a phone.

        The header is the tightest row on the site, and the tier is already legible from
        the icon and its colour — the word costs horizontal space that the cart and
        account controls need more. It stays in the accessible name via sr-only, so a
        screen reader still announces the tier rather than an unlabelled image.
      */}
      <span className="sr-only sm:not-sr-only">{badgeText}</span>
    </Wrapper>
  );
}
