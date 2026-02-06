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
      role: string;
      firstName: string;
      lastName: string;
    };
  }

  interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    firstName: string;
    lastName: string;
    deleted?: boolean; // Flag to mark token as deleted when user is removed
  }
}

export {};
