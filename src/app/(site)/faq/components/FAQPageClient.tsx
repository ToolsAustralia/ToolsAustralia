"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import FAQContent from "@/components/features/FAQContent";
import MetallicDivider from "@/components/ui/MetallicDivider";
import { FaqEntry } from "@/data/faqs";

const PartnerBenefitsPromoSectionClient = dynamic(
  () => import("@/components/sections/promo/PartnerBenefitsPromoSectionClient"),
  { ssr: false }
);

interface FAQPageClientProps {
  faqs: FaqEntry[];
  categories: FaqEntry["category"][];
}

export default function FAQPageClient({ faqs, categories }: FAQPageClientProps) {
  return (
    <>
      {/* Page Header - Metallic Industrial Design */}
      <div className="relative pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] pb-8 bg-gradient-to-b from-black via-slate-900 to-black">
        {/* Background Image with Dark Overlay */}
        <div className="absolute inset-0 z-0">
          <Image src="/images/faqImage.webp" alt="Tools Australia" fill className="object-cover " priority />
          <div className="absolute inset-0  " />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="text-center lg:text-left">
              <h1 className="text-[32px] sm:text-[40px] lg:text-[48px] font-bold font-['Poppins'] mb-4">
                <span className="text-white">F</span>
                <span className="bg-gradient-to-r from-red-600 to-red-675 bg-clip-text text-transparent">A</span>
                <span className="text-white">Q</span>
              </h1>
            </div>
            <div className="text-center lg:text-right lg:max-w-md">
              <p className="text-[16px] text-gray-200">
                Find answers to common questions about shopping, payments, rewards, and partnerships
              </p>
            </div>
          </div>
        </div>

        {/* Metallic Border */}
        <MetallicDivider height="h-[2px]" className="absolute bottom-0 left-0 right-0" />
      </div>

      {/* FAQ Content */}
      <div className="bg-white">
        <FAQContent faqs={faqs} categories={categories} />
      </div>

      {/* Partner Benefits promo — reused component, scrolls to #membership */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <PartnerBenefitsPromoSectionClient scrollToId="membership" />
      </div>
    </>
  );
}
