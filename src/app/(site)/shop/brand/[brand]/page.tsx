import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import ShopContent from "@/components/features/ShopContent";
import MembershipSection from "@/components/sections/MembershipSection";
import MetallicDivider from "@/components/ui/MetallicDivider";
import { brandLogos } from "@/data/brandLogos";
import { BreadcrumbJsonLd } from "@/components/seo/StructuredData";

const BRAND_DETAILS = {
  milwaukee: {
    name: "Milwaukee",
    headline: "Heavy-Duty Power Tools Built for Site Conditions",
    seoDescription:
      "Shop Milwaukee tools at Tools Australia. Discover cordless platforms, jobsite essentials, and rugged accessories backed by local support.",
    intro:
      "Milwaukee is the byword for durability on Australian job sites. Explore cordless M18 and M12 platforms, jobsite lighting, accessories, and storage engineered for sparkies, plumbers, and construction crews.",
    highlights: [
      "Genuine Australian stock with full manufacturer warranty support.",
      "Curated range of performance-driven power tools, hand tools, lighting, and storage.",
      "Flexible membership perks with bonus giveaway entries on every purchase.",
    ],
  },
  dewalt: {
    name: "DeWALT",
    headline: "Professional Power Tools Engineered for Productivity",
    seoDescription:
      "Explore DeWALT power tools and ToughSystem storage at Tools Australia. Genuine Australian stock and rapid delivery nationwide.",
    intro:
      "DeWALT is trusted on worksites worldwide for uncompromising performance. From 18V XR and FLEXVOLT power tools to nailers, grinders, and storage, we stock the essentials for commercial crews.",
    highlights: [
      "Official Australian stock backed by DeWALT warranties.",
      "Comprehensive range of cordless, corded, and hand tools for every trade.",
      "Tool storage and accessories that integrate with the ToughSystem platform.",
    ],
  },
  makita: {
    name: "Makita",
    headline: "Lightweight Cordless Performance for Every Trade",
    seoDescription:
      "Shop Makita power tools, outdoor equipment, and accessories with Tools Australia. LXT and XGT platforms in stock.",
    intro:
      "Makita’s LXT and XGT systems deliver lightweight, high-output cordless tools tailored for Australian tradies. Outfit your crew with drills, saws, outdoor power equipment, and specialty solutions.",
    highlights: [
      "Extensive inventory of 18V LXT and 40V XGT tools.",
      "Outdoor power equipment ready for landscaping and facilities teams.",
      "Ergonomic designs that reduce fatigue without compromising output.",
    ],
  },
  kincrome: {
    name: "Kincrome",
    headline: "Workshop Storage and Hand Tools Built to Last",
    seoDescription:
      "Kincrome tool kits, storage, and workshop gear available from Tools Australia with national support.",
    intro:
      "Kincrome delivers premium-grade hand tools, storage systems, and workshop equipment suited to Australian garages and service departments.",
    highlights: [
      "Modular storage, tool trolleys, and chest systems for organised workshops.",
      "Complete mechanic tool kits with lifetime guarantees.",
      "Specialist automotive, electrical, and aviation tools for trade professionals.",
    ],
  },
  sidchrome: {
    name: "Sidchrome",
    headline: "Workshop-Proven Hand Tools Since 1940",
    seoDescription:
      "Browse Sidchrome spanners, socket sets, and workshop kits. Premium metallurgy for serious mechanics at Tools Australia.",
    intro:
      "Sidchrome hand tools deliver strength and precision trusted by Aussie workshops for generations. Find complete socket sets, torque solutions, and storage designed for day-in, day-out reliability.",
    highlights: [
      "Lifetime warranty backed by Sidchrome for peace of mind.",
      "Mechanic-ready kits that keep your workflow organised.",
      "Member discounts and giveaway entries exclusive to Tools Australia.",
    ],
  },
  "chicago-pneumatic": {
    name: "Chicago Pneumatic",
    headline: "Industrial Air Tools That Keep Production Moving",
    seoDescription:
      "Chicago Pneumatic pneumatic tools and compressors supplied by Tools Australia for heavy-duty applications.",
    intro:
      "Chicago Pneumatic offers rugged compressors, impact wrenches, and assembly tools ready for workshops, mining operations, and manufacturing facilities across Australia.",
    highlights: [
      "Industrial-grade pneumatic tools for demanding environments.",
      "Expert advice on pairing the right compressor and air management hardware.",
      "Access to OEM spares and service through our partner network.",
    ],
  },
  gearwrench: {
    name: "GearWrench",
    headline: "Speed Meets Strength for Automotive Pros",
    seoDescription:
      "Find GearWrench ratcheting spanners, torque tools, and specialty automotive gear. Fast shipping Australia-wide.",
    intro:
      "GearWrench innovation delivers rapid turns with less fatigue. Explore ratcheting spanners, torque solutions, and specialty pullers that help automotive technicians hit their deadlines.",
    highlights: [
      "Full range of 120XP and locking flex-head designs for tight spaces.",
      "Specialty service tools that solve the jobs other kits cannot.",
      "Earn member-only rewards with every GearWrench purchase.",
    ],
  },
  "ingersoll-rand": {
    name: "Ingersoll Rand",
    headline: "Industrial Air & Power Solutions",
    seoDescription:
      "Ingersoll Rand impact wrenches, air compressors, and assembly tools stocked in Australia by Tools Australia.",
    intro:
      "Ingersoll Rand sets the benchmark for pneumatic performance. Shop legendary impact wrenches, assembly systems, and compressors tuned for industrial environments.",
    highlights: [
      "Rugged tools ready for mining, transport, and heavy industry.",
      "Professional advice on pairing the right air system with your tools.",
      "Access to genuine parts and service through our partner network.",
    ],
  },
  knipex: {
    name: "Knipex",
    headline: "Precision German Pliers and Cutters",
    seoDescription:
      "Tools Australia stocks genuine Knipex pliers, cutters, and specialist tools for electrical and industrial trades.",
    intro:
      "Knipex pliers, cutters, and crimping tools are engineered for precision work. Equip electricians, mechanics, and installers with trusted German-made tools.",
    highlights: [
      "Comprehensive range of pliers, cutters, and crimping solutions.",
      "High leverage designs that reduce strain without sacrificing control.",
      "Ideal for electrical, HVAC, plumbing, and manufacturing teams.",
    ],
  },
  koken: {
    name: "Koken",
    headline: "Japanese Socket Systems for Accuracy and Fit",
    seoDescription:
      "Discover Koken sockets, torque tools, and accessories at Tools Australia—perfect for precise assembly work.",
    intro:
      "Koken delivers precision sockets and torque tools prized by automotive and industrial technicians. Build sets that deliver consistent results shift after shift.",
    highlights: [
      "6-point and 12-point socket systems engineered for tight tolerances.",
      "Torque wrenches and accessories ready for OEM service departments.",
      "Chrome and impact lines to suit workshop and field service environments.",
    ],
  },
  mitutoyo: {
    name: "Mitutoyo",
    headline: "Measurement Accuracy Trusted Worldwide",
    seoDescription:
      "Mitutoyo measuring instruments and metrology tools available through Tools Australia for precise inspections.",
    intro:
      "Mitutoyo provides precision measuring equipment—including calipers, micrometers, and indicators—trusted in manufacturing, mining, and scientific environments.",
    highlights: [
      "Certified measuring instruments with calibration support.",
      "Digital and analog options to match every inspection workflow.",
      "Technical guidance to help teams maintain quality compliance.",
    ],
  },
  stahlwille: {
    name: "Stahlwille",
    headline: "German Torque and Aviation Tools for Specialists",
    seoDescription: "Browse Stahlwille torque wrenches, aviation tooling, and workshop solutions at Tools Australia.",
    intro:
      "Stahlwille combines German engineering with ergonomic design, delivering torque tools and aviation equipment that stand up to rigorous standards.",
    highlights: [
      "Torque wrenches with precise calibration and digital reporting options.",
      "Specialist aviation tool sets for MRO teams.",
      "Lifetime support and calibration services through Australian partners.",
    ],
  },
  "warren-brown": {
    name: "Warren & Brown",
    headline: "Precision Torque & Electrical Solutions",
    seoDescription:
      "Explore Warren & Brown torque wrenches, fibre management, and electrical tools. Trusted by technicians nation-wide.",
    intro:
      "Warren & Brown delivers precision torque, fibre optic, and electrical solutions made for Australian conditions. Equip your team with calibrated tools and cable management systems built to last.",
    highlights: [
      "Calibration-ready torque wrenches with Australian service support.",
      "Specialised fibre and electrical tooling for infrastructure teams.",
      "Member pricing and draw entries on every Warren & Brown order.",
    ],
  },
} satisfies Record<
  string,
  { name: string; headline: string; seoDescription: string; intro: string; highlights: string[] }
