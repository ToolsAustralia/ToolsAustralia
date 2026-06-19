/**
 * JWT signing secret for auth tokens.
 * We fail fast when the secret is missing so we never generate weak tokens.
 */
const rawJwtSecret = process.env.NEXTAUTH_SECRET;

if (!rawJwtSecret) {
  throw new Error("NEXTAUTH_SECRET is required for JWT operations but was not provided.");
}

const JWT_SECRET = rawJwtSecret;

export interface JWTPayload {
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

/**
 * Check if we're running on the server side
 */
function isServerSide(): boolean {
  return typeof window === "undefined";
}

/**
 * Sign a JWT token - server-side only
 */
export async function signJWT(payload: JWTPayload): Promise<string> {
  // Only run on server side
  if (!isServerSide()) {
    throw new Error("JWT signing is only available on the server side");
  }

  try {
    // Dynamic import for server-side only execution
    const jwtModule = await import("jsonwebtoken");
    const jwt = jwtModule.default || jwtModule;

    return new Promise((resolve, reject) => {
      jwt.sign(
        payload,
        JWT_SECRET,
        {
          // These tokens are short-lived BRIDGE credentials: they are minted by
          // /api/auth/auto-login and /api/auth/verify-login-code and consumed
          // within seconds by the NextAuth `auto-login` provider to establish the
          // real (30-day) session. They are never used as a long-lived credential,
          // so a short lifetime shrinks the misuse window with no UX cost.
          expiresIn: "15m",
          algorithm: "HS256",
          issuer: "tools-australia",
          audience: "tools-australia-users",
        },
        (err: Error | null, token?: string) => {
          if (err) {
            reject(err);
          } else {
            resolve(token!);
          }
        }
      );
    });
  } catch (error) {
    console.error("Failed to sign JWT:", error);
    throw new Error("JWT signing failed");
  }
}

/**
 * Mint a short-lived auto-login BRIDGE token for a user.
 *
 * SECURITY: only ever call this as the result of a SERVER-VERIFIED action —
 * `/api/auth/auto-login` (after it verifies the caller's Stripe PaymentIntent
 * belongs to the user) or `/api/auth/verify-email` (after a verified email code).
 * Never mint from unauthenticated `{ userId, email }` input — that was the
 * `/api/auth/auto-login` account-takeover hole (a non-secret id + email is not
 * proof of identity). The token is consumed within seconds by the NextAuth
 * `auto-login` provider to establish the session.
 */
export async function signAutoLoginToken(user: {
  _id: { toString(): string } | string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}): Promise<string> {
  return signJWT({
    sub: typeof user._id === "string" ? user._id : user._id.toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  });
}

/**
 * Verify a JWT token - server-side only
 */
export async function verifyJWT(token: string): Promise<JWTPayload> {
  // Only run on server side
  if (!isServerSide()) {
    throw new Error("JWT verification is only available on the server side");
  }

  try {
    // Dynamic import for server-side only execution
    const jwtModule = await import("jsonwebtoken");
    const jwt = jwtModule.default || jwtModule;

    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        JWT_SECRET,
        {
          algorithms: ["HS256"], // Pin the algorithm: never accept a token signed with any other alg.
          issuer: "tools-australia",
          audience: "tools-australia-users",
        },
        (err: Error | null, decoded?: unknown) => {
          if (err) {
            reject(err);
          } else {
            resolve(decoded as JWTPayload);
          }
        }
      );
    });
  } catch (error) {
    console.error("Failed to verify JWT:", error);
    throw new Error("JWT verification failed");
  }
}
