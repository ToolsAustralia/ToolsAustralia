"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";

// Partner brands data with equal representation
const partnerBrands = [
  {
    id: "milwaukee",
    name: "Milwaukee",
    logo: "/images/brands/milwaukee.png",
    productImage: "/images/brands/toolset/milwaukeetools.png",
    description: "Professional-grade power tools and accessories",
    productCount: "View All Products",
    color: "bg-red-600",
    textColor: "text-red-600",
    metallicGradient: "from-red-600 via-red-500 to-red-700",
    toolCategories: ["Drill", "Saw", "Grinder", "Impact", "Hammer", "Multi"],
  },
  {
    id: "dewalt",
    name: "DeWalt",
    logo: "/images/brands/dewalt-black.png",
    productImage: "/images/brands/toolset/dewalttools.png",
    description: "Heavy-duty construction and woodworking tools",
    productCount: "View All Products",
    color: "bg-yellow-600",
    textColor: "text-yellow-600",
    metallicGradient: "from-yellow-500 via-yellow-600 to-amber-600",
    toolCategories: ["Circular Saw", "Table Saw", "Chainsaw", "Mixer", "Blower", "Trimmer"],
  },
  {
    id: "makita",
    name: "Makita",
    logo: "/images/brands/Makita-red.png",
    productImage: "/images/brands/toolset/makitatools.jpg",
    description: "Innovative cordless and corded power tools",
    productCount: "View All Products",
    color: "bg-cyan-600",
    textColor: "text-blue-600",
    metallicGradient: "from-cyan-600 via-blue-500 to-cyan-700",
    toolCategories: ["Drill", "Sander", "Nail Gun", "Vacuum", "Blower", "Trimmer"],
  },
  {
    id: "kincrome",
    name: "Kincrome",
    logo: "/images/brands/kincrome.png",
    productImage: "/images/brands/toolset/kincrometools.jpg",
    description: "Premium hand tools and tool storage solutions",
    productCount: "View All Products",
    color: "bg-blue-700",
    textColor: "text-orange-600",
    metallicGradient: "from-blue-700 via-blue-600 to-blue-800",
    toolCategories: ["Grinder", "Heat Gun", "Jigsaw", "Blower", "Light", "Compressor"],
  },
  {
    id: "sidchrome",
    name: "Sidchrome",
    logo: "/images/brands/sidchrome.png",
    productImage: "/images/brands/toolset/sidchrometools.jpg",
    description: "Professional automotive and industrial tools",
    productCount: "View All Products",
    color: "bg-red-700",
    textColor: "text-green-600",
    metallicGradient: "from-red-800 via-red-700 to-red-900",
    toolCategories: ["Wrench", "Socket", "Screwdriver", "Pliers", "Hammer", "Set"],
  },
  {
    id: "chicago-pneumatic",
    name: "Chicago Pneumatic",
    logo: "/images/brands/chicagoPneumatic.png",
    productImage: "/images/brands/toolset/chicagopneumatictools.jpg",
    description: "Professional pneumatic tools and compressors",
    productCount: "View All Products",
    color: "bg-red-600",
    textColor: "text-red-600",
    metallicGradient: "from-red-600 via-red-700 to-red-800",
    toolCategories: ["Impact Wrench", "Drill", "Grinder", "Sander", "Compressor", "Nail Gun"],
  },
  {
    id: "gearwrench",
    name: "GearWrench",
    logo: "/images/brands/gearWrench.png",
    productImage: "/images/brands/toolset/gearWrenchtools.jpg",
    description: "Professional hand tools and tool sets",
    productCount: "View All Products",
    color: "bg-orange-600",
    textColor: "text-orange-600",
    metallicGradient: "from-orange-600 via-orange-700 to-orange-800",
    toolCategories: ["Wrench", "Socket", "Screwdriver", "Pliers", "Ratchet", "Set"],
  },
  {
    id: "ingersoll-rand",
    name: "Ingersoll Rand",
    logo: "/images/brands/Ingersoll-Rand.png",
    productImage: "/images/brands/toolset/ingersollRandtools.jpg",
    description: "Industrial air compressors and tools",
    productCount: "View All Products",
    color: "bg-red-600",
    textColor: "text-red-600",
    metallicGradient: "from-red-600 via-red-700 to-red-800",
    toolCategories: ["Compressor", "Impact Wrench", "Drill", "Grinder", "Sander", "Nail Gun"],
  },
  {
    id: "knipex",
    name: "Knipex",
    logo: "/images/brands/knipex.png",
    productImage: "/images/brands/toolset/knipextools.jpg",
    description: "Premium pliers and cutting tools",
    productCount: "View All Products",
    color: "bg-red-600",
    textColor: "text-red-600",
    metallicGradient: "from-red-600 via-red-700 to-red-800",
    toolCategories: ["Pliers", "Cutters", "Crimpers", "Strippers", "Wrenches", "Specialty"],
  },
  {
    id: "koken",
    name: "Koken",
    logo: "/images/brands/koken.png",
    productImage: "/images/brands/toolset/kokentools.jpg",
    description: "Precision measuring and inspection tools",
    productCount: "View All Products",
    color: "bg-gray-700",
    textColor: "text-gray-100",
    metallicGradient: "from-gray-700 via-gray-600 to-gray-800",
    toolCategories: ["Calipers", "Micrometers", "Gauges", "Rulers", "Squares", "Levels"],
  },
  {
    id: "mitutoyo",
    name: "Mitutoyo",
    logo: "/images/brands/mitutoyo.webp",
    productImage: "/images/brands/toolset/mitutoyotools.png",
    description: "Precision measuring instruments and tools",
    productCount: "View All Products",
    color: "bg-orange-600",
    textColor: "text-orange-600",
    metallicGradient: "from-orange-600 via-orange-700 to-orange-800",
    toolCategories: ["Calipers", "Micrometers", "Gauges", "Rulers", "Squares", "Levels"],
  },
  {
    id: "stahlwille",
    name: "Stahlwille",
    logo: "/images/brands/stahlwille.png",
    productImage: "/images/brands/toolset/stahlwilletools.jpg",
    description: "Professional wrenches and hand tools",
    productCount: "View All Products",
    color: "bg-green-900",
    textColor: "text-gray-100",
    metallicGradient: "from-green-900 via-green-800 to-gray-900",
    toolCategories: ["Wrench", "Socket", "Screwdriver", "Pliers", "Hammer", "Set"],
  },
  {
    id: "warren-brown",
    name: "Warren & Brown",
    logo: "/images/brands/warrenBrown.png",
    productImage: "/images/brands/toolset/warrenBrowntools.jpg",
    description: "Professional torque wrenches and tools",
    productCount: "View All Products",
    color: "bg-blue-600",
    textColor: "text-blue-600",
    metallicGradient: "from-blue-600 via-blue-700 to-blue-800",
    toolCategories: ["Torque Wrench", "Socket", "Screwdriver", "Pliers", "Hammer", "Set"],
  },
];

