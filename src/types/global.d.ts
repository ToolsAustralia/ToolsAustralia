import mongoose from "mongoose";

declare global {
  var mongoose: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };

  interface Window {
    // Klaviyo onsite JavaScript types.
    // Optional because the script is loaded client-side and may not be present
    // during SSR or before the loader has finished executing.
    klaviyo?: {
      push: (args: unknown[]) => void;
      identify: (email: string, properties?: Record<string, unknown>) => void;
      track: (eventName: string, properties?: Record<string, unknown>) => void;
    };
    _klOnsite?: unknown[];

    // Google Tag Manager dataLayer. Use lib/gtm.ts helpers instead of pushing directly.
    dataLayer?: Record<string, unknown>[];
  }
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;            // legacy, kept until Phase 5 cleanup
      firstName: string;
      lastName: string;
      userType: "customer" | "staff" | "admin";
      roleId: string | null;
      /** Display name of the assigned Role, joined server-side. `null` for customers. */
      roleName: string | null;
      permissions: string[];
    };
  }

  interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    userType: "customer" | "staff" | "admin";
    roleId: string | null;
    tokenVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    firstName: string;
    lastName: string;
    userType: "customer" | "staff" | "admin";
    roleId: string | null;
    // Optional: old tokens issued before Task 4 deploy lack these. Callers must guard.
    permissions?: string[];
    permissionsLoadedAt?: number; // unix ms — when we last loaded perms from DB
    /** Cached Role.name for sidebar display (refreshed together with permissions). */
    roleName?: string | null;
    /**
     * Stamped from User.tokenVersion when the token is issued / refreshed.
     * If this drops out of sync with the DB value, the JWT callback forces a
     * sign-out (sets `deleted = true`). See docs/auth/roles.md.
     */
    tokenVersion?: number;
    deleted?: boolean;
    /**
     * Whether the account has EVER completed a purchase — the dashboard-access
     * gate read by `src/middleware.ts`. Stamped by the jwt callback on every
     * request from the user document it already loads, so a first purchase
     * unlocks `/my-account` on the next navigation.
     *
     * Optional: tokens issued before this shipped lack it. Middleware treats
     * absent as "not yet known" and lets the request through rather than
     * bouncing an existing signed-in member mid-session — the next request
     * carries the stamp. See `src/utils/auth/has-ever-paid.ts`.
     */
    hasEverPaid?: boolean;
  }
}

export {};
