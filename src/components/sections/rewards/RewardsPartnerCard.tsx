"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { Lock, ExternalLink, Store, ArrowRight, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import AccessRing from "@/components/ui/AccessRing";
import { inkOn, shade, PAST_DUE_AMBER } from "@/utils/membership/tier-visuals";
import { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";
import { getPartnerCatalogUnlockedCount } from "@/utils/partner-discounts/partner-catalog-visibility";
import { usePortalHandoff } from "@/components/sections/rewards/PortalHandoff";
import { partnerDiscountSsoEnabled } from "@/config/featureFlags";
import { usePartnerCatalogueSpotlight } from "@/app/(site)/my-account/components/PartnerCatalogueSpotlight";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface RewardsPartnerCardProps {
  acct: DashboardAccountState;
  partnerAccessPct: number;
  expiryLabel?: string | null;
  tierHex?: string | null;
  /** Given name + tier, shown in the transit takeover's footer so the session reads as theirs. */
  memberName?: string | null;
  tierLabel?: string | null;
  onBecomeMember: () => void;
  onBuyPackage: () => void;
  onUpdatePayment: () => void;
}

const fmtAu = (n: number): string => n.toLocaleString("en-AU");

/** Leads the Rewards page — ported from the prototype `PartnerGrid`. */
export default function RewardsPartnerCard({
  acct,
  partnerAccessPct,
  expiryLabel,
  tierHex,
  memberName,
  tierLabel,
  onBecomeMember,
  onBuyPackage,
  onUpdatePayment,
}: RewardsPartnerCardProps) {
  const sso = usePortalHandoff({ memberName, tierLabel, accessPct: partnerAccessPct });
  const catalogueIsNew = usePartnerCatalogueSpotlight().show;
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
  // Real numbers behind the ring's percent, so "50%" reads as a checkable promise.
  const unlocked = getPartnerCatalogUnlockedCount(partnerAccessPct);
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
          : // Was "of Australia's top tool brands, on your account" — two problems (audit
            // 2026-07-31): the percent had no denominator, and the tool-brand claim does not
            // survive contact with the catalogue we actually hand members (Milwaukee, DeWalt,
            // Makita and Ryobi all return zero offers in the portal). State the real count.
            unlocked.count != null
            ? `${fmtAu(unlocked.count)} of ${fmtAu(unlocked.total)} partner offers, on your account`
            : "of partner discounts, on your account";

  return (
    <section>
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Partner discounts</span>

      <div className={cn("mt-3 rounded-[1.1rem] border bg-surface p-4 shadow-sm", pastdue ? "border-[#d97706]/45" : "border-token")}>
        <div className="flex items-center gap-4">
          <AccessRing percent={pct || 0.1} size={72} stroke={8} color={c} trackColor="rgba(0,0,0,0.08)">
            <span className="num font-poppins text-base font-extrabold" style={{ color: c }}>
              {locked ? <Lock className="h-5 w-5" /> : `${partnerAccessPct}%`}
            </span>
          </AccessRing>
          <div className="min-w-0 flex-1">
            <div className="font-poppins text-[15px] font-extrabold text-primary-token dark:text-white">{headline}</div>
            <div className="mt-1 text-[11.5px] font-semibold leading-[1.4]" style={{ color: onetime || pastdue ? c : undefined }}>
              <span className={onetime || pastdue ? "" : "text-muted-token"}>{sub}</span>
            </div>
          </div>
        </div>

        {guest ? (
          <div className="mt-3.5 flex gap-2.5">
            {/* #e02424, not #ff5a5a — white on the lighter stop measured 3.06:1, below the
                4.5:1 AA floor for 12.5px bold text (panel F-035). */}
            {/* Pulses for ~5s on every arrival at Rewards (see .ta-nudge-attention). A guest
                landing here is looking at a locked ring — this is the move out of it. */}
            <button type="button" onClick={onBecomeMember} className="ta-nudge-attention flex flex-1 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#e02424] to-[#c40d0d] px-3 py-3 text-[12.5px] font-extrabold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
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
          <>
          <button
            type="button"
            onClick={sso.start}
            disabled={sso.busy}
            className="ta-nudge-attention mt-3.5 flex w-full items-center gap-3 rounded-[10px] px-4 py-3 text-left disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            /* The darkening is CONDITIONAL on which ink `inkOn()` picked, and must stay that way.
               White-ink tiers were failing badly — Tradie's cyan measured 2.07:1 against the old
               `shade(c, 22) -> shade(c, -16)` ramp, under half the 4.5:1 AA minimum — so those get
               a much darker ramp. But `inkOn()` returns DARK ink for a bright tier (Foreman's
               yellow), and that tier was already passing at 9.64:1; applying the same darkening
               unconditionally puts dark ink on a dark ground and drops it to 2.70:1, breaking a
               tier that was fine. Computed with the repo's own `shade`/`inkOn` over all three
               tiers, worst point of the gradient (both stops + midpoint):
                 Tradie  1.85 -> 5.96   Boss  3.89 -> 10.51   Foreman  9.64 (unchanged). */
            style={{
              color: inkOn(c),
              background:
                inkOn(c) === "#ffffff"
                  ? `linear-gradient(150deg, ${shade(c, -44)}, ${shade(c, -60)})`
                  : `linear-gradient(150deg, ${shade(c, 22)}, ${shade(c, -16)})`,
              boxShadow: `0 14px 30px -18px ${c}`,
              // Ring tone for .ta-nudge-attention — the member's own tier colour at ~55%,
              // so the pulse reads as part of the card rather than a stray red alert.
              // `c` is always a 6-digit hex here, so the 8-digit alpha form is safe.
              ["--ta-attention" as string]: `${c}8c`,
            } as CSSProperties}
          >
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px]" style={{ background: inkOn(c) === "#ffffff" ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.14)" }}>
              <Store className="h-[17px] w-[17px]" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block font-poppins text-[13px] font-extrabold">{sso.busy ? "Opening…" : "Open partner portal"}</b>
              {/* Solid ink, not a translucent one. At 10px this label was the worst contrast on the
                  card in BOTH branches — `rgba(255,255,255,.78)` gave 1.79:1 on the old cyan ramp,
                  and `rgba(0,0,0,.6)` still only reaches 4.45:1 on Foreman's yellow, just under AA.
                  The 10px/13px size gap already carries the hierarchy without discounting opacity. */}
              {/* Was "See every deal · signed in automatically" — dropped the "see every deal"
                  half (68% of the portal's home page is above a Tradie's level, so it read as
                  "use every deal"). The entitlement itself is stated once, on the ring subline
                  above; repeating the count here was redundant. */}
              <span className="text-[10px] font-semibold" style={{ color: inkOn(c) }}>Signed in automatically</span>
            </span>
            <ExternalLink className="h-4 w-4" />
          </button>
          {/* The SSO route's error bodies are customer copy and this is the surface
              Cobber's FAQ points members at — swallowing them left the button flicking
              "Opening…" and back with no explanation (panel F-033). Once the takeover is
              up it owns error display, so `error` here is only the pre-takeover leg. */}
          {sso.error && (
            <p className="mt-2 text-[11.5px] font-semibold text-[#c40d0d] dark:text-[#ff6b6b]" role="alert">
              {sso.error}
            </p>
          )}
          {sso.overlay}
          </>
        ) : (
          // Partner portal (SSO) not shipped yet — see partnerDiscountSsoEnabled().
          <div className="mt-3.5 flex w-full items-center gap-3 rounded-[10px] border border-token px-4 py-3">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-black/[.06] text-muted-token dark:bg-white/[.08]">
              <Store className="h-[17px] w-[17px]" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block font-poppins text-[13px] font-extrabold text-primary-token dark:text-white">Partner portal</b>
              <span className="text-[10px] font-semibold text-muted-token">Coming soon</span>
            </span>
          </div>
        )}
      </div>

      {/* ── The catalogue link is UNIVERSAL, deliberately outside the CTA branches above ──
          It used to live inside the SSO branch, which meant only active members and one-time
          holders ever saw it. Two states were wrongly excluded:

            • PAST-DUE WITH A LIVE PACK — the card above literally reads "Active from your
              pack · 25%", then offered no way to see what that 25% opens. They paid for it.
            • GUEST / 0% — for them the catalogue is the best conversion surface we have:
              1,833 offers, every one marked with the membership that opens it, each card
              linking to /membership. Hiding it is the opposite of what it is good at.

          Entitlement is a property of the ROW's copy, not of who may see the row. */}
      {/* Pulses on every arrival at Rewards, NOT just the first (see .ta-nudge-attention).
          The "New" badge below is one-time by design — "new" stops being true — but the row
          itself stays worth pointing at long after, so the two cues have different lifetimes.
          Guests get the default red: their ring colour `c` is grey, and grey is the one tone
          that cannot pull attention. */}
      <Link
        href="/my-account/rewards/catalogue"
        className="ta-nudge-attention mt-2 flex items-center justify-between gap-2 rounded-[10px] border border-token px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
        style={locked ? undefined : ({ ["--ta-attention" as string]: `${c}8c` } as CSSProperties)}
      >
        <span className="min-w-0">
          <b className="flex items-center gap-1.5 text-[11.5px] font-extrabold text-primary-token dark:text-white">
            {partnerAccessPct > 0 ? `See what your ${partnerAccessPct}% opens` : "See what a membership opens"}
            {/* The nav dot gets them to Rewards; this marks WHICH row is the new thing,
                otherwise the trail goes cold on a page with four other cards. */}
            {catalogueIsNew && (
              <span className="rounded-full bg-red-600 px-1.5 py-[1px] text-[9px] font-black uppercase tracking-wide text-white">
                New
              </span>
            )}
          </b>
          <span className="text-[10px] font-semibold text-muted-token">
            Search and filter all {fmtAu(unlocked.total)} partner offers
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-token" />
      </Link>

      {/* No partner-catalog access (guest / past-due with no live pack) → hide the brand grid
          entirely, no dimmed glimpse; the ring + CTA above already prompt to unlock. A past-due
          member WITH a live pack is not locked, so their accessible slice shows. */}
      {/* These are Tools Australia's OWN partner brands — mention-us-at-the-counter deals that
          are NOT in the iGoDirect portal catalogue at all. They previously sat unlabelled
          directly under the portal button, so the ring's percent read as if it described THIS
          grid (audit 2026-07-31, finding 13). Naming the programme separates the two. */}
      {!locked && (
        <>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">
            Tools Australia partners
          </span>
          <span className="text-[10px] font-semibold text-muted-token">Deal direct · no portal</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-[11px]">
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
                <span className="font-poppins text-xs font-black" style={{ color: bc }}>{b.discount}</span>
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
        </>
      )}
    </section>
  );
}
