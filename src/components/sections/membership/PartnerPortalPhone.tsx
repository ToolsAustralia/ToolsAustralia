"use client";

import Image from "next/image";
import { Tag, ArrowRight } from "lucide-react";
import AccessRing from "@/components/ui/AccessRing";
import { useTilt } from "@/hooks/useTilt";
import { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";
import { getPackageIcon } from "@/utils/images/package-icons";
import { getPartnerCatalogVisibleSliceLength } from "@/utils/partner-discounts/partner-catalog-visibility";

const TIER_BAR = ["#00c2ed", "#ffd200", "#ee0000"];

function chipOf(name: string): string {
  return name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
}

/**
 * In-phone preview of the member rewards portal: access ring + a live partner-deals
 * list drawn from the REAL PARTNER_BRAND_OFFERS catalogue, sliced by tier. Counts are
 * catalogue-driven so this scales from 7 brands today to 1,000+ with no change.
 */
export default function PartnerPortalPhone({
  tierName,
  accentHex,
  accessPercent,
  subscriptionPlanId,
  activeTierIndex,
}: {
  tierName: string;
  accentHex: string;
  accessPercent: number;
  subscriptionPlanId: string;
  activeTierIndex: number;
}) {
  const ref = useTilt<HTMLDivElement>(4);
  const icon = getPackageIcon(subscriptionPlanId);
  const total = PARTNER_BRAND_OFFERS.length;
  const visibleCount = getPartnerCatalogVisibleSliceLength(total, subscriptionPlanId);
  const visible = PARTNER_BRAND_OFFERS.slice(0, Math.max(1, visibleCount));
  const deals = visible.slice(0, 3);
  const moreCount = Math.max(0, visibleCount - deals.length);

  return (
    <div ref={ref} className="mx-auto w-[260px] [transform-style:preserve-3d]">
      <div className="relative rounded-[2.2rem] border border-white/10 bg-neutral-950 p-3 shadow-2xl">
        <div className="absolute left-1/2 top-3 h-1.5 w-16 -translate-x-1/2 rounded-full bg-white/15" />
        <div className="rounded-[1.7rem] bg-gradient-to-b from-neutral-900 to-black p-2 pt-8">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-white">My Rewards</div>
              <div className="text-xs font-semibold" style={{ color: accentHex }}>
                {tierName} member
              </div>
            </div>
            {icon && (
              <span
                className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-white/10 bg-white/5"
                style={{ boxShadow: `0 0 18px -8px ${accentHex}` }}
              >
                <Image src={icon} alt="" width={34} height={34} className="h-[34px] w-[34px] object-contain drop-shadow" />
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            <AccessRing percent={accessPercent} size={110} stroke={10} color={accentHex} trackColor="rgba(255,255,255,0.08)">
              <span className="font-poppins text-2xl font-extrabold" style={{ color: accentHex }}>
                {accessPercent}%
              </span>
            </AccessRing>
            <span className="text-[11px] uppercase tracking-wider text-white/55">of partner brands unlocked</span>
          </div>

          <div className="mt-4 flex gap-1">
            {TIER_BAR.map((c, i) => (
              <span
                key={c}
                className="h-1.5 flex-1 rounded-full"
                style={{ background: i <= activeTierIndex ? c : "rgba(255,255,255,0.12)" }}
              />
            ))}
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/70">Live partner deals</span>
              {moreCount > 0 && (
                <span className="ml-auto inline-flex flex-none items-center gap-1 whitespace-nowrap text-[10px] font-extrabold" style={{ color: accentHex }}>
                  <Tag className="h-2.5 w-2.5 flex-none" /> View more
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-1.5">
              {deals.map((d, i) => (
                <li
                  key={d.id}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2"
                >
                  <span
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md font-poppins text-[9px] font-black"
                    style={{ background: i === 0 ? accentHex : "rgba(255,255,255,0.12)", color: i === 0 ? "#000" : "#fff" }}
                  >
                    {chipOf(d.name)}
                  </span>
                  <span className="flex-1 truncate text-[11px] font-semibold text-white/90">{d.name}</span>
                  <span
                    className="flex-shrink-0 font-poppins text-[11px] font-black"
                    style={i === 0 ? { background: accentHex, color: "#000", padding: "2px 7px", borderRadius: 7 } : { color: accentHex }}
                  >
                    {d.discount}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-extrabold"
            style={{ background: accentHex, color: "#000" }}
          >
            Open partner portal <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
