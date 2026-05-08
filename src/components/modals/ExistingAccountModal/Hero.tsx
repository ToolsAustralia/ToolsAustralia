"use client";

import React, { type ComponentType } from "react";
import { Sparkles } from "lucide-react";

interface HeroProps {
  titleId: string;
  eyebrow: string;
  title: string;
  sub: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

/** ExistingAccountModal hero — dark gradient backdrop with red glow.
 * Visually identical to LoginPromptModal/Hero so the auth modals feel
 * cohesive. */
const Hero: React.FC<HeroProps> = ({ titleId, eyebrow, title, sub, icon: Icon }) => (
  <div className="relative px-[18px] pt-4 pb-[16px] text-white overflow-hidden bg-[radial-gradient(700px_280px_at_50%_-80px,rgba(238,0,0,0.30),transparent_65%),linear-gradient(180deg,#0a0a0a_0%,#141416_60%,#0a0a0a_100%)]">
    <div className="relative z-[2]">
      <div className="inline-flex items-center gap-1.5 px-[10px] py-1 rounded-full text-[10px] font-extrabold tracking-[0.2em] uppercase border border-red-400/40 bg-red-500/10 text-red-300 mb-2.5">
        <Sparkles className="h-2.5 w-2.5" />
        <span>{eyebrow}</span>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-[12px] inline-flex items-center justify-center flex-none max-xs:w-10 max-xs:h-10"
          style={{
            backgroundColor: "rgba(238,0,0,0.18)",
            border: "1.5px solid rgba(238,0,0,0.4)",
            boxShadow: "0 4px 14px rgba(238,0,0,0.34)",
          }}
        >
          <Icon className="w-5 h-5 text-red-300" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex flex-col gap-0.5">
          <h2
            id={titleId}
            className="relative font-acumin text-[24px] leading-none tracking-[0.005em] uppercase m-0 max-xs:text-[20px]"
          >
            {title}
          </h2>
          <p className="relative text-[11px] leading-[1.3] max-w-[360px] max-xs:text-[10px] text-white/65">
            {sub}
          </p>
        </div>
      </div>
    </div>
  </div>
);

export default Hero;
