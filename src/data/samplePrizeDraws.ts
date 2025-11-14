// Sample Mini Draws data for Tools Australia
export interface MiniDrawData {
  id: string;
  name: string;
  description: string;
  prize: {
    name: string;
    description: string;
    value: number;
    images: string[];
    category: string;
    specifications: Record<string, string | number>;
    brand?: string;
    model?: string;
    condition?: string;
    warranty?: string;
    delivery?: {
      method: string;
      timeframe: string;
      restrictions?: string;
    };
    terms?: string[];
  };
  ticketPrice: number;
  maximumTickets: number;
  totalTickets?: number;
  soldTickets?: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  maxEntriesPerPurchaser?: number;
  category: string;
  tickets?: Array<{
    ticketNumber: string;
    userId?: string;
    purchaseDate: string;
    source?: string;
    isWinner?: boolean;
  }>;
  winner?: {
    userId: string;
    ticketNumber: string;
    selectedDate: string;
    notified: boolean;
  };
}

// Helper function to generate start date (now) and end date (7-28 days from now)
function getStartDate(): string {
  return new Date().toISOString();
}

function getEndDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString();
}

export const sampleMiniDraws: MiniDrawData[] = [
  {
    id: "draw1",
    name: "DeWalt Professional Tool Collection",
    description:
      "Enter to win an amazing collection of professional DeWalt power tools! This premium collection includes drills, impact drivers, saws, and more. Perfect for professional tradespeople and serious DIY enthusiasts.",
    prize: {
      name: "DeWalt Professional Tool Collection",
      description:
        "Complete set of professional DeWalt power tools including drill, impact driver, circular saw, and accessories",
      value: 2500,
      images: [
        "/images/SampleProducts/dewalt1.jpg",
        "/images/SampleProducts/dewalt2.jpg",
        "/images/SampleProducts/dewalttools.png",
      ],
      category: "Power Tools",
      specifications: {
        count: "12 tools",
        weight: "35kg",
        warranty: "3 years",
        condition: "New",
        voltage: "18V",
        batteryLife: "4-6 hours",
      },
      brand: "DeWalt",
      delivery: {
        method: "Direct shipping to winner",
        timeframe: "7-14 business days",
        restrictions: "Australia only",
      },
      terms: [
        "Winner must claim prize within 30 days",
        "Valid Australian address required",
        "Prize transferable to family member",
        "No cash alternative available",
      ],
    },
    ticketPrice: 15,
    maximumTickets: 1000,
    totalTickets: 1000,
    soldTickets: 320,
    startDate: getStartDate(),
    endDate: getEndDate(21),
    isActive: true,
    maxEntriesPerPurchaser: 10,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw2",
    name: "Makita Cordless Drill Set",
    description:
      "Win a premium Makita cordless drill set with multiple batteries and accessories. This versatile kit is perfect for both professional and home use.",
    prize: {
      name: "Makita Cordless Drill Set",
      description: "Complete cordless drill set with 2 batteries, charger, and comprehensive accessory kit",
      value: 450,
      images: [
        "/images/SampleProducts/makita1.jpg",
        "/images/SampleProducts/makita2.png",
        "/images/SampleProducts/makitatools.jpg",
      ],
      category: "Power Tools",
      specifications: {
        power: "18V",
        voltage: "240V",
        warranty: "3 years",
        condition: "New",
        batteryCount: "2",
        weight: "2.1kg",
      },
      brand: "Makita",
      delivery: {
        method: "Free shipping nationwide",
        timeframe: "5-7 business days",
        restrictions: "Residential only",
      },
    },
    ticketPrice: 8,
    maximumTickets: 500,
    totalTickets: 500,
    soldTickets: 180,
    startDate: getStartDate(),
    endDate: getEndDate(24),
    isActive: true,
    maxEntriesPerPurchaser: 15,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw3",
    name: "Milwaukee Heavy Duty Kit",
    description:
      "Enter for a chance to win this professional Milwaukee tool kit. Built for the toughest jobs with superior durability and performance.",
    prize: {
      name: "Milwaukee Heavy Duty Kit",
      description: "Professional Milwaukee tool kit with impact driver, drill, and premium accessories",
      value: 680,
      images: [
        "/images/SampleProducts/milwaukee1.jpg",
        "/images/SampleProducts/milwaukee2.jpg",
        "/images/SampleProducts/milwaukeetools.png",
      ],
      category: "Power Tools",
      specifications: {
        power: "18V",
        torque: "203 Nm",
        warranty: "5 years",
        condition: "New",
        batteryLife: "6-8 hours",
        weight: "2.8kg",
      },
      brand: "Milwaukee",
      delivery: {
        method: "Express shipping",
        timeframe: "3-5 business days",
        restrictions: "Metro areas only",
      },
    },
    ticketPrice: 12,
    maximumTickets: 750,
    totalTickets: 750,
    soldTickets: 245,
    startDate: getStartDate(),
    endDate: getEndDate(28),
    isActive: true,
    maxEntriesPerPurchaser: 12,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw4",
    name: "Kincrome Professional Set",
    description:
      "Win this comprehensive Kincrome professional tool set. Australian-made quality tools designed for Australian conditions.",
    prize: {
      name: "Kincrome Professional Set",
      description: "Complete Kincrome professional tool set with hand tools, power tools, and storage case",
      value: 380,
      images: [
        "/images/SampleProducts/kincrome1.jpg",
        "/images/SampleProducts/kincrome2.jpg",
        "/images/SampleProducts/kincrometools.jpg",
      ],
      category: "Hand Tools",
      specifications: {
        count: "25 pieces",
        warranty: "Lifetime",
        condition: "New",
        weight: "8.5kg",
        material: "Chrome vanadium steel",
      },
      brand: "Kincrome",
      delivery: {
        method: "Standard shipping",
        timeframe: "7-10 business days",
        restrictions: "Australia wide",
      },
    },
    ticketPrice: 6,
    maximumTickets: 600,
    totalTickets: 600,
    soldTickets: 95,
    startDate: getStartDate(),
    endDate: getEndDate(22),
    isActive: true,
    maxEntriesPerPurchaser: 20,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw5",
    name: "Sidchrome Precision Tools",
    description:
      "Enter to win this premium Sidchrome precision tool collection. Perfect for mechanics and precision work.",
    prize: {
      name: "Sidchrome Precision Tools",
      description: "Professional Sidchrome precision tool set with ratchets, sockets, and specialty tools",
      value: 520,
      images: ["/images/SampleProducts/sidchrome1.jpg"],
      category: "Hand Tools",
      specifications: {
        count: "40 pieces",
        warranty: "Lifetime",
        condition: "New",
        weight: "12kg",
        finish: "Chrome plated",
      },
      brand: "Sidchrome",
      delivery: {
        method: "Secure shipping",
        timeframe: "5-8 business days",
        restrictions: "Signature required",
      },
    },
    ticketPrice: 10,
    maximumTickets: 400,
    totalTickets: 400,
    soldTickets: 78,
    startDate: getStartDate(),
    endDate: getEndDate(26),
    isActive: true,
    maxEntriesPerPurchaser: 8,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw6",
    name: "DeWalt Impact Driver Pro",
    description:
      "Win this powerful DeWalt impact driver designed for heavy-duty applications. Perfect for construction and automotive work.",
    prize: {
      name: "DeWalt Impact Driver Pro",
      description: "Professional-grade impact driver with brushless motor and advanced torque control",
      value: 320,
      images: ["/images/SampleProducts/dewalt1.jpg"],
      category: "Power Tools",
      specifications: {
        power: "18V",
        torque: "150 Nm",
        warranty: "3 years",
        condition: "New",
        weight: "1.4kg",
        batteryLife: "3-4 hours",
      },
      brand: "DeWalt",
      delivery: {
        method: "Express shipping",
        timeframe: "2-3 business days",
        restrictions: "Metro areas only",
      },
    },
    ticketPrice: 7,
    maximumTickets: 350,
    totalTickets: 350,
    soldTickets: 45,
    startDate: getStartDate(),
    endDate: getEndDate(23),
    isActive: true,
    maxEntriesPerPurchaser: 12,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw7",
    name: "DeWalt Circular Saw Kit",
    description:
      "Enter to win this professional DeWalt circular saw with precision cutting capabilities. Ideal for carpentry and construction.",
    prize: {
      name: "DeWalt Circular Saw Kit",
      description: "Heavy-duty circular saw with laser guide and dust collection system",
      value: 280,
      images: ["/images/SampleProducts/dewalt2.jpg"],
      category: "Power Tools",
      specifications: {
        power: "18V",
        bladeSize: "165mm",
        warranty: "3 years",
        condition: "New",
        weight: "3.2kg",
        features: "Laser guide, dust collection",
      },
      brand: "DeWalt",
      delivery: {
        method: "Standard shipping",
        timeframe: "5-7 business days",
        restrictions: "Australia wide",
      },
    },
    ticketPrice: 6,
    maximumTickets: 400,
    totalTickets: 400,
    soldTickets: 67,
    startDate: getStartDate(),
    endDate: getEndDate(25),
    isActive: true,
    maxEntriesPerPurchaser: 15,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw8",
    name: "DeWalt Complete Tool Set",
    description:
      "Win this comprehensive DeWalt tool collection featuring multiple power tools and accessories. Perfect for professional tradespeople.",
    prize: {
      name: "DeWalt Complete Tool Set",
      description:
        "Complete professional tool set with drill, impact driver, circular saw, and comprehensive accessories",
      value: 1200,
      images: ["/images/SampleProducts/dewalttools.png"],
      category: "Power Tools",
      specifications: {
        count: "8 tools",
        warranty: "3 years",
        condition: "New",
        weight: "25kg",
        voltage: "18V",
        batteryCount: "2",
      },
      brand: "DeWalt",
      delivery: {
        method: "Freight shipping",
        timeframe: "7-10 business days",
        restrictions: "Australia wide",
      },
    },
    ticketPrice: 12,
    maximumTickets: 800,
    totalTickets: 800,
    soldTickets: 156,
    startDate: getStartDate(),
    endDate: getEndDate(27),
    isActive: true,
    maxEntriesPerPurchaser: 8,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw9",
    name: "Makita Cordless Drill",
    description:
      "Enter to win this reliable Makita cordless drill with long-lasting battery life. Perfect for both professional and DIY use.",
    prize: {
      name: "Makita Cordless Drill",
      description: "High-performance cordless drill with brushless motor and LED work light",
      value: 220,
      images: ["/images/SampleProducts/makita1.jpg"],
      category: "Power Tools",
      specifications: {
        power: "18V",
        chuckSize: "13mm",
        warranty: "3 years",
        condition: "New",
        weight: "1.8kg",
        batteryLife: "4-5 hours",
      },
      brand: "Makita",
      delivery: {
        method: "Standard shipping",
        timeframe: "5-7 business days",
        restrictions: "Australia wide",
      },
    },
    ticketPrice: 5,
    maximumTickets: 300,
    totalTickets: 300,
    soldTickets: 89,
    startDate: getStartDate(),
    endDate: getEndDate(28),
    isActive: true,
    maxEntriesPerPurchaser: 20,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw10",
    name: "Makita Impact Driver",
    description:
      "Win this powerful Makita impact driver designed for fastening applications. Built for durability and performance.",
    prize: {
      name: "Makita Impact Driver",
      description: "Professional impact driver with variable speed control and ergonomic design",
      value: 190,
      images: ["/images/SampleProducts/makita2.png"],
      category: "Power Tools",
      specifications: {
        power: "18V",
        torque: "140 Nm",
        warranty: "3 years",
        condition: "New",
        weight: "1.2kg",
        features: "Variable speed, LED light",
      },
      brand: "Makita",
      delivery: {
        method: "Express shipping",
        timeframe: "3-5 business days",
        restrictions: "Metro areas only",
      },
    },
    ticketPrice: 4,
    maximumTickets: 250,
    totalTickets: 250,
    soldTickets: 34,
    startDate: getStartDate(),
    endDate: getEndDate(28),
    isActive: true,
    maxEntriesPerPurchaser: 25,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw11",
    name: "Makita Tool Collection",
    description:
      "Enter to win this premium Makita tool collection featuring multiple cordless tools and accessories. Perfect for professional use.",
    prize: {
      name: "Makita Tool Collection",
      description: "Complete Makita tool collection with drill, impact driver, and comprehensive accessory set",
      value: 750,
      images: ["/images/SampleProducts/makitatools.jpg"],
      category: "Power Tools",
      specifications: {
        count: "6 tools",
        warranty: "3 years",
        condition: "New",
        weight: "18kg",
        voltage: "18V",
        batteryCount: "2",
      },
      brand: "Makita",
      delivery: {
        method: "Freight shipping",
        timeframe: "7-10 business days",
        restrictions: "Australia wide",
      },
    },
    ticketPrice: 10,
    maximumTickets: 600,
    totalTickets: 600,
    soldTickets: 123,
    startDate: getStartDate(),
    endDate: getEndDate(28),
    isActive: true,
    maxEntriesPerPurchaser: 10,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw12",
    name: "Milwaukee Drill Driver",
    description:
      "Win this high-performance Milwaukee drill driver with advanced features. Built for professional tradespeople.",
    prize: {
      name: "Milwaukee Drill Driver",
      description: "Professional drill driver with brushless motor and advanced electronics",
      value: 350,
      images: ["/images/SampleProducts/milwaukee1.jpg"],
      category: "Power Tools",
      specifications: {
        power: "18V",
        chuckSize: "13mm",
        warranty: "5 years",
        condition: "New",
        weight: "2.0kg",
        batteryLife: "5-6 hours",
      },
      brand: "Milwaukee",
      delivery: {
        method: "Express shipping",
        timeframe: "2-3 business days",
        restrictions: "Metro areas only",
      },
    },
    ticketPrice: 8,
    maximumTickets: 450,
    totalTickets: 450,
    soldTickets: 78,
    startDate: getStartDate(),
    endDate: getEndDate(28),
    isActive: true,
    maxEntriesPerPurchaser: 15,
    category: "tools",
    tickets: [],
  },
  {
    id: "draw13",
    name: "Milwaukee Impact Wrench",
    description:
      "Enter to win this powerful Milwaukee impact wrench designed for automotive and heavy-duty applications.",
    prize: {
      name: "Milwaukee Impact Wrench",
      description: "Heavy-duty impact wrench with high torque output and durable construction",
      value: 420,
      images: ["/images/SampleProducts/milwaukee2.jpg"],
      category: "Power Tools",
      specifications: {
        power: "18V",
        torque: "450 Nm",
        warranty: "5 years",
        condition: "New",
        weight: "2.5kg",
        features: "High torque, LED light",
      },
      brand: "Milwaukee",
      delivery: {
        method: "Express shipping",
        timeframe: "3-5 business days",
        restrictions: "Metro areas only",
      },
    },
    ticketPrice: 9,
    maximumTickets: 500,
    totalTickets: 500,
    soldTickets: 92,
    startDate: getStartDate(),
    endDate: getEndDate(28),
    isActive: true,
    maxEntriesPerPurchaser: 12,
    category: "tools",
    tickets: [],
  },
];
