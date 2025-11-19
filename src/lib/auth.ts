import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import connectDB from "./mongodb";
import User from "@/models/User";
import { verifyJWT } from "./jwt";

/**
 * Lightweight debug helper so we never log sensitive auth data in production.
 * Toggle via NEXT_PUBLIC_ENABLE_AUTH_DEBUG for local testing.
 */
const isAuthDebugEnabled =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_AUTH_DEBUG === "true";
const authDebugLog = (...args: unknown[]): void => {
  if (isAuthDebugEnabled) {
    console.log(...args);
  }
};

// Validate required environment variables
const requiredEnvVars = {
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  MONGODB_URI: process.env.MONGODB_URI,
};

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:", missingVars);
  throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
}

export const authOptions: NextAuthOptions = {
  // Keep debug output strictly disabled in production
  debug: isAuthDebugEnabled,

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        authDebugLog("🔍 NextAuth authorize called with:", {
          email: credentials?.email,
          hasPassword: !!credentials?.password,
        });

        if (!credentials?.email) {
          authDebugLog("❌ Missing email");
          return null;
        }

        try {
          authDebugLog("🔍 Attempting to connect to database...");
          await connectDB();
          authDebugLog("✅ Database connected successfully");

          authDebugLog("🔍 Looking for user:", credentials.email);
          const user = await User.findOne({ email: credentials.email });

          if (!user) {
            authDebugLog("❌ User not found:", credentials.email);
            return null;
          }

          authDebugLog("✅ User found:", {
            id: user._id,
            email: user.email,
            isActive: user.isActive,
            isEmailVerified: user.isEmailVerified,
            role: user.role,
            hasPassword: !!user.password,
          });

          // Handle passwordless users (no password field)
          if (!user.password) {
            authDebugLog("🔍 User has no password - passwordless user");
            // For passwordless users, we'll handle authentication via SMS OTP in a separate endpoint
            // This credentials provider is mainly for users with passwords
            authDebugLog("❌ Passwordless user cannot login via credentials provider");
            return null;
          }

          // Handle users with passwords
          if (!credentials?.password) {
            authDebugLog("❌ Password required for this user");
            return null;
          }

          authDebugLog("🔍 Checking password...");
          const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

          if (!isPasswordValid) {
            authDebugLog("❌ Invalid password for user:", credentials.email);
            return null;
          }

          authDebugLog("✅ Password valid for user:", credentials.email);

          const result = {
            id: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          };

          authDebugLog("✅ Returning user data:", result);
          return result;
        } catch (error) {
          console.error("❌ Auth error:", error);
          console.error("❌ Error details:", {
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          });
          return null;
        }
      },
    }),
    CredentialsProvider({
      id: "auto-login",
      name: "auto-login",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        authDebugLog("🔍 Auto-login authorize called");

        if (!credentials?.token) {
          authDebugLog("❌ Missing auto-login token");
          return null;
        }

        try {
          // Verify the JWT token
          const payload = await verifyJWT(credentials.token);
          authDebugLog("✅ Auto-login token verified for:", payload.email);

          return {
            id: payload.sub,
            email: payload.email,
            firstName: payload.firstName,
            lastName: payload.lastName,
            role: payload.role,
          };
        } catch (error) {
          console.error("❌ Auto-login token verification failed:", error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // For Google OAuth, we need to fetch the user from database to get the role
      if (account?.provider === "google" || !token.role) {
        try {
          await connectDB();
          const dbUser = await User.findOne({ email: token.email || user?.email });
          if (dbUser) {
            token.sub = dbUser._id.toString(); // Use MongoDB ObjectId as the subject
            token.role = dbUser.role; // Set role from database
            token.firstName = dbUser.firstName;
            token.lastName = dbUser.lastName;
            token.email = dbUser.email;
          }
        } catch (error) {
          console.error("Error finding user in JWT callback:", error);
        }
      } else if (user) {
        // For credentials login, use the user object directly
        token.role = user.role;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.email = user.email;
      } else if (token.sub && !user && !account) {
        // On subsequent requests, sync email from database if it changed
        // This ensures session stays in sync after email updates
        try {
          await connectDB();
          const dbUser = await User.findById(token.sub);
          if (dbUser && dbUser.email !== token.email) {
            authDebugLog(`✅ Email synced from database: ${token.email} → ${dbUser.email}`);
            token.email = dbUser.email;
            token.firstName = dbUser.firstName;
            token.lastName = dbUser.lastName;
          }
        } catch (error) {
          console.error("Error syncing user data in JWT callback:", error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
        session.user.firstName = token.firstName as string;
        session.user.lastName = token.lastName as string;
        session.user.email = token.email as string;
      }
      return session;
    },
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        try {
          await connectDB();

          const existingUser = await User.findOne({ email: user.email });

          if (!existingUser) {
            // Google OAuth is only allowed for existing users
            // New users must register through the normal flow to set up their account
            authDebugLog(`❌ Google sign-in rejected: No existing account for ${user.email}`);
            return false; // Reject sign-in for new users
          }

          // Update user's email verification status if signing in via Google
          // Google OAuth confirms the email is valid and belongs to the user
          if (!existingUser.isEmailVerified) {
            existingUser.isEmailVerified = true;
            await existingUser.save();
          }

          // Check membership status for logging purposes only (not for blocking access)
          const hasActiveSubscription = existingUser.subscription?.isActive;
          const hasActiveOneTimePackages = existingUser.oneTimePackages?.some(
            (pkg: { isActive: boolean }) => pkg.isActive
          );

          if (hasActiveSubscription || hasActiveOneTimePackages) {
            const membershipType = hasActiveSubscription ? "subscription" : "one-time packages";
            authDebugLog(`✅ Google sign-in approved for ${user.email} with active ${membershipType}`);
          } else {
            authDebugLog(`✅ Google sign-in approved for ${user.email} (no active membership)`);
          }

          return true;
        } catch (error) {
          console.error("❌ Google sign-in error:", error);
          return false;
        }
      }

      return true;
    },
    async redirect({ url, baseUrl }) {
      // If the URL is relative, make it absolute
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      // If the URL is on the same origin, allow it
      if (new URL(url).origin === baseUrl) {
        return url;
      }
      // Otherwise, redirect to base URL
      return baseUrl;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
