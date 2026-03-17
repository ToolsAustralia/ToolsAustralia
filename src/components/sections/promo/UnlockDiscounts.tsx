"use client";

import React from "react";
import Image from "next/image";
import { clsx } from "clsx";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import type { PromoLandingTheme } from "@/stores/usePromoThemeStore";

/**
 * Highlights key parts of discount messages (codes and amounts) with gradient text
 * Similar to the membership hero section highlighting
 */
function highlightDiscountMessage(message: string, gradientStyle?: React.CSSProperties, fallbackGradient?: string): React.ReactNode {
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
        className="bg-clip-text text-transparent font-bold"
        style={
          gradientStyle ?? {
            backgroundImage: fallbackGradient ?? "linear-gradient(to right, #D32F2F, #b91c1c)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
          }
        }
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
    businessLink: "https://www.zjwraps.com/",
  },
  {
    id: "superbad",
    name: "Super Bad",
    logo: "/images/partnerBrandLogos/SuperBad.png",
    discount: "90% OFF",
    discountMessage: "Mention Tools Australia for 90% off your trial shoot",
    gradient: "from-red-900 via-red-800 to-amber-100",
    businessLink: "#", // Link to be provided later
  },
  {
    id: "multihub",
    name: "Multi Hub",
    logo: "/images/partnerBrandLogos/multiHub.png",
    discount: "VIP PROMOS",
    discountMessage: "Mention Tools Australia for VIP promos",
    gradient: "from-pink-500 via-pink-600 to-fuchsia-600",
    businessLink: "#", // Link to be provided later
  },
  {
    id: "artc",
    name: "All Round Trade Constructions",
    logo: "/images/partnerBrandLogos/ARTC.png",
    discount: "10% OFF",
    discountMessage: "Mention Tools Australia for 10% off quote",
    gradient: "from-gray-900 via-gray-800 to-black",
    businessLink: "https://www.facebook.com/share/16kRKXkcVa/?mibextid=wwXIfr",
  },
  {
    id: "sealmotors",
    name: "Seal Motors",
    logo: "/images/partnerBrandLogos/sealMotors.png",
    discount: "10% OFF",
    discountMessage: "Mention Tools Australia for 10% off car services",
    gradient: "from-gray-900 via-gray-800 to-black",
    businessLink: "https://www.sealmotors.com.au/",
  },
  {
    id: "toolmanlane",
    name: "Toolman Lane",
    logo: "/images/partnerBrandLogos/ToolmanLane.jpg",
    discount: "10% OFF",
    discountMessage: "10% off all purchases when you mention Tools Australia",
    gradient: "from-gray-900 via-gray-800 to-black",
    businessLink: "#", // Link to be provided later
  },
  {
    id: "bal",
    name: "BAL Building Services",
    logo: "/images/partnerBrandLogos/BAL.jpg",
    discount: "FREE QUOTE",
    discountMessage: "Free quote when you mention Tools Australia.",
    gradient: "from-gray-900 via-gray-800 to-black",
    businessLink: "https://www.facebook.com/BALbuilding/",
  },
];

interface UnlockDiscountsProps {
  showUnlockButton?: boolean;
  title?: string;
  description?: string;
  hasAccess?: boolean; // Whether user has access to partner discounts
  /** Optional package theme to use when user has active package (Partner Discounts section on my-account) */
  packageTheme?: PromoLandingTheme;
  /** Optional className for the section wrapper (padding, margin, etc.) */
  className?: string;
}

