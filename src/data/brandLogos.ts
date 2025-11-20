export interface BrandLogo {
  id: string;
  name: string;
  logo: string;
  gradient: string;
  imageScale?: number;
  splitGradient?: boolean;
  hasOverlay?: boolean;
}

export const brandLogos: BrandLogo[] = [
  {
    id: "sidchrome",
    name: "SIDCHROME",
    logo: "/images/brands/sidchrome.png",
    gradient: "from-red-800 via-red-700 to-red-900",
    imageScale: 1,
  },
  {
    id: "milwaukee",
    name: "Milwaukee",
    logo: "/images/brands/milwaukee.png",
    gradient: "from-red-600 via-red-500 to-red-700",
    imageScale: 1.5,
  },
  {
    id: "makita",
    name: "Makita",
    logo: "/images/brands/Makita-red.png",
    gradient: "from-makita-500 via-makita-600 to-makita-700", // Makita brand gradient
    imageScale: 1.5,
  },
  {
    id: "kincrome",
    name: "KINCROME",
    logo: "/images/brands/kincrome.png",
    gradient: "from-blue-700 via-blue-600 to-blue-800",
    imageScale: 1,
  },
  {
    id: "dewalt",
    name: "DEWALT",
    logo: "/images/brands/dewalt-black.png",
    gradient: "from-yellow-500 via-yellow-600 to-amber-600",
    imageScale: 1,
    hasOverlay: true,
  },
  {
    id: "chicago-pneumatic",
    name: "Chicago Pneumatic",
    logo: "/images/brands/chicagoPneumatic.png",
    gradient: "from-gray-900 via-gray-800 to-black",
    imageScale: 2.5,
    hasOverlay: true,
  },
  {
    id: "gearwrench",
    name: "GearWrench",
    logo: "/images/brands/gearWrench.png",
    gradient: "from-gray-900 via-gray-800 to-black",
    imageScale: 2.5,
    hasOverlay: true,
  },
  {
    id: "ingersoll-rand",
    name: "Ingersoll Rand",
    logo: "/images/brands/Ingersoll-Rand.png",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
    imageScale: 2.5,
    hasOverlay: true,
  },
  {
    id: "knipex",
    name: "Knipex",
    logo: "/images/brands/knipex.png",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
    imageScale: 1.5,
    hasOverlay: true,
  },
  {
    id: "koken",
    name: "Koken",
    logo: "/images/brands/koken.png",
    gradient: "from-gray-700 via-gray-600 to-gray-800",
    imageScale: 1,
    hasOverlay: true,
  },
  {
    id: "mitutoyo",
    name: "Mitutoyo",
    logo: "/images/brands/mitutoyo.webp",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
    imageScale: 1.5,
    hasOverlay: true,
  },
  {
    id: "stahlwille",
    name: "Stahlwille",
    logo: "/images/brands/stahlwille.png",
    gradient: "from-green-900 from-0% via-green-800 via-50% to-gray-900 to-50%",
    imageScale: 1,
    splitGradient: true,
    hasOverlay: true,
  },
  {
    id: "warren-brown",
    name: "Warren & Brown",
    logo: "/images/brands/warrenBrown.png",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
    imageScale: 3.5,
    hasOverlay: true,
  },
];
