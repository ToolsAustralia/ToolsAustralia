"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { MyAccountData } from "@/hooks/queries";

// Lazy-loaded: bundles Stripe payment-method UI.
const PaymentMethodsTab = dynamic(() => import("@/components/modals/PaymentMethodsTab"), {
  ssr: false,
});

interface PaymentTabProps {
  user: MyAccountData["user"];
}

export default function PaymentTab({ user }: PaymentTabProps) {
  return (
    <div className="space-y-6">
      <PaymentMethodsTab
        user={{
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mobile: user.mobile,
          subscription: user.subscription,
          stripeSubscriptionId: user.stripeSubscriptionId,
        }}
        settingsRedesign
      />
    </div>
  );
}
