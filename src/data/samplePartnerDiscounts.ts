// Sample partner discounts data for development/demo purposes
// This replaces database calls for development/demo purposes

export interface SamplePartnerDiscount {
  _id: string;
  name: string;
  brand: string;
  description: string;
  discountPercent: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom: Date;
  validTo: Date;
  isActive: boolean;
  applicableCategories?: string[];
  imageUrl?: string;
  termsAndConditions?: string;
  createdAt: Date;
}

// Sample partner discounts data
export const samplePartnerDiscounts: SamplePartnerDiscount[] = [
  // DeWalt Partner Discounts
  {
    _id: "dewalt-discount-001",
    name: "DeWalt Professional Tools Discount",
    brand: "DeWalt",
    description: "Get exclusive discounts on DeWalt professional power tools and accessories.",
    discountPercent: 15,
    minPurchaseAmount: 100,
    maxDiscountAmount: 500,
    validFrom: new Date("2024-01-01T00:00:00Z"),
    validTo: new Date("2024-12-31T23:59:59Z"),
    isActive: true,
    applicableCategories: ["Power Tools", "Drills", "Saws", "Accessories"],
    imageUrl: "/images/brands/dewalt.png",
    termsAndConditions:
      "Valid on DeWalt branded products only. Cannot be combined with other offers. Minimum purchase of $100 required.",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  },

  {
    _id: "dewalt-discount-002",
    name: "DeWalt Battery & Charger Special",
    brand: "DeWalt",
    description: "Special pricing on DeWalt batteries and chargers for your power tools.",
    discountPercent: 20,
    minPurchaseAmount: 50,
    maxDiscountAmount: 200,
    validFrom: new Date("2024-01-15T00:00:00Z"),
    validTo: new Date("2024-03-15T23:59:59Z"),
    isActive: true,
    applicableCategories: ["Batteries", "Chargers", "Power Tool Accessories"],
    imageUrl: "/images/brands/dewalt.png",
    termsAndConditions: "Valid on DeWalt batteries and chargers only. Limited time offer.",
    createdAt: new Date("2024-01-15T00:00:00Z"),
  },

  // Milwaukee Partner Discounts
  {
    _id: "milwaukee-discount-001",
    name: "Milwaukee M18 FUEL Discount",
    brand: "Milwaukee",
    description: "Exclusive discount on Milwaukee M18 FUEL brushless tools and accessories.",
    discountPercent: 12,
    minPurchaseAmount: 150,
    maxDiscountAmount: 400,
    validFrom: new Date("2024-01-01T00:00:00Z"),
    validTo: new Date("2024-12-31T23:59:59Z"),
    isActive: true,
    applicableCategories: ["Power Tools", "M18 FUEL", "REDLITHIUM"],
    imageUrl: "/images/brands/milwaukee.png",
    termsAndConditions: "Valid on Milwaukee M18 FUEL products only. Cannot be combined with other offers.",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  },

  {
    _id: "milwaukee-discount-002",
    name: "Milwaukee Hand Tools Special",
    brand: "Milwaukee",
    description: "Great deals on Milwaukee hand tools and measuring equipment.",
    discountPercent: 18,
    minPurchaseAmount: 75,
    maxDiscountAmount: 150,
    validFrom: new Date("2024-01-10T00:00:00Z"),
    validTo: new Date("2024-04-10T23:59:59Z"),
    isActive: true,
    applicableCategories: ["Hand Tools", "Measuring Tools", "Tool Storage"],
    imageUrl: "/images/brands/milwaukee.png",
    termsAndConditions: "Valid on Milwaukee hand tools only. Limited time offer.",
    createdAt: new Date("2024-01-10T00:00:00Z"),
  },

  // Makita Partner Discounts
  {
    _id: "makita-discount-001",
    name: "Makita LXT Cordless Tools",
    brand: "Makita",
    description: "Special pricing on Makita LXT cordless tool system and accessories.",
    discountPercent: 10,
    minPurchaseAmount: 120,
    maxDiscountAmount: 300,
    validFrom: new Date("2024-01-01T00:00:00Z"),
    validTo: new Date("2024-12-31T23:59:59Z"),
    isActive: true,
    applicableCategories: ["Power Tools", "LXT Cordless", "Batteries"],
    imageUrl: "/images/brands/Makita-red.png",
    termsAndConditions: "Valid on Makita LXT products only. Cannot be combined with other offers.",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  },

  {
    _id: "makita-discount-002",
    name: "Makita Accessories Bundle",
    brand: "Makita",
    description: "Bundle discounts on Makita tool accessories and consumables.",
    discountPercent: 25,
    minPurchaseAmount: 40,
    maxDiscountAmount: 100,
    validFrom: new Date("2024-01-20T00:00:00Z"),
    validTo: new Date("2024-02-20T23:59:59Z"),
    isActive: true,
    applicableCategories: ["Accessories", "Consumables", "Blades", "Bits"],
    imageUrl: "/images/brands/Makita-red.png",
    termsAndConditions: "Valid on Makita accessories only. Limited time offer.",
    createdAt: new Date("2024-01-20T00:00:00Z"),
  },

  // Kincrome Partner Discounts
  {
    _id: "kincrome-discount-001",
    name: "Kincrome Professional Tools",
    brand: "Kincrome",
    description: "Exclusive discount on Kincrome professional hand tools and storage solutions.",
    discountPercent: 20,
    minPurchaseAmount: 80,
    maxDiscountAmount: 250,
    validFrom: new Date("2024-01-01T00:00:00Z"),
    validTo: new Date("2024-12-31T23:59:59Z"),
    isActive: true,
    applicableCategories: ["Hand Tools", "Tool Storage", "Professional Tools"],
    imageUrl: "/images/brands/kincrome.png",
    termsAndConditions: "Valid on Kincrome products only. Lifetime warranty applies.",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  },

  {
    _id: "kincrome-discount-002",
    name: "Kincrome Socket Sets Special",
    brand: "Kincrome",
    description: "Special pricing on Kincrome socket sets and wrench collections.",
    discountPercent: 15,
    minPurchaseAmount: 60,
    maxDiscountAmount: 180,
    validFrom: new Date("2024-01-05T00:00:00Z"),
    validTo: new Date("2024-03-05T23:59:59Z"),
    isActive: true,
    applicableCategories: ["Socket Sets", "Wrenches", "Hand Tools"],
    imageUrl: "/images/brands/kincrome.png",
    termsAndConditions: "Valid on Kincrome socket sets only. Professional quality guarantee.",
    createdAt: new Date("2024-01-05T00:00:00Z"),
  },

  // Sidchrome Partner Discounts
  {
    _id: "sidchrome-discount-001",
    name: "Sidchrome Professional Range",
    brand: "Sidchrome",
    description: "Exclusive discount on Sidchrome professional tool sets and individual tools.",
    discountPercent: 18,
    minPurchaseAmount: 100,
    maxDiscountAmount: 400,
    validFrom: new Date("2024-01-01T00:00:00Z"),
    validTo: new Date("2024-12-31T23:59:59Z"),
    isActive: true,
    applicableCategories: ["Tool Sets", "Professional Tools", "Hand Tools"],
    imageUrl: "/images/brands/sidchrome.png",
    termsAndConditions: "Valid on Sidchrome professional range only. Australian made quality.",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  },

  // Expired Discounts (for demo purposes)
  {
    _id: "expired-discount-001",
    name: "Black Friday DeWalt Special",
    brand: "DeWalt",
    description: "Black Friday special pricing on DeWalt tools (Expired).",
    discountPercent: 30,
    minPurchaseAmount: 200,
    maxDiscountAmount: 600,
    validFrom: new Date("2023-11-24T00:00:00Z"),
    validTo: new Date("2023-11-26T23:59:59Z"),
    isActive: false,
    applicableCategories: ["Power Tools", "All DeWalt Products"],
    imageUrl: "/images/brands/dewalt.png",
    termsAndConditions: "Valid on Black Friday weekend only. Limited time offer.",
    createdAt: new Date("2023-11-24T00:00:00Z"),
  },
];

