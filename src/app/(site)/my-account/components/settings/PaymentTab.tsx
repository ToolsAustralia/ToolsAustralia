"use client";

import React from "react";
import PaymentMethodsTab from "@/components/modals/PaymentMethodsTab";

interface PaymentTabProps {
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export default function PaymentTab({ user }: PaymentTabProps) {
  return (
    <div className="space-y-4">
      <PaymentMethodsTab user={user} />
    </div>
  );
}
