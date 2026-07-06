"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { SectionContainer } from "@/components/ui/SectionContainer";

/** Serializable card payload — built server-side in page.tsx from the prize catalog + image manifest. */
export interface GiveawayGalleryCard {
  slug: string;
  /** Short display title, e.g. "Milwaukee × Sidchrome". */
  title: string;
  /** Brand filter key ("milwaukee" | "dewalt" | "makita" | "ryobi" | "hikoki" | "cash"). */
  brandKey: string;
  /** Full combo description (the catalog label). */
  description: string;
  /** e.g. "$35,000+ Value". */
  valueLabel?: string;
  /** Manifest-verified landing hero art (light variants). */
  images: { desktop: string; mobile: string };
}

interface GiveawayGalleryClientProps {
  cards: GiveawayGalleryCard[];
}

const BRAND_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All combinations" },
  { key: "milwaukee", label: "Milwaukee" },
  { key: "dewalt", label: "DeWalt" },
  { key: "makita", label: "Makita" },
  { key: "ryobi", label: "Ryobi" },
  { key: "hikoki", label: "HiKOKI" },
  { key: "cash", label: "Cash" },
];

/**
 * Clickable gallery of every major-draw prize combination. Each card renders the SAME
 * landing hero art the combination's `/promotions/<slug>` page uses — mobile asset under
 * `lg`, desktop asset from `lg` up (the promotions-wide 1024px art-direction split) — on a
 * white plate (the hero art is composited for light backgrounds), and deep-links to the
 * combination's landing page. Brand pills filter client-side; no data fetching.
 */
export default function GiveawayGalleryClient({ cards }: GiveawayGalleryClientProps) {
  const [filter, setFilter] = useState<string>("all");

  const visible = useMemo(
    () => (filter === "all" ? cards : cards.filter((c) => c.brandKey === filter)),
    [cards, filter],
  );

  return (
    <SectionContainer className="py-10 sm:py-14 lg:py-16">
      {/* Brand filter pills */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {BRAND_FILTERS.map(({ key, label }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={active}
                className={cn(
                  "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600",
                  active
                    ? "border-transparent bg-gradient-to-b from-red-500 to-red-700 text-white shadow-[0_10px_22px_-10px_rgba(238,0,0,.6)]"
                    : "border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:text-red-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-red-800",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-sm font-semibold text-gray-500 dark:text-neutral-400">
        {visible.length} prize combination{visible.length === 1 ? "" : "s"}
      </p>

      {/* Gallery grid */}
      <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {visible.map((card) => (
          <li key={card.slug}>
            <Link
              href={`/promotions/${card.slug}`}
              className="group flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_8px_32px_rgba(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-red-300 hover:shadow-[0_16px_40px_rgba(238,0,0,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-red-800"
            >
              {/* Image plate — hero art is composited for light backgrounds, so the plate stays
                  white in both themes. Art-directed: mobile asset < lg, desktop asset ≥ lg. */}
              <div className="relative w-full overflow-hidden bg-white">
                <div className="relative aspect-[1080/1164] w-full lg:hidden">
                  <Image
                    src={card.images.mobile}
                    alt={card.title}
                    fill
                    sizes="(min-width: 640px) 50vw, 100vw"
                    className="object-contain object-center transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </div>
                <div className="relative hidden aspect-[2560/1044] w-full lg:block">
                  <Image
                    src={card.images.desktop}
                    alt={card.title}
                    fill
                    sizes="33vw"
                    className="object-contain object-center transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </div>
                {card.valueLabel && (
                  <span className="absolute right-3 top-3 rounded-full bg-gradient-to-b from-red-500 to-red-700 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-md">
                    {card.valueLabel}
                  </span>
                )}
              </div>

              {/* Copy */}
              <div className="flex flex-1 flex-col gap-1.5 border-t border-gray-100 p-4 dark:border-neutral-800">
                <h3 className="font-sans text-lg font-extrabold uppercase leading-tight text-gray-900 dark:text-white">
                  {card.title}
                </h3>
                <p className="line-clamp-2 text-sm text-gray-600 dark:text-neutral-400">{card.description}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-bold text-red-600 dark:text-red-500">
                  View this combination
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </SectionContainer>
  );
}
