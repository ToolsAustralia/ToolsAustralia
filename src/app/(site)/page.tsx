import { Suspense } from "react";
import type { Metadata } from "next";
import Hero from "@/components/sections/Hero";
import PrizeShowcase from "@/components/sections/promo/PrizeShowcase";
import MembershipSection from "@/components/sections/MembershipSection";
// import ProductCategories from "@/components/features/ProductCategories"; // Temporarily hidden until the shop is live
// Temporarily disabled - no real reviews yet
// import CustomerTestimonials from "@/components/sections/CustomerTestimonials";
import HomeProducts from "./components/HomeProducts";
import HomeMiniDraws from "./components/HomeMiniDraws";
import LandingPageTrigger from "./components/LandingPageTrigger";
import FloatingCountdownBanner from "@/components/banners/FloatingCountdownBanner";
import LatestWinnerHero from "@/components/sections/LatestWinnerHero";
import WinnerTestimoniesClient from "./components/WinnerTestimoniesClient";
import { SectionContainer } from "@/components/ui";
import { LazyMount } from "@/components/ui/LazyMount";

// Marketing route class: static + ISR (no-nonce CSP — see docs/security-csp/architecture.md).
// All homepage data (winners, mini-draws, promos, user state) is client-fetched, so a 5-min
// shell revalidate is safe.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Tools Australia | Professional Tools, Mini Draws & Partner Deals",
  description:
    "Shop professional tools, join mini draws, and access exclusive partner deals across Australia. Power tools, hand tools, safety, and more.",
  openGraph: {
    title: "Tools Australia | Professional Tools, Mini Draws & Partner Deals",
    description: "Shop professional tools, join mini draws, and access exclusive partner deals across Australia.",
    type: "website",
    url: "/",
    images: [
      {
        url: "/images/Tools Australia Logo/Social Media Profile_Black Background.webp",
        width: 1200,
        height: 630,
        alt: "Tools Australia",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tools Australia | Professional Tools, Mini Draws & Partner Deals",
    description: "Shop professional tools, mini draws, and exclusive partner deals across Australia.",
    images: ["/images/Tools Australia Logo/Social Media Profile_Black Background.webp"],
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Below-fold sections benefit from `content-visibility: auto` to skip rendering work
// while offscreen. Pair with a generous `contain-intrinsic-size` to avoid scroll jumps.
const lazySectionStyle = { contentVisibility: "auto", containIntrinsicSize: "1px 800px" } as const;

const winnerTestimoniesSkeleton = (
  <section
    className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950"
    style={lazySectionStyle}
  >
    <SectionContainer>
      <div className="text-center">
        <div className="text-[20px] sm:text-[24px] font-bold text-black dark:text-white mb-2 sm:mb-3 font-poppins">
          Winner Testimonies
        </div>
        <div className="text-gray-500 dark:text-neutral-400">Loading testimonies...</div>
      </div>
    </SectionContainer>
  </section>
);

const miniDrawsSkeleton = (
  <section
    className="py-12 sm:py-16 lg:py-20 bg-white dark:bg-neutral-950 w-full overflow-hidden"
    style={lazySectionStyle}
  >
    <SectionContainer>
      <div className="text-center">
        <div className="text-[20px] sm:text-[24px] font-bold text-black dark:text-white mb-2 sm:mb-3 font-poppins">
          MINI DRAWS
        </div>
        <div className="text-gray-500 dark:text-neutral-400">Loading mini draws...</div>
      </div>
    </SectionContainer>
  </section>
);

const bestsellersSkeleton = (
  <section
    className="py-12 sm:py-16 lg:py-20 bg-white dark:bg-neutral-950 w-full overflow-hidden"
    style={lazySectionStyle}
  >
    <SectionContainer>
      <div className="text-center">
        <div className="text-[20px] sm:text-[24px] font-bold text-black dark:text-white mb-2 sm:mb-3 font-poppins">
          BEST SELLERS
        </div>
        <div className="text-gray-500 dark:text-neutral-400">Loading products...</div>
      </div>
    </SectionContainer>
  </section>
);

const newArrivalsSkeleton = (
  <section
    className="py-12 sm:py-16 lg:py-20 bg-white dark:bg-neutral-950 w-full overflow-hidden"
    style={lazySectionStyle}
  >
    <SectionContainer>
      <div className="text-center">
        <div className="text-[20px] sm:text-[24px] font-bold text-black dark:text-white mb-2 sm:mb-3 font-poppins">
          NEW ARRIVALS
        </div>
        <div className="text-gray-500 dark:text-neutral-400">Loading products...</div>
      </div>
    </SectionContainer>
  </section>
);

export default function HomePage() {
  return (
    <div className="min-h-screen-svh bg-white dark:bg-neutral-950 w-full overflow-hidden">
      {/* Mini Draw Trigger for Landing Page */}
      <LandingPageTrigger />
      <FloatingCountdownBanner />
      <main className="w-full overflow-hidden">
        <Hero />
        <SectionContainer>
          <MembershipSection padding="pt-8 pb-4" />
          <PrizeShowcase priorityHero={false} />
          {/* Latest Winner Hero Section */}
        <LatestWinnerHero className="mb-8" />
        </SectionContainer>

        {/* Winner Testimonies Section - Client-side fetch */}
        <LazyMount fallback={winnerTestimoniesSkeleton}>
          <Suspense fallback={winnerTestimoniesSkeleton}>
            <WinnerTestimoniesClient />
          </Suspense>
        </LazyMount>

        {/* Mini Draws Section - Client-side fetch */}
        <LazyMount fallback={miniDrawsSkeleton}>
          <Suspense fallback={miniDrawsSkeleton}>
            <HomeMiniDraws />
          </Suspense>
        </LazyMount>


        {/* Best Sellers Section - Client-side fetch */}
        <LazyMount fallback={bestsellersSkeleton}>
          <Suspense fallback={bestsellersSkeleton}>
            <HomeProducts sectionType="bestsellers" title="BEST SELLERS" />
          </Suspense>
        </LazyMount>

        {/* New Arrivals Section - Client-side fetch */}
        <LazyMount fallback={newArrivalsSkeleton}>
          <Suspense fallback={newArrivalsSkeleton}>
            <HomeProducts sectionType="newarrivals" title="NEW ARRIVALS" />
          </Suspense>
        </LazyMount>

        {/* Browse by Brand - Temporarily hidden until the shop is live */}
        {/* <SectionContainer>
          <ProductCategories showBackground={false} />
        </SectionContainer> */}
        {/* Customer Testimonials - Temporarily disabled (no real reviews yet) */}
        {/* <CustomerTestimonials /> */}
      </main>
    </div>
  );
}
