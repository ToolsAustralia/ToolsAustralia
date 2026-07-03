"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import AccessRing from "@/components/ui/AccessRing";
import { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface PartnerPreviewProps {
  acct: DashboardAccountState;
  partnerAccessPct: number;
  /** One-time time-gated access label, e.g. "5 days". */
  expiryLabel?: string | null;
  tierHex?: string | null;
  className?: string;
}

const DEALS = PARTNER_BRAND_OFFERS.slice(0, 3);

/**
 * Compact partner-discounts preview — ported from the prototype: an access ring
 * + title/"See all" + deal rows (letter badge · name · category · offer).
 * Greyed when past due; teal accent for one-time; links to the full Rewards page.
 */
export default function PartnerPreview({ acct, partnerAccessPct, expiryLabel, tierHex, className }: PartnerPreviewProps) {
  const locked = acct === "pastdue";
  const isOneTime = acct === "onetime";
  const accent = locked ? "#d97706" : isOneTime ? "#0ea5a5" : tierHex ?? "#ee0000";
  const sub =
    isOneTime && expiryLabel
      ? `Access ends in ${expiryLabel} · from your pack`
      : locked
        ? "Paused — update payment to resume"
        : "of the catalogue unlocked · top tool brands";

  return (
    <section className={cn("rounded-[1.1rem] border border-token bg-surface px-5 pb-4 pt-2 shadow-sm", className)}>
      <div className="flex items-center gap-4 py-3">
        <AccessRing percent={partnerAccessPct} size={58} stroke={7} color={accent} trackColor="rgba(0,0,0,0.08)">
          <span className="num font-['Poppins'] text-sm font-black" style={{ color: accent }}>{partnerAccessPct}%</span>
        </AccessRing>
        <div className="min-w-0 flex-1">
          <div className="font-['Poppins'] text-[15px] font-extrabold text-primary-token dark:text-white">Partner discounts</div>
          <div className="mt-1 text-[11.5px] font-semibold" style={{ color: isOneTime ? accent : undefined }}>
            <span className={isOneTime ? "" : "text-muted-token"}>{sub}</span>
          </div>
        </div>
        <Link href="/my-account/rewards" className="inline-flex items-center gap-1 text-[12.5px] font-extrabold" style={{ color: tierHex ?? "#ee0000" }}>
          See all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* No partner-catalog access (past due) → hide the deal glimpse entirely; the
          header already says "Paused — update payment to resume". */}
      {!locked && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-black/10 to-transparent dark:via-white/10" />
          <div>
            {DEALS.map((d) => (
              <div key={d.id} className="flex items-center gap-[11px] border-b border-token py-[11px] last:border-0">
                <span
                  className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] font-['Poppins'] text-xs font-black"
                  style={{ background: "rgba(0,0,0,.05)", color: tierHex ?? "#ee0000" }}
                >
                  {d.name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-bold text-primary-token dark:text-white">{d.name}</div>
                  <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-token">{d.category}</div>
                </div>
                <span className="whitespace-nowrap font-['Poppins'] text-[13px] font-black" style={{ color: tierHex ?? "#ee0000" }}>
                  {d.discount}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
