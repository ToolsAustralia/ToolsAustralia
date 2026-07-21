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
  /** Brand wordmark SVG path (public/images/brands/name/*.svg) — brand-colored, reads on both themes. */
  wordmarkSrc?: string;
  /** Full combo description (the catalog label). */
  description: string;
  /** Brand accent hex (computed server-side) — hairline, hover glow, CTA color. */
  accentHex: string;
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
      : "border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:text-red-600 dark:border-white/15 dark:bg-white/[.06] dark:text-gray-300 dark:hover:border-red-500/60 dark:hover:text-white",
  );
}

/** One showroom card — pointer tilt (motion-safe), brand glow, white art plate, theme-aware shell. */
function ComboCard({ card }: { card: GiveawayGalleryCard }) {
  const tiltRef = useTilt<HTMLAnchorElement>(4);
  return (
    <Link
      ref={tiltRef}
      href={`/promotions/${card.slug}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-[border-color,box-shadow] duration-300 will-change-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:rounded-2xl dark:border-white/10 dark:bg-gradient-to-b dark:from-white/[.07] dark:to-white/[.02] dark:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)]"
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${card.accentHex}99`;
        e.currentTarget.style.boxShadow = `0 22px 54px -18px ${card.accentHex}59, 0 0 0 1px ${card.accentHex}33`;
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

      {/* White art plate — the hero art is composited for light backgrounds, so it stays white in
          both themes (a lit display case in dark). Art-directed: mobile < lg, desktop ≥ lg. */}
      <div className="relative m-2 overflow-hidden rounded-lg bg-white sm:m-2.5 sm:rounded-xl">
        <div className="relative aspect-[1080/1164] w-full lg:hidden">
          <Image
            src={card.images.mobile}
            alt={card.title}
            fill
            sizes="(min-width: 1024px) 33vw, 50vw"
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
      </div>

      {/* Identity + name — brand wordmark, then the prize name (always visible, truncated on mobile). */}
      <div className="flex flex-1 flex-col gap-1 px-3 pb-3 pt-1 sm:gap-1.5 sm:px-4 sm:pb-4">
        <div className="flex items-center justify-between gap-2">
          {card.wordmarkSrc ? (
            <span className="relative block h-5 w-24 shrink-0 sm:h-6 sm:w-28">
              <Image src={card.wordmarkSrc} alt={card.title} fill unoptimized className="object-contain object-left" />
            </span>
          ) : (
            <h3 className="font-sans text-base font-extrabold uppercase leading-tight text-gray-900 sm:text-lg dark:text-white">
              {card.title}
            </h3>
          )}
          <span className="hidden shrink-0 rounded-md border border-gray-200 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500 sm:inline-block dark:border-white/15 dark:bg-white/[.06] dark:text-gray-300">
            {card.storageLabel}
          </span>
        </div>
        {/* Prize name — short combo title always; full catalog label from sm. */}
        <h3 className="truncate font-sans text-[12.5px] font-bold text-gray-900 sm:hidden dark:text-white">
          {card.title}
        </h3>
        <p className="hidden text-[13px] leading-snug text-gray-600 sm:line-clamp-2 sm:block dark:text-gray-400">
          {card.description}
        </p>
        <span
          className="mt-auto inline-flex items-center gap-1 pt-1.5 text-[12px] font-bold sm:gap-1.5 sm:text-sm"
          style={{ color: card.accentHex }}
        >
          <span className="sm:hidden">View</span>
          <span className="hidden sm:inline">View this combination</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 sm:h-4 sm:w-4" />
        </span>
      </div>
    </Link>
  );
}

/**
 * Theme-aware showroom gallery of the major-draw prize combinations. STICKY glass filter dock
 * follows the scroll on every viewport — its `top` clears the PromoBanner (which goes `fixed` when
 * scrolled), and the page ancestors use `overflow-x-clip` (NOT `overflow-hidden`, which would
 * establish a scroll container and silently break `position: sticky`). TWO independent filter
 * dimensions — toolset brand AND toolbox brand — AND-ed or used alone; tapping an active pill
 * clears it. Cards: mobile 2-up (see the whole offering at a glance), pointer tilt (motion-safe),
 * brand-glow hover, white art plates, brand wordmarks. The featured combo joins the grid only when
 * a filter is active (it's already the hero above in the unfiltered view). Filtering is client-only.
 */
export default function GiveawayGalleryClient({ cards, featuredSlug, brands, storages }: GiveawayGalleryClientProps) {
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [storageFilter, setStorageFilter] = useState<string>("all");
  const unfiltered = brandFilter === "all" && storageFilter === "all";

  const visible = useMemo(
    () =>
      cards.filter(
        (c) =>
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
    <>
      {/* ── Full-width sticky filter bar — theme-aware glass. `top-0` (not top-16/20):
          on /promotions the PromoBanner is IN-FLOW (followOnScroll={false}) and there is
          NO fixed header, so nothing sits above the gallery — the bar spans edge-to-edge
          and sticks flush to the viewport top. Content stays in the max-w-7xl container. ── */}
      <div className="sticky top-0 z-30 mt-6 w-full border-b border-gray-200 bg-white/95 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.25)] backdrop-blur-[var(--ta-blur)] sm:mt-8 dark:border-white/10 dark:bg-slate-950/95 dark:shadow-[0_10px_28px_-16px_rgba(0,0,0,0.9)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2.5">
            {/* Toolset brand row */}
            <div className="flex items-center gap-2.5">
              <span className="inline-flex w-[70px] shrink-0 items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-500 sm:w-[86px] sm:tracking-[0.14em] dark:text-gray-400">
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
              <span className="w-[70px] shrink-0 text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-500 sm:w-[86px] sm:tracking-[0.14em] dark:text-gray-400">
                Toolbox
              </span>
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
              <span className="hidden shrink-0 items-center gap-2 text-[12px] font-semibold tabular-nums text-gray-500 sm:inline-flex dark:text-gray-400">
                {visible.length} combo{visible.length === 1 ? "" : "s"}
                {!unfiltered && (
                  <button type="button" onClick={clear} className="font-bold text-red-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-500">
                    Clear
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      <SectionContainer className="pb-4 pt-4 sm:pt-6">
      {/* Mobile count + clear (the bar keeps them on sm+). */}
      <p className="flex items-center gap-3 text-sm font-semibold tabular-nums text-gray-500 sm:hidden dark:text-gray-400">
        {visible.length} combination{visible.length === 1 ? "" : "s"}
        {!unfiltered && (
          <button type="button" onClick={clear} className="font-bold text-red-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-500">
            Clear filters
          </button>
        )}
      </p>

      {/* Gallery grid — 2-up on mobile (see the whole offering), 3-up on desktop. */}
      {visible.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 py-14 text-center dark:border-white/10 dark:bg-white/[.04]">
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">No combination matches those filters — try clearing one.</p>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:mt-5 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {visible.map((card) => (
            <li key={card.slug}>
              <ComboCard card={card} />
            </li>
          ))}
        </ul>
      )}
      </SectionContainer>
    </>
  );
}
