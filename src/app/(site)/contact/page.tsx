import { Metadata } from "next";
import Image from "next/image";
// import { LocalBusinessJsonLd } from "@/components/seo/StructuredData"; // Temporarily unused
import ContactForm from "@/components/features/ContactForm";
import MetallicDivider from "@/components/ui/MetallicDivider";
import { Facebook, Instagram, Mail } from "lucide-react";
import MembershipSection from "@/components/sections/MembershipSection";

// SEO Metadata for Contact Page
export const metadata: Metadata = {
  title: "Contact Us | Tools Australia",
  description:
    "Get in touch with Tools Australia. Contact our team for support, inquiries, or feedback. We're here to help with all your tool needs.",
  keywords: "contact, support, tools Australia, customer service, help, inquiry",
  openGraph: {
    title: "Contact Us | Tools Australia",
    description: "Get in touch with Tools Australia. Contact our team for support, inquiries, or feedback.",
    type: "website",
    url: "/contact",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Us | Tools Australia",
    description: "Get in touch with Tools Australia. Contact our team for support, inquiries, or feedback.",
  },
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au"}/contact`,
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen-svh bg-white">
      {/* Page Header - Metallic Industrial Design */}
      <div className="relative pt-[86px] sm:pt-[106px] pb-8 bg-gradient-to-b from-black via-slate-900 to-black">
        {/* Background Image with Dark Overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/background/contact-bg.png"
            alt="Tools Australia"
            fill
            className="object-cover "
            priority
          />
          <div className="absolute inset-0 " />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="text-center lg:text-left">
              <h1 className="text-[32px] sm:text-[40px] lg:text-[48px] font-bold font-['Poppins'] mb-4">
                <span className="text-white">C</span>
                <span className="bg-gradient-to-r from-[#ee0000] to-[#cc0000] bg-clip-text text-transparent">o</span>
                <span className="text-white">ntact</span>
              </h1>
            </div>
            <div className="text-center lg:text-right lg:max-w-md">
              <p className="text-[16px] text-gray-200">Any question or remarks? Just write us a message!</p>
            </div>
          </div>
        </div>

        {/* Metallic Border */}
        <MetallicDivider height="h-[2px]" className="absolute bottom-0 left-0 right-0" />
      </div>

      {/* Contact Form Section - Mobile Optimized */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-[10px] shadow-[0px_0px_60px_30px_rgba(0,0,0,0.03)] overflow-hidden relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[600px] sm:min-h-[700px] lg:min-h-[800px]">
            {/* Contact Information */}
            <div className="bg-black p-6 sm:p-8 lg:p-12 text-white relative flex flex-col">
              {/* Background Image with Dark Overlay */}
              <div className="absolute inset-0 z-0">
                <Image
                  src="/images/background/contact-bg.png"
                  alt="Tools Australia Contact"
                  fill
                  className="object-cover opacity-30"
                  priority
                />
                <div className="absolute inset-0 bg-black/60" />
              </div>

              {/* Background Pattern */}
              <div className="absolute inset-0 overflow-hidden z-10">
                <div className="absolute top-[200px] sm:top-[300px] lg:top-[464px] left-[50%] lg:left-[311px] w-[200px] sm:w-[250px] lg:w-[269px] h-[200px] sm:h-[250px] lg:h-[269px] bg-white/10 rounded-full transform -translate-x-1/2 lg:translate-x-0"></div>
                <div className="absolute top-[150px] sm:top-[250px] lg:top-[438px] left-[40%] lg:left-[283px] w-[100px] sm:w-[120px] lg:w-[138px] h-[100px] sm:h-[120px] lg:h-[138px] bg-white/10 rounded-full transform -translate-x-1/2 lg:translate-x-0"></div>
              </div>

              <div className="relative z-20 flex flex-col h-full">
                {/* Top Section - Contact Information Header */}
                <div className="mb-6 sm:mb-8">
                  <h2 className="text-[20px] sm:text-[24px] lg:text-[28px] font-semibold mb-3 sm:mb-4 font-['Poppins']">
                    Contact Information
                  </h2>
                  <p className="text-[14px] sm:text-[16px] lg:text-[18px] text-white/90 font-['Poppins']">
                    Say something to start a live chat with our team
                  </p>
                </div>

                {/* Contact Details Section */}
                <div className="space-y-6 sm:space-y-8">
                  <div className="flex items-start gap-4 sm:gap-6">
                    <Mail className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-white flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-[12px] sm:text-[14px] lg:text-[16px] text-white/80 font-['Poppins'] mb-1">
                        Email
                      </p>
                      <a
                        href="mailto:hello@toolsaustralia.com.au"
                        className="font-normal text-[14px] sm:text-[16px] lg:text-[18px] font-['Poppins'] text-white hover:text-red-400 transition-colors"
                      >
                        hello@toolsaustralia.com.au
                      </a>
                    </div>
                  </div>

                  {/* Social Media Section */}
                  <div>
                    <p className="text-white/80 text-[12px] sm:text-[14px] mb-3 sm:mb-4 font-['Poppins']">Follow Us:</p>
                    <div className="flex items-center gap-3 sm:gap-4">
                      <a
                        href="https://facebook.com/toolsaustralia"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-800 hover:bg-blue-600 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110"
                        aria-label="Follow us on Facebook"
                      >
                        <Facebook className="w-5 h-5 sm:w-6 sm:h-6" />
                      </a>

                      <a
                        href="https://instagram.com/toolsaustralia"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-800 hover:bg-gradient-to-r hover:from-purple-500 hover:to-pink-500 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110"
                        aria-label="Follow us on Instagram"
                      >
                        <Instagram className="w-5 h-5 sm:w-6 sm:h-6" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form - Client Component */}
            <div className="bg-white">
              <ContactForm />
            </div>
          </div>
        </div>
      </div>

      {/* Membership Section */}
      <div className="bg-gradient-to-b from-black via-slate-900 to-black">
        {/* Membership Section */}
        <MembershipSection title="UNLOCK THE DETAILS" padding="pt-8 pb-32" titleColor="text-white" />
      </div>
    </div>
  );
}
