// Admin Dashboard Types for Tools Australia

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "moderator" | "support";
  isAdmin: boolean;
  avatar?: string;
  lastLogin: Date;
}

export interface RealTimeStats {
  activeUsers: number;
  onlineUsers: number;
  currentRevenue: number;
  todayOrders: number;
  conversionRate: number;
  avgSessionTime: string;
  bounceRate: number;
  newSignups: number;
  activeDraws: number;
  ticketsSold: number;
  systemHealth: number;
  apiCalls: number;
}

export interface ChartData {
  month: string;
  shop: number;
  tickets: number;
  memberships: number;
  total: number;
}

export interface UserAnalytics {
  date: string;
  newUsers: number;
  activeUsers: number;
  returning: number;
}

export interface MembershipDistribution {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface DeviceData {
  device: string;
  users: number;
  percentage: number;
}

export interface DrawPerformance {
  name: string;
  revenue: number;
  tickets: number;
  completion: number;
  status: "active" | "completed" | "upcoming";
  endDate: string;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkLatency: number;
  uptime: string;
  activeConnections: number;
  dbConnections: number;
  cacheHitRate: number;
}

export interface RecentActivity {
  id: number;
  type: "user_signup" | "draw_complete" | "high_value_order" | "system_alert" | "membership_upgrade";
  user: string;
  action: string;
  time: string;
  status: "success" | "warning" | "error" | "info";
}

export interface AdvancedUserData {
  id: number;
  name: string;
  email: string;
  membership: "Boss" | "Foreman" | "Tradie" | "Free";
  joined: string;
  lastActive: string;
  totalSpent: number;
  lifetimeValue: number;
  orders: number;
  tickets: number;
  location: string;
  device: string;
  status: "active" | "inactive" | "banned";
  riskScore: "low" | "medium" | "high";
  engagement: number;
}

export interface ProductPerformance {
  id: number;
  name: string;
  category: string;
  price: number;
  cost: number;
  margin: number;
  stock: number;
  sold: number;
  revenue: number;
  rating: number;
  reviews: number;
  status: "active" | "inactive" | "out-of-stock";
  trend: "up" | "down";
  salesGrowth: number;
}

export interface AdminTab {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export interface AdminDashboardProps {
  user: AdminUser;
  navigateTo: (page: string) => void;
  selectedTab?: string;
}

type ReferralHistoryItem = {
  id: string;
  referralCode: string;
  status: "generated" | "pending" | "converted" | "expired" | "flagged";
  role: "referrer" | "friend";
  friendEmail?: string;
  conversionDate?: string;
  createdAt?: string;
  entriesAwarded: number;
};

// ========================================
// USER MANAGEMENT TYPES
// ========================================

export interface AdminUserListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  role: "user" | "admin";
  isActive: boolean;
  isEmailVerified: boolean;
  isMobileVerified?: boolean;
  profileSetupCompleted?: boolean;
  createdAt: string;
  lastLogin?: string;
  subscription?: {
    packageId: string;
    packageName?: string | null;
    isActive: boolean;
    startDate: string;
    endDate?: string;
    status: string;
  } | null;
  totalSpent: number;
  majorDrawEntries: number;
  miniDrawCount?: number;
  rewardsPoints: number;
  accumulatedEntries: number;
}

export interface AdminUserDetail {
  // Basic Information
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  profession?: string;
  /** ISO date string (YYYY-MM-DD) when set */
  birthdate?: string;
  role: "user" | "admin";
  isActive: boolean;
  isEmailVerified: boolean;
  isMobileVerified?: boolean;
  profileSetupCompleted?: boolean;
  /** false = opted out of Klaviyo marketing email; omitted/undefined treated as opted in */
  acceptsPromotionalEmail?: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;

  // Subscription Information
  subscription?: {
    packageId: string | null;
    packageName?: string;
    isActive: boolean;
    startDate: string;
    endDate?: string;
    cancelledAt?: string | null;
    status: string;
    autoRenew?: boolean;
    previousSubscription?: Record<string, unknown>;
    pendingChange?: Record<string, unknown>;
    lastDowngradeDate?: string;
    lastUpgradeDate?: string;
    lastMonthAccumulatedEntries?: number;
  } | null;