// Helper functions
export const getActivePartnerDiscounts = (): SamplePartnerDiscount[] => {
  const now = new Date();
  return samplePartnerDiscounts.filter(
    (discount) => discount.isActive && discount.validFrom <= now && discount.validTo > now
  );
};

export const getPartnerDiscountsByBrand = (brand: string): SamplePartnerDiscount[] => {
  const now = new Date();
  return samplePartnerDiscounts.filter(
    (discount) =>
      discount.brand.toLowerCase() === brand.toLowerCase() &&
      discount.isActive &&
      discount.validFrom <= now &&
      discount.validTo > now
  );
};

export const getPartnerDiscountsByCategory = (category: string): SamplePartnerDiscount[] => {
  const now = new Date();
  return samplePartnerDiscounts.filter(
    (discount) =>
      discount.applicableCategories?.includes(category) &&
      discount.isActive &&
      discount.validFrom <= now &&
      discount.validTo > now
  );
};

export const getPartnerDiscountById = (id: string): SamplePartnerDiscount | undefined => {
  return samplePartnerDiscounts.find((discount) => discount._id === id);
};

export const getExpiredPartnerDiscounts = (): SamplePartnerDiscount[] => {
  const now = new Date();
  return samplePartnerDiscounts.filter((discount) => !discount.isActive || discount.validTo <= now);
};

export const getAllPartnerDiscounts = (): SamplePartnerDiscount[] => {
  return samplePartnerDiscounts;
};
