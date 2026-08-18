"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Layers, Zap, ShieldCheck, Percent } from "lucide-react";
import MetallicButton from "@/components/ui/MetallicButton";
import AccessRing from "@/components/ui/AccessRing";
import { useUserContext } from "@/contexts/UserContext";
import { usePromoTheme, usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import { useMemberships } from "@/hooks/useMemberships";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getPackageIcon } from "@/utils/images/package-icons";
import { TIER_HEX, tierKeyFromName, glossGrad, inkOn } from "@/utils/membership/tier-visuals";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { PARTNER_CATALOG_TOTAL } from "@/generated/partnerCatalogPreview";
import { apprentice, tradie, foreman, boss, power } from "@/utils/images/package-icons";

const BENEFITS = [
  {
    icon: Layers,
    title: "Entries Accumulate Monthly",
    text: "Your entries carry over and stack each billing cycle — the longer you stay subscribed, the more entries you hold.",
  },
  {
    // Copy rule: user-facing text says "one-time packs", never the backend-only "Additional
    // Packs" term (isAdditional flag). See docs/subscription/package-terminology.md.
    icon: Zap,
    title: "Boosted One-Time Packs",
    text: "As a member, your one-time packs come with up to 2× more entries — at the same price as the standard version.",
  },
  {
    icon: Percent,
    title: "Partner Discounts & Shop Savings",
    text: "Get 5–20% off in our shop and tiered access to partner brand discounts (50%–100% of offers by plan) for as long as your membership stays active.",
  },
  {
    icon: ShieldCheck,
    title: "Set & Forget",
    text: "Your subscription auto-renews each giveaway — no need to re-purchase. Upgrade, downgrade, or cancel anytime.",
  },
];

const TIERS = [
  { src: tradie, name: "Tradie", entries: "15", price: "$20" },
  { src: foreman, name: "Foreman", entries: "40", price: "$40" },
  { src: boss, name: "Boss", entries: "100", price: "$80" },
];

const EXTRA_ICONS = [
  { src: apprentice, name: "Apprentice" },
  { src: power, name: "Power" },
];

interface PartnerBenefitsPromoSectionProps {
  /** Scroll target ID for VIEW PACKAGES CTA — "packages" (promo) or "membership" (FAQ/membership page) */
  scrollToId?: "packages" | "membership";
}

/** Cycles plotted on the mobile accumulation chart. */
const CLIMB_MONTHS = 5;

/** Deck order is left → right → apex, so Boss (the apex) renders last and sits on top. */
const DECK_ORDER = ["tradie", "foreman", "boss"] as const;

/**
 * Partner Benefits promo section — shown to guests and non-members only.
 *
 * Desktop: benefits left, tier showcase right (the original layout).
 * Mobile (design handoff, 2026-08-13): rebuilt as the "Become a member" pitch — the
 * accumulation claim proved with a real climb chart, four benefit tiles, then the
 * /membership hero's tier deck so the three subscription tiers are the closing image.
 * The old mobile surface was the desktop copy stacked, plus a five-icon strip that
 * wrongly mixed one-time packs (Apprentice, Power) into a MEMBERSHIP pitch.
 *
 * Copy note (CLAUDE.md rule 11): free entries are an INCLUSION of the membership, never
 * a purchase, and never framed as odds.
 */
