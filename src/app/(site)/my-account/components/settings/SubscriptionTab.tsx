"use client";

import React from "react";
import dynamic from "next/dynamic";
// Type-only import keeps the prop-extraction pattern below working without
// pulling the SubscriptionManagementModal bundle into this route's chunk.
import type SubscriptionManagementModalType from "@/components/modals/SubscriptionManagementModal";

// Lazy-loaded: bundles Stripe + payment forms.
const SubscriptionManagementModal = dynamic(
  () => import("@/components/modals/SubscriptionManagementModal"),
  { ssr: false },
);

type SubscriptionUser = React.ComponentProps<typeof SubscriptionManagementModalType>["user"];

interface SubscriptionTabProps {
  user: SubscriptionUser;
  membershipModal: ReturnType<typeof import("@/hooks/useMembershipModal").useMembershipModal>;
  onSubscriptionUpdate?: () => void;
}

export default function SubscriptionTab({ user, membershipModal, onSubscriptionUpdate }: SubscriptionTabProps) {
  return (
    <div className="space-y-4">
      <SubscriptionManagementModal
        isOpen
        onClose={() => {}}
        user={user}
        membershipModal={membershipModal}
        onSubscriptionUpdate={onSubscriptionUpdate}
        renderAsPanel
      />
    </div>
  );
}
