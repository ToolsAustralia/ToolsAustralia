/**
 * Hook for managing membership registration logic
 *
 * Handles user registration, validation, and error management.
 *
 * @module components/modals/membership/hooks/useMembershipRegistration
 */

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { trackCompleteRegistration, trackFacebookEvent } from '@/components/FacebookPixel';
import { MembershipFormData, RegistrationErrors, GuestUserData } from '../types';
import { logger } from '@/utils/logger';

/**
 * Registration result
 */
export interface RegistrationResult {
  success: boolean;
  data?: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    mobile: string;
    pixelEventId?: string;
  };
  error?: string;
  field?: string;
  message?: string;
  isExistingAccount?: boolean;
  existingAccountEmail?: string;
}

/**
 * Hook options
 */
export interface UseMembershipRegistrationOptions {
  formData: MembershipFormData;
  setRegistrationErrors: (errors: RegistrationErrors | ((prev: RegistrationErrors) => RegistrationErrors)) => void;
  setGuestUserData: (data: GuestUserData | null) => void;
  setCurrentStep: (step: number) => void;
  setShowCardForm: (show: boolean) => void;
  affiliateCode?: string;
  activePlanPrice: number;
  onPaymentIntentCreated?: (clientSecret: string, paymentIntentId?: string) => void;
}

/**
 * Hook return type
 */
export interface UseMembershipRegistrationReturn {
  handleRegistration: () => Promise<void>;
  validateMobileNumber: (mobile: string) => boolean;
  formatMobileNumber: (value: string) => string;
  formatExpiryDate: (value: string) => string;
}

/**
 * Validates Australian mobile number
 */
export function validateMobileNumber(mobile: string): boolean {
  const cleaned = mobile.replace(/\s+/g, '');
  const patterns = [
    /^(\+61|61)?[4-5]\d{8}$/, // +61412345678, 61412345678, 412345678
    /^0[4-5]\d{8}$/, // 0412345678
  ];
  return patterns.some((pattern) => pattern.test(cleaned));
}

/**
 * Formats mobile number for display
 */
export function formatMobileNumber(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  const v = value.replace(/[^\d+]/g, '');

  if (v.startsWith('+61')) {
    const digits = v.substring(3);
    if (digits.length <= 9) {
      return '+61 ' + digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3').trim();
    }
  } else if (v.startsWith('61') && v.length > 2) {
    const digits = v.substring(2);
    if (digits.length <= 9) {
      return '+61 ' + digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3').trim();
    }
  } else if (v.startsWith('0')) {
    if (v.length <= 10) {
      return v.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3').trim();
    }
  } else if (v.startsWith('4') || v.startsWith('5')) {
    if (v.length <= 9) {
      return '0' + v.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3').trim();
    }
  }

  return v;
}

/**
 * Formats expiry date for display
 */
export function formatExpiryDate(value: string): string {
  const v = value.replace(/\D/g, '');
  if (v.length >= 2) {
    return v.substring(0, 2) + '/' + v.substring(2, 4);
  }
  return v;
}

/**
 * Hook for managing membership registration
 */
export function useMembershipRegistration(
  options: UseMembershipRegistrationOptions
): UseMembershipRegistrationReturn {
  const pathname = usePathname();
  const { showToast } = useToast();

  const handleRegistration = useCallback(async () => {
    const {
      formData,
      setRegistrationErrors,
      setGuestUserData,
      setCurrentStep,
      setShowCardForm,
      affiliateCode,
      onPaymentIntentCreated,
    } = options;

    setRegistrationErrors({});

    // Extract promotion slug from current URL if on promotions page
    let promotionSlug: string | undefined;
    try {
      const currentPathname = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
      const promotionsMatch = currentPathname.match(/^\/promotions\/([^/?#]+)/);
      if (promotionsMatch && promotionsMatch[1]) {
        promotionSlug = promotionsMatch[1];
        logger.debug('Captured promotion slug from URL', { promotionSlug });
      }
    } catch (error) {
      logger.warn('Could not extract promotion slug from URL', { error });
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          mobile: formData.phone,
          affiliateCode: affiliateCode || undefined,
          promotionSlug: promotionSlug,
        }),
      });

      const result: RegistrationResult = await response.json();

      if (result.success && result.data) {
        logger.info('User registered successfully', { userId: result.data.userId });

        // Track CompleteRegistration event client-side
        try {
          if (result.data.pixelEventId) {
            trackFacebookEvent('CompleteRegistration', {
              eventID: result.data.pixelEventId,
              content_type: 'user',
              registration_method: 'email',
            });
            logger.debug('Facebook Pixel: CompleteRegistration tracked', {
              eventId: result.data.pixelEventId,
            });
          } else {
            trackCompleteRegistration();
            logger.debug('Facebook Pixel: CompleteRegistration tracked');
          }
        } catch (pixelError) {
          logger.error('Error tracking CompleteRegistration client-side', pixelError);
        }

        // Store guest user data
        setGuestUserData({
          userId: result.data.userId,
          email: result.data.email,
          firstName: result.data.firstName,
          lastName: result.data.lastName,
          mobile: result.data.mobile,
        });

        // Show success toast
        showToast({
          type: 'success',
          title: 'Step 1 Completed!',
          message: `Welcome ${formData.firstName}! Now let's set up your payment method to complete your membership.`,
          duration: 8000,
        });

        // Proceed to step 2
        setCurrentStep(2);
        setShowCardForm(true);

        // Notify parent that payment intent should be created
        if (onPaymentIntentCreated) {
          // This will be handled by the payment flow hook
          onPaymentIntentCreated('', undefined);
        }
      } else {
        // Handle registration errors
        logger.error('Registration failed', { error: result.error, field: result.field });

        if (result.isExistingAccount || result.message?.includes('has made purchases')) {
          // This should be handled by the parent component
          setRegistrationErrors({
            general: result.message || 'An account with this email or mobile already exists.',
          });
        } else if (result.field) {
          setRegistrationErrors({
            [result.field]: result.message,
          });
        } else {
          setRegistrationErrors({
            general: result.message || 'Registration failed. Please try again.',
          });
        }
      }
    } catch (error) {
      logger.error('Registration error', error);
      setRegistrationErrors({
        general: 'Registration failed. Please check your connection and try again.',
      });
    }
  }, [options, pathname, showToast]);

  return {
    handleRegistration,
    validateMobileNumber,
    formatMobileNumber,
    formatExpiryDate,
  };
}

