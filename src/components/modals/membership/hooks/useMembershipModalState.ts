/**
 * Hook for managing MembershipModal state
 *
 * Centralizes all state management for the membership modal component.
 *
 * @module components/modals/membership/hooks/useMembershipModalState
 */

import { useState, useRef } from 'react';
import { SavedPaymentMethod } from '@/hooks/useSavedPaymentMethods';
import {
  MembershipFormData,
  RegistrationErrors,
  GuestUserData,
  PaymentProcessingState,
  ExistingAccountState,
  PaymentMethodState,
} from '../types';
import { OriginalPurchaseContext } from '@/types/upsell';

/**
 * Return type for useMembershipModalState hook
 */
export interface UseMembershipModalStateReturn {
  // Form state
  formData: MembershipFormData;
  setFormData: React.Dispatch<React.SetStateAction<MembershipFormData>>;
  
  // Submission state
  isSubmitting: boolean;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  isRegistering: boolean;
  setIsRegistering: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Upsell state
  upsellTriggered: boolean;
  setUpsellTriggered: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Registration state
  registrationErrors: RegistrationErrors;
  setRegistrationErrors: React.Dispatch<React.SetStateAction<RegistrationErrors>>;
  guestUserData: GuestUserData | null;
  setGuestUserData: React.Dispatch<React.SetStateAction<GuestUserData | null>>;
  
  // Payment method state
  paymentMethodState: PaymentMethodState;
  setPaymentMethodState: React.Dispatch<React.SetStateAction<PaymentMethodState>>;
  
  // Payment processing state
  paymentProcessing: PaymentProcessingState;
  setPaymentProcessing: React.Dispatch<React.SetStateAction<PaymentProcessingState>>;
  
  // Existing account state
  existingAccount: ExistingAccountState;
  setExistingAccount: React.Dispatch<React.SetStateAction<ExistingAccountState>>;
  
  // Original purchase context
  originalPurchaseContext: OriginalPurchaseContext | null;
  setOriginalPurchaseContext: React.Dispatch<React.SetStateAction<OriginalPurchaseContext | null>>;
  
  // Package selection
  isPackageSelectionOpen: boolean;
  setIsPackageSelectionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Refs
  lastPaymentIntentAmountRef: React.MutableRefObject<number | null>;
  isCreatingPaymentIntentRef: React.MutableRefObject<boolean>;
  subscriptionCreatedRef: React.MutableRefObject<string | null>;
  cardFormRef: React.MutableRefObject<{
    confirmSetup: () => Promise<{ paymentMethodId?: string; paymentIntentId?: string; error?: string }>;
  } | null>;
}

/**
 * Hook for managing all MembershipModal state
 */
export function useMembershipModalState(): UseMembershipModalStateReturn {
  // Form state
  const [formData, setFormData] = useState<MembershipFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    cardNumber: '',
    expiryDate: '',
    cvv: '',
  });

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // Upsell state
  const [upsellTriggered, setUpsellTriggered] = useState(false);

  // Registration state
  const [registrationErrors, setRegistrationErrors] = useState<RegistrationErrors>({});
  const [guestUserData, setGuestUserData] = useState<GuestUserData | null>(null);

  // Payment method state
  const [paymentMethodState, setPaymentMethodState] = useState<PaymentMethodState>({
    selectedPaymentMethod: null,
    useSavedPaymentMethod: false,
    showCardForm: false,
    setupIntentClientSecret: null,
    paymentIntentClientSecret: null,
    paymentIntentId: null,
    cardFormError: null,
  });

  // Payment processing state
  const [paymentProcessing, setPaymentProcessing] = useState<PaymentProcessingState>({
    showPaymentProcessing: false,
    paymentIntentId: null,
    processingPackageName: '',
    processingPackageType: 'subscription',
  });

  // Existing account state
  const [existingAccount, setExistingAccount] = useState<ExistingAccountState>({
    showExistingAccountModal: false,
    existingAccountConflictField: 'email',
    existingAccountEmail: undefined,
  });

  // Original purchase context
  const [originalPurchaseContext, setOriginalPurchaseContext] = useState<OriginalPurchaseContext | null>(null);

  // Package selection
  const [isPackageSelectionOpen, setIsPackageSelectionOpen] = useState(false);

  // Refs
  const lastPaymentIntentAmountRef = useRef<number | null>(null);
  const isCreatingPaymentIntentRef = useRef<boolean>(false);
  const subscriptionCreatedRef = useRef<string | null>(null);
  const cardFormRef = useRef<{
    confirmSetup: () => Promise<{ paymentMethodId?: string; paymentIntentId?: string; error?: string }>;
  } | null>(null);

  return {
    formData,
    setFormData,
    isSubmitting,
    setIsSubmitting,
    isRegistering,
    setIsRegistering,
    upsellTriggered,
    setUpsellTriggered,
    registrationErrors,
    setRegistrationErrors,
    guestUserData,
    setGuestUserData,
    paymentMethodState,
    setPaymentMethodState,
    paymentProcessing,
    setPaymentProcessing,
    existingAccount,
    setExistingAccount,
    originalPurchaseContext,
    setOriginalPurchaseContext,
    isPackageSelectionOpen,
    setIsPackageSelectionOpen,
    lastPaymentIntentAmountRef,
    isCreatingPaymentIntentRef,
    subscriptionCreatedRef,
    cardFormRef,
  };
}

