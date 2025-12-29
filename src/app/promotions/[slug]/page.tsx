import { notFound } from "next/navigation";
import { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";

import PromoBanner from "@/components/sections/promo/PromoBanner";
import PromoHero from "@/components/sections/promo/PromoHero";
import BrandsShowcase from "@/components/sections/promo/BrandsShowcase";
import FloatingGetEntriesButton from "@/components/sections/promo/FloatingGetEntriesButton";

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

const UnlockDiscounts = dynamic(() => import("@/components/sections/promo/UnlockDiscounts"), {
  ssr: true, // Keep SSR for SEO
});

const LatestWinnerHero = dynamic(() => import("@/components/sections/LatestWinnerHero"), {
  ssr: true, // Keep SSR for SEO
});
import { getPrizeBySlug, listPrizes } from "@/config/prizes";
import { getActivePromos } from "@/utils/database/queries/promo-queries";
import { getCurrentMajorDrawServer } from "@/utils/database/queries/major-draw-server-queries";
import { createCachedQuery } from "@/utils/database/queries/server-queries";

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

/**
 * Helper function to determine hero image path based on promo multiplier
 * Used for preloading the correct hero image
 */
function getHeroImageSrc(multiplier?: number): string {
  if (!multiplier) {
    return "/images/background/promo/$20.png";
  }

  switch (multiplier) {
    case 10:
      return "/images/background/promo/x10 entries.webp";
    case 5:
      return "/images/background/promo/x5 entries.png";
    case 3:
      return "/images/background/promo/x3 entries.png";
    case 2:
      return "/images/background/promo/$20.png";
    default:
      return "/images/background/promo/$20.png";
  }
}

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

  // Fetch promo and major draw data server-side in parallel
  const [activePromos, majorDraw] = await Promise.all([
    getActivePromos().catch(() => []), // Gracefully handle errors
    getCurrentMajorDrawServer().catch(() => null), // Gracefully handle errors
  ]);

  // Extract promo data for components
  const membershipPromo = activePromos.find((p) => p.type === "membership-packages") || null;
  const oneTimePromo = activePromos.find((p) => p.type === "one-time-packages") || null;

  // Determine hero image for preloading
  const heroImageSrc = getHeroImageSrc(membershipPromo?.multiplier);

  return (
    <>
      {/* Preload hero image for faster LCP */}
      <link rel="preload" as="image" href={heroImageSrc} imageSizes="100vw" />

      <div className="min-h-screen bg-white w-full overflow-hidden scroll-smooth">
        <PromoBanner initialMembershipPromo={membershipPromo} initialOneTimePromo={oneTimePromo} />

        <main className="w-full overflow-hidden ">
          {/* Ensure hero + brands share the first mobile viewport for better context */}
          <div className="flex flex-col  lg:min-h-0 w-full ">
            <PromoHero initialPromo={membershipPromo} initialMajorDraw={majorDraw} />
            <BrandsShowcase />
          </div>

          {/* Lazy load below-fold components */}
          <Suspense fallback={<div className="min-h-[400px]" />}>
            <PromoPackages />
          </Suspense>

          <Suspense fallback={<div className="min-h-[600px]" />}>
            <PrizeShowcase slug={prize.slug} />
          </Suspense>

          <Suspense fallback={<div className="min-h-[400px]" />}>
            <LatestWinnerHero />
          </Suspense>

          <Suspense fallback={<div className="min-h-[300px]" />}>
            <GiveawayDetails />
          </Suspense>

          <Suspense fallback={<div className="min-h-[400px]" />}>
            <PromoFAQs />
          </Suspense>

          <Suspense fallback={<div className="min-h-[300px]" />}>
            <UnlockDiscounts />
          </Suspense>
        </main>

        <FloatingGetEntriesButton />
      </div>
    </>
  );
}
