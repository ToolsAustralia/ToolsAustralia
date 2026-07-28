"use client";

import { useEffect, useMemo, useState } from "react";
import { Bolt, Sparkles, ArrowRight } from "lucide-react";
import MetallicButton from "@/components/ui/MetallicButton";
import Seg from "@/components/ui/Seg";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { useMemberships } from "@/hooks/useMemberships";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { buildClimbSeries } from "@/utils/membership/climb-series";
import ClimbChart, { type ClimbGhost } from "./ClimbChart";
import PartnerPortalPhone from "./PartnerPortalPhone";

type TierKey = "tradie" | "foreman" | "boss";
const ORDER: TierKey[] = ["tradie", "foreman", "boss"];
const HEX: Record<TierKey, string> = { tradie: "#00c2ed", foreman: "#ffd200", boss: "#ee0000" };
const LABEL: Record<TierKey, string> = { tradie: "Tradie", foreman: "Foreman", boss: "Boss" };

function keyOf(name: string): TierKey {
  const n = name.toLowerCase();
  if (n.includes("foreman")) return "foreman";
  if (n.includes("boss")) return "boss";
  return "tradie";
}

export default function MembershipEntriesStack() {
  const { subscriptionPackages } = useMemberships();
  const promo = useResolvedMultiplier("membership-packages") ?? 1;
  const [tier, setTier] = useState<TierKey>("foreman");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width:640px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const months = isMobile ? 4 : 6;

  const baseByTier = useMemo(() => {
    const m: Record<TierKey, number> = { tradie: 15, foreman: 40, boss: 100 };
    for (const p of subscriptionPackages) {
      const k = keyOf(p.name);
      if (typeof p.entriesPerMonth === "number") m[k] = p.entriesPerMonth;
    }
    return m;
  }, [subscriptionPackages]);

  const cum = useMemo(() => buildClimbSeries(baseByTier[tier], promo, months), [baseByTier, tier, promo, months]);
  const total = cum[cum.length - 1] ?? 0;
  const selIdx = ORDER.indexOf(tier);
  const ghosts: ClimbGhost[] = ORDER.slice(0, selIdx).map((k) => ({
    name: LABEL[k],
    color: HEX[k],
    cum: buildClimbSeries(baseByTier[k], promo, months),
  }));

  const access = getPartnerCatalogAccessPercentForPlanId(`${tier}-subscription`);

  return (
    <section className="relative overflow-hidden bg-neutral-950 py-12 text-white sm:py-20 lg:py-24">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(900px 500px at 50% -10%, ${HEX[tier]}22, transparent 60%)` }}
        aria-hidden
      />
      <SectionContainer as="div" className="relative">
        <div className="text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.16em]"
            style={{
              color: "#f1d99a",
              background: "linear-gradient(180deg,rgba(212,175,55,.18),rgba(212,175,55,.05))",
              borderColor: "rgba(212,175,55,.5)",
              boxShadow: "0 0 28px -12px rgba(212,175,55,.7)",
            }}
          >
            <Bolt className="h-3.5 w-3.5" style={{ color: "#d4af37" }} /> Why membership pays
          </span>
          <h2 className="mt-5 font-poppins text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            Your entries don&apos;t reset. <span className="text-red-600">They stack.</span>
          </h2>
          <div className="mt-6 flex justify-center">
            <Seg
              value={tier}
              onChange={setTier}
              tone="dark"
              accentHex={HEX[tier]}
              options={ORDER.map((k) => ({ value: k, label: LABEL[k] }))}
            />
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-3 sm:p-8">
          <div className="mb-1 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/55 sm:text-xs">Your standing entries</span>
            <div className="font-poppins text-4xl font-extrabold sm:text-5xl" style={{ color: HEX[tier] }}>
              <AnimatedNumber value={total} />
            </div>
            <span className="text-[11px] text-white/55 sm:text-xs">
              after {months} months on {LABEL[tier]}
              {promo > 1 ? ` · ${promo}× start` : ""}
            </span>
          </div>
          <ClimbChart tierName={LABEL[tier]} accentHex={HEX[tier]} cum={cum} total={total} ghosts={ghosts} compact={isMobile} />
          <p className="mt-2 text-center text-[11px] leading-snug text-white/65 sm:text-[13px]">
            <Sparkles className="mr-1 inline h-3.5 w-3.5 align-[-2px]" style={{ color: HEX[tier] }} /> Stay a member and{" "}
            <b className="text-white">the climb never stops</b> — more free entries, every single month.
          </p>
        </div>

        <div className="mt-10 grid items-center gap-8 lg:grid-cols-2">
          <PartnerPortalPhone
            tierName={LABEL[tier]}
            accentHex={HEX[tier]}
            accessPercent={access}
            subscriptionPlanId={`${tier}-subscription`}
            activeTierIndex={selIdx}
          />
          <div>
            <h3 className="font-poppins text-2xl font-extrabold">Your member discounts live in one partner portal.</h3>
            <p className="mt-3 text-white/70">
              Open it straight from your account — your tier sets how much of the partner catalogue you unlock.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <MetallicButton
                href="#membership"
                variant="primary"
                size="md"
                borderRadius="full"
                className="whitespace-nowrap !rounded-xl !px-5 !text-sm sm:!rounded-full sm:!px-8 sm:!text-base"
                icon={<ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />}
              >
                Start stacking entries
              </MetallicButton>
            </div>
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
