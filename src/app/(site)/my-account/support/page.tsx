"use client";

import React from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMyAccountData } from "@/hooks/queries";
import { Facebook, Instagram, Mail } from "lucide-react";

import ContactForm from "@/components/features/ContactForm";
import DashboardHeader from "../components/DashboardHeader";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";

export default function SupportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: accountData, isLoading: loading } = useMyAccountData(session?.user?.id);

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
    }
  }, [session, status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 dark:border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session || !accountData) {
    return null;
  }

  const { user } = accountData;

  return (
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden bg-gray-50 dark:bg-neutral-950 pb-16 lg:pb-8">
      <DashboardHeader
        title="Support"
        showRenewalAlert={hasFailedRenewal(user as unknown as import("@/models/User").IUser)}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-6 sm:pb-8">
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[500px] lg:min-h-[600px]">
            {/* Contact Information - Same as /contact */}
            <div className="bg-black p-6 sm:p-8 lg:p-12 text-white relative flex flex-col">
              <div className="absolute inset-0 z-0">
                <Image
                  src="/images/background/contact-bg.webp"
                  alt="Tools Australia Support"
                  fill
                  className="object-cover opacity-30"
                  unoptimized
                />
                <div className="absolute inset-0 bg-black/60" />
              </div>

              <div className="relative z-20 flex flex-col h-full">
                <div className="mb-6 sm:mb-8">
                  <h2 className="text-[20px] sm:text-[24px] lg:text-[28px] font-semibold mb-3 sm:mb-4 font-['Poppins']">
                    Contact Information
                  </h2>
                  <p className="text-[14px] sm:text-[16px] lg:text-[18px] text-white/90 font-['Poppins']">
                    Any question or remarks? Just write us a message!
                  </p>
                </div>

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

                  <div>
                    <p className="text-white/80 text-[12px] sm:text-[14px] mb-3 sm:mb-4 font-['Poppins']">Follow Us:</p>
                    <div className="flex items-center gap-3 sm:gap-4">
                      <a
                        href="https://www.facebook.com/toolsaust"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-800 hover:bg-blue-600 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110"
                        aria-label="Follow us on Facebook"
                      >
                        <Facebook className="w-5 h-5 sm:w-6 sm:h-6" />
                      </a>
                      <a
                        href="https://www.instagram.com/toolsaustralia/"
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

            {/* Contact Form - Same component and API as /contact */}
            <div className="bg-white dark:bg-neutral-900">
              <ContactForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