export default function UnlockDiscounts({
  showUnlockButton = true,
  title = "Unlock Partner Discounts",
  description = "Get instant access to exclusive discounts from Australia's top tool brands",
  hasAccess = false, // Default to false for public pages
  packageTheme,
  className,
}: UnlockDiscountsProps = {}) {
  const discountsRef = useScrollAnimation();
  const { openEntryFlow } = useMajorDrawEntryCta();
  const storeTheme = usePromoTheme();
  const theme = packageTheme ?? storeTheme;
  const preferDark = theme.preferDarkBackground ?? false;

  return (
    <section ref={discountsRef} className={clsx("py-8 sm:py-12 lg:py-16 mb-12 relative", className)}>
      <div className="w-full px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white font-['Poppins'] mb-3 sm:mb-4 drop-shadow-lg">
            {title}
          </h2>
          <p className="text-base sm:text-lg text-gray-700 dark:text-neutral-400 font-['Inter'] max-w-2xl mx-auto">{description}</p>
        </div>

        {/* Partner Discounts Grid - Only show when user has access */}
        {hasAccess && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-8 sm:mb-12 stagger-animation">
            {partnerDiscounts.map((partner) => (
              <a
                key={partner.id}
                href={partner.businessLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative bg-white dark:bg-neutral-800 rounded-xl sm:rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 border-2 border-gray-200 dark:border-neutral-600 hover:border-gray-300 dark:hover:border-neutral-500 flex flex-col min-h-[200px] sm:min-h-[280px] lg:min-h-[320px] cursor-pointer"
              >
                {/* Top Section: Full Background with Centered Logo */}
                <div
                  className={`h-[50%] flex items-center justify-center p-3 sm:p-4 lg:p-6 relative ${
                    partner.id === "zjwraps" ||
                    partner.id === "superbad" ||
                    partner.id === "artc" ||
                    partner.id === "sealmotors" ||
                    partner.id === "toolmanlane" ||
                    partner.id === "bal"
                      ? ""
                      : `bg-gradient-to-br ${partner.gradient}`
                  }`}
                  style={
                    partner.id === "zjwraps" ||
                    partner.id === "superbad" ||
                    partner.id === "artc" ||
                    partner.id === "sealmotors" ||
                    partner.id === "toolmanlane" ||
                    partner.id === "bal"
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
                    style={
                      partner.id === "superbad"
                        ? { transform: "scale(2)" }
                        : partner.id === "artc"
                        ? { transform: "scale(1.5)" }
                        : undefined
                    }
                    unoptimized
                  />
                </div>

                {/* Bottom Section: White Background with Discount Message */}
                <div className="h-[50%] bg-white dark:bg-neutral-800 flex flex-col items-center justify-between p-3 sm:p-4 lg:p-5 overflow-hidden">
                  {/* Brand Name Title - Fixed max height with line clamping */}
                  <div className="w-full flex-shrink-0 max-h-[3em] overflow-hidden">
                    <h3 className="text-xs sm:text-sm lg:text-base font-bold text-gray-900 dark:text-white font-['Poppins'] text-center line-clamp-2 leading-tight">
                      {partner.name}
                    </h3>
                  </div>
                  {/* Discount Message - Flexible middle section */}
                  <div className="w-full flex-1 min-h-0 flex items-center justify-center py-1">
                    <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-800 dark:text-neutral-300 font-['Inter'] text-center leading-tight line-clamp-2">
                      {highlightDiscountMessage(partner.discountMessage, {
                        backgroundImage: theme.gradientSolid,
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                      }, `linear-gradient(to right, ${theme.primary}, ${theme.primaryDark})`)}
                    </p>
                  </div>
                  {/* Tools Australia Logo - Fixed at bottom */}
                  <div className="w-full flex items-center justify-center flex-shrink-0">
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
              </a>
            ))}
          </div>
        )}

        {/* Enter to Unlock Button - Conditionally rendered */}
        {showUnlockButton && (
          <div className="text-center mt-8 sm:mt-12">
            <button
              onClick={() => {
                // Shared CTA hook ensures the correct modal flow is triggered every time.
                openEntryFlow({ openLocalModal: false });
              }}
              suppressHydrationWarning
              className={`relative ${preferDark ? "text-black" : "text-white"} px-8 sm:px-10 lg:px-12 py-4 sm:py-5 lg:py-6 rounded-full font-bold text-base sm:text-lg lg:text-xl transition-all duration-300 hover:scale-105 hover:shadow-xl group`}
              style={{
                background: theme.gradientSolid,
                boxShadow: `0 8px 32px ${theme.shadowRgba}`,
                border: `2px solid ${theme.borderRgba}`,
              }}
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
