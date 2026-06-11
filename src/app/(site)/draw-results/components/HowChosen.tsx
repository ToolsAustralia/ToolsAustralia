import type { CSSProperties } from "react";
import { Lock, PhoneCall, Play, ShieldCheck, type LucideIcon } from "lucide-react";
import { Reveal } from "./Reveal";
import StepperStage from "./StepperStage";

interface Step {
  n: string;
  Icon: LucideIcon;
  title: string;
  body: string;
}

// Copy verified against BUSINESS.md + the binding competition terms: entries
// freeze 8:00pm on the 27th, winner selected by the government-certified
// randomdraws.com.au, drawn live 8:30pm on Facebook, then contacted to arrange
// free AU-wide delivery or cash payout. No per-draw "permit number" is claimed
// (not surfaced in data), and prizes are NOT advertised as "insured" — the terms
// make insurance the winner's responsibility.
const STEPS: Step[] = [
  {
    n: "01",
    Icon: Lock,
    title: "Entries freeze at 8pm",
    body: "On the 27th, every valid entry from packs and memberships is locked into a single sequential pool. Nothing is added after the cut-off.",
  },
  {
    n: "02",
    Icon: ShieldCheck,
    title: "Random Selection",
    body: "The winning entry is selected by randomdraws.com.au — an independent, government-certified system that produces a verifiable result for every draw.",
  },
  {
    n: "03",
    Icon: Play,
    title: "Drawn live at 8:30pm",
    body: "The result is revealed live on our Facebook page — no edits, no delays. You watch the exact moment the winner is pulled.",
  },
  {
    n: "04",
    Icon: PhoneCall,
    title: "Winner announced & contacted",
    body: "We announce the winner live, then reach out directly to arrange delivery. Tools ship free Australia-wide, or the cash is paid into their account.",
  },
];

export default function HowChosen() {
  return (
    <section
      className="py-14 sm:py-24"
      style={{ background: "var(--surface)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}
    >
      <div className="lp-container">
        <Reveal className="text-center max-w-2xl mx-auto">
          <span className="lp-kicker justify-center">No smoke, no mirrors</span>
          <h2 className="lp-display lp-italic text-2xl sm:text-4xl lg:text-5xl mt-4" style={{ color: "var(--ink)" }}>
            How a winner is chosen.
          </h2>
          <p className="mt-4 text-lg" style={{ color: "var(--ink-2)" }}>
Our fair and transparent selection process ensures every valid entry is treated equally in the draw

          </p>
        </Reveal>
        <StepperStage className="relative mt-14">
          {/* connector rail (desktop) — the electrode travels along it */}
          <div
            className="ta-step-line hidden lg:block absolute"
            style={{ top: 29, left: "12.5%", right: "12.5%", height: 2 }}
          >
            <span className="ta-step-line-fill">
              <span className="ta-step-line-head" />
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-8 sm:gap-y-10">
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                className="ta-step relative flex flex-col items-center text-center"
                style={{ "--step": i } as CSSProperties}
              >
                <span className="ta-step-badge relative inline-flex items-center justify-center" style={{ width: 58, height: 58 }}>
                  {/* ring traced by a glowing electrode */}
                  <svg className="ta-step-ring" viewBox="0 0 58 58" aria-hidden="true">
                    <circle className="ta-step-ring-track" cx="29" cy="29" r="26" />
                    <circle className="ta-step-ring-fill" cx="29" cy="29" r="26" pathLength={100} />
                  </svg>
                  <span className="ta-step-dot" aria-hidden="true" />
                  <span className="ta-step-num lp-display lp-num text-lg">{s.n}</span>
                </span>
                <span className="ta-step-icon inline-flex items-center justify-center mt-5">
                  <s.Icon size={26} />
                </span>
                <div className="ta-step-def mt-3">
                  <h3 className="lp-display text-[14px] sm:text-[16px]" style={{ color: "var(--ink)" }}>
                    {s.title}
                  </h3>
                  <p className="text-[12px] sm:text-[13px] mt-2 leading-relaxed max-w-[15rem]" style={{ color: "var(--ink-3)" }}>
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </StepperStage>
      </div>
    </section>
  );
}
