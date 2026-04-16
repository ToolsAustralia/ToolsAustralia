export interface BrandLogo {
  id: string;
  name: string;
  logo: string;
  gradient: string;
  gradientDirection?: "r" | "l" | "t" | "b" | "tl" | "tr" | "bl" | "br";
  imageScale?: number;
  imageScaleSm?: number;
  imageScaleMd?: number;
  imageScaleLg?: number;
  splitGradient?: boolean;
  splitOrientation?: "horizontal" | "vertical";
  hasOverlay?: boolean;
  textClass?: string;
  overlayScale?: number;
}

export type BrandId = (typeof brandLogos)[number]["id"];

export const brandLogos: BrandLogo[] = [
  {
    id: "sidchrome",
    name: "SIDCHROME",
    logo: "/images/brands/sidchrome.webp",
    gradient: "from-red-800 via-red-700 to-red-900",
    imageScale: 1,
    imageScaleSm: 1.4,
    imageScaleMd: 1.4,
    imageScaleLg: 1.4,
    textClass: "text-white",
  },
  {
    id: "milwaukee",
    name: "Milwaukee",
    logo: "/images/brands/milwaukee.webp",
    gradient: "from-red-600 via-red-500 to-red-700",
    imageScale: 1.5,
    imageScaleSm: 1.5,
    imageScaleMd: 1.5,
    imageScaleLg: 1.5,
    textClass: "text-white",
  },
  {
    id: "makita",
    name: "Makita",
    logo: "/images/brands/Makita-red.webp",
    gradient: "from-makita-500 via-makita-600 to-makita-700", // Makita brand gradient
    imageScale: 1.0,
    imageScaleSm: 1.4,
    imageScaleMd: 1.4,
    imageScaleLg: 1.4,
    textClass: "text-white",
  },
  {
    id: "kincrome",
    name: "KINCROME",
    logo: "/images/brands/kincrome.webp",
    gradient: "from-blue-700 via-blue-600 to-blue-800",
    imageScale: 0.9,
    imageScaleSm: 1.4,
    imageScaleMd: 1.4,
    imageScaleLg: 1.4,
    textClass: "text-white",
  },
  {
    id: "dewalt",
    name: "DEWALT",
    logo: "/images/brands/dewalt-black.webp",
    gradient: "from-yellow-500 via-yellow-600 to-amber-600",
    imageScale: 1,
    imageScaleSm: 1.4,
    imageScaleMd: 1.4,
    imageScaleLg: 1.4,
    hasOverlay: true,
    textClass: "text-gray-900",
  },
  {
    id: "chicago-pneumatic",
    name: "Chicago Pneumatic",
    logo: "/images/brands/chicagoPneumatic.webp",
    gradient: "from-gray-900 via-gray-800 to-black",
    imageScale: 2.0,
    imageScaleSm: 2.5,
    imageScaleMd: 2.5,
    imageScaleLg: 2.5,
    hasOverlay: true,
    textClass: "text-white",
    overlayScale: 1.0,
  },
  {
    id: "gearwrench",
    name: "GearWrench",
    logo: "/images/brands/gearWrench.webp",
    gradient: "from-gray-900 via-gray-800 to-black",
    imageScale: 2.5,
    imageScaleSm: 3.0,
    imageScaleMd: 3.0,
    imageScaleLg: 3.0,
    hasOverlay: true,
    textClass: "text-white",
  },
  {
    id: "ingersoll-rand",
    name: "Ingersoll Rand",
    logo: "/images/brands/Ingersoll-Rand.webp",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
    imageScale: 2.5,
    imageScaleSm: 3.1,
    imageScaleMd: 3.1,
    imageScaleLg: 3.1,
    hasOverlay: true,
    textClass: "text-gray-900",
    overlayScale: 1.0,
  },
  {
    id: "knipex",
    name: "Knipex",
    logo: "/images/brands/knipex.webp",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
    imageScale: 1.2,
    imageScaleSm: 1.5,
    imageScaleMd: 1.5,
    imageScaleLg: 1.5,
    hasOverlay: true,
    textClass: "text-gray-900",
  },
  {
    id: "koken",
    name: "Koken",
    logo: "/images/brands/koken.webp",
    gradient: "from-gray-700 via-gray-600 to-gray-800",
    imageScale: 1.2,
    imageScaleSm: 1.2,
    imageScaleMd: 1.2,
    imageScaleLg: 1.2,
    hasOverlay: true,
    textClass: "text-white",
  },
  {
    id: "mitutoyo",
    name: "Mitutoyo",
    logo: "/images/brands/mitutoyo.webp",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
    imageScale: 1.3,
    imageScaleSm: 1.6,
    imageScaleMd: 1.6,
    imageScaleLg: 1.6,
    hasOverlay: true,
    textClass: "text-gray-900",
  },
  {
    id: "stahlwille",
    name: "Stahlwille",
    logo: "/images/brands/stahlwille.webp",
    gradient: "bg-[linear-gradient(to_bottom,#111827_0%,#111827_55%,#064e3b_55%,#064e3b_100%)]",
    imageScale: 1,
    imageScaleSm: 1.4,
    imageScaleMd: 1.4,
    imageScaleLg: 1.4,
    splitGradient: true,
    hasOverlay: true,
    textClass: "text-white",
    splitOrientation: "vertical",
  },
  {
    id: "warren-brown",
    name: "Warren & Brown",
    logo: "/images/brands/warrenBrown.webp",
    gradient: "from-gray-100 via-gray-200 to-gray-300",
    imageScale: 2.5,
    imageScaleSm: 3.1,
    imageScaleMd: 3.5,
    imageScaleLg: 3.8,
    hasOverlay: true,
    textClass: "text-gray-900",
    overlayScale: 0.8,
  },
];
