/**
 * React Query Key Structure for Tools Australia
 *
 * This file defines all query keys used throughout the application.
 * Keys are hierarchical and typed for better developer experience.
 */

export const queryKeys = {
  // User-related queries
  users: {
    all: ["users"] as const,
    detail: (id: string) => ["users", id] as const,
    account: (id: string) => ["users", id, "account"] as const,
    dashboard: (id: string) => ["users", id, "dashboard"] as const,
    profile: (id: string) => ["users", id, "profile"] as const,
  },

  // Product queries
  products: {
    all: ["products"] as const,
    detail: (id: string) => ["products", id] as const,
    list: (filters: Record<string, unknown>) => ["products", "list", filters] as const,
    search: (query: string) => ["products", "search", query] as const,
    categories: ["products", "categories"] as const,
    bestsellers: ["products", "bestsellers"] as const,
    newarrivals: ["products", "newarrivals"] as const,
    featured: ["products", "featured"] as const,
    related: (id: string) => ["products", id, "related"] as const,
    analytics: (id: string) => ["products", id, "analytics"] as const,
    reviews: (id: string) => ["products", id, "reviews"] as const,
  },

  // Mini draw queries
  miniDraws: {
    all: ["mini-draws"] as const,
    detail: (id: string) => ["mini-draws", id] as const,
    list: (filters: Record<string, unknown>) => ["mini-draws", "list", filters] as const,
    entries: (id: string) => ["mini-draws", id, "entries"] as const,
    activity: (id: string) => ["mini-draws", id, "activity"] as const,
    results: ["mini-draws", "results"] as const,
    userEntries: (userId: string) => ["mini-draws", "user-entries", userId] as const,
  },

  // Membership queries
  memberships: {
    packages: ["memberships", "packages"] as const,
    user: (id: string) => ["memberships", "user", id] as const,
    subscriptions: (id: string) => ["memberships", "subscriptions", id] as const,
    oneTime: (id: string) => ["memberships", "one-time", id] as const,
  },

  // Payment method queries
  paymentMethods: {
    all: (userId: string) => ["payment-methods", userId] as const,
    default: (userId: string) => ["payment-methods", userId, "default"] as const,
  },

  // Cart queries
  cart: {
    all: (userId: string) => ["cart", userId] as const,
    items: (userId: string) => ["cart", userId, "items"] as const,
    summary: (userId: string) => ["cart", userId, "summary"] as const,
  },

  // Order queries
  orders: {
    all: (userId: string) => ["orders", userId] as const,
    detail: (id: string) => ["orders", id] as const,
    recent: (userId: string) => ["orders", userId, "recent"] as const,
    analytics: (userId: string) => ["orders", userId, "analytics"] as const,
  },

  // Major draw queries
  majorDraw: {
    all: ["major-draw"] as const,
    current: ["major-draw", "current"] as const,
    userStats: (userId: string) => ["major-draw", "user-stats", userId] as const,
    entries: (userId: string) => ["major-draw", "entries", userId] as const,
  },

  // Upsell queries
  upsell: {
    offers: (params: Record<string, unknown>) => ["upsell", "offers", params] as const,
    analytics: (params: Record<string, unknown>) => ["upsell", "analytics", params] as const,
    tracking: (offerId: string) => ["upsell", "tracking", offerId] as const,
  },

  // Mini draw queries
  miniDraw: {
    packages: ["mini-draw", "packages"] as const,
    userPackages: (userId: string) => ["mini-draw", "user-packages", userId] as const,
  },

  // Giveaway queries
  giveaways: {
    all: ["giveaways"] as const,
    detail: (id: string) => ["giveaways", id] as const,
    active: ["giveaways", "active"] as const,
  },

  // Rewards queries
  rewards: {
    user: (userId: string) => ["rewards", userId] as const,
    history: (userId: string) => ["rewards", userId, "history"] as const,
    redeem: (userId: string) => ["rewards", userId, "redeem"] as const,
  },

  // Referral queries
  referrals: {
    profile: (userId: string) => ["referrals", "profile", userId] as const,
  },

  // Admin queries
  admin: {
    users: ["admin", "users"] as const,
    orders: ["admin", "orders"] as const,
    analytics: ["admin", "analytics"] as const,
    products: ["admin", "products"] as const,
    miniDraws: ["admin", "mini-draws"] as const,
  },
} as const;

// Type helpers for query keys
export type QueryKey = typeof queryKeys;
export type UserQueryKey = QueryKey["users"];
export type ProductQueryKey = QueryKey["products"];
export type MiniDrawQueryKey = QueryKey["miniDraws"];
export type MembershipQueryKey = QueryKey["memberships"];
export type PaymentMethodQueryKey = QueryKey["paymentMethods"];
export type CartQueryKey = QueryKey["cart"];
export type OrderQueryKey = QueryKey["orders"];
export type MajorDrawQueryKey = QueryKey["majorDraw"];
export type UpsellQueryKey = QueryKey["upsell"];

export type GiveawayQueryKey = QueryKey["giveaways"];
export type RewardsQueryKey = QueryKey["rewards"];
export type AdminQueryKey = QueryKey["admin"];
