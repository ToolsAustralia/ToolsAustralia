"use client";

import Image from "next/image";
import { Lock, ExternalLink, Store, ArrowRight } from "lucide-react";
import { cn } from "@/utils/cn";
import AccessRing from "@/components/ui/AccessRing";
import { inkOn, shade, PAST_DUE_AMBER } from "@/utils/membership/tier-visuals";
import { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";
import { usePartnerDiscountSso } from "@/hooks/queries/usePartnerDiscountSso";
import { partnerDiscountSsoEnabled } from "@/config/featureFlags";
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

/** Leads the Rewards page — ported from the prototype `PartnerGrid`. */
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
  const guest = acct === "none";
  const pastdue = acct === "pastdue";
  const onetime = acct === "onetime";
  // A past-due member keeps any one-time pack partner access they paid for (honored by the
  // queue + SSO + shop). Only a past-due member with NO live pack is truly paused/locked —
  // otherwise the card would falsely read "Paused / 0%" while the queue shows "· 25% active".
  const pastDueWithPack = pastdue && partnerAccessPct > 0;
  const locked = guest || (pastdue && !pastDueWithPack);

  const c = guest ? "#8a8a8f" : pastdue ? PAST_DUE_AMBER : onetime ? "#0ea5a5" : tierHex ?? "#ee0000";
  const pct = locked ? 0 : partnerAccessPct;

  // Show the tier-accurate slice of the catalogue (first N in order, N = ceil(pct% ·
  // total) — same rule as getPartnerCatalogVisibleSliceLength). Locked users see a
  // 4-brand dimmed teaser. With the SSO portal off, this grid IS the live catalogue.
  const total = PARTNER_BRAND_OFFERS.length;
  const visibleCount = locked ? 4 : Math.min(total, Math.max(1, Math.ceil((partnerAccessPct / 100) * total)));
  const brands = PARTNER_BRAND_OFFERS.slice(0, visibleCount);
  const headline = guest
    ? "Locked"
    : pastDueWithPack
      ? "Active from your pack"
      : pastdue
        ? "Paused"
        : onetime
          ? "Access unlocked"
          : "Catalogue unlocked";
  const sub = guest
    ? "Become a member or buy a package to unlock discounts"
    : pastDueWithPack
      ? // Ring already shows the %, headline already says "Active" — subline carries only the new facts.
        `${expiryLabel ? `Ends in ${expiryLabel} · ` : ""}membership paused`
      : pastdue
        ? "Update payment to restore your discounts"
        : onetime
          ? `Ends in ${expiryLabel ?? "soon"} · from your pack`
          : "of Australia's top tool brands, on your account";

  return (
    <section>
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Partner discounts</span>

      <div className={cn("mt-3 rounded-[1.1rem] border bg-surface p-4 shadow-sm", pastdue ? "border-[#d97706]/45" : "border-token")}>
        <div className="flex items-center gap-4">
          <AccessRing percent={pct || 0.1} size={72} stroke={8} color={c} trackColor="rgba(0,0,0,0.08)">
            <span className="num font-['Poppins'] text-base font-extrabold" style={{ color: c }}>
              {locked ? <Lock className="h-5 w-5" /> : `${partnerAccessPct}%`}
            </span>
          </AccessRing>
          <div className="min-w-0 flex-1">
            <div className="font-['Poppins'] text-[15px] font-extrabold text-primary-token dark:text-white">{headline}</div>
            <div className="mt-1 text-[11.5px] font-semibold leading-[1.4]" style={{ color: onetime || pastdue ? c : undefined }}>
              <span className={onetime || pastdue ? "" : "text-muted-token"}>{sub}</span>
            </div>
          </div>
        </div>

        {guest ? (
          <div className="mt-3.5 flex gap-2.5">
            <button type="button" onClick={onBecomeMember} className="flex flex-1 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#ff5a5a] to-[#c40d0d] px-3 py-3 text-[12.5px] font-extrabold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
              Become a member
            </button>
            <button type="button" onClick={onBuyPackage} className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-token px-3 py-3 text-[12.5px] font-extrabold text-primary-token focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-white">
              Buy a package
            </button>
          </div>
        ) : pastdue ? (
          // Past-due keeps the "Update payment" CTA whether or not a pack is live — it restores
          // the (higher) membership partner tier. When a pack IS live the ring/grid above already
          // show the real access, so this is a restore-more prompt, not a "you have nothing" one.
          <button type="button" onClick={onUpdatePayment} className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-b from-[#fbbf24] to-[#d97706] px-4 py-3 text-[13px] font-extrabold text-[#241a02] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">
            {pastDueWithPack ? "Update payment to restore membership" : "Update payment"} <ArrowRight className="h-4 w-4" />
          </button>
        ) : partnerDiscountSsoEnabled() ? (
          <button
            type="button"
            onClick={() => sso.mutate()}
            disabled={sso.isPending}
            className="mt-3.5 flex w-full items-center gap-3 rounded-[10px] px-4 py-3 text-left disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            style={{ color: inkOn(c), background: `linear-gradient(150deg, ${shade(c, 22)}, ${shade(c, -16)})`, boxShadow: `0 14px 30px -18px ${c}` }}
          >
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px]" style={{ background: inkOn(c) === "#ffffff" ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.14)" }}>
              <Store className="h-[17px] w-[17px]" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block font-['Poppins'] text-[13px] font-extrabold">{sso.isPending ? "Opening…" : "Open partner portal"}</b>
              <span className="text-[10px] font-semibold" style={{ color: inkOn(c) === "#ffffff" ? "rgba(255,255,255,.78)" : "rgba(0,0,0,.6)" }}>See every deal · signed in via SSO</span>
            </span>
            <ExternalLink className="h-4 w-4" />
          </button>
        ) : (
          // Partner portal (SSO) not shipped yet — see partnerDiscountSsoEnabled().
          <div className="mt-3.5 flex w-full items-center gap-3 rounded-[10px] border border-token px-4 py-3">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-black/[.06] text-muted-token dark:bg-white/[.08]">
              <Store className="h-[17px] w-[17px]" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block font-['Poppins'] text-[13px] font-extrabold text-primary-token dark:text-white">Partner portal</b>
              <span className="text-[10px] font-semibold text-muted-token">Coming soon</span>
            </span>
          </div>
        )}
      </div>

      {/* No partner-catalog access (guest / past-due with no live pack) → hide the brand grid
          entirely, no dimmed glimpse; the ring + CTA above already prompt to unlock. A past-due
          member WITH a live pack is not locked, so their accessible slice shows. */}
      {!locked && (
        <div className="mt-3 grid grid-cols-2 gap-[11px]">
        {brands.map((b) => {
          const bc = locked ? "#8a93a1" : c;
          const hasLink = !locked && Boolean(b.businessLink) && b.businessLink !== "#";
          const tileClass = "flex flex-col gap-2.5 rounded-[1.1rem] border border-token bg-surface p-3.5 shadow-sm";
          const inner = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white ring-1 ring-black/[.06]">
                  <Image src={b.logo} alt={b.name} width={30} height={30} className="h-7 w-7 object-contain" />
                </span>
                <span className="font-['Poppins'] text-xs font-black" style={{ color: bc }}>{b.discount}</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-bold text-primary-token dark:text-white">{b.name}</span>
                  {hasLink && <ExternalLink className="h-3 w-3 shrink-0 text-muted-token" />}
                </div>
                <div className="mt-1 truncate text-[10.5px] font-semibold text-muted-token">{b.category}</div>
              </div>
            </>
          );
          return hasLink ? (
            <a
              key={b.id}
              href={b.businessLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(tileClass, "transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600")}
            >
              {inner}
            </a>
          ) : (
            <div key={b.id} className={tileClass}>{inner}</div>
          );
        })}
        </div>
      )}
    </section>
  );
}
