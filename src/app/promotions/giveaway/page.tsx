import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Banknote } from "lucide-react";
import { listPrizes, DEFAULT_PRIZE_SLUG, type PrizeCatalogEntry } from "@/config/prizes";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";
import { BRAND_THEMES, type BrandKey } from "@/config/brand-theme";
import GiveawayGalleryClient, { type GiveawayGalleryCard } from "./GiveawayGalleryClient";

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
    url: `${baseUrl}/promotions/giveaway`,
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
  milwaukee: "Milwaukee Toolbox",
  kincrome: "Kincrome",
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
    description: prize.label,
    valueLabel: prize.prizeValueLabel,
    accentHex,
    accentInk: inkOn(accentHex),
    images: { desktop: images.desktop, mobile: images.mobile },
  };
}

/**
 * /promotions/giveaway — the giveaway combinations gallery. Editorial index of every major-draw
 * prize combination: featured headline combo (the default prize) → brand-filterable grid of
 * brand-accented cards (each using its landing page's own hero art) → gold cash-alternative band.
 * Every card deep-links to its `/promotions/<slug>` landing page. Newsletter, footer, theme toggle
 * and the modal manager come from the promotions layout.
 */
export default function GiveawayGalleryPage() {
  const prizes = listPrizes();
  const cash = prizes.find((p) => p.slug === "cash-prize");
  const featured = toCard(prizes.find((p) => p.slug === DEFAULT_PRIZE_SLUG) ?? prizes[0]);
  const cards = prizes
    .filter((p) => p.slug !== "cash-prize" && p.slug !== featured?.slug)
    .map(toCard)
    .filter((c): c is GiveawayGalleryCard => c !== null);

  // Filter pills in fixed brand order, limited to brands that actually have cards.
  const brands = (["milwaukee", "dewalt", "makita", "ryobi", "hikoki"] as const)
    .filter((b) => cards.some((c) => c.brandKey === b) || featured?.brandKey === b)
    .map((b) => ({ key: b, label: BRAND_DISPLAY[b], accentHex: brandAccent(b) }));

  const comboCount = cards.length + (featured ? 1 : 0);

  return (
    <div className="min-h-svh w-full overflow-hidden bg-white dark:bg-neutral-950">
      <main className="w-full overflow-hidden">
        {/* ── Hero band — dark slate, promotions vocabulary ── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full opacity-25"
            style={{ background: "radial-gradient(closest-side, #ee0000, transparent 70%)" }}
          />
          <div className="relative mx-auto w-full max-w-7xl px-4 pb-10 pt-12 text-center sm:px-6 sm:pb-14 sm:pt-16 lg:px-8">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-red-500 sm:text-xs">
              Major draw · {comboCount} prize combinations
            </p>
            <h1 className="mt-3 font-sans text-3xl font-extrabold font-[950] uppercase leading-[1.05] text-white sm:text-4xl lg:text-5xl">
              Pick your dream combination
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-gray-300 sm:text-lg">
              Your favourite power-tool brand, premium toolbox storage and{" "}
              <span className="font-bold text-white">$5,000 cash</span> — in every combination. Or skip the tools
              and take <span className="font-bold text-white">$10,000 straight to your bank</span>.
            </p>
          </div>
        </section>

        {/* ── Featured headline combo — full-width art, the obvious first click ── */}
        {featured && (
          <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <Link
              href={`/promotions/${featured.slug}`}
              className="group relative -mt-6 block overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.18)] transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-neutral-700 sm:-mt-8"
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
              <div className="relative w-full bg-white">
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
              <div className="flex flex-col gap-2 border-t border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="min-w-0">
                  <h2 className="font-sans text-xl font-extrabold uppercase leading-tight text-gray-900 dark:text-white sm:text-2xl">
                    {featured.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-neutral-400">{featured.description}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-500">
                  {featured.valueLabel ? `${featured.valueLabel} · ` : ""}View this combination
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </section>
        )}

        {/* ── Filterable gallery ── */}
        <GiveawayGalleryClient cards={cards} brands={brands} />

        {/* ── Cash alternative — distinct gold band, closing the page ── */}
        {cash && (
          <section className="mx-auto w-full max-w-7xl px-4 pb-14 pt-2 sm:px-6 lg:px-8">
            <Link
              href="/promotions/cash-prize"
              className="group relative flex flex-col items-start gap-4 overflow-hidden rounded-2xl border border-[#e4c86a]/60 bg-gradient-to-br from-[#f9e9ad] via-[#e9c65f] to-[#d4af37] p-6 shadow-[0_18px_44px_-14px_rgba(212,175,55,0.55)] transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 sm:flex-row sm:items-center sm:justify-between sm:p-8"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/25 blur-2xl"
              />
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
