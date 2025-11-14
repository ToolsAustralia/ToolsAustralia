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
    isActive: boolean;
    startDate: string;
    endDate?: string;
    status: string;
  } | null;
  totalSpent: number;
  majorDrawEntries: number;
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
  role: "user" | "admin";
  isActive: boolean;
  isEmailVerified: boolean;
  isMobileVerified?: boolean;
  profileSetupCompleted?: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;

  // Subscription Information
  subscription?: {
    packageId: string;
    packageName?: string;
    isActive: boolean;
    startDate: string;
    endDate?: string;
    status: string;
    autoRenew?: boolean;
    previousSubscription?: Record<string, unknown>;
    pendingChange?: Record<string, unknown>;
    lastDowngradeDate?: string;
    lastUpgradeDate?: string;
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
    packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
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
  }>;
  oneTimePackageHistory: Array<Record<string, unknown>>;
  miniDrawHistory: Array<Record<string, unknown>>;
  majorDrawParticipation: Array<{
    drawId?: string;
    title?: string;
    status?: string;
    endDate?: string;
    totalEntries?: number;
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
  paymentEvents: Array<{
    eventType?: string;
    timestamp?: string;
    packageType?: string;
    data?: Record<string, unknown>;
  }>;
}

export interface UserFilters {
  page?: number;
  limit?: number;
  search?: string;
  subscriptionStatus?: "active" | "inactive" | "none";
  role?: "user" | "admin";
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "createdAt" | "email" | "lastLogin" | "totalSpent";
  sortOrder?: "asc" | "desc";
}

export type UserActionType =
  | "resend_verification"
  | "reset_password"
  | "toggle_status"
  | "add_note"
  | "resend_sms_verification";

export interface UserActionRequest {
  action: UserActionType;
  note?: string;
  reason?: string;
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
}

export interface AdminUserUpdatePayload {
  basicInfo?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    state?: string;
    role?: "user" | "admin";
    isActive?: boolean;
    isEmailVerified?: boolean;
    isMobileVerified?: boolean;
    profileSetupCompleted?: boolean;
  };
  subscription?: {
    packageId?: string;
    status?: string;
    isActive?: boolean;
    autoRenew?: boolean;
    startDate?: string;
    endDate?: string;
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
