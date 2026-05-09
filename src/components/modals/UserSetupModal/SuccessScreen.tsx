"use client";

import React from "react";
import { CheckCircle } from "lucide-react";

interface SuccessScreenProps {
  hasReferralCode: boolean;
}

const SuccessScreen: React.FC<SuccessScreenProps> = ({ hasReferralCode }) => (
  <div className="text-center space-y-3">
    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
      <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
    </div>
    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
      Profile Setup Complete!
    </h3>
    <p className="text-gray-600 dark:text-gray-400">
      You can now log in with your email and password, and we&apos;ve recorded your state for
      better service.
    </p>
    {hasReferralCode && (
      <p className="text-sm text-green-600 dark:text-green-400">
        Next up, we&apos;ll walk you through sharing your referral code so you can lock in 100
        bonus entries with your mates.
      </p>
    )}
  </div>
);

export default SuccessScreen;
