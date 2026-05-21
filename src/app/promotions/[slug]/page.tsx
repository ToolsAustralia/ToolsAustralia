import { notFound } from "next/navigation";
import { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";

import PromoThemeInitializer from "@/components/promo/PromoThemeInitializer";
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
import { getServerVariantAssignment } from "@/utils/ab-testing/get-server-variant-assignment";
import type { PromoImagePaths } from "@/utils/promo/promo-hero-types";
import { resolveEvergreenHeroImages } from "@/utils/promo/landing-image-resolver";
import { getLandingHeroImagePaths } from "@/config/promo-landing-slugs";

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
  const [effectivePromos, majorDraw, activeExperiment] = await Promise.all([
    getEffectivePromosForDisplay().catch(() => []), // Gracefully handle errors
    getCurrentMajorDrawServer().catch(() => null), // Gracefully handle errors
    ExperimentService.getActiveExperimentForSlug(slug).catch(() => null), // Gracefully handle errors
  ]);

  // Extract promo data for components (effective includes scheduled, toggle, and alternating)
  const membershipPromo = effectivePromos.find((p) => p.type === "membership-packages") || null;
  const oneTimePromo = effectivePromos.find((p) => p.type === "one-time-packages") || null;

  // Preload: brand folder heroes per prize slug (`landing/{brand}/…`); cash-prize uses all-prizes collage
  const landingForPrize = getLandingHeroImagePaths(prize.slug);
  const fallbackAllPrizes = resolveEvergreenHeroImages();
  const heroImagePaths: PromoImagePaths = landingForPrize
    ? { desktop: landingForPrize.desktop, mobile: landingForPrize.mobile }
    : { desktop: fallbackAllPrizes.desktop, mobile: fallbackAllPrizes.mobile };

  // Get experiment ID for variant assignment
  const experimentId = activeExperiment?._id 
    ? (activeExperiment._id instanceof mongoose.Types.ObjectId ? activeExperiment._id.toString() : String(activeExperiment._id))
    : null;

  // Attempt server-side variant assignment (optional optimization)
  // If this fails, client-side fallback will handle it
  const serverAssignment = experimentId 
    ? await getServerVariantAssignment(experimentId, slug).catch(() => null)
    : null;

  return (
    <>
      {/* Preload hero images for faster LCP - responsive with media queries */}
      <link 
        rel="preload" 
        as="image" 
        href={heroImagePaths.desktop} 
        media="(min-width: 1024px)"
        imageSizes="100vw" 
      />
      <link 
        rel="preload" 
        as="image" 
        href={heroImagePaths.mobile} 
        media="(max-width: 1023px)"
        imageSizes="100vw" 
      />

      <VariantAssignmentWrapper 
        experimentId={experimentId}
        initialVariantId={serverAssignment?.variantId}
        initialVariantConfig={serverAssignment?.variantConfig}
        initialAnonymousId={serverAssignment?.anonymousId}
      >
        <PromoThemeInitializer slug={prize.slug} />
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
      </VariantAssignmentWrapper>
    </>
  );
}
