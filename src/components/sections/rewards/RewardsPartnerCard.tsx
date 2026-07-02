"use client";

import Image from "next/image";
import { Lock, ExternalLink, Store, ArrowRight } from "lucide-react";
import { cn } from "@/utils/cn";
import AccessRing from "@/components/ui/AccessRing";
import { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";
import { usePartnerDiscountSso } from "@/hooks/queries/usePartnerDiscountSso";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface RewardsPartnerCardProps {
  acct: DashboardAccountState;
  partnerAccessPct: number;
  expiryLabel?: string | null;
  tierHex?: string | null;
  onBecomeMember: () => void;
  onBuyPackage: () => void;
  onUpdatePayment: () => void;
}

const BRANDS = PARTNER_BRAND_OFFERS.slice(0, 4);

/** Leads the Rewards page — partner-catalogue access ring + SSO portal + brand grid. */
export default function RewardsPartnerCard({
  acct,
  partnerAccessPct,
  expiryLabel,
  tierHex,
  onBecomeMember,
  onBuyPackage,
  onUpdatePayment,
}: RewardsPartnerCardProps) {
  const sso = usePartnerDiscountSso();
  const locked = acct === "none" || acct === "pastdue";

  const ring =
    acct === "none"
      ? { pct: 0, color: "#9ca3af", headline: "Locked", sub: "Unlock partner discounts" }
      : acct === "pastdue"
        ? { pct: 0, color: "#d97706", headline: "Paused", sub: "Update payment to resume" }
        : acct === "onetime"
          ? { pct: partnerAccessPct, color: "#0ea5a5", headline: `${partnerAccessPct}% unlocked`, sub: expiryLabel ? `Access ends in ${expiryLabel}` : "Catalogue unlocked" }
          : { pct: partnerAccessPct, color: tierHex ?? "#ee0000", headline: `${partnerAccessPct}% unlocked`, sub: "Top tool brands · catalogue unlocked" };

  return (
    <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-5">
        <AccessRing percent={ring.pct} size={104} stroke={10} color={ring.color} trackColor="rgba(0,0,0,0.08)">
          {locked ? (
            <Lock className="h-7 w-7 text-muted-token" />
          ) : (
            <div className="text-center leading-none">
              <div className="num font-['Poppins'] text-2xl font-black text-primary-token dark:text-white">{ring.pct}%</div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-token">Access</div>
            </div>
          )}
        </AccessRing>

        <div className="min-w-0 flex-1">
          <h2 className="font-['Poppins'] text-lg font-extrabold text-primary-token dark:text-white">
            Partner discounts
          </h2>
          <p className="mt-0.5 text-sm text-muted-token">{ring.sub}</p>

          {!locked && (
            <button
              type="button"
              onClick={() => sso.mutate()}
              disabled={sso.isPending}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-red-500 to-red-700 px-4 py-2.5 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60 motion-safe:active:translate-y-px"
            >
              <Store className="h-4 w-4" />
              {sso.isPending ? "Opening…" : "Open partner portal"}
              <ExternalLink className="h-3.5 w-3.5 opacity-80" />
            </button>
          )}
        </div>
      </div>

      {locked ? (
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {acct === "pastdue" ? (
            <button
              type="button"
              onClick={onUpdatePayment}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-4 py-3 text-sm font-bold text-[#241a02] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 motion-safe:active:translate-y-px sm:col-span-2"
            >
              Update payment to resume <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onBecomeMember}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-red-500 to-red-700 px-4 py-3 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px"
              >
                Become a member
              </button>
              <button
                type="button"
                onClick={onBuyPackage}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-token bg-surface px-4 py-3 text-sm font-bold text-primary-token transition-transform hover:bg-black/[.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-white dark:hover:bg-white/[.05] motion-safe:active:translate-y-px"
              >
                Buy a package
              </button>
            </>
          )}
        </div>
      ) : (
        <div className={cn("mt-5 grid grid-cols-2 gap-2.5", acct === "onetime" && expiryLabel === null && "opacity-90")}>
          {BRANDS.map((brand) => (
            <div key={brand.id} className="flex items-center gap-2.5 rounded-2xl border border-token bg-black/[.03] p-2.5 dark:bg-white/[.04]">
              <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white">
                <Image src={brand.logo} alt={brand.name} fill className="object-contain p-1" sizes="36px" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-primary-token dark:text-white">{brand.name}</div>
                <div className="truncate text-[11px] text-muted-token">{brand.discount}</div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-token" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
