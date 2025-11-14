/**
 * Upsell System Types and Interfaces
 * Defines the structure for upsell offers, user context, and modal props
 */

export interface UpsellOffer {
  id: string;
  title: string;
  description: string;
  category: "major-draw" | "mini-draw" | "membership";
  originalPrice: number;
  discountedPrice: number;
  discountPercentage: number;
  entriesCount: number;
  buttonText: string;
  conditions: string[];
  urgencyText?: string;
  validUntil?: string;
  priority: number;
  imageUrl?: string;
  // Additional properties for offer logic
  isActive: boolean;
  targetAudience: string[];
  userSegments: string[];
  maxShowsPerUser: number;
  cooldownHours: number;
}

export interface UpsellUserContext {
  userId?: string; // For invoice finalization
  isAuthenticated: boolean;
  hasDefaultPayment: boolean;
  recentPurchase: string;
  userType: "new-user" | "returning-user" | "mini-draw-buyer" | "special-package-buyer";
  totalSpent: number;
  upsellsShown: number;
  lastUpsellShown?: Date;
  membershipLevel?: string;
}

export interface UpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: UpsellOffer;
  userContext: UpsellUserContext;
  originalPurchaseContext?: OriginalPurchaseContext;
  onAccept: (offer: UpsellOffer) => void;
  onDecline: (offer: UpsellOffer) => void;
}

export interface OriginalPurchaseContext {
  paymentIntentId: string;
  packageId: string;
  packageName: string;
  packageType: "subscription" | "one-time" | "mini-draw";
  price: number;
  entries: number;
  miniDrawId?: string; // For mini-draw package purchases, link to the specific mini-draw
  miniDrawName?: string; // Optional mini-draw name for display in upsell modal
}

export interface UpsellManagerProps {
  triggerEvent: "membership-purchase" | "ticket-purchase" | "one-time-purchase";
  userContext: UpsellUserContext;
  originalPurchaseContext?: OriginalPurchaseContext; // Optional - for delayed invoice
  onOfferShown: (offer: UpsellOffer) => void;
  onOfferAccepted: (offer: UpsellOffer) => void;
  onOfferDeclined: (offer: UpsellOffer) => void;
}

export interface UpsellContextType {
  isUpsellActive: boolean;
  currentOffer: UpsellOffer | null;
  userContext: UpsellUserContext | null;
  showUpsell: (offer: UpsellOffer, userContext: UpsellUserContext) => void;
  hideUpsell: () => void;
  acceptUpsell: (offer: UpsellOffer) => void;
  declineUpsell: (offer: UpsellOffer) => void;
  canShowUpsell: (userContext: UpsellUserContext) => boolean;
}

export interface UpsellProviderProps {
  children: React.ReactNode;
}

export interface UpsellPurchaseRequest {
  offerId: string;
  paymentMethodId: string;
  useDefaultPayment?: boolean;
}

export interface UpsellPurchaseResponse {
  success: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  error?: string;
  entriesAdded?: number;
}

// Sample upsell offers for testing and development
export const SAMPLE_UPSELL_OFFERS: UpsellOffer[] = [
  {
    id: "major-draw-special",
    title: "Double Your Chances - Major Draw Special!",
    description: "You just got entries! Want to double your winning chances?",
    category: "major-draw",
    originalPrice: 100,
    discountedPrice: 50,
    discountPercentage: 50,
    entriesCount: 300,
    buttonText: "Double My Chances - $50",
    conditions: [
      "300 Major Draw Entries (3x normal value!)",
      "4 Days Partner Discount Access",
      "One-time purchase - no subscription changes",
      "Limited time offer - expires in 24 hours",
    ],
    urgencyText: "Only 24 hours left!",
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    priority: 10,
    imageUrl: "/images/upsell-major-draw.png",
    isActive: true,
    targetAudience: ["all-users"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 3,
    cooldownHours: 24,
  },
  {
    id: "mini-draw-bonus",
    title: "Mini Draw Bonus Pack",
    description: "Add more entries to your mini draw for better chances!",
    category: "mini-draw",
    originalPrice: 75,
    discountedPrice: 45,
    discountPercentage: 40,
    entriesCount: 150,
    buttonText: "Add Bonus Entries - $45",
    conditions: ["150 Mini Draw Entries", "2x better winning odds", "Instant activation", "No recurring charges"],
    urgencyText: "Limited time offer!",
    validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    priority: 8,
    imageUrl: "/images/upsell-mini-draw.png",
    isActive: true,
    targetAudience: ["all-users"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 2,
    cooldownHours: 12,
  },
  {
    id: "membership-upgrade",
    title: "Upgrade to Premium Membership",
    description: "Get more entries and exclusive benefits with our premium membership!",
    category: "membership",
    originalPrice: 200,
    discountedPrice: 120,
    discountPercentage: 40,
    entriesCount: 500,
    buttonText: "Upgrade Now - $120",
    conditions: [
      "500 Monthly Entries",
      "Exclusive member benefits",
      "Priority customer support",
      "Special member-only draws",
    ],
    urgencyText: "Special launch offer!",
    validUntil: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    priority: 9,
    imageUrl: "/images/upsell-membership.png",
    isActive: true,
    targetAudience: ["all-users"],
    userSegments: ["returning-user"],
    maxShowsPerUser: 1,
    cooldownHours: 48,
  },
];

// Upsell analytics event types
export type UpsellEventType = "shown" | "accepted" | "declined" | "dismissed";

export interface UpsellAnalyticsData {
  offerId: string;
  action: UpsellEventType;
  triggerEvent: string;
  userType: string;
  timestamp: string;
  userContext: {
    isAuthenticated: boolean;
    hasDefaultPayment: boolean;
    recentPurchase: string;
    totalSpent: number;
  };
}
