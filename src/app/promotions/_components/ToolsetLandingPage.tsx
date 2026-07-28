import { Suspense } from "react";
import dynamic from "next/dynamic";
import { getImageProps } from "next/image";

import PromoThemeInitializer from "@/components/promo/PromoThemeInitializer";
import PromoBanner from "@/components/sections/promo/PromoBanner";
import PromoHero from "@/components/sections/promo/PromoHero";
import BrandsShowcase from "@/components/sections/promo/BrandsShowcase";
import FloatingGetEntriesButton from "@/components/sections/promo/FloatingGetEntriesButton";
import PromotionsAccountButton from "@/components/sections/promo/PromotionsAccountButton";
import PromoTrustBar from "@/components/sections/promo/PromoTrustBar";

import {
  getDefaultPrizeForToolsetSlug,
  getLandingHeroImagePaths,
  type ToolsetLandingSlug,
} from "@/config/promo-landing-slugs";
import { getPrizeBySlug } from "@/config/prizes";
import PromoViewTracking from "./PromoViewTracking";
import { getEffectivePromosForDisplay } from "@/utils/database/queries/promo-queries";
import { getCurrentMajorDrawServer } from "@/utils/database/queries/major-draw-server-queries";
import ExperimentService from "@/services/ab-testing/ExperimentService";
import { VariantAssignmentWrapper } from "@/components/ab-testing/VariantAssignmentWrapper";
import { PromoThemeExperimentGate } from "@/components/ab-testing/PromoThemeExperimentGate";
import { PROMO_THEME_SLUG } from "@/lib/ab-testing/promo-theme-slug";
import {
  getLandingHeroUrgencyFromDrawDay,
  getMajorDrawHeroUrgencyFromMajorDraw,
  getPromoImagePaths,
} from "@/utils/promo/promo-hero-images";
import { getLandingHeroVideoPaths } from "@/utils/promo/landing-video-resolver";
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

const PartnerBenefitsPromoSectionClient = dynamic(
  () => import("@/components/sections/promo/PartnerBenefitsPromoSectionClient"),
  { ssr: true }
);

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
  // Resolve the full prize for the Klaviyo `Viewed Giveaway` event payload —
  // template emails reference promo title / prize name / prize image directly.
  const prize = getPrizeBySlug(defaultPrizeSlug);

  const [effectivePromos, majorDraw, activeExperiment, themeExperiment] = await Promise.all([
    getEffectivePromosForDisplay().catch(() => []),
    getCurrentMajorDrawServer().catch(() => null),
    ExperimentService.getActiveExperimentForSlug(defaultPrizeSlug).catch(() => null),
    ExperimentService.getActiveExperimentForSentinelSlug(PROMO_THEME_SLUG).catch(() => null),
  ]);

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

  // Brand landing heroes swap on the AEST calendar-day tier (drawn-tomorrow / drawn-tonight);
  // the standard mar-* hero keeps its rolling-window tier for non-brand pages.
  const landingDrawDayUrgency = getLandingHeroUrgencyFromDrawDay(majorDraw);
  const standardUrgency = getMajorDrawHeroUrgencyFromMajorDraw(majorDraw);
  const landingHero = getLandingHeroImagePaths(defaultPrizeSlug, landingDrawDayUrgency);
  const standardHero = getPromoImagePaths({
    multiplier: membershipPromo?.multiplier ?? null,
    majorDrawUrgency: standardUrgency,
  });
  const heroImagePaths: PromoImagePaths = landingHero ?? standardHero;

  // Video mode never paints the still (PromoHero renders the clip as the primary hero), so
  // preloading the raw image path there wastes bandwidth on an asset the browser downloads but
  // never displays. Still mode preloads the OPTIMIZED `/_next/image` URL (via getImageProps) —
  // a raw-path `<link rel="preload" as="image" href=...>` never matches the URL the browser's
  // image request actually resolves to, so it silently preloads nothing useful.
  const heroVideo = getLandingHeroVideoPaths(defaultPrizeSlug, landingDrawDayUrgency);
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

  const experimentId = activeExperiment?._id
    ? (activeExperiment._id instanceof mongoose.Types.ObjectId
        ? activeExperiment._id.toString()
        : String(activeExperiment._id))
    : null;

  // A/B assignment is client-authoritative (POST /api/ab-testing/assign creates the
  // assignment, records the page_view event, and sets the anon-id cookie). The server-side
  // read that used to seed initial* props called cookies()/getServerSession — incompatible
  // with this page's ISR (revalidate 60). Removing it changes nothing for first-time
  // visitors (there was no assignment to read); returning assigned visitors briefly see
  // the default variant until the client assignment applies. Accepted by DJ 2026-07-19.

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

      <VariantAssignmentWrapper experimentId={experimentId}>
        <PromoThemeExperimentGate experimentId={themeExperimentId}>
          <PromoThemeInitializer slug={defaultPrizeSlug} toolsetSlug={toolsetSlug} />
          {prize && (
            <PromoViewTracking
              promo={{
                slug: prize.slug,
                title: prize.heroHeading || prize.label,
                prizeName: prize.label,
                prizeImageUrl: prize.gallery?.[0]?.src,
              }}
            />
          )}
          <div className="min-h-svh bg-white dark:bg-neutral-950 w-full overflow-hidden">
            <PromoBanner initialMembershipPromo={membershipPromo} initialOneTimePromo={oneTimePromo} />

            <main className="w-full overflow-hidden ">
              <div className="flex flex-col lg:min-h-0 w-full ">
                <PromoHero
                  initialPromo={membershipPromo}
                  initialMajorDraw={majorDraw}
                  prizeSlug={defaultPrizeSlug}
                />
              </div>

              <PromoTrustBar initialMajorDraw={majorDraw} />

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
