/**
 * Types for MembershipModal components and hooks
 *
 * @module components/modals/membership/types
 */

import { LocalMembershipPlan } from '@/utils/membership/membership-adapters';
import { SavedPaymentMethod } from '@/hooks/useSavedPaymentMethods';
import { OriginalPurchaseContext } from '@/types/upsell';

/**
 * Form data for membership registration
 */
export interface MembershipFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cardNumber: string;
  expiryDate: string;
  cvv: string;
}

/**
 * Registration errors
 */
export interface RegistrationErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  general?: string;
}

/**
 * Guest user data after registration
 */
export interface GuestUserData {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  mobile: string;
}

/**
 * Payment processing state
 */
export interface PaymentProcessingState {
  showPaymentProcessing: boolean;
  paymentIntentId: string | null;
  processingPackageName: string;
  processingPackageType: 'one-time' | 'subscription' | 'upsell' | 'mini-draw';
}

/**
 * Existing account modal state
 */
export interface ExistingAccountState {
  showExistingAccountModal: boolean;
  existingAccountConflictField: 'email' | 'mobile';
  existingAccountEmail: string | undefined;
}

/**
 * Referral/promo state
 */
export interface ReferralState {
  couponCode: string;
  couponApplied: boolean;
  isValidatingReferral: boolean;
  referralInfo: { referrerName: string } | null;
  referralError: string | null;
}

/**
 * Payment method state
 */
export interface PaymentMethodState {
  selectedPaymentMethod: SavedPaymentMethod | null;
  useSavedPaymentMethod: boolean;
  showCardForm: boolean;
  setupIntentClientSecret: string | null;
  paymentIntentClientSecret: string | null;
  paymentIntentId: string | null;
  cardFormError: string | null;
}

/**
 * One-time purchase response data
 */
export interface OneTimePurchaseData {
  paymentIntentId: string;
  customerId: string;
  userId: string;
  clientSecret?: string;
  status: string;
  packageName: string;
  totalEntries: number;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    subscription?: {
      packageId: string;
      isActive: boolean;
      status: string;
    };
    entryWallet: number;
    rewardsPoints: number;
  };
  autoLogin?: boolean;
}

/**
 * Membership modal props
 */
export interface MembershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPlan: LocalMembershipPlan | null;
  onPlanChange?: (newPlan: LocalMembershipPlan) => void;
}

/**
 * Billing details for Stripe
 */
export interface BillingDetails {
  name?: string;
  email?: string;
  phone?: string;
  country: string;
  state: string;
  city: string;
  postalCode: string;
  line1: string;
}