  // Package Information
  oneTimePackages: Array<{
    packageId?: string;
    packageName?: string;
    purchaseDate?: string;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
    entriesGranted?: number;
  }>;
  miniDrawPackages: Array<{
    packageId?: string;
    packageName?: string;
    miniDrawId?: string;
    purchaseDate?: string;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
    entriesGranted?: number;
    price?: number;
    partnerDiscountHours?: number;
    partnerDiscountDays?: number;
    stripePaymentIntentId?: string;
  }>;

  // Points and Entries
  rewardsPoints: number;
  accumulatedEntries: number;
  entryWallet: number;

  referral?: {
    code: string | null;
    successfulConversions: number;
    totalEntriesAwarded: number;
    pendingCount: number;
    history: ReferralHistoryItem[];
  };

  // Partner Discounts
  partnerDiscountQueue: Array<{
    _id?: string;
    packageId: string;
    packageName: string;
    packageType: "membership" | "one-time" | "mini-draw" | "upsell";
    discountDays: number;
    discountHours: number;
    purchaseDate: string;
    startDate?: string;
    endDate?: string;
    status: "active" | "queued" | "expired" | "cancelled";
    queuePosition: number;
    expiryDate: string;
    stripePaymentIntentId?: string;
  }>;
  activePartnerDiscount?: Record<string, unknown>;
  queuedPartnerDiscounts: Array<Record<string, unknown>>;

  // Saved payment methods preview
  savedPaymentMethods?: Array<{
    paymentMethodId: string;
    isDefault: boolean;
    createdAt?: string;
    lastUsed?: string;
  }>;

  // Purchase History
  upsellPurchases: Array<Record<string, unknown>>;
  upsellHistory: Array<Record<string, unknown>>;
  upsellStats?: Record<string, unknown>;

  // Redemption History
  redemptionHistory: Record<string, unknown>[];

  // Computed Statistics
  statistics: {
    totalSpent: number;
    totalOrders: number;
    totalOrderValue: number;
    currentDrawEntries: number;
    accountAge: number;
    daysSinceLastLogin?: number;
    lifetimeValue: number;
    averageOrderValue: number;
    engagementScore: number;
  };