>;

type BrandSlug = keyof typeof BRAND_DETAILS;

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");

interface BrandPageProps {
  params: {
    brand: string;
  };
}

export async function generateStaticParams() {
  return Object.keys(BRAND_DETAILS).map((brand) => ({ brand }));
}

export async function generateMetadata({ params }: BrandPageProps): Promise<Metadata> {
  const brandKey = params.brand as BrandSlug;
  const brand = BRAND_DETAILS[brandKey];

  if (!brand) {
    return {};
  }

  const pageUrl = `${BASE_URL}/shop/brand/${brandKey}`;

  return {
    title: `${brand.name} Tools & Equipment | Tools Australia`,
    description: brand.seoDescription,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      title: `${brand.name} Tools & Equipment | Tools Australia`,
      description: brand.seoDescription,
      url: pageUrl,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${brand.name} Tools & Equipment | Tools Australia`,
      description: brand.seoDescription,
    },
  };
}

export default function BrandShopPage({ params }: BrandPageProps) {
  const brandKey = params.brand as BrandSlug;
  const brand = BRAND_DETAILS[brandKey];

  if (!brand) {
    // Not found keeps the route aligned with Next.js 404 patterns.
    notFound();
  }

  const logoDetails = brandLogos.find((logo) => logo.id === brandKey);
  const gradientClass = logoDetails?.splitGradient
    ? "bg-gradient-to-b from-green-900 from-0% via-green-800 via-50% to-gray-900 to-50%"
    : `bg-gradient-to-br ${logoDetails?.gradient ?? "from-black via-slate-900 to-black"}`;
  const pageUrl = `${BASE_URL}/shop/brand/${brandKey}`;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", item: `${BASE_URL}/` },
          { name: "Shop", item: `${BASE_URL}/shop` },
          { name: `${brand.name} Tools`, item: pageUrl },
        ]}
      />
      <div className="min-h-screen-svh bg-white">
        {/* Hero section mirrors the main shop layout for design consistency */}
        <section className={`relative pt-[86px] sm:pt-[106px] pb-12 text-white ${gradientClass}`}>
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
          <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-10 px-4 pt-8 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center justify-between gap-8 lg:flex-row">
              <div className="text-center lg:text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.5em] text-red-300">Brand Spotlight</p>
                <h1 className="mt-2 text-3xl font-bold md:text-4xl lg:text-5xl">{brand.name} at Tools Australia</h1>
                <p className="mt-4 max-w-2xl text-base text-gray-100 sm:text-lg">{brand.headline}</p>
              </div>
              {logoDetails && (
                <div className="relative h-24 w-44 sm:h-28 sm:w-52 lg:h-32 lg:w-60">
                  <Image
                    src={logoDetails.logo}
                    alt={`${brand.name} logo`}
                    fill
                    sizes="240px"
                    className="object-contain drop-shadow-2xl"
                    priority
                  />
                </div>
              )}
            </div>

            <p className="max-w-4xl text-center text-sm text-gray-100/90 lg:text-left lg:text-base">{brand.intro}</p>
          </div>
          <MetallicDivider height="h-[2px]" className="absolute bottom-0 left-0 right-0" />
        </section>

        <Suspense fallback={<div className="py-16 text-center text-gray-600">Loading {brand.name} products...</div>}>
          <ShopContent initialProducts={[]} totalProducts={0} defaultBrand={brandKey} />
        </Suspense>

        <div className="bg-gradient-to-b from-black via-slate-900 to-black">
          <MembershipSection title="Level Up Your Toolkit" padding="pt-8 pb-32" titleColor="text-white" />
        </div>
      </div>
    </>
  );
}
