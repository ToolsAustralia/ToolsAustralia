"use client";

import Image from "next/image";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";

const partnerDiscounts = [
  {
    id: "milwaukee",
    name: "Milwaukee",
    logo: "/images/brands/milwaukee.png",
    discount: "25% OFF",
    gradient: "from-red-600 via-red-500 to-red-700",
  },
  {
    id: "dewalt",
    name: "DeWalt",
    logo: "/images/brands/dewalt-black.png",
    discount: "30% OFF",
    gradient: "from-yellow-500 via-yellow-600 to-amber-600",
  },
  {
    id: "makita",
    name: "Makita",
    logo: "/images/brands/Makita-red.png",
    discount: "20% OFF",
    gradient: "from-cyan-600 via-blue-500 to-cyan-700",
  },
  {
    id: "sidchrome",
    name: "Sidchrome",
    logo: "/images/brands/sidchrome.png",
    discount: "15% OFF",
    gradient: "from-red-800 via-red-700 to-red-900",
  },
  {
    id: "kincrome",
    name: "Kincrome",
    logo: "/images/brands/kincrome.png",
    discount: "18% OFF",
    gradient: "from-blue-700 via-blue-600 to-blue-800",
  },
  {
    id: "chicago-pneumatic",
    name: "Chicago Pneumatic",
    logo: "/images/brands/chicagoPneumatic.png",
    discount: "22% OFF",
    gradient: "from-gray-900 via-gray-800 to-black",
  },
  {
    id: "gearwrench",
    name: "GearWrench",
    logo: "/images/brands/gearWrench.png",
    discount: "19% OFF",
    gradient: "from-gray-900 via-gray-800 to-black",
  },
  {
    id: "ingersoll-rand",
    name: "Ingersoll Rand",
    logo: "/images/brands/Ingersoll-Rand.png",
    discount: "24% OFF",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
  },
  {
    id: "knipex",
    name: "Knipex",
    logo: "/images/brands/knipex.png",
    discount: "21% OFF",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
  },
  {
    id: "koken",
    name: "Koken",
    logo: "/images/brands/koken.png",
    discount: "17% OFF",
    gradient: "from-gray-700 via-gray-600 to-gray-800",
  },
  {
    id: "mitutoyo",
    name: "Mitutoyo",
    logo: "/images/brands/mitutoyo.webp",
    discount: "23% OFF",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
  },
  {
    id: "stahlwille",
    name: "Stahlwille",
    logo: "/images/brands/stahlwille.png",
    discount: "16% OFF",
    gradient: "from-green-900 from-0% via-green-800 via-50% to-gray-900 to-50%",
  },
  {
    id: "warren-brown",
    name: "Warren & Brown",
    logo: "/images/brands/warrenBrown.png",
    discount: "20% OFF",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
  },
];

interface UnlockDiscountsProps {
  showUnlockButton?: boolean;
  title?: string;
  description?: string;
}

export default function UnlockDiscounts({
  showUnlockButton = true,
  title = "Unlock Massive Partner Discounts",
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-8 sm:mb-12 stagger-animation">
          {partnerDiscounts.map((partner) => (
            <div
              key={partner.id}
              className="group relative bg-white rounded-xl sm:rounded-2xl p-2 sm:p-3 lg:p-4 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 border-2 border-gray-200 hover:border-gray-300"
            >
              {/* Metallic Discount Badge - Top Right */}
              <div className="absolute -top-1 sm:-top-2 -right-1 sm:-right-2 z-10">
                <div className="relative bg-gradient-to-br from-red-600 via-red-700 to-red-800 text-white px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-xs font-bold shadow-lg border-2 border-red-400/30">
                  {/* Metallic shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-full"></div>
                  <span className="relative z-10">{partner.discount}</span>
                </div>
              </div>

              {/* 2-Column Layout: Logo on Left, Brand Name on Right */}
              <div className="flex items-center gap-3 sm:gap-3">
                {/* Partner Logo with Brand Color Background - Left Column */}
                <div className="flex-shrink-0 w-14 sm:w-24 lg:w-28">
                  <div
                    className={`w-full h-10 sm:h-16 lg:h-18 ${
                      partner.id === "stahlwille"
                        ? `bg-gradient-to-b ${partner.gradient}`
                        : `bg-gradient-to-br ${partner.gradient}`
                    } rounded-lg sm:rounded-xl flex items-center justify-center p-2 sm:p-3 shadow-md`}
                  >
                    <Image
                      src={partner.logo}
                      alt={`${partner.name} Logo`}
                      width={90}
                      height={36}
                      className={`h-8 sm:h-9 lg:h-10 w-auto object-contain drop-shadow-md ${
                        partner.id === "gearwrench" || partner.id === "ingersoll-rand"
                          ? "scale-150"
                          : partner.id === "milwaukee"
                          ? "scale-150"
                          : partner.id === "chicago-pneumatic"
                          ? "scale-75 sm:scale-100"
                          : partner.id === "warren-brown"
                          ? "scale-75 sm:scale-100"
                          : ""
                      }`}
                      style={
                        partner.id === "chicago-pneumatic"
                          ? { transform: "scale(1.7)" }
                          : partner.id === "gearwrench" || partner.id === "ingersoll-rand"
                          ? { transform: "scale(1.8)" }
                          : partner.id === "warren-brown"
                          ? { transform: "scale(1.8)" }
                          : partner.id === "stahlwille"
                          ? { transform: "scale(1.2)" }
                          : partner.id === "knipex"
                          ? { transform: "scale(1.2)" }
                          : partner.id === "mitutoyo"
                          ? { transform: "scale(1.2)" }
                          : {}
                      }
                      unoptimized
                    />
                  </div>
                </div>

                {/* Brand Name - Right Column */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs sm:text-base lg:text-lg font-bold text-gray-900 font-['Poppins'] break-words leading-tight">
                    {partner.name}
                  </h3>
                </div>
              </div>

              {/* Hover Glow Effect */}
              <div
                className={`absolute inset-0 bg-gradient-to-r ${partner.gradient} opacity-0 group-hover:opacity-5 rounded-xl sm:rounded-2xl transition-opacity duration-300 pointer-events-none`}
              ></div>
            </div>
          ))}
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
