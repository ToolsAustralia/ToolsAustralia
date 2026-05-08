"use client";

import React from "react";
import { ShieldCheck, Award, Lock } from "lucide-react";

const TrustBar: React.FC = () => {
  return (
    <div className="bg-neutral-50 border-t border-neutral-200 px-4 py-2.5 grid grid-cols-3 gap-0 max-xs:px-2 max-xs:py-1.5">
      {/* Cell 1: SSL */}
      <div className="flex items-center gap-2 text-2xs text-neutral-600 leading-[1.3] px-2.5 relative max-xs:text-[8px] max-xs:gap-1 max-xs:px-1">
        <span className="grow-0 shrink-0 basis-5 w-5 h-5 rounded-[5px] bg-white border border-neutral-200 inline-flex items-center justify-center text-red-700 max-xs:basis-[18px] max-xs:w-[18px] max-xs:h-[18px] max-xs:rounded">
          <ShieldCheck size={12} className="max-xs:size-2.5" />
        </span>
        <span className="inline-flex flex-col min-w-0">
          <strong className="text-neutral-950 font-bold block">SSL secure</strong>
          Entries safe
        </span>
      </div>

      {/* Cell 2: NTP — separator on left */}
      <div className="flex items-center gap-2 text-2xs text-neutral-600 leading-[1.3] px-2.5 relative before:content-[''] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-neutral-200 max-xs:text-[8px] max-xs:gap-1 max-xs:px-1">
        <span className="grow-0 shrink-0 basis-5 w-5 h-5 rounded-[5px] bg-white border border-neutral-200 inline-flex items-center justify-center text-red-700 max-xs:basis-[18px] max-xs:w-[18px] max-xs:h-[18px] max-xs:rounded">
          <Award size={12} className="max-xs:size-2.5" />
        </span>
        <span className="inline-flex flex-col min-w-0">
          <strong className="text-neutral-950 font-bold block">NTP/16264</strong>
          Govt-certified
        </span>
      </div>

      {/* Cell 3: Cancel anytime — separator on left */}
      <div className="flex items-center gap-2 text-2xs text-neutral-600 leading-[1.3] px-2.5 relative before:content-[''] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-neutral-200 max-xs:text-[8px] max-xs:gap-1 max-xs:px-1">
        <span className="grow-0 shrink-0 basis-5 w-5 h-5 rounded-[5px] bg-white border border-neutral-200 inline-flex items-center justify-center text-red-700 max-xs:basis-[18px] max-xs:w-[18px] max-xs:h-[18px] max-xs:rounded">
          <Lock size={12} className="max-xs:size-2.5" />
        </span>
        <span className="inline-flex flex-col min-w-0">
          <strong className="text-neutral-950 font-bold block">Cancel anytime</strong>
          No commitment
        </span>
      </div>
    </div>
  );
};

export default TrustBar;
