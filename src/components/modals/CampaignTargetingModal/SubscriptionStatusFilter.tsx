"use client";

import React from "react";
import Dropdown from "@/components/modals/ui/Dropdown";
import { SUBSCRIPTION_STATUS_OPTIONS, type SubscriptionStatusValue } from "./types";

interface SubscriptionStatusFilterProps {
  value: SubscriptionStatusValue;
  onChange: (value: SubscriptionStatusValue) => void;
}

export default function SubscriptionStatusFilter({ value, onChange }: SubscriptionStatusFilterProps) {
  return (
    <Dropdown
      label="Subscription"
      options={SUBSCRIPTION_STATUS_OPTIONS}
      value={value}
      onChange={(v) => onChange(v as SubscriptionStatusValue)}
    />
  );
}
