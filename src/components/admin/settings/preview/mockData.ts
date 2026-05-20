import { AREAS } from "@/lib/permissions";

export interface MockRole {
  id: string;
  name: string;
  color: string;
  permissionCount: number;
  memberCount: number;
  isSystem: boolean;
}

export interface MockStaff {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  roleName: string;
  roleColor: string;
  userType: "staff" | "admin";
  inviteStatus: "active" | "pending" | "expired";
  invitedAt: string | null;
  lastLogin: string | null;
}

export const MOCK_ROLES: MockRole[] = [
  { id: "r1", name: "Admin",           color: "#ee0000", permissionCount: 30, memberCount: 1, isSystem: true  },
  { id: "r2", name: "Ads Manager",     color: "#f59e0b", permissionCount: 6,  memberCount: 2, isSystem: false },
  { id: "r3", name: "Email Marketing", color: "#3b82f6", permissionCount: 4,  memberCount: 1, isSystem: false },
  { id: "r4", name: "Designer",        color: "#a855f7", permissionCount: 3,  memberCount: 0, isSystem: false },
];

export const MOCK_STAFF: MockStaff[] = [
  { id: "s1", firstName: "DJ",     lastName: "Rivera", email: "djrrivera25@gmail.com", roleId: "r1", roleName: "Admin",           roleColor: "#ee0000", userType: "admin", inviteStatus: "active",  invitedAt: null,                       lastLogin: "2026-05-20T08:14:00Z" },
  { id: "s2", firstName: "Maya",   lastName: "Chen",   email: "maya@example.com",      roleId: "r2", roleName: "Ads Manager",     roleColor: "#f59e0b", userType: "staff", inviteStatus: "active",  invitedAt: "2026-04-12T10:00:00Z",     lastLogin: "2026-05-19T14:22:00Z" },
  { id: "s3", firstName: "Sam",    lastName: "Patel",  email: "sam@example.com",       roleId: "r2", roleName: "Ads Manager",     roleColor: "#f59e0b", userType: "staff", inviteStatus: "pending", invitedAt: "2026-05-18T09:30:00Z",     lastLogin: null },
  { id: "s4", firstName: "Carlos", lastName: "Diaz",   email: "carlos@example.com",    roleId: "r3", roleName: "Email Marketing", roleColor: "#3b82f6", userType: "staff", inviteStatus: "expired", invitedAt: "2026-04-01T12:00:00Z",     lastLogin: null },
];

// Per-area view/edit toggles for the "Ads Manager" preview role.
// Used to show a realistic permission grid when that role is selected.
export const MOCK_PERMISSION_GRID = AREAS.map((a) => ({
  area: a,
  adsManager: {
    view: ["overview", "facebookAds", "pageAnalytics", "promoAnalytics", "abTesting"].includes(a),
    edit: ["facebookAds"].includes(a),
  },
}));
