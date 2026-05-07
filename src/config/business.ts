// src/config/business.ts
export const BUSINESS = {
  legalName: "Tools Australia Pty Ltd",
  abn: "54 690 397 061",
  acn: "690 397 061",
  license: "TP/04720",
  address: {
    line1: "6A Aylesbury Crescent",
    suburb: "Gladstone Park",
    state: "VIC",
    postcode: "3043",
    country: "Australia",
  },
  shop: {
    freeShippingThreshold: 100, // dollars (AUD)
    flatShippingRate: 10,        // dollars (AUD)
  },
} as const;

export type BusinessConfig = typeof BUSINESS;
