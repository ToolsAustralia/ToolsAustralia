import type { Metadata } from "next";
import { listPrizes } from "@/config/prizes";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";
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

/** Build the serializable gallery cards from the prize catalog + manifest-verified landing art. */
function buildCards(): GiveawayGalleryCard[] {
  return listPrizes().flatMap((prize): GiveawayGalleryCard[] => {
    const images = getLandingHeroImagePaths(prize.slug);
    // No landing art shipped for this combo → skip rather than render a broken card.
    if (!images) return [];

    if (prize.slug === "cash-prize") {
      return [
        {
          slug: prize.slug,
          title: "The Cash Alternative",
          brandKey: "cash",
          description: prize.summary || prize.label,
          valueLabel: prize.prizeValueLabel,
          images: { desktop: images.desktop, mobile: images.mobile },
        },
      ];
    }

    const [brand, storage] = prize.slug.split("-");
    const brandLabel = BRAND_DISPLAY[brand];
    const storageLabel = STORAGE_DISPLAY[storage];
    // Unknown slug shape (future combos) → still render, falling back to the catalog label.
    const title = brandLabel && storageLabel ? `${brandLabel} × ${storageLabel}` : prize.label;

    return [
      {
        slug: prize.slug,
        title,
        brandKey: brandLabel ? brand : "all",
        description: prize.label,
        valueLabel: prize.prizeValueLabel,
        images: { desktop: images.desktop, mobile: images.mobile },
      },
    ];
  });
}

/**
 * /promotions/giveaway — the giveaway combinations gallery. A clickable index of every
 * major-draw prize combination (5 brands × 3 toolbox stacks + the cash alternative), each
 * card using the combination's own landing hero art (mobile + desktop variants) and
 * deep-linking to its `/promotions/<slug>` landing page. Newsletter, footer, theme toggle
 * and the modal manager come from the promotions layout.
 */
export default function GiveawayGalleryPage() {
  const cards = buildCards();

  return (
    <div className="min-h-svh w-full overflow-hidden bg-white dark:bg-neutral-950">
      <main className="w-full overflow-hidden">
        {/* Hero band — dark slate gradient, matching the promotions section bands. */}
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full opacity-25"
            style={{ background: "radial-gradient(closest-side, #ee0000, transparent 70%)" }}
          />
          <div className="relative mx-auto w-full max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
            <div
              className="mx-auto mb-4 h-1 w-24 rounded-full"
              style={{ background: "linear-gradient(90deg,#ee0000,#b91c1c)" }}
            />
            <h1 className="font-sans text-3xl font-extrabold uppercase leading-[1.08] text-white sm:text-4xl lg:text-5xl">
              Pick your dream <span className="text-red-500">combination</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-gray-300 sm:text-lg">
              Every prize combination in the major draw — your favourite power-tool brand paired with premium
              toolbox storage, plus $5,000 cash. Or skip the tools and take{" "}
              <span className="font-bold text-white">$10,000 straight to your bank</span>.
            </p>
          </div>
        </section>

        <GiveawayGalleryClient cards={cards} />
      </main>
    </div>
  );
}
