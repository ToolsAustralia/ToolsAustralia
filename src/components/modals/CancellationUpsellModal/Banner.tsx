"use client";

import React from "react";
import { Star } from "lucide-react";

const Banner: React.FC = () => {
  return (
    <div className="mt-2.5 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-[10px] px-2.5 py-2 flex gap-2 items-center max-xs:mt-2 max-xs:px-2 max-xs:py-1.5 max-xs:gap-1.5 max-xs:rounded-lg">
      <span className="w-[26px] h-[26px] grow-0 shrink-0 basis-[26px] rounded-full bg-gradient-to-br from-[#f4cf6b] to-premium-gold text-neutral-950 inline-flex items-center justify-center shadow-[0_4px_10px_rgba(212,175,55,0.3)] max-xs:w-[22px] max-xs:h-[22px] max-xs:basis-[22px]">
        <Star size={16} fill="currentColor" className="max-xs:size-3" />
      </span>
      <div>
        <div className="text-xs font-extrabold text-neutral-950 leading-[1.25] max-xs:text-[11px]">Someone&apos;s name gets called next draw.</div>
        <div className="text-[11px] text-[#5b2a02] font-semibold mt-0.5 leading-[1.3] max-xs:text-2xs">Stick around — it could just as easily be yours.</div>
      </div>
    </div>
  );
};

export default Banner;
