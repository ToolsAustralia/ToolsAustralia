"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { cn } from "@/utils/cn";
import { useTilt } from "@/hooks/useTilt";
import { SectionContainer } from "@/components/ui/SectionContainer";

/** Serializable card payload — built server-side in page.tsx from the prize catalog + image manifest. */
export interface GiveawayGalleryCard {
  slug: string;
  /** Short display title, e.g. "Milwaukee × Sidchrome". */
  title: string;
  /** Toolset-brand filter key ("milwaukee" | "dewalt" | "makita" | "ryobi" | "hikoki"). */
  brandKey: string;
  /** Toolbox/storage filter key ("sidchrome" | "milwaukee" | "kincrome"). */
  storageKey: string;
  /** Toolbox display label for the card meta line, e.g. "Sidchrome". */
  storageLabel: string;
  /** Brand wordmark SVG path (public/images/brands/name/*.svg), when the brand ships one. */
  wordmarkSrc?: string;
  /** Full combo description (the catalog label). */
  description: string;
  /** e.g. "$35,000+ Value". */
  valueLabel?: string;
  /** Brand identity: accent hex + ink color readable on it (computed server-side). */
  accentHex: string;
  accentInk: string;
  /** Manifest-verified landing hero art (light variants). */
  images: { desktop: string; mobile: string };
}

interface GiveawayGalleryClientProps {
  /** ALL combo cards, INCLUDING the featured one (dropped from the grid only in the unfiltered view). */
  cards: GiveawayGalleryCard[];
  /** Slug rendered as the featured hero above — hidden from the grid when no filters are active. */
  featuredSlug?: string;
  /** Toolset-brand pills, in display order, with their accent hex for the pill dot. */
  brands: Array<{ key: string; label: string; accentHex: string }>;
  /** Toolbox/storage pills, in display order. */
  storages: Array<{ key: string; label: string }>;
}

function pillClass(active: boolean): string {
  return cn(
    "whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500",
    active
      ? "border-transparent bg-gradient-to-b from-red-500 to-red-700 text-white shadow-[0_10px_22px_-10px_rgba(238,0,0,.7)]"
      : "border-white/15 bg-white/[.06] text-gray-300 hover:border-red-500/60 hover:text-white",
  );
}

