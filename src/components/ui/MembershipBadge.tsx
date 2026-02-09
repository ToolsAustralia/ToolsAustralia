"use client";

import Image from "next/image";
import { getPackageIconByName, type PackageIconData } from "@/utils/images/package-icons";

// Type alias for consistency with existing code
type StaticImageData = PackageIconData;

// Helper function to extract gradient color for border
const getGradientColor = (gradient: string): string => {
  if (gradient.includes("yellow-3") || gradient.includes("yellow-4")) return "#facc15";
  if (gradient.includes("blue")) return "#3b82f6";
  if (gradient.includes("purple")) return "#9333ea";
  if (gradient.includes("orange")) return "#f97316";
  if (gradient.includes("yellow-4") && gradient.includes("amber")) return "#fbbf24";
  if (gradient.includes("gray-300") || gradient.includes("slate-400")) return "#94a3b8"; // Silver
  if (gradient.includes("blue-500") || gradient.includes("blue-600")) return "#3b82f6"; // Blue
  if (gradient.includes("green-500") || gradient.includes("green-600")) return "#22c55e"; // Green
  return "#6b7280";
};

// Helper function to get package color scheme (matching MembershipSection)
const getPackageColorScheme = (packageName: string) => {
  const lowerName = packageName.toLowerCase();

  if (lowerName.includes("apprentice")) {
    return {
      gradient: "from-gray-300 via-slate-400 to-gray-500",
      text: "text-gray-300",
      border: "border-gray-400/40",
    };
  } else if (lowerName.includes("tradie")) {
    return {
      gradient: "from-blue-500 via-blue-600 to-blue-700",
      text: "text-blue-400",
      border: "border-blue-500/50",
    };
  } else if (lowerName.includes("foreman")) {
    return {
      gradient: "from-green-500 via-green-600 to-green-700",
      text: "text-green-300",
      border: "border-green-500/50",
    };
  } else if (lowerName.includes("boss")) {
    return {
      gradient: "from-yellow-400 via-amber-500 to-yellow-600",
      text: "text-yellow-400",
      border: "border-yellow-400/50",
    };
  } else if (lowerName.includes("power")) {
    return {
      gradient: "from-orange-600 via-red-500 to-orange-700",
      text: "text-orange-400",
      border: "border-orange-500/50",
    };
  }

  // Default fallback
  return {
    gradient: "from-slate-600 via-gray-700 to-slate-800",
    text: "text-gray-400",
    border: "border-gray-500/50",
  };
};

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
   * Package data containing name and type
   */
  packageData?: { name: string; type?: "subscription" | "one-time" };
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

  // Icon-only: render just the icon (no text), e.g. for my-account one-time card
  if (iconOnly) {
    if (!packageIcon) return null;
    const Wrapper = onClick ? "button" : "span";
    return (
      <Wrapper
        type={onClick ? "button" : undefined}
        onClick={handleClick}
        className={`inline-flex items-center justify-center flex-shrink-0 ${className} ${
          onClick ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 rounded" : ""
        }`}
        title={packageData.name}
        aria-label={onClick ? `View details for ${packageData.name}` : undefined}
      >
        <Image
          src={packageIcon}
          alt={`${packageData.name} icon`}
          className="w-6 h-6 object-contain"
          width={24}
          height={24}
        />
      </Wrapper>
    );
  }

  // Get color scheme
  const colorScheme = getPackageColorScheme(packageData.name);

  // Get badge text
  const badgeText = getBadgeText(packageData.name, finalMembershipType);

  // Get gradient color for border
  const borderGradientColor = getGradientColor(colorScheme.gradient);

  // Check if this is a boss or power package (for special animation)
  const isPremiumPackage =
    packageData.name.toLowerCase().includes("boss") || packageData.name.toLowerCase().includes("power");

  const Wrapper = onClick ? "button" : "span";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={handleClick}
      className={`inline-flex items-center gap-1 font-bold text-xs px-2 py-1 rounded-full shadow-lg relative overflow-hidden ${
        colorScheme.text
      } ${className} ${isPremiumPackage ? "animate-pulse" : ""} ${
        onClick ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1" : ""
      }`}
      style={{
        border: `2px solid transparent`,
        backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${borderGradientColor}, transparent)`,
        backgroundOrigin: `border-box`,
        backgroundClip: `padding-box, border-box`,
      }}
      aria-label={onClick ? `View details for ${packageData.name}` : undefined}
    >
      {/* Package Icon */}
      {packageIcon && (
        <div className="relative w-5 h-5 flex-shrink-0">
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
