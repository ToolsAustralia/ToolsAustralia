// Export all sample data for easy importing
export * from "./sampleUsers";

export * from "./samplePartnerDiscounts";
export * from "./sampleOrders";
export * from "./sampleWinners";

// Note: Static data packages are exported via explicit named exports below to avoid naming conflicts

// Re-export commonly used functions

export {
  getSampleUser,
  getSampleUserByEmail,
  getSampleUsersByRole,
  getSampleUsersWithMembership,
  getAllSampleUsers,
  type SampleUser,
} from "./sampleUsers";

export {
  getActivePartnerDiscounts,
  getPartnerDiscountsByBrand,
  getPartnerDiscountsByCategory,
  getPartnerDiscountById,
  getExpiredPartnerDiscounts,
  getAllPartnerDiscounts,
  type SamplePartnerDiscount,
} from "./samplePartnerDiscounts";

export {
  getOrderById,
  getOrderByNumber,
  getOrdersByUser,
  getOrdersByStatus,
  getRecentOrders,
  getOrdersWithProducts,
  getOrdersWithTickets,
  getOrdersWithMemberships,
  getAllOrders,
  type SampleOrder,
} from "./sampleOrders";

// Re-export static data functions
export {
  getSubscriptionPackages as getStaticSubscriptionPackages,
  getOneTimePackages as getStaticOneTimePackages,
  getAllPackages as getAllStaticPackages,
  getPackageById as getStaticPackageById,
  getPackagesByType,
  getMemberOnlyPackages,
  getRegularPackages,
  searchPackagesByName,
  getPackagesByPriceRange,
  type StaticMembershipPackage,
} from "./membershipPackages";

export {
  getActiveUpsellPackages,
  getUpsellPackagesByCategory,
  getUpsellPackagesForPurchase,
  getUpsellPackageById,
  getUpsellPackagesByTrigger,
  sortUpsellPackagesByPriority,
  filterUpsellPackagesByUserSegment,
  getBestUpsellOffer,
  type StaticUpsellPackage,
} from "./upsellPackages";
export {
  top5Winners,
  allRecentWinners,
  getWinnersByTier,
  getTopWinnersByValue,
  getWinnersByDateRange,
  getActiveMiniDraws,
  getCompletedMiniDraws,
  type Winner,
} from "./sampleWinners";

export { sampleMiniDraws, type MiniDrawData } from "./samplePrizeDraws";

export { sampleProducts, type ProductData } from "./sampleProducts";

