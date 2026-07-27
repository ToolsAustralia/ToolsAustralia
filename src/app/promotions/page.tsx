import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { DEFAULT_PRIZE_SLUG } from "@/config/prize-summaries";
import { NTP_NUMBER } from "@/constants/legal";
import { getEffectivePromosForDisplay } from "@/utils/database/queries/promo-queries";
import PromoThemeInitializer from "@/components/promo/PromoThemeInitializer";
import { VariantProvider } from "@/components/ab-testing/VariantProvider";
import PromoBanner from "@/components/sections/promo/PromoBanner";
import PromotionsAccountButton from "@/components/sections/promo/PromotionsAccountButton";
import PrizeGallerySpotlight from "./_components/PrizeGallerySpotlight";

// Winner testimonies — same self-fetching, near-viewport-deferred mount the brand
// [slug] pages use (WinnerTestimoniesClientLazy → useWinnersFeed). Keeps this ISR
// page static/anonymous: the winners data is fetched CLIENT-side, never on render.
const WinnerTestimoniesClientLazy = dynamic(
  () => import("@/components/sections/WinnerTestimoniesClientLazy"),
  { ssr: true }
);

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au";

// Marketing route class: ISR like its [slug]/brand siblings. Without this the gallery went
// static-FOREVER and baked getEffectivePromosForDisplay() promo objects at build time —
// which PromoBanner prefers over fresh client data (review finding, 2026-07-19).
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Giveaway Prize Combinations - Tools Australia",
  description:
    "Every prize combination in the Tools Australia major draw — Milwaukee, DeWalt, Makita, Ryobi and HiKOKI power tool kits with premium toolbox storage, or the $10,000 cash alternative. Build the win you actually want.",
  openGraph: {
    title: "Giveaway Prize Combinations - Tools Australia",
    description:
      "Browse every major-draw prize combination and build your dream tool setup — or take the $10,000 cash alternative.",
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
      "Browse every major-draw prize combination and build your dream tool setup — or take the $10,000 cash alternative.",
    images: [`${baseUrl}/images/background/promo/landing/all-prizes/all-prizes.webp`],
  },
};

/**
 * /promotions — the "Spotlight" showroom, and the promotions ROOT (owner call; the page
 * here used to be a bare redirect to DEFAULT_PRIZE_SLUG).
 *
 * A cinematic configurator rather than a grid: one large LIVE PREVIEW beside a grouped
 * rail of every toolset × toolbox combination plus the $10,000 cash alternative,
 * with the selected toolset's accent recolouring the whole stage. Composition:
 * PromoBanner (the page's "navbar") → gallery top bar (home, live draw line, entry CTA)
 * → stage → permit fine print. Every option deep-links to its own `/promotions/<slug>`
 * prize page.
 *
 * THEME-AWARE via the `.prize-gallery` token layer in globals.css (keyed off `html.dark`,
 * driven by the promotions guest theme toggle) — CSS, not a JS theme read, so the right
 * palette paints on the first frame of a page that IS the fold.
 *
 * All brand data comes from the shared prize-selection registries, so adding a brand is
 * one record there plus its art — never an edit here.
 */
export default async function GiveawayGalleryPage() {
  const effectivePromos = await getEffectivePromosForDisplay().catch(() => []);
  const membershipPromo = effectivePromos.find((p) => p.type === "membership-packages") || null;
  const oneTimePromo = effectivePromos.find((p) => p.type === "one-time-packages") || null;

  return (
    <div className="prize-gallery min-h-svh w-full overflow-x-clip bg-[var(--pgs-page)] text-[var(--pgs-text)]">
      {/* Theme the promo chrome to the site default (Milwaukee/red) so PromoBanner + account
          button render exactly like they do on the [slug] pages. */}
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
              the fixed scroll-follow pill above a sticky preview column. */}
          <PromoBanner
            initialMembershipPromo={membershipPromo}
            initialOneTimePromo={oneTimePromo}
            followOnScroll={false}
          />
        </Suspense>
      </VariantProvider>

      <main className="w-full overflow-x-clip">
        <PrizeGallerySpotlight />

        {/* Real winners, directly below the configurator stage. Self-fetches its own
            winners feed and renders null when there are none, so it never blocks the page. */}
        <Suspense fallback={<div className="min-h-[200px]" />}>
          <WinnerTestimoniesClientLazy />
        </Suspense>

        {/* Extra bottom padding clears the layout's NewsletterSection, which is absolutely
            positioned + `-translate-y-1/2` so it tucks up by half its height into the page's end. */}
        <p className="mx-auto max-w-[640px] px-4 pb-28 pt-3 text-center text-[10px] leading-[1.6] text-[var(--pgs-sub)] sm:pb-36 lg:px-10 lg:pb-44 lg:text-[11px]">
          Government-certified draws ·{" "}
          <a
            href="https://randomdraws.com.au"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--pgs-link)] underline"
          >
            randomdraws.com.au
          </a>{" "}
          · Permit {NTP_NUMBER}.
        </p>
      </main>

      {/* Floating account/nav menu — the same one the brand landing pages mount (authed users only). */}
      <Suspense fallback={null}>
        <PromotionsAccountButton />
      </Suspense>
    </div>
  );
}
