import { Metadata } from "next";
import Image from "next/image";
import MembershipSection from "@/components/sections/MembershipSection";
import FAQContent from "@/components/features/FAQContent";
import MetallicButton from "@/components/ui/MetallicButton";
import MetallicDivider from "@/components/ui/MetallicDivider";
import { FAQPageJsonLd, BreadcrumbJsonLd } from "@/components/seo/StructuredData";
import { getFaqEntries } from "@/data/faqs";
import { getNonce } from "@/utils/security/getNonce";

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
      {/* Page Header - Metallic Industrial Design */}
      <div className="relative pt-[86px] sm:pt-[106px] pb-8 bg-gradient-to-b from-black via-slate-900 to-black">
        {/* Background Image with Dark Overlay */}
        <div className="absolute inset-0 z-0">
          <Image src="/images/faqImage.png" alt="Tools Australia" fill className="object-cover " priority />
          <div className="absolute inset-0  " />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="text-center lg:text-left">
              <h1 className="text-[32px] sm:text-[40px] lg:text-[48px] font-bold font-['Poppins'] mb-4">
                <span className="text-white">F</span>
                <span className="bg-gradient-to-r from-[#ee0000] to-[#cc0000] bg-clip-text text-transparent">A</span>
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

      {/* FAQ Content - Client Component */}
      <div className="bg-white">
        <FAQContent />
      </div>

      {/* FAQ Promo Section - Metallic Industrial Design */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
        <div className="relative h-[400px] sm:h-[500px] rounded-2xl overflow-hidden">
          {/* Background Image with Dark Overlay */}
          <div className="absolute inset-0 z-0">
            <Image src="/images/faqImage.png" alt="Tools Australia" fill className="object-cover" priority />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
          </div>

          {/* Content */}
          <div className="relative z-10 h-full flex items-center">
            <div className="w-full">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-center">
                {/* Left Content - Glass-morphism Card */}
                <div className="lg:col-span-2 p-2 sm:p-8 lg:p-12">
                  <div className="backdrop-blur-md bg-black/40 rounded-xl p-4 sm:p-8 border-0 sm:border border-[#ee0000]/30 shadow-2xl shadow-[#ee0000]/20">
                    <h2 className="text-lg sm:text-xl lg:text-2xl font-bold mb-2 sm:mb-3 font-['Poppins'] uppercase tracking-wide text-white">
                      MEMBERSHIP PROMO
                    </h2>

                    <h3 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-3 sm:mb-4 font-['Poppins'] leading-tight">
                      <span className="text-white">Enjoy up to </span>
                      <span className="bg-gradient-to-r from-[#ee0000] to-[#cc0000] bg-clip-text text-transparent">
                        50%{" "}
                      </span>
                      <span className="text-white">off!</span>
                    </h3>

                    <p className="text-sm sm:text-base lg:text-lg mb-4 sm:mb-6 text-gray-200 font-['Poppins'] leading-relaxed">
                      Grab your limited-time discount and enjoy 50% off on selected products
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <MetallicButton href="/shop" variant="primary" size="md" borderRadius="lg">
                        SHOP NOW
                      </MetallicButton>
                      <MetallicButton
                        href="/promotional/giveaway"
                        variant="secondary"
                        size="md"
                        borderRadius="lg"
                        borderColor="red"
                      >
                        JOIN NOW
                      </MetallicButton>
                    </div>
                  </div>
                </div>

                {/* Right Side - Image Position (Hidden on mobile and tablet) */}
                <div className="relative h-full items-center justify-center hidden lg:flex">
                  {/* Absolutely positioned image overlapping the right portion */}
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-[500px] h-[500px] z-20">
                    <Image
                      src="/images/faqImage.png"
                      alt="Tools Australia Products"
                      fill
                      className="object-cover rounded-xl"
                      priority
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Metallic Border Glow */}
          <div className="absolute inset-0 rounded-2xl border border-[#ee0000]/30 pointer-events-none z-10"></div>
        </div>
      </div>

      {/* Membership Section */}
      <div className="bg-gradient-to-b from-black via-slate-900 to-black">
        <MembershipSection title="UNLOCK THE DETAILS" padding="pt-8 pb-32" titleColor="text-white" />
      </div>
      </div>
    </>
  );
}
