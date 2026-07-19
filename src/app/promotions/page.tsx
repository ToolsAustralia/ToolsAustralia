import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image, { getImageProps } from "next/image";
import { ArrowRight, Banknote } from "lucide-react";
import { listPrizes, DEFAULT_PRIZE_SLUG, type PrizeCatalogEntry } from "@/config/prizes";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";
import { BRAND_THEMES, type BrandKey } from "@/config/brand-theme";
import { getEffectivePromosForDisplay } from "@/utils/database/queries/promo-queries";
import PromoThemeInitializer from "@/components/promo/PromoThemeInitializer";
import { VariantProvider } from "@/components/ab-testing/VariantProvider";
import PromoBanner from "@/components/sections/promo/PromoBanner";
import PromotionsAccountButton from "@/components/sections/promo/PromotionsAccountButton";
import GiveawayGalleryClient, { type GiveawayGalleryCard } from "./_components/GiveawayGalleryClient";
import GalleryCountdown from "./_components/GalleryCountdown";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au";

// Marketing route class: ISR like its [slug]/brand siblings. Without this the gallery went
// static-FOREVER and baked getEffectivePromosForDisplay() promo objects at build time —
// which PromoBanner prefers over fresh client data (review finding, 2026-07-19).
export const revalidate = 60;

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

/** Real brand wordmark SVGs (public/images/brands/name/) — brand-colored, read on both themes. */
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
    accentHex,
    images: { desktop: images.desktop, mobile: images.mobile },
  };
}

/**
 * /promotions — the giveaway combinations showroom (owner: the gallery IS the promotions root;
 * the old page here was a bare redirect to DEFAULT_PRIZE_SLUG). THEME-AWARE (light + dark, follows
 * the promotions guest theme toggle) and mounts the SAME chrome the brand landing pages use:
 * PromoThemeInitializer (so PromoBanner + account button render themed/identical to the [slug]
 * pages) + PromoBanner (the "navbar") + PromotionsAccountButton. Composition: hero (heading,
 * live draw countdown, brand wordmark strip) → featured lead combo → sticky dual-filter dock +
 * showroom grid (2-up on mobile) → gold cash band. Every card deep-links to `/promotions/<slug>`.
 * `overflow-x-clip` (not `overflow-hidden`) on the ancestors so the sticky dock actually sticks.
 */
