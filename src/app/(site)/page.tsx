import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
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

        {/* Keyword-rich internal linking block to guide crawlers and users toward priority brand pages */}
        <section className="bg-slate-950 py-12 text-gray-100" style={lazySectionStyle}>
          <SectionContainer className="flex flex-col gap-6">
            <h2 className="text-2xl font-semibold text-white md:text-3xl">Trade-Ready Brands in One Place</h2>
            <p className="text-base text-gray-300 md:text-lg">
              Tools Australia curates professional-grade gear from trusted manufacturers so you can spec a full kit in
              one stop. Explore any of our brand hubs:
            </p>
            <div className="flex flex-wrap gap-2 md:gap-3">
              {[
                { href: "/shop/brand/milwaukee", label: "Milwaukee" },
                { href: "/shop/brand/dewalt", label: "DeWALT" },
                { href: "/shop/brand/makita", label: "Makita" },
                { href: "/shop/brand/kincrome", label: "Kincrome" },
                { href: "/shop/brand/sidchrome", label: "Sidchrome" },
                { href: "/shop/brand/chicago-pneumatic", label: "Chicago Pneumatic" },
                { href: "/shop/brand/gearwrench", label: "GearWrench" },
                { href: "/shop/brand/ingersoll-rand", label: "Ingersoll Rand" },
                { href: "/shop/brand/knipex", label: "Knipex" },
                { href: "/shop/brand/koken", label: "Koken" },
                { href: "/shop/brand/mitutoyo", label: "Mitutoyo" },
                { href: "/shop/brand/stahlwille", label: "Stahlwille" },
                { href: "/shop/brand/warren-brown", label: "Warren & Brown" },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-full border border-red-500/40 bg-red-950/30 px-3 py-1 text-sm font-medium text-red-200 transition hover:border-red-400 hover:text-white"
                >
                  {label}
                </Link>
              ))}
            </div>
            <p className="text-base text-gray-300 md:text-lg">
              Pair your favourite brand gear with our{" "}
              <Link className="text-red-400 underline-offset-2 hover:text-red-300 hover:underline" href="/membership">
                membership rewards
              </Link>{" "}
              to unlock deeper discounts and bonus giveaway entries every month.
            </p>
          </SectionContainer>
        </section>

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
