"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { Trophy, Zap, Wrench, Shield, Car, TreePine, Settings, Ruler } from "lucide-react";

// Mini draw categories
const miniDrawCategories = [
  {
    id: "power-tools",
    name: "Power Tools",
    icon: Zap,
    description: "Cordless drills, saws, sanders",
    color: "bg-blue-500",
    prizeCount: 12,
  },
  {
    id: "hand-tools",
    name: "Hand Tools",
    icon: Wrench,
    description: "Hammers, screwdrivers, pliers",
    color: "bg-green-500",
    prizeCount: 8,
  },
  {
    id: "safety-equipment",
    name: "Safety Equipment",
    icon: Shield,
    description: "Hard hats, gloves, goggles",
    color: "bg-red-500",
    prizeCount: 6,
  },
  {
    id: "cordless-tools",
    name: "Cordless Tools",
    icon: Trophy,
    description: "Battery-powered equipment",
    color: "bg-purple-500",
    prizeCount: 15,
  },
  {
    id: "automotive",
    name: "Automotive",
    icon: Car,
    description: "Car care and repair tools",
    color: "bg-orange-500",
    prizeCount: 10,
  },
  {
    id: "garden-tools",
    name: "Garden Tools",
    icon: TreePine,
    description: "Lawn care and gardening",
    color: "bg-emerald-500",
    prizeCount: 7,
  },
  {
    id: "accessories",
    name: "Accessories",
    icon: Settings,
    description: "Tool accessories and parts",
    color: "bg-gray-500",
    prizeCount: 9,
  },
  {
    id: "measurement-tools",
    name: "Measurement Tools",
    icon: Ruler,
    description: "Levels, measuring tapes",
    color: "bg-indigo-500",
    prizeCount: 5,
  },
];

export default function PrizeCategories() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll animation for mobile/tablet
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollLeft = container.scrollLeft;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;

      // If we've scrolled to the end, reset to beginning
      if (scrollLeft >= scrollWidth - clientWidth - 10) {
        container.scrollLeft = 0;
      }
    }
  };

  // Initialize scroll position to the middle for infinite scroll
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      // Set initial scroll position to the middle (second set of categories)
      const oneSetWidth = container.scrollWidth / 3;
      container.scrollLeft = oneSetWidth;
    }
  }, []);

  return (
    <section className="py-12 sm:py-16 lg:py-20 bg-[#f0f0f0] rounded-[40px] mx-2 sm:mx-3 lg:mx-4 my-8 w-full overflow-visible">
      <div className="w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto">
        {/* Section Header */}
        <div className="text-center mb-8 sm:mb-10 lg:mb-12">
          <h2 className="text-[20px] sm:text-[24px] lg:text-[48px] font-bold text-black font-['Poppins'] mb-2 sm:mb-3 lg:mb-4 leading-tight">
            BROWSE CATEGORIES
          </h2>
          <p className="text-[14px] sm:text-[16px] lg:text-[18px] text-gray-600 max-w-3xl mx-auto">
            Explore mini draws by category and find amazing tools and equipment in your area of interest
          </p>
        </div>

        {/* Mobile/Tablet: Horizontal Scrolling Animation */}
        <div className="lg:hidden category-scroll-container">
          <div
            ref={scrollContainerRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory"
            onScroll={handleScroll}
          >
            {/* Render categories 3 times for infinite scroll effect */}
            {[...miniDrawCategories, ...miniDrawCategories, ...miniDrawCategories].map((category, index) => (
              <Link
                key={`${category.id}-${index}`}
                href={`/mini-draws?category=${encodeURIComponent(category.name)}`}
                className="flex-shrink-0 w-[140px] sm:w-[160px] group snap-start"
              >
                <div className="bg-white rounded-[20px] sm:rounded-[25px] p-4 sm:p-6 shadow-[0px_4px_10px_0px_rgba(0,0,0,0.1)] hover:shadow-xl transition-all duration-300 group-hover:scale-105 h-full flex flex-col items-center text-center">
                  <div
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full ${category.color} flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <category.icon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                  </div>
                  <h3 className="text-[12px] sm:text-[14px] font-bold text-black mb-1 sm:mb-2 leading-tight">
                    {category.name}
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-gray-600 mb-2 sm:mb-3 leading-tight">
                    {category.description}
                  </p>
                  <div className="text-[10px] sm:text-[11px] text-red-600 font-semibold">
                    {category.prizeCount} prizes
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Desktop: Grid Layout */}
        <div className="hidden lg:grid lg:grid-cols-4 xl:grid-cols-4 gap-6 xl:gap-8">
          {miniDrawCategories.map((category) => (
            <Link
              key={category.id}
              href={`/mini-draws?category=${encodeURIComponent(category.name)}`}
              className="group"
            >
              <div className="bg-white rounded-[25px] p-8 shadow-[0px_4px_10px_0px_rgba(0,0,0,0.1)] hover:shadow-xl transition-all duration-300 group-hover:scale-105 h-full flex flex-col items-center text-center">
                <div
                  className={`w-16 h-16 rounded-full ${category.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
                >
                  <category.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-[18px] font-bold text-black mb-3 leading-tight">{category.name}</h3>
                <p className="text-[14px] text-gray-600 mb-4 leading-relaxed">{category.description}</p>
                <div className="text-[14px] text-red-600 font-semibold">{category.prizeCount} prizes available</div>
              </div>
            </Link>
          ))}
        </div>

        {/* View All Button */}
        <div className="text-center mt-8 sm:mt-10 lg:mt-12">
          <Link
            href="/mini-draws"
            className="inline-flex items-center gap-2 bg-black text-white px-6 sm:px-8 py-3 sm:py-4 rounded-[40px] sm:rounded-[45px] lg:rounded-[50px] text-[14px] sm:text-[16px] font-bold hover:bg-gray-800 transition-colors duration-200 group"
          >
            View All Mini Draws
            <svg
              className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform duration-200"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      <style jsx>{`
        .category-scroll-container::-webkit-scrollbar {
          display: none;
        }
        .category-scroll-container {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </section>
  );
}

