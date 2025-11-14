// Sample orders data for development/demo purposes
// This replaces database calls for development/demo purposes

export interface SampleOrder {
  _id: string;
  orderNumber: string;
  user: string; // User ID
  products: {
    product: string; // Product ID
    quantity: number;
    price: number;
  }[];
  tickets: {
    miniDrawId: string;
    quantity: number;
    price: number;
  }[];
  membership?: {
    packageId: string;
    price: number;
  };
  totalAmount: number;
  appliedDiscounts: {
    type: "membership" | "partner" | "rewards";
    amount: number;
    description: string;
  }[];
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "completed";
  shippingAddress?: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  paymentIntentId?: string;
  trackingNumber?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Sample orders data
export const sampleOrders: SampleOrder[] = [
  // Product Order with Membership Discount
  {
    _id: "order-001",
    orderNumber: "TA-2024-001",
    user: "vip-member-001",
    products: [
      { product: "dewalt-drill-20v", quantity: 1, price: 189.99 },
      { product: "makita-angle-grinder", quantity: 1, price: 89.99 },
    ],
    tickets: [],
    totalAmount: 223.98,
    appliedDiscounts: [{ type: "membership", amount: 44.8, description: "VIP Membership 20% discount" }],
    status: "delivered",
    shippingAddress: {
      firstName: "John",
      lastName: "Smith",
      address: "123 Trade Street",
      city: "Melbourne",
      state: "VIC",
      postalCode: "3000",
      country: "Australia",
    },
    paymentIntentId: "pi_vip_order_001",
    trackingNumber: "TRK001234567",
    createdAt: new Date("2024-01-10T10:30:00Z"),
    updatedAt: new Date("2024-01-12T14:20:00Z"),
  },

  // Ticket Purchase Order
  {
    _id: "order-002",
    orderNumber: "TA-2024-002",
    user: "pro-member-002",
    products: [],
    tickets: [
      { miniDrawId: "mini-draw-001", quantity: 10, price: 50.0 },
      { miniDrawId: "mini-draw-002", quantity: 5, price: 15.0 },
    ],
    totalAmount: 65.0,
    appliedDiscounts: [],
    status: "completed",
    paymentIntentId: "pi_ticket_order_002",
    createdAt: new Date("2024-01-12T15:45:00Z"),
    updatedAt: new Date("2024-01-12T15:45:00Z"),
  },

  // Membership Subscription Order
  {
    _id: "order-003",
    orderNumber: "TA-2024-003",
    user: "starter-member-003",
    products: [],
    tickets: [],
    membership: {
      packageId: "starter-tradie-package",
      price: 20.0,
    },
    totalAmount: 20.0,
    appliedDiscounts: [],
    status: "completed",
    paymentIntentId: "pi_membership_order_003",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  },

  // One-time Package Order
  {
    _id: "order-004",
    orderNumber: "TA-2024-004",
    user: "one-time-user-004",
    products: [],
    tickets: [],
    membership: {
      packageId: "mega-tool-pack",
      price: 50.0,
    },
    totalAmount: 50.0,
    appliedDiscounts: [],
    status: "completed",
    paymentIntentId: "pi_onetime_order_004",
    createdAt: new Date("2024-01-10T00:00:00Z"),
    updatedAt: new Date("2024-01-10T00:00:00Z"),
  },

  // Mixed Order (Products + Tickets)
  {
    _id: "order-005",
    orderNumber: "TA-2024-005",
    user: "member-boost-006",
    products: [
      { product: "milwaukee-cutoff-tool", quantity: 1, price: 149.99 },
      { product: "kincrome-socket-set", quantity: 1, price: 89.99 },
    ],
    tickets: [{ miniDrawId: "mini-draw-003", quantity: 3, price: 30.0 }],
    totalAmount: 239.98,
    appliedDiscounts: [{ type: "membership", amount: 24.0, description: "Pro Membership 10% discount" }],
    status: "shipped",
    shippingAddress: {
      firstName: "Lisa",
      lastName: "Anderson",
      address: "456 Builder Boulevard",
      city: "Sydney",
      state: "NSW",
      postalCode: "2000",
      country: "Australia",
    },
    paymentIntentId: "pi_mixed_order_005",
    trackingNumber: "TRK005678901",
    createdAt: new Date("2024-01-15T09:20:00Z"),
    updatedAt: new Date("2024-01-16T11:30:00Z"),
  },

  // Member Booster Package Order
  {
    _id: "order-006",
    orderNumber: "TA-2024-006",
    user: "member-boost-006",
    products: [],
    tickets: [],
    membership: {
      packageId: "heavy-duty-pack-member",
      price: 100.0,
    },
    totalAmount: 100.0,
    appliedDiscounts: [],
    status: "completed",
    paymentIntentId: "pi_booster_order_006",
    createdAt: new Date("2024-01-08T14:15:00Z"),
    updatedAt: new Date("2024-01-08T14:15:00Z"),
  },

  // Regular User Product Order
  {
    _id: "order-007",
    orderNumber: "TA-2024-007",
    user: "regular-user-005",
    products: [{ product: "sidchrome-tool-kit", quantity: 1, price: 199.99 }],
    tickets: [],
    totalAmount: 199.99,
    appliedDiscounts: [],
    status: "processing",
    shippingAddress: {
      firstName: "Alex",
      lastName: "Brown",
      address: "789 DIY Drive",
      city: "Brisbane",
      state: "QLD",
      postalCode: "4000",
      country: "Australia",
    },
    paymentIntentId: "pi_regular_order_007",
    createdAt: new Date("2024-01-15T16:30:00Z"),
    updatedAt: new Date("2024-01-15T16:30:00Z"),
  },

  // Large Order with Multiple Discounts
  {
    _id: "order-008",
    orderNumber: "TA-2024-008",
    user: "vip-member-001",
    products: [
      { product: "dewalt-hammer-drill", quantity: 1, price: 159.99 },
      { product: "milwaukee-combo-kit", quantity: 1, price: 299.99 },
      { product: "kincrome-tool-chest", quantity: 1, price: 399.99 },
    ],
    tickets: [
      { miniDrawId: "mini-draw-001", quantity: 20, price: 100.0 },
      { miniDrawId: "mini-draw-002", quantity: 15, price: 45.0 },
    ],
    totalAmount: 1004.97,
    appliedDiscounts: [
      { type: "membership", amount: 152.0, description: "VIP Membership 20% discount on products" },
      { type: "rewards", amount: 50.0, description: "Redeemed 5000 rewards points" },
    ],
    status: "pending",
    shippingAddress: {
      firstName: "John",
      lastName: "Smith",
      address: "123 Trade Street",
      city: "Melbourne",
      state: "VIC",
      postalCode: "3000",
      country: "Australia",
    },
    paymentIntentId: "pi_large_order_008",
    createdAt: new Date("2024-01-15T18:45:00Z"),
    updatedAt: new Date("2024-01-15T18:45:00Z"),
  },

  // Cancelled Order
  {
    _id: "order-009",
    orderNumber: "TA-2024-009",
    user: "starter-member-003",
    products: [{ product: "makita-oscillating-tool", quantity: 1, price: 129.99 }],
    tickets: [],
    totalAmount: 129.99,
    appliedDiscounts: [{ type: "membership", amount: 6.5, description: "Starter Membership 5% discount" }],
    status: "cancelled",
    paymentIntentId: "pi_cancelled_order_009",
    notes: "Customer requested cancellation",
    createdAt: new Date("2024-01-14T12:00:00Z"),
    updatedAt: new Date("2024-01-14T15:30:00Z"),
  },

  // Ticket-only Order
  {
    _id: "order-010",
    orderNumber: "TA-2024-010",
    user: "regular-user-005",
    products: [],
    tickets: [
      { miniDrawId: "mini-draw-001", quantity: 5, price: 25.0 },
      { miniDrawId: "mini-draw-002", quantity: 10, price: 30.0 },
    ],
    totalAmount: 55.0,
    appliedDiscounts: [],
    status: "completed",
    paymentIntentId: "pi_ticket_only_order_010",
    createdAt: new Date("2024-01-13T11:20:00Z"),
    updatedAt: new Date("2024-01-13T11:20:00Z"),
  },
];

// Helper functions
export const getOrderById = (id: string): SampleOrder | undefined => {
  return sampleOrders.find((order) => order._id === id);
};

export const getOrderByNumber = (orderNumber: string): SampleOrder | undefined => {
  return sampleOrders.find((order) => order.orderNumber === orderNumber);
};

export const getOrdersByUser = (userId: string): SampleOrder[] => {
  return sampleOrders.filter((order) => order.user === userId);
};

export const getOrdersByStatus = (status: SampleOrder["status"]): SampleOrder[] => {
  return sampleOrders.filter((order) => order.status === status);
};

export const getRecentOrders = (limit: number = 10): SampleOrder[] => {
  return sampleOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
};

export const getOrdersWithProducts = (): SampleOrder[] => {
  return sampleOrders.filter((order) => order.products.length > 0);
};

export const getOrdersWithTickets = (): SampleOrder[] => {
  return sampleOrders.filter((order) => order.tickets.length > 0);
};

export const getOrdersWithMemberships = (): SampleOrder[] => {
  return sampleOrders.filter((order) => order.membership);
};

export const getAllOrders = (): SampleOrder[] => {
  return sampleOrders;
};