interface ProductCategoriesProps {
  title?: string;
  description?: string;
  padding?: string;
  margin?: string;
  showBackground?: boolean;
}

export default function ProductCategories({
  title = "BROWSE BY BRAND",
  description = "Discover our premium partner brands, each offering professional-grade tools and equipment for every trade",
  padding = "py-20 sm:py-24 lg:py-28",
  margin = "my-0",
  showBackground = true,
}: ProductCategoriesProps) {
  const [isPaused, setIsPaused] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
  };

  const handleTouchStart = () => {
    setIsPaused(true);
  };

  const handleTouchEnd = () => {
    // Resume animation after a delay when touch ends
    setTimeout(() => {
      setIsPaused(false);
    }, 2000);
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current || isPaused) return;

    const container = scrollContainerRef.current;
    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = container.clientWidth; // clientWidth calculated but not used in this context

    // Calculate the width of one set of brands
    const oneSetWidth = scrollWidth / 3;

    // If scrolled past the second set (towards the end), jump to the first set
    if (scrollLeft >= oneSetWidth * 2) {
      container.scrollLeft = scrollLeft - oneSetWidth;
    }
    // If scrolled before the first set (towards the beginning), jump to the second set
    else if (scrollLeft <= 0) {
      container.scrollLeft = scrollLeft + oneSetWidth;
    }
  };

  // Initialize scroll position to the middle for infinite scroll
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      // Set initial scroll position to the middle (second set of brands)
      const oneSetWidth = container.scrollWidth / 3;
      container.scrollLeft = oneSetWidth;
    }
  }, []);

  return (
    <section
      className={`${padding} ${
        showBackground ? "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900" : "bg-transparent"
      } relative overflow-visible ${margin} w-full`}
    >
      {/* Metallic shine overlay - only show when background is enabled */}
      {showBackground && (
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/5 pointer-events-none"></div>
      )}
      <div className="w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto relative z-10">
        {/* Section Header */}
        <div className="text-center mb-8 sm:mb-10 lg:mb-12">
          <h2
            className={`text-[20px] sm:text-[24px] lg:text-[48px] font-bold font-['Poppins'] mb-2 sm:mb-3 lg:mb-4 leading-tight ${
              showBackground ? "text-white drop-shadow-lg" : "text-gray-900"
            }`}
          >
            {title}
          </h2>
          <p
            className={`text-[14px] sm:text-[16px] lg:text-[18px] max-w-3xl mx-auto ${
              showBackground ? "text-slate-200" : "text-gray-600"
            }`}
          >
            {description}
          </p>
        </div>

        {/* Mobile/Tablet: Horizontal Scrolling Animation */}
        <div className="lg:hidden brand-scroll-container">
          <div
            ref={scrollContainerRef}
            className={`flex gap-4 ${isPaused ? "" : "animate-scroll-right-to-left"}`}
            style={{ width: "max-content" }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onScroll={handleScroll}
          >
            {/* Triple the brands for seamless infinite scroll */}
            {[...partnerBrands, ...partnerBrands, ...partnerBrands].map((brand, index) => (
              <div key={`${brand.id}-${index}`} className="flex-shrink-0">
                <Link
                  href={`/shop/brand/${brand.id}`}
                  className="block relative overflow-hidden rounded-[16px] sm:rounded-[20px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] w-[280px] sm:w-[320px] bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm border border-slate-500/30"
                >
                  {/* Metallic shine overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>

                  <div className="relative h-[160px] sm:h-[180px]">
                    <Image
                      src={brand.productImage}
                      alt={`${brand.name} Products`}
                      fill
                      className="object-cover transition-all duration-300 opacity-80"
                      sizes="(max-width: 640px) 280px, 320px"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-800/40 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 z-20">
                      <div className="relative h-6 w-12 sm:h-8 sm:w-16 mb-2">
                        <Image
                          src={brand.logo}
                          alt={`${brand.name} Logo`}
                          fill
                          className={`object-contain drop-shadow-md ${
                            brand.id === "chicago-pneumatic" ||
                            brand.id === "gearwrench" ||
                            brand.id === "ingersoll-rand" ||
                            brand.id === "stahlwille" ||
                            brand.id === "warren-brown"
                              ? "scale-150"
                              : ""
                          }`}
                          sizes="(max-width: 640px) 48px, 64px"
                        />
                      </div>
                      <h3 className="text-white text-[14px] sm:text-[16px] font-bold font-['Poppins'] mb-2">
                        {brand.name}
                      </h3>
                      {/* Metallic brand badge */}
                      <div className="relative inline-block">
                        <div
                          className={`bg-gradient-to-br ${brand.metallicGradient} text-white px-2 py-1 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-[12px] font-semibold border-2 border-white/20`}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-full"></div>
                          <span className="relative z-10">{brand.productCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop: Brand Collage - Equal grid */}
        <div className="hidden lg:grid grid-cols-5 gap-4">
          {partnerBrands.map((brand) => (
            <div key={brand.id} className="relative">
              <Link
                href={`/shop/brand/${brand.id}`}
                className="block relative overflow-hidden rounded-[20px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm border border-slate-500/30"
              >
                {/* Metallic shine overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>

                <div className="relative h-[200px]">
                  <Image
                    src={brand.productImage}
                    alt={`${brand.name} Products`}
                    fill
                    className="object-cover transition-all duration-300 opacity-80"
                    sizes="20vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-800/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
                    <div className="relative h-8 w-16 mb-2">
                      <Image
                        src={brand.logo}
                        alt={`${brand.name} Logo`}
                        fill
                        className={`object-contain drop-shadow-md ${
                          brand.id === "chicago-pneumatic" ||
                          brand.id === "gearwrench" ||
                          brand.id === "ingersoll-rand" ||
                          brand.id === "stahlwille" ||
                          brand.id === "warren-brown"
                            ? "scale-150"
                            : ""
                        }`}
                        sizes="64px"
                      />
                    </div>
                    <h3 className="text-white text-[18px] font-bold font-['Poppins'] mb-2">{brand.name}</h3>
                    {/* Metallic brand badge */}
                    <div className="relative inline-block">
                      <div
                        className={`bg-gradient-to-br ${brand.metallicGradient} text-white px-3 py-1 rounded-full text-[12px] font-semibold border-2 border-white/20`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-full"></div>
                        <span className="relative z-10">{brand.productCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>

        {/* View All Products Button */}
        <div className="mt-6 sm:mt-8 text-center">
          <Link
            href="/shop"
            className="relative inline-block bg-gradient-to-br from-red-600 via-red-700 to-red-800 text-white px-6 py-3 sm:px-8 sm:py-4 rounded-full text-[14px] sm:text-[16px] lg:text-[18px] font-bold shadow-[0_8px_32px_rgba(239,68,68,0.4)] border-2 border-red-400/30"
          >
            {/* Metallic shine effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-full"></div>
            <span className="relative z-10">View All Products</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
