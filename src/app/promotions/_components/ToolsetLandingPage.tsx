import { Suspense } from "react";
import dynamic from "next/dynamic";

import PromoThemeInitializer from "@/components/promo/PromoThemeInitializer";
import PromoBanner from "@/components/sections/promo/PromoBanner";
import PromoHero from "@/components/sections/promo/PromoHero";
import BrandsShowcase from "@/components/sections/promo/BrandsShowcase";
import FloatingGetEntriesButton from "@/components/sections/promo/FloatingGetEntriesButton";
import PromotionsAccountButton from "@/components/sections/promo/PromotionsAccountButton";

import {
  getDefaultPrizeForToolsetSlug,
  getLandingHeroImagePaths,
  type ToolsetLandingSlug,
} from "@/config/promo-landing-slugs";
import { getEffectivePromosForDisplay } from "@/utils/database/queries/promo-queries";
import { getCurrentMajorDrawServer } from "@/utils/database/queries/major-draw-server-queries";
import ExperimentService from "@/services/ab-testing/ExperimentService";
import { VariantAssignmentWrapper } from "@/components/ab-testing/VariantAssignmentWrapper";
import { getServerVariantAssignment } from "@/utils/ab-testing/get-server-variant-assignment";
import { getPromoImagePaths } from "@/utils/promo/promo-hero-images";
import type { PromoImagePaths } from "@/utils/promo/promo-hero-types";
import mongoose from "mongoose";

const PromoPackages = dynamic(() => import("@/components/sections/promo/PromoPackages"), {
  ssr: true,
});

const PrizeShowcase = dynamic(() => import("@/components/sections/promo/PrizeShowcase"), {
  ssr: true,
});

const GiveawayDetails = dynamic(() => import("@/components/sections/promo/GiveawayDetails"), {
  ssr: true,
});

const PromoFAQs = dynamic(() => import("@/components/sections/promo/PromoFAQs"), {
  ssr: true,
});

const UnlockDiscounts = dynamic(() => import("@/components/sections/promo/UnlockDiscounts"), {
  ssr: true,
});

const LatestWinnerHero = dynamic(() => import("@/components/sections/LatestWinnerHero"), {
  ssr: true,
});

const WinnerTestimoniesClientLazy = dynamic(
  () => import("@/components/sections/WinnerTestimoniesClientLazy"),
  { ssr: true }
);

interface ToolsetLandingPageProps {
  toolsetSlug: ToolsetLandingSlug;
}

export default async function ToolsetLandingPage({ toolsetSlug }: ToolsetLandingPageProps) {
  const defaultPrizeSlug = getDefaultPrizeForToolsetSlug(toolsetSlug);

  const [effectivePromos, majorDraw, activeExperiment] = await Promise.all([
    getEffectivePromosForDisplay().catch(() => []),
    getCurrentMajorDrawServer().catch(() => null),
    ExperimentService.getActiveExperimentForSlug(defaultPrizeSlug).catch(() => null),
  ]);

  const membershipPromo = effectivePromos.find((p) => p.type === "membership-packages") || null;
  const oneTimePromo = effectivePromos.find((p) => p.type === "one-time-packages") || null;

  const landingHero = getLandingHeroImagePaths(defaultPrizeSlug);
  const standardHero = getPromoImagePaths({ multiplier: membershipPromo?.multiplier ?? null });
  const heroImagePaths: PromoImagePaths = landingHero ?? standardHero;

  const experimentId = activeExperiment?._id
    ? (activeExperiment._id instanceof mongoose.Types.ObjectId
        ? activeExperiment._id.toString()
        : String(activeExperiment._id))
    : null;

  const serverAssignment = experimentId
    ? await getServerVariantAssignment(experimentId, defaultPrizeSlug).catch(() => null)
    : null;

  return (
    <>
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
        <PromoThemeInitializer slug={defaultPrizeSlug} toolsetSlug={toolsetSlug} />
        <div className="min-h-screen bg-white dark:bg-neutral-950 w-full overflow-hidden">
          <PromoBanner initialMembershipPromo={membershipPromo} initialOneTimePromo={oneTimePromo} />

          <main className="w-full overflow-hidden ">
            <div className="flex flex-col lg:min-h-0 w-full ">
              <PromoHero
                initialPromo={membershipPromo}
                initialMajorDraw={majorDraw}
                isToolsetLandingPage
              />
            </div>

            <Suspense fallback={<div className="min-h-[400px]" />}>
              <PromoPackages />
            </Suspense>

            <Suspense fallback={<div className="min-h-[600px]" />}>
              <PrizeShowcase
                slug={defaultPrizeSlug}
                toolsetMode
                toolsetSlug={toolsetSlug}
              />
            </Suspense>

            <Suspense fallback={<div className="min-h-[400px]" />}>
              <LatestWinnerHero contentWrapperClassName="w-full px-4 sm:px-0 max-w-7xl mx-auto relative z-10" />
            </Suspense>

            <Suspense fallback={<div className="min-h-[200px]" />}>
              <WinnerTestimoniesClientLazy />
            </Suspense>

            <Suspense fallback={<div className="min-h-[300px]" />}>
              <GiveawayDetails />
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
