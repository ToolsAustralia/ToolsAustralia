import { Suspense } from "react";
import { Metadata } from "next";
import Image from "next/image";
import ShopContent from "@/components/features/ShopContent";
import MembershipSection from "@/components/sections/MembershipSection";
import MetallicDivider from "@/components/ui/MetallicDivider";
import { FREE_SHIPPING_THRESHOLD_LABEL } from "@/config/shop";

// nonce-CSP route class — must render per-request; never cache HTML with a baked nonce
// (see docs/security-csp/architecture.md "Route classes").
export const dynamic = "force-dynamic";

// SEO Metadata for Shop Page
//
// This used to promise DeWalt, Makita and Milwaukee power tools. We sell none of
// them — the catalogue is Tools Australia apparel, printed to order by the print
// provider (see printProviderSync, which seeds every product as category
// "Apparel", brand "Tools Australia"). Naming brands we do not stock draws in
// searches we cannot answer and lands the shopper on a page of t-shirts.
const SHOP_TITLE = "Merch Shop | Tools Australia";
const SHOP_TAGLINE =
  "Official Tools Australia gear, printed to order in your pick of colour and size.";

export const metadata: Metadata = {
  title: SHOP_TITLE,
  // The shipping threshold comes from SHOP_CONFIG rather than being typed here —
  // copy that restates a config value drifts from it, and this one is a promise.
  description: `${SHOP_TAGLINE} Free delivery on orders of ${FREE_SHIPPING_THRESHOLD_LABEL} or more, and members get their tier's discount applied at checkout.`,
  keywords:
    "Tools Australia merch, Tools Australia apparel, tradie apparel, tradie merch, print to order clothing, Australia",
  openGraph: {
    title: SHOP_TITLE,
    description: `${SHOP_TAGLINE} Free delivery on orders of ${FREE_SHIPPING_THRESHOLD_LABEL} or more.`,
    type: "website",
    url: "/shop",
  },
  twitter: {
    card: "summary_large_image",
    title: SHOP_TITLE,
    description: SHOP_TAGLINE,
  },
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au"}/shop`,
  },
};

export default function ShopPage() {
  return (
    <div className="min-h-screen-svh bg-white dark:bg-neutral-950">
      {/* Page Header - Metallic Industrial Design */}
      <div className="relative pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] pb-5 sm:pb-14 bg-gradient-to-b from-black via-slate-900 to-black overflow-hidden">
        {/* Background Image with Dark Overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/background/shopPage-bg.webp"
            alt="Tools Australia"
            fill
            className="object-cover "
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/50" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-3 sm:gap-6">
            <div className="text-center lg:text-left">
              <h1 className="text-[32px] sm:text-[40px] lg:text-[48px] font-bold font-poppins mb-0 lg:mb-4">
                <span className="text-white">S</span>
                <span className="bg-gradient-to-r from-red-600 to-red-675 bg-clip-text text-transparent">h</span>
                <span className="text-white">op</span>
              </h1>
            </div>
            <div className="text-center lg:text-right lg:max-w-md">
              <p className="text-[16px] text-gray-200">{SHOP_TAGLINE}</p>
            </div>
          </div>
        </div>

        {/* Metallic Border */}
        <MetallicDivider height="h-[2px]" className="absolute bottom-0 left-0 right-0" />
      </div>

      {/* Main Shop Content - Client Component for Interactivity */}
      {/* The fallback reserves a viewport because the membership section below it is
       * otherwise on screen while the grid streams, then gets shoved ~1500px down —
       * measured CLS 0.527 on desktop, the whole of /shop's 0.55. A viewport is the
       * right size: the section only has to clear the fold, and it starts 258px down,
       * so 100svh puts it below the fold at ANY window height while still being
       * shorter than the real grid (1539px desktop / 864px mobile) — the swap can only
       * push it further down, never back up into view. */}
      <Suspense
        fallback={
          <div className="min-h-screen-svh py-12 text-center text-gray-600 dark:text-neutral-400 bg-white dark:bg-neutral-950">
            Loading shop...
          </div>
        }
      >
        <ShopContent initialProducts={[]} totalProducts={0} />
      </Suspense>

      {/* Membership Section */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-0">
        <MembershipSection title="UPGRADE YOUR TOOL GAME" padding="pt-8 pb-32" titleColor="" />
      </div>
    </div>
  );
}
