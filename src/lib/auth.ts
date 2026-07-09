import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import connectDB from "./mongodb";
import User from "@/models/User";
import Role from "@/models/Role";
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

          // Deactivated accounts must be rejected AT login, not after. Without
          // this, login succeeds (session issued) and the jwt callback's
          // subsequent-request guard kills the token seconds later — an endless
          // login→auto-logout loop with no explanation (removed staff,
          // admin-deactivated users, invited staff who set a password via the
          // public reset flow without completing /staff-setup). Checked AFTER
          // password validation so account status is only revealed to someone
          // holding valid credentials.
          if (user.isActive === false) {
            authDebugLog("❌ Account is deactivated:", credentials.email);
            throw new Error("ACCOUNT_DEACTIVATED");
          }

          const result = {
            id: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            userType: user.userType ?? "customer",
            roleId: user.roleId ? user.roleId.toString() : null,
            tokenVersion: user.tokenVersion ?? 0,
          };

          authDebugLog("✅ Returning user data:", result);
          return result;
        } catch (error) {
          // Rethrow the deactivation rejection so NextAuth surfaces it as
          // result.error = "ACCOUNT_DEACTIVATED" (login UIs show a clear
          // message). Returning null here would collapse it into the generic
          // "CredentialsSignin" invalid-credentials error.
          if (error instanceof Error && error.message === "ACCOUNT_DEACTIVATED") {
            throw error;
          }
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

          // A valid auto-login token must not bypass the deactivation check —
          // same login→auto-logout loop as the credentials provider otherwise.
          await connectDB();
          const dbUser = await User.findById(payload.sub).select("isActive").lean();
          if (!dbUser) {
            authDebugLog("❌ Auto-login rejected: account no longer exists:", payload.email);
            return null;
          }
          if (dbUser.isActive === false) {
            authDebugLog("❌ Auto-login rejected: account deactivated:", payload.email);
            // Thrown (not null) so callers see result.error = "ACCOUNT_DEACTIVATED"
            // and can show the real reason — parity with the credentials provider.
            throw new Error("ACCOUNT_DEACTIVATED");
          }

          return {
            id: payload.sub,
            email: payload.email,
            firstName: payload.firstName,
            lastName: payload.lastName,
            role: payload.role,
            userType: (payload as { userType?: "customer" | "staff" }).userType ?? "customer",
            roleId: (payload as { roleId?: string | null }).roleId ?? null,
          };
        } catch (error) {
          // Surface the deactivation rejection as result.error = "ACCOUNT_DEACTIVATED"
          // (returning null would collapse it into the generic CredentialsSignin).
          if (error instanceof Error && error.message === "ACCOUNT_DEACTIVATED") {
            throw error;
          }
          // Anything else: bad/expired token or a transient DB failure.
          console.error("❌ Auto-login failed (token invalid or lookup error):", error);
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
      const PERM_TTL_MS = 5 * 60 * 1000;

      const loadRole = async (
        roleId: string | null
      ): Promise<{ permissions: string[]; name: string | null }> => {
        if (!roleId) return { permissions: [], name: null };
        const role = await Role.findById(roleId)
          .select("permissions name")
          .lean();
        return {
          permissions: role?.permissions ?? [],
          name: role?.name ?? null,
        };
      };

      // For Google OAuth, we need to fetch the user from database to get the role
      if (account?.provider === "google" || !token.role) {
        try {
          await connectDB();
          const dbUser = await User.findOne({ email: token.email || user?.email });
          if (dbUser) {
            // Never mint a first token for a deactivated account (providers
            // already reject at login; this covers any path that skips them).
            if (dbUser.isActive === false) {
              authDebugLog("🔒 JWT invalidated: account is deactivated");
              token.deleted = true;
              return token;
            }
            token.sub = dbUser._id.toString(); // Use MongoDB ObjectId as the subject
            token.role = dbUser.role; // Set role from database
            token.firstName = dbUser.firstName;
            token.lastName = dbUser.lastName;
            token.email = dbUser.email;
            token.userType = dbUser.userType ?? "customer";
            token.roleId = dbUser.roleId ? dbUser.roleId.toString() : null;
            {
              const r = await loadRole(token.roleId);
              token.permissions = r.permissions;
              token.roleName = r.name;
            }
            token.permissionsLoadedAt = Date.now();
            token.tokenVersion = dbUser.tokenVersion ?? 0;
          } else {
            // If the user record has been removed, mark token as deleted
            // The session callback will return null when this flag is set
            authDebugLog("🔒 JWT invalidated: Google user no longer exists in database");
            token.deleted = true;
            return token;
          }
        } catch (error) {
          console.error("Error finding user in JWT callback:", error);
        }
      } else if (user) {
        // For credentials login, use the user object directly
        await connectDB();
        token.role = user.role;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.email = user.email;
        token.userType = user.userType ?? "customer";
        token.roleId = user.roleId ?? null;
        {
          const r = await loadRole(token.roleId);
          token.permissions = r.permissions;
          token.roleName = r.name;
        }
        token.permissionsLoadedAt = Date.now();
        token.tokenVersion = user.tokenVersion ?? 0;
      } else if (token.sub && !user && !account) {
        // On subsequent requests, sync from database and refresh permissions if stale
        try {
          await connectDB();
          const dbUser = await User.findById(token.sub);
          if (!dbUser || dbUser.isActive === false) {
            // If the user has been deleted or deactivated, mark token as deleted
            // The session callback will return null when this flag is set
            authDebugLog(
              `🔒 JWT invalidated: user ${token.sub} is ${!dbUser ? "missing" : "inactive"}`
            );
            token.deleted = true;
            return token;
          }

          // Force sign-out when User.tokenVersion has been bumped (role change,
          // staff removal, or a permission edit on the role the user holds).
          // The guard intentionally only fires when the token already carried a
          // tokenVersion — tokens issued before this field existed get one
          // stamped below and become eligible for future invalidation.
          if (
            typeof token.tokenVersion === "number" &&
            (dbUser.tokenVersion ?? 0) !== token.tokenVersion
          ) {
            authDebugLog(
              `🔒 JWT invalidated: tokenVersion mismatch for user ${token.sub} (token=${token.tokenVersion}, db=${dbUser.tokenVersion ?? 0})`
            );
            token.deleted = true;
            return token;
          }

          // Keep session data in sync with the latest database values.
          token.email = dbUser.email;
          token.firstName = dbUser.firstName;
          token.lastName = dbUser.lastName;
          token.role = dbUser.role;
          token.userType = dbUser.userType ?? "customer";

          const dbRoleId = dbUser.roleId ? dbUser.roleId.toString() : null;
          const roleChanged = dbRoleId !== (token.roleId ?? null);
          const expired =
            !token.permissionsLoadedAt ||
            Date.now() - token.permissionsLoadedAt > PERM_TTL_MS;

          if (roleChanged || expired) {
            token.roleId = dbRoleId;
            const r = await loadRole(dbRoleId);
            token.permissions = r.permissions;
            token.roleName = r.name;
            token.permissionsLoadedAt = Date.now();
          }

          // Backfill tokenVersion for tokens issued before the feature shipped.
          if (typeof token.tokenVersion !== "number") {
            token.tokenVersion = dbUser.tokenVersion ?? 0;
          }
        } catch (error) {
          console.error("Error syncing user data in JWT callback:", error);
        }
      }
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }): Promise<any> {
      // If token is marked as deleted or has no subject, return null to invalidate session
      // This happens when user is deleted or deactivated
      // Note: Returning null is the correct way to invalidate sessions in NextAuth,
      // even though TypeScript types don't explicitly allow it
      if (token?.deleted || !token?.sub) {
        authDebugLog("🔒 Session invalidated: user was deleted or token is invalid");
        return null; // NextAuth accepts null to invalidate session
      }

      // Populate session with token data
      session.user.id = token.sub;
      session.user.role = token.role as string;
      session.user.firstName = token.firstName as string;
      session.user.lastName = token.lastName as string;
      session.user.email = token.email as string;
      session.user.userType =
        (token.userType as "customer" | "staff" | "admin") ?? "customer";
      session.user.roleId = (token.roleId as string | null) ?? null;
      session.user.roleName = (token.roleName as string | null) ?? null;
      session.user.permissions = token.permissions ?? [];

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

          // Same deactivation gate as the credentials provider — reject at
          // login instead of issuing a session the jwt callback kills seconds
          // later (NextAuth surfaces this as error=AccessDenied).
          if (existingUser.isActive === false) {
            authDebugLog(`❌ Google sign-in rejected: account deactivated for ${user.email}`);
            return false;
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
