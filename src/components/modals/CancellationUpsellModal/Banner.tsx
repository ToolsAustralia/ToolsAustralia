"use client";

import React from "react";
import UrgencyBanner from "../upsell-shell/UrgencyBanner";

const Banner: React.FC = () => {
  return (
    <UrgencyBanner
      tone="gold"
      title={<>Someone&apos;s name gets called next draw.</>}
      sub="Stick around — it could just as easily be yours."
    />
  );
};

export default Banner;
