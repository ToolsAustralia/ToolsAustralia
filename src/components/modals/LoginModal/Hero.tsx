"use client";

import React from "react";
import { LogIn, Sparkles } from "lucide-react";

interface HeroProps {
  /** Close handler — wired into the absolutely-positioned close button. */
  onClose: () => void;
}

/** LoginModal premium dark hero — extracted from the orchestrator so the
 * inline JSX block isn't repeated and the visual lives next to the matching
 * LoginPromptModal/Hero.tsx + ExistingAccountModal/Hero.tsx files. */
const Hero: React.FC<HeroProps> = ({ onClose }) => (
  <div className="relative px-[18px] pt-4 pb-[16px] text-white overflow-hidden bg-[radial-gradient(700px_280px_at_50%_-80px,rgba(238,0,0,0.30),transparent_65%),linear-gradient(180deg,#0a0a0a_0%,#141416_60%,#0a0a0a_100%)]">
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className="absolute top-3 right-3 z-10 w-[30px] h-[30px] rounded-full bg-black/55 text-white/95 inline-flex items-center justify-center border border-white/20 transition-colors duration-150 backdrop-blur-md hover:bg-black/75 hover:text-white max-xs:top-2 max-xs:right-2 max-xs:w-[26px] max-xs:h-[26px]"
    >
      <span className="sr-only">Close</span>
      <span aria-hidden className="text-base leading-none">×</span>
    </button>
    <div className="relative z-[2]">
      <div className="inline-flex items-center gap-1.5 px-[10px] py-1 rounded-full text-[10px] font-extrabold tracking-[0.2em] uppercase border border-red-400/40 bg-red-500/10 text-red-300 mb-2.5">
        <Sparkles size={11} />
        <span>Welcome back</span>
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
          <LogIn className="w-5 h-5 text-red-300" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex flex-col gap-0.5">
          <h2 className="relative font-acumin text-[24px] leading-none tracking-[0.005em] uppercase m-0 max-xs:text-[20px]">
            Log in
          </h2>
          <p className="relative text-[11px] leading-[1.3] max-w-[360px] max-xs:text-[10px] text-white/65">
            Pick up where you left off — entries, draws, packages.
          </p>
        </div>
      </div>
    </div>
  </div>
);

export default Hero;
