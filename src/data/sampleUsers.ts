// Sample user data for development/demo purposes
// This replaces database calls for development/demo purposes

export interface SampleUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  role: "user" | "admin";
  membership?: {
    packageId: string;
    type: "subscription" | "one-time";
    startDate: Date;
    endDate?: Date;
    isActive: boolean;
  };
  accumulatedEntries: number;
  entryWallet: number;
  rewardsPoints: number;
  isEmailVerified: boolean;
  lastLogin?: Date;
  createdAt: Date;
}

// Sample users data
export const sampleUsers: SampleUser[] = [
  // Admin User
  {
    _id: "admin-user-001",
    firstName: "Admin",
    lastName: "User",
    email: "admin@toolsaustralia.com.au",
    mobile: "+61412345678",
    role: "admin",
    accumulatedEntries: 0,
    entryWallet: 0,
    rewardsPoints: 0,
    isEmailVerified: true,
    lastLogin: new Date("2024-01-15T10:30:00Z"),
    createdAt: new Date("2024-01-01T00:00:00Z"),
  },

  // VIP Member (Legends)
  {
    _id: "vip-member-001",
    firstName: "John",
    lastName: "Smith",
    email: "john.smith@email.com",
    mobile: "+61412345679",
    role: "user",
    membership: {
      packageId: "boss",
      type: "subscription",
      startDate: new Date("2024-01-01T00:00:00Z"),
      isActive: true,
    },
    accumulatedEntries: 150, // 100 from VIP + 50 carried over
    entryWallet: 25, // Unused entries
    rewardsPoints: 2850,
    isEmailVerified: true,
    lastLogin: new Date("2024-01-15T09:15:00Z"),
    createdAt: new Date("2023-12-15T00:00:00Z"),
  },

  // Pro Member (Builder)
  {
    _id: "pro-member-002",
    firstName: "Sarah",
    lastName: "Johnson",
    email: "sarah.johnson@email.com",
    mobile: "+61412345680",
    role: "user",
    membership: {
      packageId: "pro-builder-package",
      type: "subscription",
      startDate: new Date("2024-01-01T00:00:00Z"),
      isActive: true,
    },
    accumulatedEntries: 60, // 40 from Pro + 20 carried over
    entryWallet: 10, // Unused entries
    rewardsPoints: 1200,
    isEmailVerified: true,
    lastLogin: new Date("2024-01-14T16:45:00Z"),
    createdAt: new Date("2023-11-20T00:00:00Z"),
  },

  // Starter Member (Tradie)
  {
    _id: "starter-member-003",
    firstName: "Mike",
    lastName: "Wilson",
    email: "mike.wilson@email.com",
    mobile: "+61412345681",
    role: "user",
    membership: {
      packageId: "starter-tradie-package",
      type: "subscription",
      startDate: new Date("2024-01-01T00:00:00Z"),
      isActive: true,
    },
    accumulatedEntries: 20, // 15 from Starter + 5 carried over
    entryWallet: 5, // Unused entries
    rewardsPoints: 450,
    isEmailVerified: true,
    lastLogin: new Date("2024-01-13T11:20:00Z"),
    createdAt: new Date("2024-01-01T00:00:00Z"),
  },

  // One-time Package User (Non-member)
  {
    _id: "one-time-user-004",
    firstName: "Emma",
    lastName: "Davis",
    email: "emma.davis@email.com",
    mobile: "+61412345682",
    role: "user",
    membership: {
      packageId: "mega-tool-pack",
      type: "one-time",
      startDate: new Date("2024-01-10T00:00:00Z"),
      endDate: new Date("2024-01-12T00:00:00Z"),
      isActive: false, // Expired
    },
    accumulatedEntries: 0,
    entryWallet: 8, // Remaining entries from expired package
    rewardsPoints: 150,
    isEmailVerified: true,
    lastLogin: new Date("2024-01-12T14:30:00Z"),
    createdAt: new Date("2024-01-10T00:00:00Z"),
  },

  // Regular User (No membership)
  {
    _id: "regular-user-005",
    firstName: "Alex",
    lastName: "Brown",
    email: "alex.brown@email.com",
    mobile: "+61412345683",
    role: "user",
    accumulatedEntries: 0,
    entryWallet: 0,
    rewardsPoints: 75,
    isEmailVerified: true,
    lastLogin: new Date("2024-01-15T08:00:00Z"),
    createdAt: new Date("2024-01-05T00:00:00Z"),
  },

  // Member with One-time Package
  {
    _id: "member-boost-006",
    firstName: "Lisa",
    lastName: "Anderson",
    email: "lisa.anderson@email.com",
    mobile: "+61412345684",
    role: "user",
    membership: {
      packageId: "pro-builder-package",
      type: "subscription",
      startDate: new Date("2023-12-01T00:00:00Z"),
      isActive: true,
    },
    accumulatedEntries: 85, // 40 from Pro + 45 from boosters
    entryWallet: 15,
    rewardsPoints: 2100,
    isEmailVerified: true,
    lastLogin: new Date("2024-01-15T12:00:00Z"),
    createdAt: new Date("2023-12-01T00:00:00Z"),
  },
];

// Helper functions
export const getSampleUser = (id: string): SampleUser | undefined => {
  return sampleUsers.find((user) => user._id === id);
};

export const getSampleUserByEmail = (email: string): SampleUser | undefined => {
  return sampleUsers.find((user) => user.email === email);
};

export const getSampleUsersByRole = (role: "user" | "admin"): SampleUser[] => {
  return sampleUsers.filter((user) => user.role === role);
};

export const getSampleUsersWithMembership = (): SampleUser[] => {
  return sampleUsers.filter((user) => user.membership?.isActive);
};

export const getAllSampleUsers = (): SampleUser[] => {
  return sampleUsers;
};
