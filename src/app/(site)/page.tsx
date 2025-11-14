import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/sections/Hero";
import MajorDrawSection from "@/components/sections/MajorDrawSection";
import MembershipSection from "@/components/sections/MembershipSection";
import ProductCategories from "@/components/features/ProductCategories";
// Temporarily disabled - no real reviews yet
// import CustomerTestimonials from "@/components/sections/CustomerTestimonials";
import HomeProducts from "./components/HomeProducts";
import HomeMiniDraws from "./components/HomeMiniDraws";
import LandingPageTrigger from "./components/LandingPageTrigger";
import FloatingCountdownBanner from "@/components/banners/FloatingCountdownBanner";

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
        url: "/Social Media Profile_Black Background.png",
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
    images: ["/Social Media Profile_Black Background.png"],
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function HomePage() {
  return (
    <div className="min-h-screen-svh bg-white w-full overflow-hidden">
      {/* Mini Draw Trigger for Landing Page */}
      <LandingPageTrigger />
      <FloatingCountdownBanner />
      <main className="w-full overflow-hidden">
        <Hero />

        <MajorDrawSection />

        {/* <GiveawaySection /> */}

        <MembershipSection />

        {/* Mini Draws Section - Client-side fetch */}
        <Suspense
          fallback={
            <section className="py-12 sm:py-16 lg:py-20 bg-white w-full overflow-hidden">
              <div className="w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto">
                <div className="text-center">
                  <div className="text-[20px] sm:text-[24px] font-bold text-black mb-2 sm:mb-3 font-['Poppins']">
                    MINI DRAWS
                  </div>
                  <div className="text-gray-500">Loading mini draws...</div>
                </div>
              </div>
            </section>
          }
        >
          <HomeMiniDraws />
        </Suspense>

        {/* Keyword-rich internal linking block to guide crawlers and users toward priority brand pages */}
        <section className="bg-slate-950 py-12 text-gray-100">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
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
          </div>
        </section>

        {/* Best Sellers Section - Client-side fetch */}
        <Suspense
          fallback={
            <section className="py-12 sm:py-16 lg:py-20 bg-white w-full overflow-hidden">
              <div className="w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto">
                <div className="text-center">
                  <div className="text-[20px] sm:text-[24px] font-bold text-black mb-2 sm:mb-3 font-['Poppins']">
                    BEST SELLERS
                  </div>
                  <div className="text-gray-500">Loading products...</div>
                </div>
              </div>
            </section>
          }
        >
          <HomeProducts sectionType="bestsellers" title="BEST SELLERS" />
        </Suspense>

        {/* New Arrivals Section - Client-side fetch */}
        <Suspense
          fallback={
            <section className="py-12 sm:py-16 lg:py-20 bg-white w-full overflow-hidden">
              <div className="w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto">
                <div className="text-center">
                  <div className="text-[20px] sm:text-[24px] font-bold text-black mb-2 sm:mb-3 font-['Poppins']">
                    NEW ARRIVALS
                  </div>
                  <div className="text-gray-500">Loading products...</div>
                </div>
              </div>
            </section>
          }
        >
          <HomeProducts sectionType="newarrivals" title="NEW ARRIVALS" />
        </Suspense>

        <ProductCategories showBackground={false} />
        {/* Customer Testimonials - Temporarily disabled (no real reviews yet) */}
        {/* <CustomerTestimonials /> */}
      </main>
    </div>
  );
}
