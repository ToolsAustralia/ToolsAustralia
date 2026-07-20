"use client";

import { Gift, ArrowRight } from "lucide-react";
import MetallicButton from "@/components/ui/MetallicButton";
import { SectionContainer } from "@/components/ui/SectionContainer";
import type { MembershipCardCta } from "@/hooks/useMembershipCardCta";

// Referral reward — same value surfaced across the app ("GET 100 FREE ENTRIES").
const REFERRAL_ENTRIES = 100;

export default function MembershipFinalCta({ cta }: { cta: MembershipCardCta }) {
  const plans = cta.membershipPlans;
  const tradie = plans.find((p) => p.name.toLowerCase().includes("tradie")) ?? plans[0];
  const fromPrice = tradie?.price ?? 20;
  return (
    <section className="relative overflow-hidden pt-16 pb-36 -mb-20 text-white sm:pt-24 sm:pb-48 sm:-mb-24 lg:pb-56 lg:-mb-32">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(78% 62% at 50% -16%, rgba(255,42,42,.55), transparent 60%), radial-gradient(56% 50% at 88% 116%, rgba(240,182,44,.26), transparent 60%), radial-gradient(52% 48% at 8% 112%, rgba(238,0,0,.24), transparent 60%), linear-gradient(170deg,#2a0d0d,#160a0a 60%,#0c0708)",
        }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 1px,transparent 1px 16px)" }}
        aria-hidden
      />
      <SectionContainer as="div" className="relative text-center">
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-[9px] font-extrabold uppercase tracking-[0.08em] sm:gap-2 sm:px-4 sm:text-xs sm:tracking-[0.14em]"
          style={{
            color: "#f1d99a",
            background: "linear-gradient(180deg,rgba(212,175,55,.18),rgba(212,175,55,.05))",
            borderColor: "rgba(212,175,55,.5)",
            boxShadow: "0 0 28px -12px rgba(212,175,55,.7)",
          }}
        >
          <Gift className="h-3 w-3 flex-none sm:h-3.5 sm:w-3.5" style={{ color: "#d4af37" }} /> Refer a mate · both get {REFERRAL_ENTRIES} free entries
        </span>
        <h2 className="mx-auto mt-5 max-w-3xl font-poppins text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
          Join today.{" "}
          <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">Be in this month&apos;s draw.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] text-white/75 sm:text-lg">
          Discounts at our partner brands, free entries every month, drawn live on the 27th. From ${fromPrice}/mo, cancel
          anytime.
        </p>
        <div className="mt-8 flex flex-nowrap items-stretch justify-center gap-2.5 sm:gap-3">
          <MetallicButton
            variant="primary"
            size="md"
            borderRadius="full"
            onClick={() => tradie && cta.onSelect(tradie)}
            icon={<ArrowRight className="h-4 w-4" />}
            className="justify-center whitespace-nowrap !rounded-xl !px-4 !text-sm sm:!rounded-full sm:!px-8 sm:!text-base"
          >
            Become a member
          </MetallicButton>
          <a
            href="#membership"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-xl border px-4 py-3 text-sm font-extrabold text-[#1a1407] transition-transform hover:-translate-y-0.5 sm:rounded-full sm:px-8 sm:py-4 sm:text-base"
            style={{ background: "linear-gradient(180deg,#ffe9a8,#e6b955 55%,#caa23e)", borderColor: "rgba(255,240,190,.6)", boxShadow: "0 14px 30px -14px rgba(212,175,55,.7)" }}
          >
            Compare tiers
          </a>
        </div>
      </SectionContainer>
    </section>
  );
}
