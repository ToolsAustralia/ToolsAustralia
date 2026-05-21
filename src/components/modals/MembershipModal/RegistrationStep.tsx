"use client";

/**
 * RegistrationStep — step 1: name/email/phone form + REGISTER/Continue button.
 * Visual output (className strings, structure, button text variants) is
 * preserved byte-for-byte from the original MembershipModal.tsx
 * (lines 5309-5417).
 */

import React from "react";
import { Input, Button } from "../ui";

interface RegistrationErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  general?: string;
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cardNumber: string;
  expiryDate: string;
  cvv: string;
}

interface RegistrationStepProps {
  formData: FormData;
  registrationErrors: RegistrationErrors;
  isRegistering: boolean;
  hasCompletedRegistration: boolean;
  onInputChange: (field: string, value: string) => void;
  onNextStep: () => void;
  formatMobileNumber: (value: string) => string;
  validateMobileNumber: (mobile: string) => boolean;
  getPhoneMaxLength: (value: string) => number;
}

const RegistrationStep: React.FC<RegistrationStepProps> = ({
  formData,
  registrationErrors,
  isRegistering,
  hasCompletedRegistration,
  onInputChange,
  onNextStep,
  formatMobileNumber,
  validateMobileNumber,
  getPhoneMaxLength,
}) => {
  return (
    <div className="space-y-3 sm:space-y-4">
      {registrationErrors.general && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3">
          <p className="text-sm text-red-600 dark:text-red-400">{registrationErrors.general}</p>
        </div>
      )}

      <Input
        name="firstName"
        value={formData.firstName}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onInputChange("firstName", e.target.value)}
        placeholder="Enter your first name"
        error={registrationErrors.firstName}
        className="h-11"
      />

      <Input
        name="lastName"
        value={formData.lastName}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onInputChange("lastName", e.target.value)}
        placeholder="Enter your last name"
        error={registrationErrors.lastName}
        className="h-11"
      />

      <Input
        type="email"
        name="email"
        value={formData.email}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onInputChange("email", e.target.value)}
        placeholder="Enter your email address"
        error={registrationErrors.email}
        className="h-11"
      />

      <div>
        <Input
          type="tel"
          name="phone"
          value={formData.phone}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const rawValue = e.target.value;
            const formattedValue = formatMobileNumber(rawValue);

            // Get max length for the formatted value
            const maxLength = getPhoneMaxLength(formattedValue);
            const isDeleting = rawValue.length < formData.phone.length;

            // Allow input if:
            // 1. User is deleting (always allow)
            // 2. Formatted value is within expected length for the format
            if (isDeleting || formattedValue.length <= maxLength) {
              onInputChange("phone", formattedValue);
            }
          }}
          placeholder="0412 345 678"
          error={registrationErrors.mobile}
          maxLength={getPhoneMaxLength(formData.phone)}
          autoComplete="tel"
          className="h-11"
        />

        {formData.phone && !validateMobileNumber(formData.phone) && !registrationErrors.mobile && (
          <p className="text-xs sm:text-sm text-red-500 mt-1">
            Please enter a valid Australian mobile number
          </p>
        )}
      </div>

      <Button
        type="button"
        onClick={onNextStep}
        disabled={
          hasCompletedRegistration
            ? false
            : Boolean(
                !formData.firstName ||
                  !formData.lastName ||
                  !formData.email ||
                  formData.phone === "" ||
                  !validateMobileNumber(formData.phone) ||
                  isRegistering
              )
        }
        variant="primary"
        fullWidth
        size="lg"
        loading={isRegistering}
        className="h-11 !py-0 font-bold text-sm sm:text-base"
      >
        {isRegistering ? (
          "Creating Account..."
        ) : hasCompletedRegistration ? (
          <>
            <span className="sm:hidden">Continue to Billing</span>
            <span className="hidden sm:inline">Continue to Billing</span>
          </>
        ) : (
          <>
            <span className="sm:hidden">REGISTER</span>
            <span className="hidden sm:inline">REGISTER</span>
          </>
        )}
      </Button>
    </div>
  );
};

export default RegistrationStep;
