"use client";

import React from "react";
import Image from "next/image";
import { Trophy } from "lucide-react";
import { cn } from "@/utils/cn";
import styles from "./hero.module.css";

interface HeroProps {
  /** Hero copy: locked-in entries reminder OR no-renewal "hold up" copy. Already styled. */
  entriesCopy: React.ReactNode;
  /** Locked-in entries — the big number on the right of the progress bar. */
  accumulatedEntries: number;
}

const TOTAL_SEG = 14;
const SEGMENTS = Array.from({ length: TOTAL_SEG }, (_, i) => i < TOTAL_SEG - 1);

const Hero: React.FC<HeroProps> = ({ entriesCopy, accumulatedEntries }) => {
  return (
    <div className={cn("relative px-4 pt-3.5 pb-3 text-white overflow-hidden max-xs:px-3 max-xs:pt-3 max-xs:pb-2.5", styles.heroBg, styles.heroStripeOverlay)}>
      <div className="relative z-[2]">
        {/* Eyebrow */}
        <div className="flex items-center justify-center gap-2.5 mb-1.5 max-xs:gap-2 max-xs:mb-1">
          <span className="basis-8 grow-0 shrink-0 h-px bg-[linear-gradient(90deg,transparent,rgba(212,175,55,0.6))] max-xs:basis-[18px]" />
          <span className="text-premium-gold inline-flex"><Trophy size={14} strokeWidth={2.2} /></span>
          <span className="font-extrabold text-[11px] tracking-[0.22em] uppercase text-premium-gold max-xs:text-2xs max-xs:tracking-[0.18em]">Hold up, mate</span>
          <span className="text-premium-gold inline-flex"><Trophy size={14} strokeWidth={2.2} /></span>
          <span className="basis-8 grow-0 shrink-0 h-px bg-[linear-gradient(90deg,rgba(212,175,55,0.6),transparent)] max-xs:basis-[18px]" />
        </div>

        {/* Headline */}
        <h2 className="font-acumin font-normal text-[28px] leading-none tracking-[0.005em] text-center uppercase mb-1.5 max-xs:text-[22px]" id="cm-headline">
          <span className="block font-sans font-extrabold text-[11px] tracking-[0.14em] text-white/55 uppercase mb-1 max-xs:text-2xs max-xs:mb-0.5">You&apos;re already in.</span>
          Don&apos;t walk away from
          <br />
          <span className="text-premium-gold">your next win.</span>
        </h2>

        {/* Sub-copy */}
        <p className="text-center text-xs text-white/70 max-w-[440px] mx-auto mb-2 leading-snug max-xs:text-[11px] max-xs:mb-1.5 max-xs:leading-[1.35]" data-cm-sub>
          {entriesCopy}
        </p>

        {/* Prize banner */}
        <div className="mt-1.5 rounded-xl overflow-hidden border border-white/10 leading-none max-xs:mt-1 max-xs:rounded-[10px]" style={{
          background: "radial-gradient(600px 200px at 50% 50%, rgba(212, 175, 55, 0.1), transparent 70%), linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(0, 0, 0, 0.15))",
        }}>
          <Image
            src="/images/background/promo/landing/all-prizes/all-prizes.webp"
            alt="Major draw prize line-up"
            width={1200}
            height={400}
            sizes="(max-width: 640px) 92vw, 540px"
            style={{ width: "100%", height: "auto", display: "block" }}
            priority={false}
          />
        </div>

        {/* Progress */}
        <div className="mt-2.5 bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2 grid grid-cols-[1fr_auto] gap-3 items-center max-xs:mt-2 max-xs:px-2.5 max-xs:py-1.5 max-xs:gap-2 max-xs:rounded-[10px]">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-[#4ade80] mb-1.5 max-xs:text-[9px] max-xs:tracking-[0.14em] max-xs:mb-1">You&apos;re this close to a win</div>
            <div className="relative flex gap-[3px] h-2.5 items-center max-xs:h-2 max-xs:gap-0.5">
              {SEGMENTS.map((on, i) => (
                <span key={i} data-progress-seg className={cn("flex-1 h-2 bg-white/[0.06] rounded-[2px] max-xs:h-1.5", on && "bg-gradient-to-r from-green-600 to-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]")} />
              ))}
              <span className="ml-1.5 text-white/60 text-[13px]" aria-hidden>→</span>
            </div>
          </div>
          <div className="text-center border-l border-white/[0.08] pl-4 flex flex-col items-center justify-center max-xs:pl-2.5">
            <div className="font-acumin text-[24px] text-white leading-none max-xs:text-[20px]">{accumulatedEntries.toLocaleString()}</div>
            <div className="text-[9px] font-extrabold tracking-[0.16em] uppercase text-white/55 mt-0.5 text-center whitespace-nowrap max-xs:text-3xs max-xs:mt-0.5">Active entries</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero;
