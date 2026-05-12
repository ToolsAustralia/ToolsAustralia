"use client";

import React from "react";
import { ShieldCheck, Award, Truck } from "lucide-react";
import UpsellShellTrustBar from "../upsell-shell/TrustBar";

interface TrustBarProps {
  /** Optional brand-tinted Tailwind class (e.g. "text-red-600 dark:text-red-400")
   *  applied to each icon. Falls back to red when absent. */
  iconColorClass?: string;
}

const TrustBar: React.FC<TrustBarProps> = ({ iconColorClass }) => {
  const iconCls = iconColorClass ?? "text-red-600 dark:text-red-400";
  return (
    <UpsellShellTrustBar
      cells={[
        {
          icon: <ShieldCheck size={12} className={`max-xs:size-2.5 ${iconCls}`} />,
          strong: "Secure payment",
          secondary: "Powered by Stripe",
        },
        {
          icon: <Award size={12} className={`max-xs:size-2.5 ${iconCls}`} />,
          strong: "NTP/16264",
          secondary: "Govt-certified draw",
        },
        {
          icon: <Truck size={12} className={`max-xs:size-2.5 ${iconCls}`} />,
          strong: "Real prizes shipped",
          secondary: "To every winner",
        },
      ]}
    />
  );
};

export default TrustBar;
