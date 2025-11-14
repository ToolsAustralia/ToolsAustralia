import { Metadata } from "next";
import PartnerInteractive from "./components/PartnerInteractive";
import PartnershipFormSection from "./components/PartnershipFormSection";
import AboutToolsAustralia from "@/components/sections/AboutToolsAustralia";
// import PartnerBenefits from "./components/PartnerBenefits";
// import ExistingPartners from "@/components/sections/ExistingPartners";

// SEO Metadata for Partner Page
export const metadata: Metadata = {
  title: "Become a Partner | Tools Australia",
  description:
    "Join Australia's leading tool marketplace. Partner with Tools Australia to reach thousands of tool professionals and grow your business.",
  keywords: "partner, partnership, tools business, Australia marketplace, tool brands, business growth",
  openGraph: {
    title: "Become a Partner | Tools Australia",
    description: "Join Australia's leading tool marketplace and grow your business with us.",
    type: "website",
    url: "/partner",
  },
  twitter: {
    card: "summary_large_image",
    title: "Become a Partner | Tools Australia",
    description: "Join Australia's leading tool marketplace and grow your business with us.",
  },
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au"}/partner`,
  },
};

export default function PartnerPage() {
  return (
    <div className="min-h-screen-svh bg-white">
      <main>
        {/* Hero Section - Client Component for interactivity */}
        <PartnerInteractive />

        {/* About Tools Australia Section - Server Component */}
        <AboutToolsAustralia />

        {/* Partnership Form Section - Client Component */}
        <PartnershipFormSection />

        {/* Partner Benefits Section - Server Component */}
        {/* <PartnerBenefits /> */}

        {/* Existing Partners Section - Server Component */}
        {/* <ExistingPartners /> */}
      </main>
    </div>
  );
}