export default function PartnerBenefitsPromoSection({ scrollToId = "packages" }: PartnerBenefitsPromoSectionProps) {
  const { isAuthenticated, hasActiveSubscription, loading } = useUserContext();
  const theme = usePromoTheme();
  const currentSlug = usePromoThemeStore((s) => s.slug);
  /** Light accents (Ryobi lime, DeWalt yellow) swallow white ink — see `PromoBottomDock`. */
  const accentInk =
    (theme.preferDarkBackground ?? false) || (currentSlug ?? "").startsWith("dewalt-")
      ? "#000000"
      : "#ffffff";
  const { subscriptionPackages } = useMemberships();
  const membershipMultiplier = useResolvedMultiplier("membership-packages", "display") ?? 1;

  /**
   * Tier data for the mobile deck + climb chart, keyed off the SAME source and multiplier
   * the packages section above uses — a hard-coded "40 entries" here would contradict the
   * card a screen away the moment a promo goes live (the bug MembershipHero documents).
   */
  const tiers = useMemo(
    () =>
      DECK_ORDER.map((key) => {
        const plan = subscriptionPackages.find((p) => tierKeyFromName(p.name) === key);
        if (!plan) return null;
        const base = plan.totalEntries ?? plan.entriesPerMonth ?? 0;
        return {
          key,
          name: plan.name,
          price: plan.price,
          base,
          entries: base * membershipMultiplier,
          hex: TIER_HEX[key],
          access: getPartnerCatalogAccessPercentForPlanId(`${key}-subscription`),
          icon: getPackageIcon(plan.id) ?? getPackageIcon(key),
        };
      }).filter((t): t is NonNullable<typeof t> => t !== null),
    [subscriptionPackages, membershipMultiplier]
  );

  /**
   * The climb: cycle one lands the promo-boosted grant, then every cycle after adds the
   * BASE monthly grant on top (the promo applies to the month it runs, not forever). With
   * Foreman at 40/mo and a 10× promo live that reads 400 / 440 / 480 / 520 / 560.
   */
  const climbTier = tiers.find((t) => t.key === "foreman") ?? tiers[1] ?? tiers[0] ?? null;
  const climb = useMemo(() => {
    if (!climbTier) return [];
    return Array.from({ length: CLIMB_MONTHS }, (_, i) => climbTier.entries + climbTier.base * i);
  }, [climbTier]);
  const climbTotal = climb.length > 0 ? climb[climb.length - 1] : 0;

  /** Mobile benefit tiles — every number is derived, none typed in by hand. */
  const mobileBenefits = [
    {
      stat: climbTier ? `+${climbTier.base.toLocaleString()}` : "+",
      suffix: "/mo",
      title: "Entries carry over",
      body: "Nothing ever resets",
    },
    { stat: "2×", suffix: "", title: "Boosted packs", body: "More free entries" },
    {
      stat: PARTNER_CATALOG_TOTAL.toLocaleString(),
      suffix: "",
      title: "Partner offers",
      body: "50–100% by tier",
    },
    { stat: "Auto", suffix: "", title: "Set & forget", body: "Cancel anytime" },
  ];

  const shouldShow = !loading && (!isAuthenticated || !hasActiveSubscription);

  const handleViewPackages = () => {
    const el = document.getElementById(scrollToId);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  if (!shouldShow) return null;

  return (
    /* Full-bleed on a phone (no gutter, no radius, no vertical gap) so this reads as a BAND of
       the page like How It Works, not a card sitting on it — an inset card here made the section
       look like an ad slot dropped into the scroll. From `sm` it is the inset card it was. */
    <section className="w-full px-0 py-0 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
      <div className="max-w-6xl mx-auto">
        <div className="relative overflow-hidden sm:rounded-2xl">
          {/* Background */}
          <div className="absolute inset-0 z-0">
            <Image
              src="/images/faqImage.webp"
              alt="Tools Australia workshop"
              fill
              className="object-cover"
              sizes="(max-width: 1280px) 100vw, 1152px"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/90 to-black/85 lg:via-black/88 lg:to-black/80" />
            <div
              className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full blur-[100px] opacity-15"
              style={{ background: theme.gradient }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10">
            {/* ============================ MOBILE ============================ */}
            <div className="p-4 sm:p-6 lg:hidden">
              {/* Eyebrow */}
              <div className="mb-2.5 flex items-center gap-2">
                <div className="h-0.5 w-6 rounded-full" style={{ background: theme.gradient }} />
                <span
                  className="font-sans text-2xs font-bold uppercase tracking-[0.16em]"
                  style={{ color: theme.primaryLight }}
                >
                  Become a member
                </span>
              </div>

              <h2 className="font-sans text-xl font-extrabold leading-[1.2] text-white sm:text-2xl">
                A Membership&apos;s Free Entries
                <br />
                <span style={{ color: theme.primaryLight }}>Accumulate Every Month.</span>
              </h2>

              <p className="mt-2.5 font-sans text-xs leading-relaxed text-gray-300 sm:text-sm">
                Become a{" "}
                <Link
                  href="/membership"
                  className="font-bold"
                  style={{ color: theme.primaryLight, borderBottom: `1px solid ${theme.borderRgba}` }}
                >
                  member
                </Link>{" "}
                on any tier and your free entries stack every billing cycle.
              </p>

              {/* Accumulation proof — the claim above, drawn. */}
              {climbTier && climbTotal > 0 && (
                <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/[0.35] p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-sans text-3xs font-semibold uppercase tracking-[0.11em] text-gray-400">
                      {climbTier.name} member &middot; held after {CLIMB_MONTHS} months
                    </span>
                    <span className="font-sans text-[15px] font-extrabold text-white">
                      {climbTotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-3 flex h-[58px] items-end gap-1.5" aria-hidden>
                    {climb.map((value, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm"
                        style={{
                          height: `${Math.round((value / climbTotal) * 100)}%`,
                          background:
                            i === climb.length - 1
                              ? theme.primary
                              : hexToRgbaString(theme.primary, 0.45 + i * 0.1),
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    {climb.map((value, i) => (
                      <div key={i} className="flex-1 text-center">
                        <div className="font-sans text-3xs font-bold text-white/75">
                          {value.toLocaleString()}
                        </div>
                        <div className="mt-0.5 font-mono text-3xs text-white/35">M{i + 1}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 font-sans text-3xs leading-relaxed text-gray-400">
                    {climbTier.name}: {climbTier.base.toLocaleString()} free entries a month
                    {membershipMultiplier > 1 ? `, ×${membershipMultiplier} this month` : ""}. Every cycle
                    adds to the total — nothing resets.
                  </p>
                </div>
              )}

              {/* Benefit tiles */}
              <div className="mt-3.5 grid grid-cols-2 gap-2">
                {mobileBenefits.map((b) => (
                  <div
                    key={b.title}
                    className="relative overflow-hidden rounded-[13px] border border-white/10 px-3.5 pb-3.5 pt-3.5"
                    style={{
                      background: `linear-gradient(160deg, ${hexToRgbaString(theme.primary, 0.14)}, rgba(255,255,255,0.04) 62%)`,
                    }}
                  >
                    <div className="flex items-baseline gap-0.5">
                      <span
                        className="font-sans text-2xl font-black leading-none tracking-[-0.02em]"
                        style={{ color: theme.primaryLight }}
                      >
                        {b.stat}
                      </span>
                      {b.suffix && (
                        <span
                          className="font-sans text-[11px] font-bold leading-none"
                          style={{ color: theme.primaryLight }}
                        >
                          {b.suffix}
                        </span>
                      )}
                    </div>
                    <p className="mt-2.5 font-sans text-[11.5px] font-bold leading-tight text-white">
                      {b.title}
                    </p>
                    <p className="mt-1 font-sans text-3xs leading-snug text-gray-400">{b.body}</p>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleViewPackages}
                className="mt-3.5 w-full rounded-full px-4 py-3.5 font-sans text-xs font-extrabold uppercase tracking-[0.06em]"
                style={{
                  background: theme.primary,
                  color: accentInk,
                  boxShadow: `0 0 22px ${theme.shadowRgba}`,
                }}
              >
                Become a member
              </button>
              <p className="mt-2.5 flex items-center justify-center gap-1.5 font-sans text-2xs text-gray-400">
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-400" />
                Cancel anytime — no lock-in
              </p>

              {/* Tier deck — the /membership hero's fan, sized for a phone. */}
              {tiers.length > 0 && (
                <div className="mt-[18px] border-t border-white/10 pt-4">
                  <p className="text-center font-sans text-3xs font-bold uppercase tracking-[0.16em] text-white/40">
                    Three membership tiers
                  </p>
                  <div className="relative mt-9 h-[216px] [perspective:1400px]">
                    {tiers.map((t) => {
                      const ink = inkOn(t.hex);
                      const apex = t.key === "boss";
                      const transform = apex
                        ? "translate(-50%,-50%) translateY(-8px) scale(1.05)"
                        : t.key === "tradie"
                          ? "translate(-50%,-50%) translateX(-80%) translateY(12px) rotateY(22deg) scale(.86)"
                          : "translate(-50%,-50%) translateX(80%) translateY(12px) rotateY(-22deg) scale(.86)";
                      return (
                        <div
                          key={t.key}
                          className={`absolute left-1/2 top-1/2 ${apex ? "z-[3]" : "z-[1]"}`}
                          style={{ transform }}
                        >
                          <button
                            type="button"
                            onClick={handleViewPackages}
                            aria-label={`${t.name} — $${t.price}/mo, includes ${t.entries.toLocaleString()} free entries a month and ${t.access}% partner access`}
                            className="relative block w-[132px] overflow-hidden rounded-[15px] border border-white/25 p-0 text-center"
                            style={{
                              background: glossGrad(t.hex),
                              color: ink,
                              boxShadow: apex
                                ? `0 0 0 1px ${t.hex},0 36px 74px -22px ${t.hex},0 44px 84px -30px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.55)`
                                : `0 0 0 1px ${t.hex},0 30px 60px -24px ${t.hex},0 38px 70px -30px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.45)`,
                            }}
                          >
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-x-0 top-0 h-[46%]"
                              style={{ background: "linear-gradient(180deg,rgba(255,255,255,.26),transparent)" }}
                            />
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-0 rounded-[15px]"
                              style={{
                                background:
                                  "linear-gradient(180deg,rgba(255,255,255,.22),transparent 24%,transparent 70%,rgba(0,0,0,.18))",
                              }}
                            />
                            <div className="relative flex flex-col items-center gap-[9px] px-[11px] pb-4 pt-5">
                              <span className="font-sans text-[10.5px] font-black uppercase tracking-[0.12em]">
                                {t.name}
                              </span>
                              <AccessRing
                                percent={t.access}
                                size={60}
                                stroke={6}
                                color={ink}
                                trackColor={ink === "#ffffff" ? "rgba(255,255,255,.22)" : "rgba(10,10,10,.22)"}
                              >
                                <span className="font-sans text-[13px] font-extrabold">{t.access}%</span>
                              </AccessRing>
                              <span className="-mt-1 font-sans text-[7px] font-extrabold uppercase tracking-[0.14em] opacity-90">
                                Partner access
                              </span>
                              <div className="leading-[1.25] opacity-85">
                                {t.entries !== t.base && (
                                  <span className="block font-sans text-[7.5px] font-semibold leading-none opacity-70">
                                    was <s>{t.base.toLocaleString()}</s>
                                  </span>
                                )}
                                <b className="block font-sans text-[12.5px] font-extrabold leading-tight">
                                  {t.entries.toLocaleString()}
                                </b>
                                <span className="font-sans text-[8.5px] leading-tight">free entries / mo</span>
                              </div>
                              <div className="font-sans text-base font-black">
                                ${t.price}
                                <span className="text-[8.5px] font-semibold opacity-60">/mo</span>
                              </div>
                            </div>
                          </button>

                          {/* Icon medallion straddling the card's top edge — a sibling of the
                              button because the button clips its own gloss layers. */}
                          {t.icon && (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute left-1/2 top-0 z-10 grid h-[29px] w-[29px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border"
                              style={{
                                background: glossGrad(t.hex),
                                borderColor: "rgba(255,255,255,.5)",
                                boxShadow:
                                  "0 6px 16px -4px rgba(0,0,0,.65), 0 0 0 3px rgba(10,10,10,.35), inset 0 1px 0 rgba(255,255,255,.5)",
                              }}
                            >
                              <Image
                                src={t.icon}
                                alt=""
                                width={18}
                                height={18}
                                className="h-[18px] w-[18px] object-contain"
                              />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ============================ DESKTOP ============================ */}
            <div className="hidden items-stretch lg:grid lg:grid-cols-12 lg:gap-6">

              {/* LEFT: Copy + Benefits (7/12 on desktop) */}
              <div className="lg:col-span-7 p-4 sm:p-6 lg:p-10">
                {/* Eyebrow */}
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <div className="h-0.5 w-6 rounded-full" style={{ background: theme.gradient }} />
                  <span
                    className="text-2xs sm:text-xs font-bold uppercase tracking-[0.2em] bg-clip-text text-transparent"
                    style={{
                      backgroundImage: theme.gradient,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                    }}
                  >
                    Become a member
                  </span>
                </div>

                {/* Headline */}
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold font-sans leading-[1.15] mb-1.5 sm:mb-2">
                  <span className="text-white">Your Entries Accumulate.</span>
                  <br />
                  <span
                    className="bg-clip-text text-transparent"
                    style={{
                      backgroundImage: theme.gradient,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                    }}
                  >
                    Every Month They Grow.
                  </span>
                </h2>

                {/* Sub-headline */}
                <p className="text-xs sm:text-sm lg:text-[15px] text-gray-300 font-sans leading-relaxed mb-4 sm:mb-6 max-w-lg">
                  Pick a tier — Tradie, Foreman, or Boss — and your entries
                  stack on top of last month&apos;s total every billing cycle.
                  Add promo multipliers on top and your count climbs fast.
                </p>

                {/* Benefits grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5 sm:mb-6">
                  {BENEFITS.map((b, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div
                        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
                        style={{ background: `${theme.primary}20` }}
                      >
                        <b.icon className="w-3.5 h-3.5" style={{ color: theme.primaryLight }} />
                      </div>
                      <div>
                        <p className="text-xs sm:text-[13px] font-bold text-white font-sans leading-tight mb-0.5">
                          {b.title}
                        </p>
                        <p className="text-2xs sm:text-xs text-gray-400 font-sans leading-snug">
                          {b.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CTA row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 sm:gap-4">
                  <MetallicButton onClick={handleViewPackages} variant="primary" size="sm" borderRadius="lg">
                    VIEW PACKAGES
                  </MetallicButton>
                  <span className="text-2xs text-gray-400 font-sans flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    Cancel anytime — no lock-in
                  </span>
                </div>

              </div>

              {/* RIGHT: Tier showcase (5/12 on desktop) */}
              <div className="hidden lg:flex lg:col-span-5 items-center justify-center py-8 pr-6">
                <div className="w-full max-w-[280px] space-y-3">
                  {/* Tier cards */}
                  {TIERS.map((tier, i) => {
                    const isCenter = i === 1;
                    const isBoss = i === 2;
                    return (
                      <div
                        key={tier.name}
                        className={`relative flex items-center gap-4 rounded-xl p-3 backdrop-blur-[var(--ta-blur)] transition-transform duration-[var(--ta-transition-dur)] hover:scale-[1.03] cursor-pointer ${
                          isBoss ? "bg-white/[0.08]" : "bg-white/[0.04] ring-1 ring-white/[0.06]"
                        }`}
                        style={isBoss ? { boxShadow: `inset 0 0 0 1px ${theme.primary}40` } : undefined}
                        onClick={handleViewPackages}
                      >
                        {/* Icon */}
                        <div
                          className={`relative flex-shrink-0 animate-member-benefit-float ${
                            isBoss ? "w-14 h-14" : isCenter ? "w-12 h-12" : "w-10 h-10"
                          }`}
                          style={{
                            animationDuration: `${4 + i * 0.6}s`,
                            animationDelay: `${i * 0.2}s`,
                          }}
                        >
                          <Image
                            src={tier.src}
                            alt={`${tier.name} pack`}
                            fill
                            sizes="56px"
                            className="object-contain drop-shadow-[0_4px_12px_rgba(238,0,0,0.3)]"
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white font-sans uppercase tracking-wide">
                            {tier.name}
                          </p>
                          <p className="text-2xs text-gray-400 font-sans">
                            {tier.price}/giveaway &middot; includes {tier.entries} free entries/mo
                          </p>
                        </div>

                        {/* Arrow */}
                        <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>

                        {/* Boss highlight border */}
                        {isBoss && (
                          <div
                            className="absolute inset-0 rounded-xl pointer-events-none"
                            style={{ border: `1px solid ${theme.primary}30` }}
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* One-time packs teaser */}
                  <div className="flex items-center justify-center gap-3 pt-2 mt-1 border-t border-white/[0.06]">
                    {EXTRA_ICONS.map((pkg) => (
                      <div key={pkg.name} className="flex items-center gap-1.5 opacity-60">
                        <div className="relative w-7 h-7">
                          <Image
                            src={pkg.src}
                            alt={`${pkg.name} pack`}
                            fill
                            sizes="28px"
                            className="object-contain"
                          />
                        </div>
                        <span className="text-2xs text-gray-500 font-sans font-medium uppercase">
                          {pkg.name}
                        </span>
                      </div>
                    ))}
                    <span className="text-2xs text-gray-600 dark:text-neutral-400 font-sans">
                      + one-time packs
                    </span>
                  </div>

                  {/* Accumulation visual */}
                  <div className="rounded-lg bg-white/[0.04] p-3 mt-1">
                    <p className="text-2xs text-gray-500 font-sans uppercase tracking-wider mb-2 text-center font-semibold">
                      How entries accumulate
                    </p>
                    <div className="flex items-end justify-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((month) => {
                        const height = 12 + month * 8;
                        return (
                          <div key={month} className="flex flex-col items-center gap-1">
                            <div
                              className="w-6 rounded-sm transition-all"
                              style={{
                                height,
                                background: `linear-gradient(to top, ${theme.primaryDark}, ${theme.primaryLight})`,
                                opacity: 0.3 + month * 0.14,
                              }}
                            />
                            <span className="text-3xs text-gray-600 dark:text-neutral-400 font-sans">M{month}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Border — only around the inset card. Full-bleed on a phone, a ring on all four
              sides would draw a box around a band that has no edges. */}
          <div
            className="pointer-events-none absolute inset-0 z-20 hidden sm:block sm:rounded-2xl"
            style={{ border: `1px solid ${theme.borderRgba}` }}
          />
        </div>
      </div>

    </section>
  );
}
