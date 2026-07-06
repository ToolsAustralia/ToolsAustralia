import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Banknote } from "lucide-react";
import { listPrizes, DEFAULT_PRIZE_SLUG, type PrizeCatalogEntry } from "@/config/prizes";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";
import { BRAND_THEMES, type BrandKey } from "@/config/brand-theme";
import GiveawayGalleryClient, { type GiveawayGalleryCard } from "./_components/GiveawayGalleryClient";
import GalleryCountdown from "./_components/GalleryCountdown";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au";

export const metadata: Metadata = {
  title: "Giveaway Prize Combinations - Tools Australia",
  description:
    "Every prize combination in the Tools Australia major draw — Milwaukee, DeWalt, Makita, Ryobi and HiKOKI power tool kits with premium toolbox storage, or the $10,000 cash alternative. Pick your dream setup.",
  openGraph: {
    title: "Giveaway Prize Combinations - Tools Australia",
    description:
      "Browse every major-draw prize combination and pick your dream tool setup — or take the $10,000 cash alternative.",
    images: [
      {
        url: `${baseUrl}/images/background/promo/landing/all-prizes/all-prizes.webp`,
        width: 1200,
        height: 630,
        alt: "Tools Australia giveaway prize combinations",
      },
    ],
    type: "website",
    url: `${baseUrl}/promotions`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Giveaway Prize Combinations - Tools Australia",
    description:
      "Browse every major-draw prize combination and pick your dream tool setup — or take the $10,000 cash alternative.",
    images: [`${baseUrl}/images/background/promo/landing/all-prizes/all-prizes.webp`],
  },
};

const BRAND_DISPLAY: Record<string, string> = {
  milwaukee: "Milwaukee",
  dewalt: "DeWalt",
  makita: "Makita",
  ryobi: "Ryobi",
  hikoki: "HiKOKI",
};

const STORAGE_DISPLAY: Record<string, string> = {
  sidchrome: "Sidchrome",
  milwaukee: "Milwaukee",
  kincrome: "Kincrome",
};

/** Real brand wordmark SVGs (public/images/brands/name/). */
const BRAND_WORDMARK: Record<string, string> = {
  milwaukee: "/images/brands/name/milwaukeeText.svg",
  dewalt: "/images/brands/name/dewaltText.svg",
  makita: "/images/brands/name/makitaText.svg",
  ryobi: "/images/brands/name/ryobiText.svg",
  hikoki: "/images/brands/name/hikokiText.svg",
};

/** Brand accent for the gallery. Milwaukee uses the Tools Australia site red (matches the
 *  landing pages — see prize-brand-colors.ts); the rest come from BRAND_THEMES. */
function brandAccent(brand: string): string {
  if (brand === "milwaukee") return "#ee0000";
  return BRAND_THEMES[brand as BrandKey]?.primary ?? "#ee0000";
}

/** Readable ink on a brand accent (YIQ luminance — yellow/lime/cyan need dark ink). */
function inkOn(hex: string): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 150 ? "#241a02" : "#ffffff";
}

function toCard(prize: PrizeCatalogEntry): GiveawayGalleryCard | null {
  const images = getLandingHeroImagePaths(prize.slug);
  // No landing art shipped for this combo → skip rather than render a broken card.
  if (!images) return null;

  const [brand, storage] = prize.slug.split("-");
  const brandLabel = BRAND_DISPLAY[brand];
  const storageLabel = STORAGE_DISPLAY[storage];
  const accentHex = brandAccent(brand);

  return {
    slug: prize.slug,
    // Unknown slug shape (future combos) → fall back to the catalog label.
    title: brandLabel && storageLabel ? `${brandLabel} × ${storageLabel}` : prize.label,
    brandKey: brandLabel ? brand : "all",
    storageKey: storageLabel ? storage : "all",
    storageLabel: storageLabel ?? "",
    wordmarkSrc: BRAND_WORDMARK[brand],
    description: prize.label,
    valueLabel: prize.prizeValueLabel,
    accentHex,
    accentInk: inkOn(accentHex),
    images: { desktop: images.desktop, mobile: images.mobile },
  };
}

