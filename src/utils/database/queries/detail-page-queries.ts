/**
 * Detail Page Query Patterns
 *
 * Reusable patterns for detail pages that need to fetch:
 * - Main entity (cached to prevent duplicates)
 * - Related entities
 * - User-specific data (if authenticated)
 *
 * These patterns ensure optimal performance through parallelization
 * and query deduplication.
 */

import { cache } from "react";
import connectDB from "@/lib/mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import User from "@/models/User";

/**
 * Generic pattern for fetching user membership status and entry data.
 * Can be reused across different detail pages (products, mini-draws, etc.)
 *
 * Note: This function assumes DB is already connected (mongoose uses global connection pool).
 * If called independently, ensure connectDB() is called first.
 *
 * @param userId - User ID from session
 * @returns User membership status
 */
export async function getUserMembershipData(userId: string | undefined): Promise<{ hasActiveMembership: boolean }> {
  if (!userId) {
    return { hasActiveMembership: false };
  }

  try {
    // Note: connectDB() uses global connection pool, so calling it multiple times is safe
    // but we assume it's already connected from the parent component for better performance
    await connectDB();
    const user = await User.findById(userId).lean();

    if (!user) {
      return { hasActiveMembership: false };
    }

    const hasActiveMembership = user.subscription?.isActive === true;

    return { hasActiveMembership };
  } catch (error) {
    console.error("Error fetching user membership data:", error);
    return { hasActiveMembership: false };
  }
}

/**
 * Cached session fetcher to prevent duplicate session calls
 * in the same request.
 */
export const getCachedSession = cache(async () => {
  return getServerSession(authOptions);
});

/**
 * Pattern for detail pages that need:
 * 1. Main entity (cached)
 * 2. Related entities
 * 3. User data (if authenticated)
 *
 * All independent queries are parallelized for optimal performance.
 *
 * @param options - Configuration for the detail page query
 * @returns All fetched data in parallel
 */
export async function fetchDetailPageData<TEntity, TRelated, TUserData>(options: {
  entityId: string;
  getEntity: (id: string) => Promise<TEntity | null>;
  getRelated: (entity: TEntity) => Promise<TRelated[]>;
  getUserData?: (userId: string | undefined, entity: TEntity) => Promise<TUserData>;
}): Promise<{
  entity: TEntity;
  related: TRelated[];
  userData: TUserData;
  session: Awaited<ReturnType<typeof getCachedSession>>;
}> {
  // Ensure DB connection
  await connectDB();

  // Start session fetch in parallel (non-blocking)
  const sessionPromise = getCachedSession();

  // Fetch main entity
  const entity = await options.getEntity(options.entityId);

  if (!entity) {
    throw new Error("Entity not found");
  }

  // Parallelize independent queries
  const [session, related] = await Promise.all([sessionPromise, options.getRelated(entity)]);

  // Get user data if function provided
  const userData = options.getUserData ? await options.getUserData(session?.user?.id, entity) : ({} as TUserData);

  return {
    entity,
    related,
    userData,
    session,
  };
}
