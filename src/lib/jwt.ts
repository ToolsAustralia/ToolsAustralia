const JWT_SECRET = process.env.NEXTAUTH_SECRET || "fallback-secret-key";

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
          expiresIn: "30d", // Token expires in 30 days
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
