"use client";

import React from "react";
import PaymentMethodsTab from "@/components/modals/PaymentMethodsTab";
import type { MyAccountData } from "@/hooks/queries";

interface PaymentTabProps {
  user: MyAccountData["user"];
}

export default function PaymentTab({ user }: PaymentTabProps) {
  return (
    <div className="space-y-4">
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
      />
    </div>
  );
}
