"use client";

import Link from "next/link";
import { Crown, Target } from "lucide-react";

interface MembershipCTAProps {
  title?: string;
  subtitle?: string;
  primaryButtonText?: string;
  secondaryButtonText?: string;
  primaryButtonHref?: string;
  secondaryButtonHref?: string;
  primaryButtonIcon?: React.ReactNode;
  secondaryButtonIcon?: React.ReactNode;
  className?: string;
}

export default function MembershipCTA({
  title = "Ready to Become Our Next Winner?",
  subtitle = "Join thousands of members who are already winning amazing tools and equipment every month",
  primaryButtonText = "Join Membership",
  secondaryButtonText = "Browse Mini Draws",
  primaryButtonHref = "/membership",
  secondaryButtonHref = "/mini-draws",
  primaryButtonIcon = <Crown className="w-5 h-5" />,
  secondaryButtonIcon = <Target className="w-5 h-5" />,
  className = "",
}: MembershipCTAProps) {
  return (
    <section
      className={`bg-gradient-to-r from-red-600 via-red-700 to-red-800 rounded-2xl p-8 sm:p-12 text-center text-white relative overflow-hidden shadow-2xl ${className}`}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Cpath d='M20 20c0-5.5-4.5-10-10-10s-10 4.5-10 10 4.5 10 10 10 10-4.5 10-10zm10 0c0-5.5-4.5-10-10-10s-10 4.5-10 10 4.5 10 10 10 10-4.5 10-10z'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>
      </div>

      <div className="relative z-10 max-w-3xl mx-auto">
        <div className="flex items-center justify-center mb-6">
          <div className="p-4 bg-white/20 rounded-2xl">
            <Crown className="w-12 h-12 text-yellow-300" />
          </div>
        </div>
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4 font-['Poppins']">
          {title} <span className="text-yellow-300">Winner</span>?
        </h2>
        <p className="text-base sm:text-lg lg:text-xl mb-6 sm:mb-8 text-white/90 leading-relaxed px-4">{subtitle}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={primaryButtonHref}
            className="inline-flex items-center px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-gray-100 transition-all duration-300 shadow-lg hover:shadow-xl"
          >
            {primaryButtonIcon && <span className="mr-2">{primaryButtonIcon}</span>}
            {primaryButtonText}
          </Link>
          <Link
            href={secondaryButtonHref}
            className="inline-flex items-center px-8 py-4 bg-yellow-300 text-black font-semibold rounded-full hover:bg-yellow-400 transition-all duration-300 shadow-lg hover:shadow-xl"
          >
            {secondaryButtonIcon && <span className="mr-2">{secondaryButtonIcon}</span>}
            {secondaryButtonText}
          </Link>
        </div>
      </div>
    </section>
  );
}



















