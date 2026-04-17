"use client";

import React from "react";
import Image from "next/image";
import { Check, Layers, Zap, ShieldCheck, Percent } from "lucide-react";
import MetallicButton from "@/components/ui/MetallicButton";
import { useUserContext } from "@/contexts/UserContext";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { apprentice, tradie, foreman, boss, power } from "@/utils/images/package-icons";

const BENEFITS = [
  {
    icon: Layers,
    title: "Entries Accumulate Monthly",
    text: "Your entries carry over and stack each billing cycle — the longer you stay subscribed, the more entries you hold.",
  },
  {
    icon: Zap,
    title: "Exclusive Additional Packs",
    text: "Members unlock Additional Packs with up to 2× more entries at the same price as standard one-time packs.",
  },
  {
    icon: Percent,
    title: "Partner Discounts & Shop Savings",
    text: "Get 5–20% off in our shop and tiered access to partner brand discounts (50%–100% of offers by plan) for 30 days per cycle.",
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

/**
 * Partner Benefits promo section — shown to guests and non-members only.
 * Desktop: benefits left, tier showcase right.
 * Mobile: stacked with horizontal icon strip.
 */
export default function PartnerBenefitsPromoSection({ scrollToId = "packages" }: PartnerBenefitsPromoSectionProps) {
  const { isAuthenticated, hasActiveSubscription, loading } = useUserContext();
  const theme = usePromoTheme();

  const shouldShow = !loading && (!isAuthenticated || !hasActiveSubscription);

  const handleViewPackages = () => {
    const el = document.getElementById(scrollToId);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  if (!shouldShow) return null;

  return (
    <section className="w-full px-3 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-20">
      <div className="max-w-6xl mx-auto">
        <div className="relative rounded-xl sm:rounded-2xl overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 z-0">
            <Image
              src="/images/faqImage.webp"
              alt="Tools Australia workshop"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/90 to-black/85 lg:via-black/88 lg:to-black/80" />
            <div
              className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full blur-[100px] opacity-15"
              style={{ background: theme.gradient }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-6 items-stretch">

              {/* LEFT: Copy + Benefits (7/12 on desktop) */}
              <div className="lg:col-span-7 p-4 sm:p-6 lg:p-10">
                {/* Eyebrow */}
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <div className="h-0.5 w-6 rounded-full" style={{ background: theme.gradient }} />
                  <span
                    className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] bg-clip-text text-transparent"
                    style={{
                      backgroundImage: theme.gradient,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                    }}
                  >
                    Why Subscribe
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
                        <p className="text-[11px] sm:text-xs text-gray-400 font-sans leading-snug">
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
                  <span className="text-[11px] text-gray-400 font-sans flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    Cancel anytime — no lock-in
                  </span>
                </div>

                {/* Mobile: icon strip */}
                <div className="flex lg:hidden items-center justify-center gap-4 mt-6 pt-5 border-t border-white/10">
                  {[...TIERS, ...EXTRA_ICONS.map((e) => ({ ...e, entries: undefined, price: undefined }))].map((pkg) => (
                    <div key={pkg.name} className="flex flex-col items-center gap-0.5">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 relative">
                        <Image
                          src={pkg.src}
                          alt={`${pkg.name} pack`}
                          fill
                          sizes="48px"
                          className="object-contain drop-shadow-[0_2px_6px_rgba(238,0,0,0.25)]"
                        />
                      </div>
                      <span className="text-[9px] sm:text-[10px] text-gray-500 font-sans font-medium uppercase tracking-wide">
                        {pkg.name}
                      </span>
                    </div>
                  ))}
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
                        className={`relative flex items-center gap-4 rounded-xl p-3 backdrop-blur-sm transition-transform duration-300 hover:scale-[1.03] cursor-pointer ${
                          isBoss ? "bg-white/[0.08]" : "bg-white/[0.04] ring-1 ring-white/[0.06]"
                        }`}
                        style={isBoss ? { boxShadow: `inset 0 0 0 1px ${theme.primary}40` } : undefined}
                        onClick={handleViewPackages}
                      >
                        {/* Icon */}
                        <div
                          className={`relative flex-shrink-0 ${
                            isBoss ? "w-14 h-14" : isCenter ? "w-12 h-12" : "w-10 h-10"
                          }`}
                          style={{ animation: `memberBenefitFloat ${4 + i * 0.6}s ease-in-out infinite ${i * 0.2}s` }}
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
                          <p className="text-[11px] text-gray-400 font-sans">
                            {tier.entries} entries/mo &middot; {tier.price}/giveaway
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
                        <span className="text-[10px] text-gray-500 font-sans font-medium uppercase">
                          {pkg.name}
                        </span>
                      </div>
                    ))}
                    <span className="text-[10px] text-gray-600 dark:text-neutral-400 font-sans">
                      + one-time packs
                    </span>
                  </div>

                  {/* Accumulation visual */}
                  <div className="rounded-lg bg-white/[0.04] p-3 mt-1">
                    <p className="text-[10px] text-gray-500 font-sans uppercase tracking-wider mb-2 text-center font-semibold">
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
                            <span className="text-[8px] text-gray-600 dark:text-neutral-400 font-sans">M{month}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Border */}
          <div
            className="absolute inset-0 rounded-xl sm:rounded-2xl pointer-events-none z-20"
            style={{ border: `1px solid ${theme.borderRgba}` }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes memberBenefitFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </section>
  );
}
