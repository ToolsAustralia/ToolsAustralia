"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/utils/cn";
import { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface PartnerPreviewProps {
  acct: DashboardAccountState;
  /** One-time time-gated access label, e.g. "5 days". */
  expiryLabel?: string | null;
  className?: string;
}

const PREVIEW = PARTNER_BRAND_OFFERS.slice(0, 2);

/**
 * Compact partner-discounts preview for the home. Links to the full Rewards page.
 * Disabled/greyed when past due. Real offers only (from PARTNER_BRAND_OFFERS).
 */
export default function PartnerPreview({ acct, expiryLabel, className }: PartnerPreviewProps) {
  const locked = acct === "pastdue";
  const sub =
    acct === "onetime" && expiryLabel
      ? `Access ends in ${expiryLabel} · Australia's top tool brands`
      : locked
        ? "Paused — update payment to resume"
        : "Australia's top tool brands";

  return (
    <section className={cn("rounded-3xl border border-token bg-surface p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-['Poppins'] text-base font-extrabold text-primary-token dark:text-white">Partner discounts</h3>
          <p className="mt-0.5 text-sm text-muted-token">{sub}</p>
        </div>
        <Link
          href="/my-account/benefits"
          className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-red-600 hover:underline dark:text-red-400"
        >
          See all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className={cn("mt-4 space-y-2", locked && "pointer-events-none opacity-50 grayscale")}>
        {PREVIEW.map((brand) => (
          <div key={brand.id} className="flex items-center gap-3 rounded-2xl border border-token bg-page/60 p-2.5">
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white">
              <Image src={brand.logo} alt={brand.name} fill className="object-contain p-1" sizes="40px" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-primary-token dark:text-white">{brand.name}</div>
              <div className="truncate text-xs text-muted-token">{brand.discountMessage}</div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] font-extrabold text-red-600 dark:bg-red-500/15 dark:text-red-400">
              {brand.discount}
              <ExternalLink className="h-3 w-3" />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
