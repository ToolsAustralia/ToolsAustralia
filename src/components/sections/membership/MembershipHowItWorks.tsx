"use client";

import { Sparkles, Trophy, ChevronRight } from "lucide-react";
import { useMemberships } from "@/hooks/useMemberships";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { TIER_HEX, tierKeyFromName, glossGrad, inkOn } from "@/utils/membership/tier-visuals";
import type { MembershipPlan } from "@/hooks/useMemberships";
import { cn } from "@/utils/cn";

const ACCENTS = ["#ee0000", "#ff7a1a", "#d4af37"];

function MiniCard({ plan, metric }: { plan: MembershipPlan; metric: "price" | "access" }) {
  const key = tierKeyFromName(plan.name);
  const hex = TIER_HEX[key];
  const ink = inkOn(hex);
  const apex = key === "boss";
  const access = getPartnerCatalogAccessPercentForPlanId(`${key}-subscription`);
  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center gap-[5px] overflow-hidden rounded-[13px] border border-white/20 px-1.5 py-[11px]"
      style={{
        background: glossGrad(hex),
        color: ink,
        boxShadow: `0 0 0 1px ${hex},0 ${apex ? "16px 34px -16px" : "14px 28px -18px"} ${hex},inset 0 1px 0 rgba(255,255,255,${apex ? ".5" : ".4"})`,
      }}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-[13px]"
        style={{ background: "linear-gradient(180deg,rgba(255,255,255,.2),transparent 30%,transparent 72%,rgba(0,0,0,.14))" }}
      />
      <span className="relative z-[1] font-['Poppins'] text-[9.5px] font-black uppercase tracking-[0.1em]">{plan.name}</span>
      <span className="relative z-[1] font-['Poppins'] text-[21px] font-black leading-none">
        {metric === "price" ? `$${plan.price}` : access}
        <small className="ml-px text-[9.5px] font-bold opacity-65">{metric === "price" ? "/mo" : "%"}</small>
      </span>
    </div>
  );
}

function MiniDeck({ plans, metric, label }: { plans: MembershipPlan[]; metric: "price" | "access"; label: string }) {
  return (
    <div className="flex h-full w-full flex-col justify-end gap-2">
      <div className="flex min-h-0 flex-1 items-stretch gap-2">
        {plans.map((p) => (
          <MiniCard key={p.id} plan={p} metric={metric} />
        ))}
      </div>
      <span className="text-center text-[8.5px] font-extrabold uppercase tracking-[0.18em] text-white/50">{label}</span>
    </div>
  );
}

const STEPS = [
  { n: 1, title: "Pick your tier", body: "Choose Tradie, Foreman or Boss — your member discounts go live across our partner brands the day you join." },
  { n: 2, title: "Save with partner discounts", body: "Your tier unlocks up to 100% of the partner catalogue — save on every job, and your free entries stack each month." },
  { n: 3, title: "Win on the 27th", body: "Every 27th, one member wins the Ultimate Tradie Setup — or $10,000 cash — drawn live on Facebook." },
];

export default function MembershipHowItWorks() {
  const { subscriptionPackages } = useMemberships();
  return (
    <section
      className="relative overflow-hidden py-16 text-white sm:py-20 lg:py-24"
      style={{
        background:
          "radial-gradient(900px 560px at 12% -10%, rgba(238,0,0,.3), transparent 60%),radial-gradient(760px 520px at 92% 112%, rgba(212,175,55,.18), transparent 60%),linear-gradient(160deg,#130c10,#0a090c 55%,#15100d)",
      }}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 1px,transparent 1px 16px)" }}
        aria-hidden
      />
      <div className="relative z-[1] mx-auto max-w-7xl px-5 sm:px-6">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
            <Sparkles className="h-3.5 w-3.5" /> How it works
          </span>
          <h2 className="mt-4 font-['Poppins'] text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
            Join once.{" "}
            <span style={{ background: "linear-gradient(92deg,#ffe066,#ffb300 70%,#ff8a00)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              It pays all month.
            </span>
          </h2>
        </div>

        <div className="mt-12 flex flex-col items-stretch gap-4 lg:flex-row lg:items-stretch">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
              {i > 0 && (
                <span className="mx-auto my-1 self-center text-white/40 lg:mx-2 lg:my-0">
                  <ChevronRight className="h-6 w-6 rotate-90 lg:rotate-0" />
                </span>
              )}
              <div
                className="relative flex flex-1 flex-col overflow-hidden rounded-[18px] border border-white/10 p-6 sm:p-7"
                style={{
                  background: "linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02))",
                  boxShadow: "0 26px 54px -30px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.06)",
                }}
              >
                <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg,${ACCENTS[i]},${ACCENTS[i]}99)` }} />
                <span
                  className="pointer-events-none absolute bottom-3.5 right-[18px] font-['Poppins'] text-[48px] font-black leading-none tracking-[-0.04em]"
                  style={{ WebkitTextStroke: `2px ${ACCENTS[i]}`, WebkitTextFillColor: "transparent", color: "transparent", opacity: 0.85 }}
                  aria-hidden
                >
                  0{s.n}
                </span>
                <div className="relative mb-0.5 flex h-[108px] items-end">
                  {i < 2 ? (
                    <MiniDeck plans={subscriptionPackages} metric={i === 0 ? "price" : "access"} label={i === 0 ? "Monthly price" : "Partner-discount access"} />
                  ) : (
                    <div className="flex h-full items-center gap-[13px]">
                      <span
                        className="grid h-[50px] w-[50px] place-items-center rounded-[15px] border border-amber-200/50 text-[#1a1407]"
                        style={{ background: "linear-gradient(140deg,#e8c75a,#c79a2e)", boxShadow: "0 14px 30px -12px rgba(212,175,55,.85)" }}
                      >
                        <Trophy className="h-6 w-6" />
                      </span>
                      <div className="flex flex-col gap-1">
                        <span className="font-['Poppins'] text-[25px] font-black leading-none text-white">$10,000</span>
                        <span className="text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-amber-300">won every 27th</span>
                      </div>
                    </div>
                  )}
                </div>
                <h3 className={cn("mt-[18px] font-['Poppins'] text-lg font-black leading-snug sm:text-[22px]")}>{s.title}</h3>
                <p className="mt-2 pr-14 text-[13.5px] leading-relaxed text-white/[0.64]">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
