"use client";

import React from "react";
import SubscriptionManagementModal from "@/components/modals/SubscriptionManagementModal";

type SubscriptionUser = React.ComponentProps<typeof SubscriptionManagementModal>["user"];

interface SubscriptionTabProps {
  user: SubscriptionUser;
  membershipModal: ReturnType<typeof import("@/hooks/useMembershipModal").useMembershipModal>;
}

export default function SubscriptionTab({ user, membershipModal }: SubscriptionTabProps) {
  return (
    <div className="space-y-4">
      <SubscriptionManagementModal
        isOpen
        onClose={() => {}}
        user={user}
        membershipModal={membershipModal}
        renderAsPanel
      />
    </div>
  );
}