/** One showroom card — pointer tilt (motion-safe), brand glow, white art plate in a dark shell. */
function ComboCard({ card }: { card: GiveawayGalleryCard }) {
  const tiltRef = useTilt<HTMLAnchorElement>(4);
  return (
    <Link
      ref={tiltRef}
      href={`/promotions/${card.slug}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[.07] to-white/[.02] shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)] transition-[border-color,box-shadow] duration-300 will-change-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${card.accentHex}99`;
        e.currentTarget.style.boxShadow = `0 24px 60px -18px ${card.accentHex}59, 0 0 0 1px ${card.accentHex}33`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      {/* Brand hairline */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-10 h-[3px]"
        style={{ background: `linear-gradient(90deg, ${card.accentHex}, transparent 78%)` }}
      />

      {/* White art plate — the hero art is composited for light backgrounds; framing it inside
          the dark shell reads as a lit display case. Art-directed: mobile < lg, desktop ≥ lg. */}
      <div className="relative m-2.5 overflow-hidden rounded-xl bg-white">
        <div className="relative aspect-[1080/1164] w-full lg:hidden">
          <Image
            src={card.images.mobile}
            alt={card.title}
            fill
            sizes="(min-width: 640px) 50vw, 100vw"
            className="object-contain object-center transition-transform duration-500 group-hover:scale-[1.045]"
          />
        </div>
        <div className="relative hidden aspect-[2560/1044] w-full lg:block">
          <Image
            src={card.images.desktop}
            alt={card.title}
            fill
            sizes="33vw"
            className="object-contain object-center transition-transform duration-500 group-hover:scale-[1.045]"
          />
        </div>
        {card.valueLabel && (
          <span
            className="absolute right-2.5 top-2.5 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide shadow-md"
            style={{ background: card.accentHex, color: card.accentInk }}
          >
            {card.valueLabel}
          </span>
        )}
      </div>

      {/* Identity row — real brand wordmark + toolbox chip. */}
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-1">
        <div className="flex items-center justify-between gap-3">
          {card.wordmarkSrc ? (
            <span className="relative block h-6 w-32 shrink-0">
              <Image src={card.wordmarkSrc} alt={card.title} fill unoptimized className="object-contain object-left" />
            </span>
          ) : (
            <h3 className="font-sans text-lg font-extrabold uppercase leading-tight text-white">{card.title}</h3>
          )}
          <span className="shrink-0 rounded-md border border-white/15 bg-white/[.06] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-300">
            {card.storageLabel} toolbox
          </span>
        </div>
        <p className="line-clamp-2 text-[13px] leading-snug text-gray-400">{card.description}</p>
        <span
          className="mt-auto inline-flex items-center gap-1.5 pt-1.5 text-sm font-bold transition-colors"
          style={{ color: card.accentHex }}
        >
          View this combination
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

/**
 * Cinematic showroom gallery of the major-draw prize combinations (deliberately single-look dark —
 * the promotions section's editorial mood — independent of the site theme toggle). STICKY glass
 * filter dock follows the scroll on every viewport (the promotions layout is chrome-free, so `top`
 * offsets are safe). TWO independent filter dimensions — toolset brand AND toolbox brand — AND-ed
 * or used alone; tapping an active pill clears it. Cards: pointer tilt (motion-safe via useTilt),
 * brand-glow hover, white art plates framed in dark shells, real brand wordmarks. The featured
 * combo joins the grid only when a filter is active (it's already the hero above in the unfiltered
 * view). Filtering is client-side only.
 */
export default function GiveawayGalleryClient({ cards, featuredSlug, brands, storages }: GiveawayGalleryClientProps) {
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [storageFilter, setStorageFilter] = useState<string>("all");
  const unfiltered = brandFilter === "all" && storageFilter === "all";

  const visible = useMemo(
    () =>
      cards.filter(
        (c) =>
          // Featured is the hero right above — only duplicate it into the grid when filtering.
          (!unfiltered || c.slug !== featuredSlug) &&
          (brandFilter === "all" || c.brandKey === brandFilter) &&
          (storageFilter === "all" || c.storageKey === storageFilter),
      ),
    [cards, featuredSlug, unfiltered, brandFilter, storageFilter],
  );

  const clear = () => {
    setBrandFilter("all");
    setStorageFilter("all");
  };

  return (
    <SectionContainer className="pb-4 pt-6 sm:pt-8">
      {/* ── Sticky filter dock — dark glass panel that follows the scroll on all viewports ── */}
      <div className="sticky top-2 z-30 sm:top-3">
        <div className="rounded-2xl border border-white/10 bg-slate-950/85 p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-4">
          <div className="flex flex-col gap-2.5">
            {/* Toolset brand row */}
            <div className="flex items-center gap-2.5">
              <span className="inline-flex w-[86px] shrink-0 items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-500">
                <SlidersHorizontal className="h-3 w-3" /> Tools
              </span>
              <div className="-my-1 flex-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max gap-1.5">
                  <button type="button" onClick={() => setBrandFilter("all")} aria-pressed={brandFilter === "all"} className={pillClass(brandFilter === "all")}>
                    All
                  </button>
                  {brands.map(({ key, label, accentHex }) => {
                    const active = brandFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setBrandFilter(active ? "all" : key)}
                        aria-pressed={active}
                        className={cn(pillClass(active), "inline-flex items-center gap-1.5")}
                      >
                        <span aria-hidden className={cn("h-2 w-2 rounded-full", active && "ring-2 ring-white/60")} style={{ background: accentHex }} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Toolbox row */}
            <div className="flex items-center gap-2.5">
              <span className="w-[86px] shrink-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-500">Toolbox</span>
              <div className="-my-1 flex-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max items-center gap-1.5">
                  <button type="button" onClick={() => setStorageFilter("all")} aria-pressed={storageFilter === "all"} className={pillClass(storageFilter === "all")}>
                    All
                  </button>
                  {storages.map(({ key, label }) => {
                    const active = storageFilter === key;
                    return (
                      <button key={key} type="button" onClick={() => setStorageFilter(active ? "all" : key)} aria-pressed={active} className={pillClass(active)}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Count + clear live in the dock so they follow the scroll too. */}
              <span className="hidden shrink-0 items-center gap-2 text-[12px] font-semibold tabular-nums text-gray-400 sm:inline-flex">
                {visible.length} combo{visible.length === 1 ? "" : "s"}
                {!unfiltered && (
                  <button type="button" onClick={clear} className="font-bold text-red-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                    Clear
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile count + clear (the dock keeps them on sm+). */}
      <p className="mt-3 flex items-center gap-3 text-sm font-semibold tabular-nums text-gray-400 sm:hidden">
        {visible.length} combination{visible.length === 1 ? "" : "s"}
        {!unfiltered && (
          <button type="button" onClick={clear} className="font-bold text-red-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
            Clear filters
          </button>
        )}
      </p>

      {/* Gallery grid — showroom cards. */}
      {visible.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.04] py-14 text-center">
          <p className="text-sm font-semibold text-gray-400">No combination matches those filters — try clearing one.</p>
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {visible.map((card) => (
            <li key={card.slug}>
              <ComboCard card={card} />
            </li>
          ))}
        </ul>
      )}
    </SectionContainer>
  );
}
