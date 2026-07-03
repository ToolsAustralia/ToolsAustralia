"use client";

import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { cn } from "@/utils/cn";
import AccessRing from "@/components/ui/AccessRing";
import { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";
import { PAST_DUE_AMBER } from "@/utils/membership/tier-visuals";
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
  // A past-due member who still holds a live one-time pack keeps real partner access (honored by
  // the queue + SSO + shop) — only a past-due member with NO live pack is truly locked. Mirrors
  // RewardsPartnerCard so the home widget and the Rewards page agree instead of falsely reading
  // "Paused / 0%" here while the Rewards page shows the pack active.
  const pastDue = acct === "pastdue";
  const pastDueWithPack = pastDue && partnerAccessPct > 0;
  const locked = pastDue && !pastDueWithPack;
  const isOneTime = acct === "onetime";
  const accent = pastDue ? PAST_DUE_AMBER : isOneTime ? "#0ea5a5" : tierHex ?? "#ee0000";
  const sub = pastDueWithPack
    ? `${partnerAccessPct}% active${expiryLabel ? ` · ends in ${expiryLabel}` : ""} · membership paused`
    : isOneTime && expiryLabel
      ? `Access ends in ${expiryLabel} · from your pack`
      : locked
        ? "Paused — update payment to resume"
        : "of the catalogue unlocked · top tool brands";
  // Accent-colored subline for the one-time + past-due-with-pack states (else muted).
  const accentSub = isOneTime || pastDueWithPack;

  return (
    <section className={cn("rounded-[1.1rem] border border-token bg-surface px-5 pb-4 pt-2 shadow-sm", className)}>
      <div className="flex items-center gap-4 py-3">
        <AccessRing percent={locked ? 0.1 : partnerAccessPct} size={58} stroke={7} color={accent} trackColor="rgba(0,0,0,0.08)">
          {locked ? (
            <Lock className="h-5 w-5" style={{ color: accent }} />
          ) : (
            <span className="num font-['Poppins'] text-sm font-black" style={{ color: accent }}>{partnerAccessPct}%</span>
          )}
        </AccessRing>
        <div className="min-w-0 flex-1">
          <div className="font-['Poppins'] text-[15px] font-extrabold text-primary-token dark:text-white">Partner discounts</div>
          <div className="mt-1 text-[11.5px] font-semibold" style={{ color: accentSub ? accent : undefined }}>
            <span className={accentSub ? "" : "text-muted-token"}>{sub}</span>
          </div>
        </div>
        <Link href="/my-account/rewards" className="inline-flex items-center gap-1 text-[12.5px] font-extrabold" style={{ color: tierHex ?? "#ee0000" }}>
          See all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* No partner-catalog access (past due with no live pack) → hide the deal glimpse entirely;
          the header already says "Paused — update payment to resume". A past-due member WITH a live
          pack is not locked, so their deals show. */}
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
