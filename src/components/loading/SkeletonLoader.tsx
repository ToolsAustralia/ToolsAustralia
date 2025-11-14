"use client";

import React from "react";

/**
 * Skeleton Loader Components
 *
 * Use cases:
 * - Product cards, user profiles, content sections
 * - When you know the layout structure
 * - Better perceived performance than spinners
 */

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = "", width, height, rounded = false }) => {
  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === "number" ? `${width}px` : width;
  if (height) style.height = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      className={`
        bg-gray-200 animate-pulse
        ${rounded ? "rounded-full" : "rounded-lg"}
        ${className}
      `}
      style={style}
    />
  );
};

/**
 * Product Card Skeleton
 * Perfect for product listings
 */
export const ProductCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl shadow-lg p-4 space-y-4">
    {/* Product Image */}
    <Skeleton height={200} className="w-full rounded-xl" />

    {/* Product Info */}
    <div className="space-y-2">
      <Skeleton height={16} width="80%" />
      <Skeleton height={14} width="60%" />
      <Skeleton height={20} width="40%" />
    </div>

    {/* Button */}
    <Skeleton height={40} className="w-full rounded-full" />
  </div>
);

/**
 * User Profile Skeleton
 * For user account pages
 */
export const UserProfileSkeleton: React.FC = () => (
  <div className="space-y-6">
    {/* Profile Header */}
    <div className="flex items-center space-x-4">
      <Skeleton width={80} height={80} rounded />
      <div className="space-y-2">
        <Skeleton height={24} width={200} />
        <Skeleton height={16} width={150} />
      </div>
    </div>

    {/* Stats Cards */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl p-4 space-y-2">
          <Skeleton height={16} width="60%" />
          <Skeleton height={24} width="40%" />
        </div>
      ))}
    </div>
  </div>
);

/**
 * Table Skeleton
 * For data tables and lists
 */
export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({ rows = 5, columns = 4 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="flex space-x-4">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Skeleton key={colIndex} height={20} width={colIndex === 0 ? "30%" : "20%"} />
        ))}
      </div>
    ))}
  </div>
);

/**
 * Membership Card Skeleton
 * For membership sections
 */
export const MembershipCardSkeleton: React.FC = () => (
  <div className="bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl p-6 space-y-4 animate-pulse">
    <div className="space-y-2">
      <Skeleton height={24} width="70%" />
      <Skeleton height={16} width="90%" />
      <Skeleton height={16} width="80%" />
    </div>

    <div className="space-y-2">
      <Skeleton height={32} width="60%" />
      <Skeleton height={20} width="40%" />
    </div>

    <Skeleton height={48} className="w-full rounded-full" />
  </div>
);