/** Sum the catalog's "$35,000+ Value" labels into a headline prize-pool figure. */
function prizePoolTotal(prizes: PrizeCatalogEntry[]): number {
  return prizes
    .filter((p) => p.slug !== "cash-prize")
    .reduce((sum, p) => {
      const digits = (p.prizeValueLabel ?? "").replace(/[^0-9]/g, "");
      return sum + (digits ? parseInt(digits, 10) : 0);
    }, 0);
}

/**
 * /promotions — the giveaway combinations showroom (owner: the gallery IS the promotions root;
 * the old page here was a bare redirect to DEFAULT_PRIZE_SLUG). Deliberately single-look dark —
 * the promotions section's cinematic mood. Composition: pinstriped hero (prize-pool stat, live
 * draw countdown, brand wordmark strip) → featured headline combo (dark billboard) → sticky
 * dual-filter dock + showroom grid → gold cash-alternative band. Every card deep-links to its
 * `/promotions/<slug>` landing page. Newsletter, footer and modal manager come from the layout.
 */
export default function GiveawayGalleryPage() {
  const prizes = listPrizes();
  const cash = prizes.find((p) => p.slug === "cash-prize");
  const featured = toCard(prizes.find((p) => p.slug === DEFAULT_PRIZE_SLUG) ?? prizes[0]);
  // ALL tool combos (incl. the featured one — the client drops it from the grid only in the
  // unfiltered view, so a filtered pair that matches ONLY the featured combo still shows it).
  const cards = prizes
    .filter((p) => p.slug !== "cash-prize")
    .map(toCard)
    .filter((c): c is GiveawayGalleryCard => c !== null);

  // Filter pills in fixed order, limited to values that actually have cards.
  const brands = (["milwaukee", "dewalt", "makita", "ryobi", "hikoki"] as const)
    .filter((b) => cards.some((c) => c.brandKey === b))
    .map((b) => ({ key: b, label: BRAND_DISPLAY[b], accentHex: brandAccent(b) }));
  const storages = (["sidchrome", "milwaukee", "kincrome"] as const)
    .filter((s) => cards.some((c) => c.storageKey === s))
    .map((s) => ({ key: s, label: STORAGE_DISPLAY[s] }));

  const comboCount = cards.length;
  const poolTotal = prizePoolTotal(prizes);

  return (
    <div className="min-h-svh w-full overflow-hidden bg-slate-950">
      <main className="w-full overflow-hidden">
        {/* ── Cinematic hero ── */}
        <section className="relative overflow-hidden">
          {/* Pinstripe + red pulse — the promotions hero vocabulary. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent 0 14px, rgba(255,255,255,0.014) 14px 28px)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[52rem] -translate-x-1/2 rounded-full opacity-30"
            style={{ background: "radial-gradient(closest-side, #ee0000, transparent 70%)" }}
          />
          <div className="relative mx-auto w-full max-w-7xl px-4 pb-12 pt-14 text-center sm:px-6 sm:pb-16 sm:pt-20 lg:px-8">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-red-500 sm:text-xs">
              One major draw · {comboCount} ways to win it
            </p>
            <h1 className="mx-auto mt-4 max-w-4xl font-sans text-4xl font-extrabold font-[950] uppercase leading-[0.95] tracking-tight text-white sm:text-5xl lg:text-7xl">
              Pick your dream
              <span className="block text-transparent [-webkit-text-stroke:2px_#ee0000] sm:[-webkit-text-stroke:3px_#ee0000]">
                combination
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-gray-300 sm:text-lg">
              Your brand. Your toolbox. <span className="font-bold text-white">$5,000 cash in every combo</span> —
              or skip the tools and take <span className="font-bold text-white">$10,000 straight to your bank</span>.
            </p>

            {/* Stat row */}
            <div className="mx-auto mt-7 flex max-w-2xl items-stretch justify-center divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[.04] py-4 backdrop-blur-sm">
              {[
                { v: `$${Math.round(poolTotal / 1000)}K+`, l: "in prize combinations" },
                { v: String(comboCount), l: "combinations, one winner" },
                { v: "$10K", l: "cash alternative" },
              ].map(({ v, l }) => (
                <div key={l} className="flex-1 px-3">
                  <div className="text-xl font-black tabular-nums text-white sm:text-2xl">{v}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 sm:text-[11px]">{l}</div>
                </div>
              ))}
            </div>

            {/* Live draw countdown (renders nothing until the draw resolves). */}
            <GalleryCountdown />

            {/* Brand wordmark strip — the five toolset brands, real SVG wordmarks. */}
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 opacity-80">
              {brands.map(({ key, label }) =>
                BRAND_WORDMARK[key] ? (
                  <span key={key} className="relative block h-5 w-24 sm:h-6 sm:w-28">
                    <Image src={BRAND_WORDMARK[key]} alt={label} fill unoptimized className="object-contain" />
                  </span>
                ) : null,
              )}
            </div>
          </div>
        </section>

        {/* ── Featured headline combo — dark billboard ── */}
        {featured && (
          <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <Link
              href={`/promotions/${featured.slug}`}
              className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[.07] to-white/[.02] shadow-[0_28px_70px_-20px_rgba(0,0,0,0.9)] transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              style={{ boxShadow: `0 28px 70px -20px rgba(0,0,0,0.9), 0 0 60px -30px ${featured.accentHex}` }}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 z-10 h-[3px]"
                style={{ background: `linear-gradient(90deg, ${featured.accentHex}, transparent 78%)` }}
              />
              <span
                className="absolute left-4 top-4 z-10 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide shadow-md"
                style={{ background: featured.accentHex, color: featured.accentInk }}
              >
                This month&apos;s headline
              </span>
              <div className="relative m-2.5 overflow-hidden rounded-xl bg-white sm:m-3">
                <div className="relative aspect-[1080/1164] w-full lg:hidden">
                  <Image
                    src={featured.images.mobile}
                    alt={featured.title}
                    fill
                    priority
                    sizes="100vw"
                    className="object-contain object-center transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="relative hidden aspect-[2560/1044] w-full lg:block">
                  <Image
                    src={featured.images.desktop}
                    alt={featured.title}
                    fill
                    priority
                    sizes="100vw"
                    className="object-contain object-center transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 px-4 pb-4 pt-1 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:pb-5">
                <div className="min-w-0">
                  <h2 className="font-sans text-xl font-extrabold uppercase leading-tight text-white sm:text-2xl">
                    {featured.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-400">{featured.description}</p>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold"
                  style={{ color: featured.accentHex }}
                >
                  {featured.valueLabel ? `${featured.valueLabel} · ` : ""}View this combination
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </section>
        )}

        {/* ── Filterable showroom ── */}
        <GiveawayGalleryClient cards={cards} featuredSlug={featured?.slug} brands={brands} storages={storages} />

        {/* ── Cash alternative — distinct gold band, closing the page ── */}
        {cash && (
          <section className="mx-auto w-full max-w-7xl px-4 pb-16 pt-4 sm:px-6 lg:px-8">
            <Link
              href="/promotions/cash-prize"
              className="group relative flex flex-col items-start gap-4 overflow-hidden rounded-2xl border border-[#e4c86a]/60 bg-gradient-to-br from-[#f9e9ad] via-[#e9c65f] to-[#d4af37] p-6 shadow-[0_24px_60px_-18px_rgba(212,175,55,0.5)] transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 sm:flex-row sm:items-center sm:justify-between sm:p-8"
            >
              <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/25 blur-2xl" />
              <div className="relative flex items-center gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#241a02]/90 text-[#f6dd8c] shadow-lg">
                  <Banknote className="h-7 w-7" />
                </span>
                <div>
                  <h2 className="font-sans text-xl font-extrabold uppercase leading-tight text-[#241a02] sm:text-2xl">
                    Rather have the cash?
                  </h2>
                  <p className="mt-1 max-w-xl text-sm font-medium text-[#241a02]/80">
                    {cash.summary || "No tools, no hassle — $10,000 straight to your bank account."}
                  </p>
                </div>
              </div>
              <span className="relative inline-flex shrink-0 items-center gap-2 rounded-full bg-[#241a02] px-5 py-3 text-sm font-extrabold text-[#f6dd8c] shadow-md transition-transform duration-300 group-hover:translate-x-1">
                {cash.prizeValueLabel ?? "$10,000 Cash"}
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
