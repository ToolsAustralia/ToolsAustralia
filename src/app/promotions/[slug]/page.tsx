import { notFound } from "next/navigation";
import { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { getImageProps } from "next/image";

import PromoThemeInitializer from "@/components/promo/PromoThemeInitializer";
import PromoViewTracking from "@/app/promotions/_components/PromoViewTracking";
import PromoBanner from "@/components/sections/promo/PromoBanner";
import PromoHero from "@/components/sections/promo/PromoHero";
import BrandsShowcase from "@/components/sections/promo/BrandsShowcase";
import FloatingGetEntriesButton from "@/components/sections/promo/FloatingGetEntriesButton";
import PromotionsAccountButton from "@/components/sections/promo/PromotionsAccountButton";
import PromoTrustBar from "@/components/sections/promo/PromoTrustBar";

// Lazy load below-fold components for better performance
const PromoPackages = dynamic(() => import("@/components/sections/promo/PromoPackages"), {
  ssr: true, // Keep SSR for SEO
});

const PrizeShowcase = dynamic(() => import("@/components/sections/promo/PrizeShowcase"), {
  ssr: true, // Keep SSR for SEO
});

const GiveawayDetails = dynamic(() => import("@/components/sections/promo/GiveawayDetails"), {
  ssr: true, // Keep SSR for SEO
});

const PromoFAQs = dynamic(() => import("@/components/sections/promo/PromoFAQs"), {
  ssr: true, // Keep SSR for SEO
});

const PartnerBenefitsPromoSectionClient = dynamic(
  () => import("@/components/sections/promo/PartnerBenefitsPromoSectionClient"),
  { ssr: true }
);

const UnlockDiscounts = dynamic(() => import("@/components/sections/promo/UnlockDiscounts"), {
  ssr: true, // Keep SSR for SEO
});

const LatestWinnerHero = dynamic(() => import("@/components/sections/LatestWinnerHero"), {
  ssr: true, // Keep SSR for SEO
});

const WinnerTestimoniesClientLazy = dynamic(
  () => import("@/components/sections/WinnerTestimoniesClientLazy"),
  { ssr: true }
);
import { getPrizeBySlug, listPrizes } from "@/config/prizes";
import { getEffectivePromosForDisplay } from "@/utils/database/queries/promo-queries";
import { getCurrentMajorDrawServer } from "@/utils/database/queries/major-draw-server-queries";
import { createCachedQuery } from "@/utils/database/queries/server-queries";
import mongoose from "mongoose";
import ExperimentService from "@/services/ab-testing/ExperimentService";
import { VariantAssignmentWrapper } from "@/components/ab-testing/VariantAssignmentWrapper";
import { PromoThemeExperimentGate } from "@/components/ab-testing/PromoThemeExperimentGate";
import { PROMO_THEME_SLUG } from "@/lib/ab-testing/promo-theme-slug";
import type { PromoImagePaths } from "@/utils/promo/promo-hero-types";
import { resolveEvergreenHeroImages } from "@/utils/promo/landing-image-resolver";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";
import { getLandingHeroUrgencyFromDrawDay } from "@/utils/promo/promo-hero-images";
import { getLandingHeroVideoPaths } from "@/utils/promo/landing-video-resolver";

interface PromotionsPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;
export const revalidate = 60; // ISR: Revalidate every 60 seconds

export function generateStaticParams() {
  return listPrizes().map((prize) => ({ slug: prize.slug }));
}

// Cached prize lookup to prevent duplicate queries between generateMetadata and page component
const getCachedPrize = createCachedQuery(async (slug: string) => {
  return getPrizeBySlug(slug);
});

export async function generateMetadata({ params }: PromotionsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const prize = await getCachedPrize(slug);

  if (!prize) {
    return {
      title: "Promotion Not Found - Tools Australia",
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au";
  const prizeImage = prize.gallery?.[0]?.src || "/images/grand-draw.jpg";
  const fullImageUrl = prizeImage.startsWith("http") ? prizeImage : `${baseUrl}${prizeImage}`;

  return {
    title: `${prize.label} - Tools Australia`,
    description: prize.summary || prize.detailedDescription || `Enter to win ${prize.label}`,
    openGraph: {
      title: `${prize.label} - Tools Australia`,
      description: prize.summary || prize.detailedDescription || `Enter to win ${prize.label}`,
      images: [
        {
          url: fullImageUrl,
          width: 1200,
          height: 630,
          alt: prize.label,
        },
      ],
      type: "website",
      url: `${baseUrl}/promotions/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${prize.label} - Tools Australia`,
      description: prize.summary || prize.detailedDescription || `Enter to win ${prize.label}`,
      images: [fullImageUrl],
    },
  };
}

export default async function PromotionsPage({ params }: PromotionsPageProps) {
  const { slug } = await params;
  const prize = await getCachedPrize(slug);

  if (!prize) {
    notFound();
  }

  // Fetch effective promos (scheduled > toggle > alternating), major draw, and A/B testing experiment data server-side in parallel
  const [effectivePromos, majorDraw, activeExperiment, themeExperiment] = await Promise.all([
    getEffectivePromosForDisplay().catch(() => []), // Gracefully handle errors
    getCurrentMajorDrawServer().catch(() => null), // Gracefully handle errors
    ExperimentService.getActiveExperimentForSlug(slug).catch(() => null), // Gracefully handle errors
    ExperimentService.getActiveExperimentForSentinelSlug(PROMO_THEME_SLUG).catch(() => null), // Gracefully handle errors
  ]);

  // Extract promo data for components (effective includes scheduled, toggle, and alternating)
  const membershipPromo = effectivePromos.find((p) => p.type === "membership-packages") || null;
  const oneTimePromo = effectivePromos.find((p) => p.type === "one-time-packages") || null;

  // Sentinel default-theme experiment id, baked into this ISR snapshot — identical for
  // every visitor of the current 60s window. Derived here (ahead of the preload block
  // below) because the preload guard needs it; `experimentId` for the slug-targeted
  // experiment stays where it was, further down.
  const themeExperimentId = themeExperiment?._id
    ? themeExperiment._id instanceof mongoose.Types.ObjectId
      ? themeExperiment._id.toString()
      : String(themeExperiment._id)
    : null;

  // Preload: brand folder heroes per prize slug (`landing/{brand}/…`); cash-prize uses all-prizes collage
  const landingForPrize = getLandingHeroImagePaths(prize.slug);
  const fallbackAllPrizes = resolveEvergreenHeroImages();
  const heroImagePaths: PromoImagePaths = landingForPrize
    ? { desktop: landingForPrize.desktop, mobile: landingForPrize.mobile }
    : { desktop: fallbackAllPrizes.desktop, mobile: fallbackAllPrizes.mobile };

  // Calendar-day (AEST) tier — mirrors ToolsetLandingPage's derivation — so the video-vs-still
  // preload decision below matches what PromoHero actually resolves for this slug/tier.
  const landingDrawDayUrgency = getLandingHeroUrgencyFromDrawDay(majorDraw);

  // Video mode never paints the still (PromoHero renders the clip as the primary hero), so
  // preloading the raw image path there wastes bandwidth on an asset the browser downloads but
  // never displays. Still mode preloads the OPTIMIZED `/_next/image` URL (via getImageProps) —
  // a raw-path `<link rel="preload" as="image" href=...>` never matches the URL the browser's
  // image request actually resolves to, so it silently preloads nothing useful. See
  // docs/promo/gotchas.md and ToolsetLandingPage.tsx (same pattern).
  const heroVideo = getLandingHeroVideoPaths(prize.slug, landingDrawDayUrgency);
  // A theme experiment makes the server's light-path preload a coin flip: half of
  // visitors would download a hero they never display (the server has no theme, so
  // this preload can only ever emit the LIGHT paths). Skipping it while the test is
  // live costs both arms equally, which is the only fair option — a preload biased
  // toward one arm would read as "dark converts worse" and corrupt the experiment's
  // own result. See docs/promo/gotchas.md.
  const heroImagePreload =
    heroVideo || themeExperimentId
      ? null
      : {
          mobile: getImageProps({ src: heroImagePaths.mobile, alt: "", fill: true, sizes: "100vw" }).props,
          desktop: getImageProps({ src: heroImagePaths.desktop, alt: "", fill: true, sizes: "100vw" }).props,
        };

  // Get experiment ID for variant assignment
  const experimentId = activeExperiment?._id 
    ? (activeExperiment._id instanceof mongoose.Types.ObjectId ? activeExperiment._id.toString() : String(activeExperiment._id))
    : null;

  // A/B assignment is client-authoritative (POST /api/ab-testing/assign). The old
  // server-side read called cookies()/getServerSession — under this page's ISR the
  // dynamic-API throw was swallowed by .catch(() => null), so it could never succeed
  // here; removed 2026-07-19 for consistency with ToolsetLandingPage.

  return (
    <>
      {heroImagePreload && (
        <>
          <link
            rel="preload"
            as="image"
            media="(min-width: 1024px)"
            imageSrcSet={heroImagePreload.desktop.srcSet}
            imageSizes="100vw"
          />
          <link
            rel="preload"
            as="image"
            media="(max-width: 1023px)"
            imageSrcSet={heroImagePreload.mobile.srcSet}
            imageSizes="100vw"
          />
        </>
      )}

      <VariantAssignmentWrapper
        experimentId={experimentId}
      >
        <PromoThemeExperimentGate experimentId={themeExperimentId}>
          <PromoThemeInitializer slug={prize.slug} />
          <PromoViewTracking
            promo={{
              slug: prize.slug,
              title: prize.heroHeading || prize.label,
              prizeName: prize.label,
              prizeImageUrl: prize.gallery?.[0]?.src,
            }}
          />
          <div className="min-h-svh bg-white dark:bg-neutral-950 w-full overflow-hidden">
            <PromoBanner initialMembershipPromo={membershipPromo} initialOneTimePromo={oneTimePromo} />

            <main className="w-full overflow-hidden">
              <div className="flex flex-col lg:min-h-0 w-full">
                <PromoHero
                  initialPromo={membershipPromo}
                  initialMajorDraw={majorDraw}
                  prizeSlug={prize.slug}
                />
              </div>

              <PromoTrustBar initialMajorDraw={majorDraw} />

              <Suspense fallback={<div className="min-h-[400px]" />}>
                <PromoPackages />
              </Suspense>

              <Suspense fallback={<div className="min-h-[600px]" />}>
                <PrizeShowcase slug={prize.slug} />
              </Suspense>

              <Suspense fallback={<div className="min-h-[300px]" />}>
                <GiveawayDetails />
              </Suspense>

              <Suspense fallback={<div className="min-h-[400px]" />}>
                <LatestWinnerHero contentWrapperClassName="w-full px-4 sm:px-0 max-w-7xl mx-auto relative z-10" />
              </Suspense>

              <Suspense fallback={<div className="min-h-[200px]" />}>
                <WinnerTestimoniesClientLazy />
              </Suspense>

              <Suspense fallback={null}>
                <PartnerBenefitsPromoSectionClient />
              </Suspense>

              <Suspense fallback={<div className="min-h-[400px]" />}>
                <PromoFAQs />
              </Suspense>

              <BrandsShowcase />

              <Suspense fallback={<div className="min-h-[300px]" />}>
                <UnlockDiscounts />
              </Suspense>
            </main>

          <FloatingGetEntriesButton />
          <Suspense fallback={null}>
            <PromotionsAccountButton />
          </Suspense>
        </div>
        </PromoThemeExperimentGate>
      </VariantAssignmentWrapper>
    </>
  );
}