  // History Arrays
  subscriptionHistory: Array<{
    timestamp?: string;
    packageId?: string;
    packageName?: string;
    price?: number;
    status?: string;
    /** Stripe invoice `billing_reason` when stored (e.g. subscription_cycle, subscription_create) */
    billingReason?: string;
  }>;
  oneTimePackageHistory: Array<Record<string, unknown>>;
  miniDrawHistory: Array<Record<string, unknown>>;
  majorDrawParticipation: Array<{
    drawId?: string;
    title?: string;
    status?: string;
    endDate?: string;
    totalEntries?: number;
    entries?: Array<{
      totalEntries?: number;
      entriesBySource?: {
        membership?: number;
        "one-time-package"?: number;
        upsell?: number;
        "mini-draw"?: number;
        referral?: number;
        "bonus-entry-promo"?: number;
      };
    }>;
  }>;
  miniDrawParticipation: Array<{
    miniDrawId?: string;
    miniDrawName?: string;
    miniDrawStatus?: string;
    drawDate?: string;
    totalEntries?: number;
    isActive?: boolean;
  }>;
  orders: Array<{
    _id?: string;
    orderNumber?: string;
    createdAt?: string;
    totalAmount?: number;
    status?: string;
  }>;
  /** Preview of recent events; full history via GET .../payment-events (paginated) */
  paymentEvents: Array<{
    _id?: string;
    eventType?: string;
    paymentIntentId?: string;
    hasRefundProcessed?: boolean;
    /** ISO timestamp of matching RefundProcessed (same paymentIntentId), when refunded */
    refundProcessedAt?: string;
    timestamp?: string;
    packageType?: string;
    packageId?: string;
    packageName?: string;
    data?: Record<string, unknown>;
  }>;
  /** Total count of payment events for this user (matches paginated API total) */
  paymentEventsTotal: number;
}

/** Paginated payment events response for admin user activity */
export interface AdminUserPaymentEventsPage {
  events: AdminUserDetail["paymentEvents"];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface UserFilters {
  page?: number;
  limit?: number;
  search?: string;
  subscriptionStatus?: "active" | "none" | "past_due";
  autoRenew?: "true" | "false"; // Filter by auto-renewal status
  membershipPackage?: string;
  role?: "user" | "admin";
  dateFrom?: string;
  dateTo?: string;
  /** Australian state codes (e.g. NSW, VIC); OR semantics when multiple */
  states?: string[];
  /** Active major draw with entries: yes | no */
  inActiveMajorDraw?: "yes" | "no" | "";
  sortBy?: "createdAt" | "email" | "lastLogin" | "totalSpent" | "majorDrawEntries" | "miniDrawCount";
  sortOrder?: "asc" | "desc";
}

export type UserActionType =
  | "resend_verification"
  | "reset_password"
  | "toggle_status"
  | "add_note"
  | "resend_sms_verification"
  | "send_email"
  | "admin_set_password"
  | "clear_payment_methods";

export interface UserActionRequest {
  action: UserActionType;
  note?: string;
  reason?: string;
  subject?: string;
  message?: string;
  newPassword?: string;
}

export interface UserActionResponse {
  success: boolean;
  action: UserActionType;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export interface AdminUsersResponse {
  success: boolean;
  data: {
    users: AdminUserListItem[];
    stats?: {
      totalUsers: number;
      activeSubscriptions: number;
      verifiedUsers: number;
      conversions: number;
    };
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      limit: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  };
}

export interface AdminUserDetailResponse {
  success: boolean;
  data: AdminUserDetail;
  error?: string;
  /** Present when DB saved but Klaviyo marketing preference sync failed */
  warning?: string;
}

export interface AdminUserUpdatePayload {
  basicInfo?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    state?: string;
    profession?: string;
    /** YYYY-MM-DD or empty string to clear */
    birthdate?: string;
    role?: "user" | "admin";
    isActive?: boolean;
    isEmailVerified?: boolean;
    isMobileVerified?: boolean;
    profileSetupCompleted?: boolean;
    /** Klaviyo marketing/promotional email (not transactional) */
    acceptsPromotionalEmail?: boolean;
  };
  subscription?: {
    packageId?: string | null;
    status?: string;
    isActive?: boolean;
    autoRenew?: boolean;
    startDate?: string;
    endDate?: string;
    cancelledAt?: string | null;
    lastDowngradeDate?: string;
    lastUpgradeDate?: string;
  } | null;
  rewards?: {
    rewardsPoints?: number;
    accumulatedEntries?: number;
    entryWallet?: number;
  };
  oneTimePackages?: Array<{
    packageId: string;
    purchaseDate?: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
    entriesGranted: number;
  }>;
  miniDrawPackages?: Array<{
    packageId: string;
    packageName: string;
    miniDrawId?: string;
    purchaseDate: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
    entriesGranted: number;
    price: number;
    partnerDiscountHours?: number;
    partnerDiscountDays?: number;
    stripePaymentIntentId: string;
  }>;
  majorDrawParticipation?: Array<{
    drawId: string;
    totalEntries: number;
  }>;
  miniDrawParticipation?: Array<{
    miniDrawId: string;
    totalEntries: number;
    isActive?: boolean;
  }>;
  partnerDiscountQueue?: Array<{
    queueId: string;
    status: "active" | "queued" | "expired" | "cancelled";
  }>;
}

// ========================================
// BONUS ENTRY PROMO TYPES
// ========================================

export type BonusEntryPromoType = "membership-packages" | "one-time-packages" | "mini-packages";

export interface BonusEntryPromo {
  id: string;
  type: BonusEntryPromoType;
  bonusEntries: number;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  startDateFormatted?: string; // Human-readable AEST date
  endDateFormatted?: string; // Human-readable AEST date
  isActive: boolean;
  isCurrentlyActive?: boolean; // Based on current AEST time
  isUpcoming?: boolean; // Promo hasn't started yet
  isExpired?: boolean; // Promo has ended
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
}

export interface CreateBonusEntryPromoPayload {
  type: BonusEntryPromoType;
  bonusEntries: number;
  startDate: string; // ISO date string in AEST
  endDate: string; // ISO date string in AEST
  description?: string;
  forceCreate?: boolean; // If true, deactivates existing promo of same type
}

export interface UpdateBonusEntryPromoPayload {
  type?: BonusEntryPromoType;
  bonusEntries?: number;
  startDate?: string; // ISO date string in AEST
  endDate?: string; // ISO date string in AEST
  description?: string;
  isActive?: boolean;
}

export interface BonusEntryPromoListResponse {
  success: boolean;
  data: BonusEntryPromo[];
  count: number;
}

export interface BonusEntryPromoResponse {
  success: boolean;
  data: BonusEntryPromo | null;
  message?: string;
}

export interface BonusEntryPromoConflict {
  existingPromo: {
    id: string;
    type: BonusEntryPromoType;
    bonusEntries: number;
    startDate: string;
    endDate: string;
    description?: string;
  };
  message: string;
}

// ========================================
// SCHEDULED PROMO TYPES
// ========================================

export type ScheduledPromoType = "membership-packages" | "one-time-packages" | "mini-packages";
export type ScheduledPromoMultiplier = 2 | 3 | 5 | 10;

export interface ScheduledPromo {
  id: string;
  type: ScheduledPromoType;
  multiplier: ScheduledPromoMultiplier;
  startDate: string;
  endDate: string;
  startDateFormatted?: string;
  endDateFormatted?: string;
  isActive: boolean;
  isCurrentlyActive?: boolean;
  isUpcoming?: boolean;
  isExpired?: boolean;
  name?: string;
  description?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
}

export interface CreateScheduledPromoPayload {
  type: ScheduledPromoType;
  multiplier: ScheduledPromoMultiplier;
  startDate: string; // ISO
  endDate: string; // ISO
  name?: string;
  description?: string;
}

export interface UpdateScheduledPromoPayload {
  type?: ScheduledPromoType;
  multiplier?: ScheduledPromoMultiplier;
  startDate?: string; // ISO
  endDate?: string; // ISO
  name?: string | null;
  description?: string | null;
  isActive?: boolean;
}

export interface ScheduledPromoListResponse {
  success: boolean;
  data: ScheduledPromo[];
  count: number;
}

export interface ScheduledPromoConflict {
  existingPromo: {
    id: string;
    type: ScheduledPromoType;
    multiplier: ScheduledPromoMultiplier;
    startDate: string;
    endDate: string;
  };
  message: string;
}

export type ScheduledPromoCalendarDayClient = {
  dateKey: string;
  multiplier: ScheduledPromoMultiplier | null;
};

export interface ApplyScheduledPromoMonthPayload {
  type: ScheduledPromoType;
  year: number;
  month: number;
  days: ScheduledPromoCalendarDayClient[];
  name?: string;
  description?: string;
}

export interface ApplyScheduledPromoMonthResponse {
  success: boolean;
  createdPromoIds: string[];
  softDeletedCount: number;
  adjustedCount: number;
}

// ========================================
// PROMO LINK TYPES
// ========================================

export interface PromoLink {
  id: string;
  code: string;
  bonusEntries: number;
  expiresAt?: Date | null;
  expiresAtFormatted?: string | null;
  isActive: boolean;
  appliesToMembership: boolean; // Whether this promo applies to membership/subscription packages
  appliesToOneTime: boolean; // Whether this promo applies to one-time packages
  campaignType: "general" | "cancelled-membership-comeback";
  eligibilityAudience: "all" | "cancelled-members";
  eligibilityRules?: {
    requireInactiveSubscription?: boolean;
    cancelledWithinDays?: number;
  };
  isExpired?: boolean;
  description?: string;
  usageCount: number;
  usedByCount: number;
  promoUrl: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export interface CreatePromoLinkPayload {
  customCode?: string;
  bonusEntries?: number;
  expiresAt?: string | null;
  description?: string;
  isActive?: boolean;
  appliesToMembership?: boolean;
  appliesToOneTime?: boolean;
  campaignType?: "general" | "cancelled-membership-comeback";
  eligibilityAudience?: "all" | "cancelled-members";
  eligibilityRules?: {
    requireInactiveSubscription?: boolean;
    cancelledWithinDays?: number;
  };
}

export interface UpdatePromoLinkPayload {
  bonusEntries?: number;
  expiresAt?: string | null;
  description?: string;
  isActive?: boolean;
  appliesToMembership?: boolean;
  appliesToOneTime?: boolean;
  campaignType?: "general" | "cancelled-membership-comeback";
  eligibilityAudience?: "all" | "cancelled-members";
  eligibilityRules?: {
    requireInactiveSubscription?: boolean;
    cancelledWithinDays?: number;
  };
}

export interface PromoLinkListResponse {
  success: boolean;
  data: PromoLink[];
  count: number;
}

export interface PromoLinkResponse {
  success: boolean;
  data: PromoLink | null;
}

// ========================================
// PROMO BANNER TEXT TYPES
// ========================================

export type PromoBannerTextScheduleType = "one-time" | "recurring";
export type PromoBannerTextRecurrencePattern =
  | "weekdays"
  | "weekends"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface PromoBannerText {
  id: string;
  imageUrl: string;
  altText?: string;
  scheduleType: PromoBannerTextScheduleType;
  startDate?: string; // ISO date string in AEST
  endDate?: string; // ISO date string in AEST
  recurrencePattern?: PromoBannerTextRecurrencePattern;
  isActive: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface CreatePromoBannerTextPayload {
  imageUrl: string;
  altText?: string;
  scheduleType: PromoBannerTextScheduleType;
  startDate?: string; // ISO date string in AEST (required for one-time)
  endDate?: string; // ISO date string in AEST (required for one-time)
  recurrencePattern?: PromoBannerTextRecurrencePattern; // Required for recurring
  description?: string;
  isActive?: boolean;
}

export interface UpdatePromoBannerTextPayload {
  imageUrl?: string;
  altText?: string;
  scheduleType?: PromoBannerTextScheduleType;
  startDate?: string; // ISO date string in AEST
  endDate?: string; // ISO date string in AEST
  recurrencePattern?: PromoBannerTextRecurrencePattern;
  description?: string;
  isActive?: boolean;
}

export interface PromoBannerTextListResponse {
  success: boolean;
  data: PromoBannerText[];
  count: number;
}

export interface PromoBannerTextResponse {
  success: boolean;
  data: PromoBannerText | null;
  message?: string;
}

// ALTERNATING PROMO MULTIPLIER TYPES
// ========================================

export type AlternatingPromoMultiplierType = "membership-packages" | "one-time-packages" | "mini-packages";

export interface AlternatingPromoMultiplier {
  id: string;
  type: AlternatingPromoMultiplierType;
  multipliers: [number, number]; // Tuple of exactly 2 multipliers (e.g., [5, 10])
  isEnabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface CreateAlternatingPromoMultiplierPayload {
  type: AlternatingPromoMultiplierType;
  multipliers: [number, number]; // Must be exactly 2 multipliers, each must be 2, 3, 5, or 10
  isEnabled?: boolean;
  description?: string;
}

export interface UpdateAlternatingPromoMultiplierPayload {
  multipliers?: [number, number];
  isEnabled?: boolean;
  description?: string;
}

export interface AlternatingPromoMultiplierListResponse {
  success: boolean;
  data: AlternatingPromoMultiplier[];
  count: number;
}

export interface AlternatingPromoMultiplierResponse {
  success: boolean;
  data: AlternatingPromoMultiplier | null;
  message?: string;
}

export interface CurrentAlternatingMultipliersResponse {
  success: boolean;
  data: Record<AlternatingPromoMultiplierType, number | null>;
}

/** Source of effective multiplier for banner display */
export type EffectiveForBannerSource = "scheduled" | "toggle" | "alternating" | "derived-from-membership" | "none";

/** Per-type entry for effective-for-banner API (includes scheduled meta when source is scheduled) */
export interface EffectiveForBannerEntry {
  multiplier: number | null;
  source: EffectiveForBannerSource;
  promoId?: string;
  scheduledEndDate?: string; // ISO, only when source === "scheduled"
  durationMs?: number; // only when source === "scheduled"
}

export interface EffectiveForBannerResponse {
  success: boolean;
  data: Record<AlternatingPromoMultiplierType, EffectiveForBannerEntry>;
}