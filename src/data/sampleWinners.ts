// Sample winners data for Tools Australia
export interface Winner {
  id: number;
  name: string;
  location: string;
  prize: string;
  value: number;
  date: string;
  image: string;
  membershipTier: "BOSS" | "FOREMAN" | "TRADIE" | "ULTIMATE";
  testimonial?: string;
}

// Top 5 recent winners for social proof
export const top5Winners: Winner[] = [
  {
    id: 1,
    name: "John Doe",
    location: "Sydney, NSW",
    prize: "DeWalt 20V Max Cordless Drill Kit",
    value: 299,
    date: "2024-01-15",
    image: "/images/SampleProducts/dewalt1.jpg",
    membershipTier: "BOSS",
    testimonial:
      "These guys are legends. I was the 25 grand winner and they are definitely legit! Really nice people and won't let you down!",
  },
  {
    id: 2,
    name: "Sarah Williams",
    location: "Melbourne, VIC",
    prize: "Milwaukee M18 Impact Driver Set",
    value: 449,
    date: "2024-01-10",
    image: "/images/SampleProducts/milwaukee1.jpg",
    membershipTier: "FOREMAN",
    testimonial:
      "Amazing experience! Won this incredible Milwaukee set and the delivery was super fast. Highly recommend joining!",
  },
  {
    id: 3,
    name: "David Chen",
    location: "Brisbane, QLD",
    prize: "Makita 18V Circular Saw",
    value: 389,
    date: "2024-01-05",
    image: "/images/SampleProducts/makita1.jpg",
    membershipTier: "TRADIE",
    testimonial: "Couldn't believe I won! The Makita saw is perfect for my workshop. Tools Australia is the real deal!",
  },
  {
    id: 4,
    name: "Emma Thompson",
    location: "Perth, WA",
    prize: "Kincrome Tool Set",
    value: 199,
    date: "2024-01-02",
    image: "/images/SampleProducts/kincrome1.jpg",
    membershipTier: "FOREMAN",
    testimonial: "Love my new Kincrome tools! Great quality and the team was so helpful throughout the process.",
  },
  {
    id: 5,
    name: "James Wilson",
    location: "Adelaide, SA",
    prize: "DeWalt Multi-Tool Kit",
    value: 259,
    date: "2023-12-28",
    image: "/images/SampleProducts/dewalt2.jpg",
    membershipTier: "BOSS",
    testimonial:
      "Professional service from start to finish. The DeWalt kit exceeded my expectations. Thank you Tools Australia!",
  },
];

// All recent winners (expanded list)
export const allRecentWinners: Winner[] = [
  ...top5Winners,
  {
    id: 6,
    name: "Lisa Anderson",
    location: "Hobart, TAS",
    prize: "Milwaukee Power Tools Bundle",
    value: 599,
    date: "2023-12-25",
    image: "/images/SampleProducts/milwaukee2.jpg",
    membershipTier: "ULTIMATE",
    testimonial: "Incredible prize bundle! The Milwaukee tools are top quality and have transformed my workshop.",
  },
  {
    id: 7,
    name: "Robert Taylor",
    location: "Darwin, NT",
    prize: "Makita Cordless Combo Kit",
    value: 329,
    date: "2023-12-20",
    image: "/images/SampleProducts/makita2.png",
    membershipTier: "FOREMAN",
    testimonial:
      "Fast delivery and excellent customer service. The Makita kit is exactly what I needed for my projects.",
  },
  {
    id: 8,
    name: "Jennifer Brown",
    location: "Gold Coast, QLD",
    prize: "Sidchrome Professional Socket Set",
    value: 179,
    date: "2023-12-18",
    image: "/images/SampleProducts/sidchrome1.jpg",
    membershipTier: "TRADIE",
    testimonial: "Great quality tools and even better customer experience. Will definitely be entering more draws!",
  },
];

// Helper function to get winners by membership tier
export const getWinnersByTier = (tier: Winner["membershipTier"]): Winner[] => {
  return allRecentWinners.filter((winner) => winner.membershipTier === tier);
};

// Helper function to get top winners by prize value
export const getTopWinnersByValue = (limit: number = 5): Winner[] => {
  return [...allRecentWinners].sort((a, b) => b.value - a.value).slice(0, limit);
};

// Helper function to get winners from specific date range
export const getWinnersByDateRange = (startDate: string, endDate: string): Winner[] => {
  return allRecentWinners.filter((winner) => {
    const winnerDate = new Date(winner.date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    return winnerDate >= start && winnerDate <= end;
  });
};
// Mini draw interface for mock functions
interface MiniDraw {
  id: string;
  name: string;
  description: string;
  prize: {
    name: string;
    value: number;
    images: string[];
  };
  endDate: string;
  isActive: boolean;
  winnerName?: string;
  winnerDate?: string;
}

// Mock functions for backward compatibility - in a real app these would come from database
export const getActiveMiniDraws = (): MiniDraw[] => {
  // Mock active mini draws data
  return [
    {
      id: "draw1",
      name: "Major Tool Draw",
      description: "Enter to win amazing power tools",
      prize: {
        name: "Professional Tool Collection",
        value: 2500,
        images: ["/images/sample-tool.jpg"],
      },
      endDate: "2024-02-15T23:59:59Z",
      isActive: true,
    },
    {
      id: "draw2",
      name: "Weekly Giveaway",
      description: "Weekly tool draw",
      prize: {
        name: "Electric Drill Set",
        value: 299,
        images: ["/images/sample-drill.jpg"],
      },
      endDate: "2024-02-10T23:59:59Z",
      isActive: true,
    },
  ];
};

export const getCompletedMiniDraws = (): MiniDraw[] => {
  // Mock completed mini draws data
  return [
    {
      id: "completed1",
      name: "Holiday Tool Bonanza",
      description: "Winter festival tool draw",
      prize: {
        name: "Complete Workshop Setup",
        value: 5000,
        images: ["/images/sample-workshop.jpg"],
      },
      endDate: "2024-01-31T23:59:59Z",
      isActive: false,
      winnerName: "John Smith",
      winnerDate: "2024-02-01T10:00:00Z",
    },
    {
      id: "completed2",
      name: "New Year Draw",
      description: "New Year celebration draw",
      prize: {
        name: "Professional Combo Kit",
        value: 1500,
        images: ["/images/sample-combo.jpg"],
      },
      endDate: "2024-01-10T23:59:59Z",
      isActive: false,
      winnerName: "Sarah Johnson",
      winnerDate: "2024-01-11T09:30:00Z",
    },
  ];
};
