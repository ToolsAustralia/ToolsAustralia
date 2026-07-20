import { Metadata } from "next";
import MembershipSection from "@/components/sections/MembershipSection";
import FAQPageClient from "./components/FAQPageClient";
import { FAQPageJsonLd, BreadcrumbJsonLd } from "@/components/seo/StructuredData";
import { getFaqEntries, faqCategories } from "@/data/faqs";
import { getNonce } from "@/utils/security/getNonce";

// nonce-CSP route class — must render per-request; never cache HTML with a baked nonce
// (see docs/security-csp/architecture.md "Route classes").
export const dynamic = "force-dynamic";

// SEO Metadata for FAQ Page
export const metadata: Metadata = {
  title: "Frequently Asked Questions | Tools Australia",
  description:
    "Find answers to common questions about Tools Australia. Get help with shopping, payments, rewards, partnerships, and more.",
  keywords: "FAQ, frequently asked questions, help, support, tools Australia, shopping, payments, rewards",
  openGraph: {
    title: "Frequently Asked Questions | Tools Australia",
    description:
      "Find answers to common questions about Tools Australia. Get help with shopping, payments, rewards, partnerships, and more.",
    type: "website",
    url: "/faq",
  },
  twitter: {
    card: "summary_large_image",
    title: "Frequently Asked Questions | Tools Australia",
    description:
      "Find answers to common questions about Tools Australia. Get help with shopping, payments, rewards, partnerships, and more.",
  },
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au"}/faq`,
  },
};

export default async function FAQPage() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
  const faqs = getFaqEntries();

  // Get CSP nonce from request headers (set by middleware in production)
  const nonce = await getNonce();

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", item: `${baseUrl}/` },
          { name: "Frequently Asked Questions", item: `${baseUrl}/faq` },
        ]}
        nonce={nonce}
      />
      <FAQPageJsonLd items={faqs.map((faq) => ({ question: faq.question, answer: faq.answer }))} nonce={nonce} />
      <div className="min-h-screen-svh bg-white">
        {/* Client-rendered: Header, FAQ Content, Promo Section */}
        <FAQPageClient faqs={faqs} categories={faqCategories} />

        {/* Membership Section - Slate as background layer (isolate keeps it visible; not parent of cards) */}
        <div className="relative isolate min-h-[400px]">
          <div
            className="absolute inset-0 z-0 bg-gradient-to-b from-black via-slate-900 to-black"
            aria-hidden
          />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 lg:py-12 pb-28 sm:pb-36">
            <MembershipSection
              title="UNLOCK THE DETAILS"
              padding="py-4 sm:py-8 lg:py-12 lg:pb-16 mb-8 sm:mb-16"
              titleColor="text-white"
            />
          </div>
        </div>
      </div>
    </>
  );
}
