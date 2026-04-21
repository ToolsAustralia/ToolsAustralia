"use client";

import Image from "next/image";
import { getPackageIconByName, getPackageIconWrapperScaleClass, type PackageIconData } from "@/utils/images/package-icons";
import {
  getMembershipSectionColorScheme,
  derivePlanIdFromPackage,
} from "@/utils/package-colors/packageColorScheme";

// Type alias for consistency with existing code
type StaticImageData = PackageIconData;

// Helper function to get package icon based on package name and type
// Uses centralized utility for consistency
const getPackageIcon = (packageName: string, membershipType?: "subscription" | "one-time"): StaticImageData | null => {
  return getPackageIconByName(packageName, membershipType);
};

// Helper function to get badge text from package name
const getBadgeText = (packageName: string, membershipType?: "subscription" | "one-time"): string => {
  const lowerName = packageName.toLowerCase();
  const isSubscription = membershipType === "subscription";

  // For subscriptions
  if (isSubscription) {
    if (lowerName.includes("boss")) return "BOSS";
    if (lowerName.includes("foreman")) return "FOREMAN";
    if (lowerName.includes("tradie")) return "TRADIE";
  }

  // For one-time packages
  if (!isSubscription) {
    if (lowerName.includes("power pack") || lowerName.includes("power")) return "POWER";
    if (lowerName.includes("boss pack") || lowerName.includes("boss")) return "BOSS";
    if (lowerName.includes("foreman pack") || lowerName.includes("foreman")) return "FOREMAN";
    if (lowerName.includes("tradie pack") || lowerName.includes("tradie")) return "TRADIE";
    if (lowerName.includes("apprentice pack") || lowerName.includes("apprentice")) return "APPRENTICE";
  }

  // Fallback: return uppercase version of name
  return packageName.toUpperCase();
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
   * When true, only the package icon is shown (no text). Used e.g. on my-account one-time card.
   */
  iconOnly?: boolean;
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
  iconOnly = false,
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
  const colorScheme = getMembershipSectionColorScheme(planId, isMembershipTab);
  const badgeStyle = colorScheme.badgeStyle ?? {};

  // Icon-only: render icon with package-themed background and border
  if (iconOnly) {
    if (!packageIcon) return null;
    const Wrapper = onClick ? "button" : "span";
    const iconStyle = badgeStyle.background
      ? {
          ...badgeStyle,
          border: `2px solid ${colorScheme.accentHex}${colorScheme.cardBorderOpacity || "CC"}`,
          padding: "2px",
        }
      : {
          background: colorScheme.accentHex,
          border: `2px solid ${colorScheme.accentHex}`,
          boxShadow: `0 0 8px ${colorScheme.accentHex}66`,
          padding: "2px",
        };
    return (
      <Wrapper
        type={onClick ? "button" : undefined}
        onClick={handleClick}
        className={`inline-flex items-center justify-center flex-shrink-0 rounded-full p-1 ${className} ${
          onClick ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1" : ""
        }`}
        style={iconStyle}
        title={packageData.name}
        aria-label={onClick ? `View details for ${packageData.name}` : undefined}
      >
        <Image
          src={packageIcon}
          alt={`${packageData.name} icon`}
          className={`w-5 h-5 object-contain ${iconScaleClass}`}
          width={20}
          height={20}
        />
      </Wrapper>
    );
  }

  // Get badge text
  const badgeText = getBadgeText(packageData.name, finalMembershipType);

  // Check if this is a boss or power package (for special animation)
  const isPremiumPackage =
    packageData.name.toLowerCase().includes("boss") || packageData.name.toLowerCase().includes("power");

  const Wrapper = onClick ? "button" : "span";
  const fullBadgeStyle = badgeStyle.background
    ? {
        ...badgeStyle,
        border: `2px solid ${colorScheme.accentHex}${colorScheme.cardBorderOpacity || "CC"}`,
      }
    : {
        background: colorScheme.accentHex,
        border: `2px solid ${colorScheme.accentHex}`,
        boxShadow: `0 0 20px ${colorScheme.accentHex}66`,
      };
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={handleClick}
      className={`inline-flex items-center gap-1 font-bold text-xs px-2 py-1 rounded-full shadow-lg relative overflow-hidden ${colorScheme.text} ${className} ${isPremiumPackage ? "animate-pulse" : ""} ${
        onClick ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1" : ""
      }`}
      style={fullBadgeStyle}
      aria-label={onClick ? `View details for ${packageData.name}` : undefined}
    >
      {/* Package Icon */}
      {packageIcon && (
        <div className={`relative w-5 h-5 flex-shrink-0 ${iconScaleClass}`}>
          <Image
            src={packageIcon}
            alt={`${packageData.name} icon`}
            className="w-full h-full object-contain"
            width={20}
            height={20}
          />
        </div>
      )}

      {/* Badge Text */}
      <span>{badgeText}</span>
    </Wrapper>
  );
}
