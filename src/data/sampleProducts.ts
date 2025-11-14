// Sample Products data for Tools Australia
export interface ProductData {
  id: string;
  name: string;
  description: string;
  price: number;
  brand: string;
  category: string;
  images: string[];
  stock: number;
  specifications: Record<string, string | number>;
  features: string[];
  isPopular?: boolean;
  isNew?: boolean;
  isFeatured?: boolean;
  rating?: number;
  reviews?: Array<{
    rating: number;
    comment: string;
    reviewer: string;
    date: string;
  }>;
}

export const sampleProducts: ProductData[] = [
  {
    id: "prod1",
    name: "Professional Drill Kit Complete Set",
    description: "Complete professional-grade drill kit suitable for heavy construction work",
    price: 399,
    brand: "DeWalt",
    category: "power-tools",
    images: ["/images/sample-drill-1.jpg", "/images/sample-drill-2.jpg"],
    stock: 50,
    specifications: {
      power: "18V",
      batteryLife: "4-6 hours",
      weight: "2.3kg",
      noiseLevel: "85db",
    },
    features: ["Cordless", "Variable Speed", "LED Light", "Ergonomic Handle"],
    isPopular: true,
    isNew: false,
    isFeatured: false,
    rating: 4.8,
    reviews: [],
  },
  {
    id: "prod2",
    name: "Multi-Value Electric Hammer",
    description: "Heavy-duty electric hammer for masonry and concrete work",
    price: 179,
    brand: "Kincrome",
    category: "hand-tools",
    images: ["/images/sample-hammer.jpg"],
    stock: 35,
    specifications: {
      power: "1200W",
      impactFrequency: "4500bpm",
      impactEnergy: "9J",
      voltage: "240V",
    },
    features: ["Anti-vibration", "Prism handle", "Heavy-duty construction", "Ergonomic design"],
    isPopular: true,
    isNew: false,
    isFeatured: false,
    rating: 4.6,
    reviews: [],
  },
  {
    id: "prod3",
    name: "Digital Spirit Level 600mm",
    description: "Professional high precision digital magnetic spirit level with internal memory",
    price: 89,
    brand: "Sidchrome",
    category: "measuring",
    images: ["/images/sample-level.jpg"],
    stock: 100,
    specifications: {
      length: "600mm",
      accuracy: "0.1°",
      memory: "Points 99",
      display: "Digital",
    },
    features: ["Memory storage", "Dual virtual vial", "Magnetic lug", "Battery powered"],
    isPopular: false,
    isNew: true,
    isFeatured: false,
    rating: 4.7,
    reviews: [],
  },
];




