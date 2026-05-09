"use client";

import React from "react";
import { ShieldCheck, MapPin, Mail, Sparkles } from "lucide-react";

interface ProgressHeroProps {
  /** Steps the user actually needs (e.g. [1, 2, 3] or [2, 3]). Drives the progress dots. */
  stepsNeeded: number[];
  /** 0-based index into stepsNeeded — which step is active. */
  clampedIndex: number;
  /** Active step number (1, 2, or 3) or null when nothing left. */
  activeStep: number | null;
  /** True when the success screen is displayed — collapses the hero into a celebratory state. */
  success: boolean;
}

const STEP_META: Record<number, { Icon: typeof MapPin; label: string; subtitle: string }> = {
  1: {
    Icon: ShieldCheck,
    label: "Set Password",
    subtitle: "Lock in a secure password so you can sign in next time.",
  },
  2: {
    Icon: MapPin,
    label: "Tell us about you",
    subtitle: "We use this to show you the right giveaways and prizes.",
  },
  3: {
    Icon: Mail,
    label: "Verify your email",
    subtitle: "Confirm your email so we can send you draw results and bonus codes.",
  },
};

/**
 * Premium dark hero shown at the top of UserSetupModal.
 * Displays a step pill row, the active step icon + headline, and supporting copy.
 * Pure presentational — no logic.
 */
const ProgressHero: React.FC<ProgressHeroProps> = ({
  stepsNeeded,
  clampedIndex,
  activeStep,
  success,
}) => {
  if (success) {
    return (
      <div className="relative overflow-hidden bg-[radial-gradient(700px_280px_at_50%_-80px,rgba(34,197,94,0.34),transparent_65%),linear-gradient(180deg,#0a0a0a_0%,#141416_60%,#0a0a0a_100%)] px-5 pt-5 pb-4 text-white">
        <div className="relative z-[2] text-center">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-[0.2em] uppercase border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 mb-2">
            <Sparkles size={11} />
            Setup complete
          </div>
          <h2 className="font-acumin text-[24px] leading-tight uppercase max-xs:text-[20px]">
            Welcome aboard.
          </h2>
        </div>
      </div>
    );
  }

  const active = activeStep && STEP_META[activeStep] ? STEP_META[activeStep] : null;
  const ActiveIcon = active?.Icon ?? ShieldCheck;

  return (
    <div className="relative overflow-hidden bg-[radial-gradient(700px_280px_at_50%_-80px,rgba(238,0,0,0.30),transparent_65%),linear-gradient(180deg,#0a0a0a_0%,#141416_60%,#0a0a0a_100%)] px-5 pt-4 pb-3.5 text-white max-xs:px-4 max-xs:pt-3.5 max-xs:pb-3">
      <div className="relative z-[2]">
        {/* Eyebrow + step pill row */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-[0.2em] uppercase border border-red-400/40 bg-red-500/10 text-red-300">
            <ActiveIcon size={11} />
            <span>Step {clampedIndex + 1} of {stepsNeeded.length}</span>
          </div>
          {/* Progress dots */}
          <div className="flex items-center gap-1">
            {stepsNeeded.map((stepNum, i) => (
              <span
                key={stepNum}
                className={
                  i === clampedIndex
                    ? "w-5 h-1 rounded-full bg-red-500"
                    : i < clampedIndex
                    ? "w-2 h-1 rounded-full bg-red-700"
                    : "w-2 h-1 rounded-full bg-white/20"
                }
              />
            ))}
          </div>
        </div>

        {/* Headline */}
        <h2
          id="user-setup-headline"
          className="font-acumin text-[24px] leading-tight uppercase mb-1 max-xs:text-[20px]"
        >
          {active?.label ?? "Complete your profile"}
        </h2>

        {/* Sub-copy */}
        <p className="text-xs leading-snug text-white/70 max-w-[440px] max-xs:text-[11px]">
          {active?.subtitle ?? "Just a few details to get your account ready."}
        </p>
      </div>
    </div>
  );
};

export default ProgressHero;
