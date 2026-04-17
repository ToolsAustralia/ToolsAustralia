/**
 * Canonical ordered list of partner brand offers for the Unlock Discounts grid.
 * Tier visibility uses the first N entries (see partner-catalog-visibility).
 */

export interface PartnerBrandOffer {
  id: string;
  name: string;
  logo: string;
  discount: string;
  discountMessage: string;
  gradient: string;
  businessLink: string;
}

export const PARTNER_BRAND_OFFERS: PartnerBrandOffer[] = [
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
    logo: "/images/partnerBrandLogos/SuperBad.webp",
    discount: "90% OFF",
    discountMessage: "Mention Tools Australia for 90% off your trial shoot",
    gradient: "from-red-900 via-red-800 to-amber-100",
    businessLink: "#", // Link to be provided later
  },
  {
    id: "multihub",
    name: "Multi Hub",
    logo: "/images/partnerBrandLogos/multiHub.webp",
    discount: "VIP PROMOS",
    discountMessage: "Mention Tools Australia for VIP promos",
    gradient: "from-pink-500 via-pink-600 to-fuchsia-600",
    businessLink: "#", // Link to be provided later
  },
  {
    id: "artc",
    name: "All Round Trade Constructions",
    logo: "/images/partnerBrandLogos/ARTC.webp",
    discount: "10% OFF",
    discountMessage: "Mention Tools Australia for 10% off quote",
    gradient: "from-gray-900 via-gray-800 to-black",
    businessLink: "https://www.facebook.com/share/16kRKXkcVa/?mibextid=wwXIfr",
  },
  {
    id: "sealmotors",
    name: "Seal Motors",
    logo: "/images/partnerBrandLogos/sealMotors.webp",
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
