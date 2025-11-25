"use client";

import React from "react";
import Image from "next/image";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";

/**
 * Highlights key parts of discount messages (codes and amounts) with gradient text
 * Similar to the membership hero section highlighting
 */
function highlightDiscountMessage(message: string): React.ReactNode {
  // Pattern to match discount codes (TA followed by numbers, optionally with "Code" prefix)
  const codePattern = /(Code\s+)?(TA\d+[A-Z]*)/gi;
  // Pattern to match percentages (25%, 20%, etc.)
  const percentPattern = /(\d+%)/g;
  // Pattern to match dollar amounts ($200, $150, etc.)
  const dollarPattern = /(\$\d+)/g;

  // Split message and highlight matches
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let key = 0;

  // Find all matches and their positions
  const matches: Array<{ start: number; end: number; text: string; type: "code" | "percent" | "dollar" }> = [];

  // Find code matches (capture full match including "Code" if present)
  let match;
  while ((match = codePattern.exec(message)) !== null) {
    const fullMatch = match[0]; // Full match including "Code " if present
    matches.push({
      start: match.index,
      end: match.index + fullMatch.length,
      text: fullMatch, // Include "Code " prefix if present for highlighting
      type: "code",
    });
  }

  // Find percent matches
  codePattern.lastIndex = 0; // Reset regex
  while ((match = percentPattern.exec(message)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      type: "percent",
    });
  }

  // Find dollar matches
  percentPattern.lastIndex = 0; // Reset regex
  while ((match = dollarPattern.exec(message)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      type: "dollar",
    });
  }

  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);

  // Remove overlapping matches (keep the first one)
  const filteredMatches: typeof matches = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const overlaps = filteredMatches.some((m) => !(current.end <= m.start || current.start >= m.end));
    if (!overlaps) {
      filteredMatches.push(current);
    }
  }

  // Build the parts array
  filteredMatches.forEach((match) => {
    // Add text before match
    if (match.start > lastIndex) {
      parts.push(message.substring(lastIndex, match.start));
    }

    // Add highlighted match
    parts.push(
      <span
        key={key++}
        className="bg-gradient-to-r from-[#ee0000] to-[#cc0000] bg-clip-text text-transparent font-bold"
      >
        {match.text}
      </span>
    );

    lastIndex = match.end;
  });

  // Add remaining text
  if (lastIndex < message.length) {
    parts.push(message.substring(lastIndex));
  }

  // If no matches found, return original message
  if (parts.length === 0) {
    return message;
  }

  return <>{parts}</>;
}

const toolsAustraliaLogo = "/images/Tools%20Australia%20Logo/Primary%20Logo.png";

const partnerDiscounts = [
  {
    id: "zjwraps",
    name: "ZJWRAPS",
    logo: "/images/partnerBrandLogos/ZJWRAPS.webp",
    discount: "250 OFF",
    discountMessage: "$250 off a wrap when you mention Tools Australia",
    gradient: "from-gray-900 via-gray-800 to-black",
  },
  {
    id: "superbad",
    name: "Super Bad",
    logo: "/images/partnerBrandLogos/SuperBad.png",
    discount: "90% OFF",
    discountMessage: "Mention Tools Australia for 90% off your trial shoot",
    gradient: "from-red-900 via-red-800 to-amber-100",
  },
  {
    id: "multihub",
    name: "Multi Hub",
    logo: "/images/partnerBrandLogos/multiHub.png",
    discount: "VIP PROMOS",
    discountMessage: "Mention Tools Australia for VIP promos",
    gradient: "from-pink-500 via-pink-600 to-fuchsia-600",
  },
];

interface UnlockDiscountsProps {
  showUnlockButton?: boolean;
  title?: string;
  description?: string;
}