export default async function GiveawayGalleryPage() {
  const effectivePromos = await getEffectivePromosForDisplay().catch(() => []);
  const membershipPromo = effectivePromos.find((p) => p.type === "membership-packages") || null;
  const oneTimePromo = effectivePromos.find((p) => p.type === "one-time-packages") || null;

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

  // Media-scoped preload pair for the featured hero's <picture> below (see docs/promo/gotchas.md):
  // a raw-path preload never matches the optimized `/_next/image` URL the browser actually
  // requests, so it silently preloads nothing useful. Also doubles as the <picture>'s
  // <source>/fallback <img> props — a single <picture> with viewport-scoped <source>s (not two
  // separate always-mounted `<Image>`s toggled by `lg:hidden`/`hidden lg:block`) is what actually
  // guarantees exactly one variant downloads: `display:none` does not stop an `<img>` from
  // fetching.
  const featuredPreload = featured
    ? {
        mobile: getImageProps({ src: featured.images.mobile, alt: featured.title, fill: true, sizes: "100vw", loading: "eager" }).props,
        desktop: getImageProps({ src: featured.images.desktop, alt: featured.title, fill: true, sizes: "100vw", loading: "eager" }).props,
      }
    : null;

  return (
    <div className="min-h-svh w-full overflow-x-clip bg-white dark:bg-neutral-950">
      {featuredPreload && (
        <>
          <link rel="preload" as="image" media="(max-width: 1023px)" imageSrcSet={featuredPreload.mobile.srcSet} imageSizes="100vw" />
          <link rel="preload" as="image" media="(min-width: 1024px)" imageSrcSet={featuredPreload.desktop.srcSet} imageSizes="100vw" />
        </>
      )}
      {/* Theme the promo chrome to the site default (Milwaukee/red) so PromoBanner + account button
          render exactly like they do on the [slug] pages. */}
      <PromoThemeInitializer slug={DEFAULT_PRIZE_SLUG} />

      {/* Same sticky promo strip the brand landing pages mount — gives the chrome-free promotions
          section its "navbar". Suspense-wrapped: PromoBanner reads useSearchParams. The
          VariantProvider is REQUIRED: PromoBanner reads useVariantContext(), and without a provider
          the default context is `isLoading: true` forever — the banner then stays stuck in its
          centered-logo loading skeleton and never renders the promo strip. The gallery runs no A/B
          experiment, so a resolved empty provider (isLoading=false) is correct (the [slug] pages
          get this from VariantAssignmentWrapper). */}
      <VariantProvider experimentId={null} variantId={null} variantConfig={null} isLoading={false}>
        <Suspense fallback={null}>
          {/* followOnScroll={false}: keep the banner in-flow on the gallery — it must not turn into
              the fixed scroll-follow pill (the gallery has its own sticky filter dock). */}
          <PromoBanner
            initialMembershipPromo={membershipPromo}
            initialOneTimePromo={oneTimePromo}
            followOnScroll={false}
          />
        </Suspense>
      </VariantProvider>

      <main className="w-full overflow-x-clip">
        {/* ── Hero ── theme-aware: light gradient in light mode, slate in dark. */}
        <section className="relative overflow-hidden bg-gradient-to-b from-gray-50 to-white dark:from-slate-950 dark:to-neutral-950">
          {/* Pinstripe — dark mode only (invisible on white). */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden dark:block"
            style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent 0 14px, rgba(255,255,255,0.014) 14px 28px)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[52rem] -translate-x-1/2 rounded-full opacity-20 dark:opacity-30"
            style={{ background: "radial-gradient(closest-side, #ee0000, transparent 70%)" }}
          />
          <div className="relative mx-auto w-full max-w-7xl px-4 pb-12 pt-14 text-center sm:px-6 sm:pb-16 sm:pt-20 lg:px-8">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-red-600 sm:text-xs dark:text-red-500">
              One major draw · {comboCount} ways to win it
            </p>
            <h1 className="mx-auto mt-4 max-w-4xl font-sans text-4xl font-extrabold font-[950] uppercase leading-[0.95] tracking-tight text-gray-900 sm:text-5xl lg:text-7xl dark:text-white">
              Pick your dream
              <span className="block text-transparent [-webkit-text-stroke:2px_#ee0000] sm:[-webkit-text-stroke:3px_#ee0000]">
                combination
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-gray-600 sm:text-lg dark:text-gray-300">
              Your brand. Your toolbox.{" "}
              <span className="font-bold text-gray-900 dark:text-white">$5,000 cash in every combo</span> — or skip
              the tools and take{" "}
              <span className="font-bold text-gray-900 dark:text-white">$10,000 straight to your bank</span>.
            </p>

            {/* Live draw countdown (renders nothing until the draw resolves). */}
            <GalleryCountdown />

            {/* Brand wordmark marquee — ONE scrolling row (matches the /membership brand marquee),
                bigger white cards. 4 copies so the animated half (-50%) always exceeds the viewport
                for a seamless loop even with only 5 brands. Hover pauses; masked edges. */}
            <div className="relative mt-10 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
              <div className="flex w-max items-center gap-3.5 animate-[marquee-scroll_45s_linear_infinite] hover:[animation-play-state:paused]">
                {[...brands, ...brands, ...brands, ...brands].map(({ key, label }, i) =>
                  BRAND_WORDMARK[key] ? (
                    <div
                      key={`${key}-${i}`}
                      className="flex h-[64px] flex-shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white px-7 shadow-sm sm:h-[80px] sm:px-9 dark:border-white/10"
                    >
                      <span className="relative block h-8 w-28 sm:h-10 sm:w-36">
                        <Image src={BRAND_WORDMARK[key]} alt={label} fill unoptimized className="object-contain" />
                      </span>
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Featured lead combo ── */}
        {featured && (
          <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <Link
              href={`/promotions/${featured.slug}`}
              className="group relative block overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_18px_44px_-16px_rgba(0,0,0,0.2)] transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-white/10 dark:bg-gradient-to-b dark:from-white/[.07] dark:to-white/[.02]"
              style={{ boxShadow: `0 22px 60px -22px ${featured.accentHex}4d` }}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 z-10 h-[3px]"
                style={{ background: `linear-gradient(90deg, ${featured.accentHex}, transparent 78%)` }}
              />
              <div className="relative m-2.5 overflow-hidden rounded-xl bg-white sm:m-3">
                {/* ONE <picture> — the aspect ratio itself is viewport-responsive (mobile portrait
                    1080/1164, desktop wide 2560/1044) via Tailwind breakpoint classes on this SAME
                    div, matching the two-div layout exactly; the <source>s below pick the image. */}
                <div className="relative aspect-[1080/1164] w-full lg:aspect-[2560/1044]">
                  <picture>
                    <source media="(min-width: 1024px)" srcSet={featuredPreload!.desktop.srcSet} sizes="100vw" />
                    <source media="(max-width: 1023px)" srcSet={featuredPreload!.mobile.srcSet} sizes="100vw" />
                    <img
                      {...featuredPreload!.mobile}
                      alt={featured.title}
                      className="object-contain object-center transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </picture>
                </div>
              </div>
              <div className="flex flex-col gap-2 px-4 pb-4 pt-1 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:pb-5">
                <div className="min-w-0">
                  <h2 className="font-sans text-xl font-extrabold uppercase leading-tight text-gray-900 sm:text-2xl dark:text-white">
                    {featured.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{featured.description}</p>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold"
                  style={{ color: featured.accentHex }}
                >
                  View this combination
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </section>
        )}

        {/* ── Filterable showroom ── */}
        <GiveawayGalleryClient cards={cards} featuredSlug={featured?.slug} brands={brands} storages={storages} />

        {/* ── Cash alternative — distinct gold band, closing the page ──
             Extra bottom padding clears the layout's NewsletterSection, which is absolutely
             positioned + `-translate-y-1/2` so it tucks up by half its height into the page's end. */}
        {cash && (
          <section className="mx-auto w-full max-w-7xl px-4 pb-28 pt-4 sm:px-6 sm:pb-36 lg:px-8 lg:pb-44">
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

      {/* Floating account/nav menu — the same one the brand landing pages mount (authed users only). */}
      <Suspense fallback={null}>
        <PromotionsAccountButton />
      </Suspense>
    </div>
  );
}
