"use client";

import React from "react";
import { ShieldCheck, Award, Lock } from "lucide-react";
import UpsellShellTrustBar from "../upsell-shell/TrustBar";

const TrustBar: React.FC = () => {
  return (
    <UpsellShellTrustBar
      cells={[
        {
          icon: <ShieldCheck size={12} className="max-xs:size-2.5" />,
          strong: "SSL secure",
          secondary: "Entries safe",
        },
        {
          icon: <Award size={12} className="max-xs:size-2.5" />,
          strong: "NTP/16264",
          secondary: "Govt-certified",
        },
        {
          icon: <Lock size={12} className="max-xs:size-2.5" />,
          strong: "Cancel anytime",
          secondary: "No commitment",
        },
      ]}
    />
  );
};

export default TrustBar;