export default function UnlockDiscounts({
  showUnlockButton = true,
  title = "Unlock Partner Discounts",
  description = "Get instant access to exclusive discounts from Australia's top tool brands",
}: UnlockDiscountsProps = {}) {
  const discountsRef = useScrollAnimation();
  const { openEntryFlow } = useMajorDrawEntryCta();

  return (
    <section ref={discountsRef} className="py-8 sm:py-12 lg:py-16 mb-12 relative">
      <div className="w-full px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 font-['Poppins'] mb-3 sm:mb-4 drop-shadow-lg">
            {title}
          </h2>
          <p className="text-base sm:text-lg text-gray-700 font-['Inter'] max-w-2xl mx-auto">{description}</p>
        </div>

        {/* Partner Discounts Grid */}
        <div className="flex justify-center mb-8 sm:mb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 stagger-animation max-w-4xl">
            {partnerDiscounts.map((partner) => (
              <div
                key={partner.id}
                className="group relative bg-white rounded-xl sm:rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 border-2 border-gray-200 hover:border-gray-300 flex flex-col min-h-[200px] sm:min-h-[280px] lg:min-h-[320px]"
              >
                {/* Top Half: Full Background with Centered Logo */}
                <div
                  className={`h-3/5 flex items-center justify-center p-3 sm:p-4 lg:p-6 relative ${
                    partner.id === "zjwraps" || partner.id === "superbad" ? "" : `bg-gradient-to-br ${partner.gradient}`
                  }`}
                  style={
                    partner.id === "zjwraps" || partner.id === "superbad"
                      ? {
                          backgroundImage: "url('/images/partnerBrandLogos/partnerlogoBg.png')",
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                        }
                      : undefined
                  }
                >
                  <Image
                    src={partner.logo}
                    alt={`${partner.name} Logo`}
                    width={90}
                    height={36}
                    className={`h-10 sm:h-12 lg:h-14 w-auto object-contain drop-shadow-md ${
                      partner.id === "superbad" ? "scale-200" : ""
                    }`}
                    style={partner.id === "superbad" ? { transform: "scale(2)" } : undefined}
                    unoptimized
                  />
                </div>

                {/* Bottom Half: White Background with Discount Message */}
                <div className="h-2/5 bg-white flex flex-col items-center justify-center gap-2 p-3 sm:p-4 lg:p-5">
                  {/* Brand Name Title */}
                  <h3 className="text-xs sm:text-sm lg:text-base font-bold text-gray-900 font-['Poppins'] text-center">
                    {partner.name}
                  </h3>
                  <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-800 font-['Inter'] text-center leading-tight">
                    {highlightDiscountMessage(partner.discountMessage)}
                  </p>
                  <div className="flex items-center justify-center">
                    <Image
                      src={toolsAustraliaLogo}
                      alt="Tools Australia logo"
                      width={48}
                      height={48}
                      className="h-4 w-auto object-contain drop-shadow sm:h-6 lg:h-7"
                      unoptimized
                    />
                  </div>
                </div>

                {/* Hover Glow Effect */}
                <div
                  className={`absolute inset-0 bg-gradient-to-r ${partner.gradient} opacity-0 group-hover:opacity-5 rounded-xl sm:rounded-2xl transition-opacity duration-300 pointer-events-none`}
                ></div>
              </div>
            ))}
          </div>
        </div>

        {/* Enter to Unlock Button - Conditionally rendered */}
        {showUnlockButton && (
          <div className="text-center mt-8 sm:mt-12">
            <button
              onClick={() => {
                // Shared CTA hook ensures the correct modal flow is triggered every time.
                openEntryFlow({ openLocalModal: false });
              }}
              className="relative bg-gradient-to-br from-red-600 via-red-700 to-red-800 text-white px-8 sm:px-10 lg:px-12 py-4 sm:py-5 lg:py-6 rounded-full font-bold text-base sm:text-lg lg:text-xl shadow-[0_8px_32px_rgba(239,68,68,0.4)] hover:shadow-[0_12px_40px_rgba(239,68,68,0.6)] transition-all duration-300 hover:scale-105 border-2 border-red-400/30 group"
            >
              {/* Metallic shine effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-full"></div>
              <span className="relative z-10 flex items-center gap-2 sm:gap-3">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
                <span className="hidden sm:inline">ENTER TO UNLOCK DISCOUNT</span>
                <span className="sm:hidden">UNLOCK DISCOUNT</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
