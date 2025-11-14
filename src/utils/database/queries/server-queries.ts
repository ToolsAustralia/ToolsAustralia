/**
 * Server-Side Query Utilities
 * 
 * Reusable utilities for optimizing server-side data fetching in Next.js App Router.
 * These utilities help prevent duplicate queries, parallelize independent operations,
 * and ensure efficient database connections.
 * 
 * @example
 * // Create a cached query function
 * const getProduct = createCachedQuery(async (id: string) => {
 *   await connectDB();
 *   return await Product.findById(id).lean();
 * });
 * 
 * // Use in both generateMetadata and page component
 * export async function generateMetadata({ params }) {
 *   const product = await getProduct(params.id);
 *   // ...
 * }
 * 
 * export default async function Page({ params }) {
 *   const product = await getProduct(params.id); // Uses cache, no duplicate query
 *   // ...
 * }
 */

import { cache } from "react";
import connectDB from "@/lib/mongodb";

/**
 * Creates a cached query function that prevents duplicate queries
 * between generateMetadata and page components in the same request.
 * 
 * This is essential for Next.js App Router where generateMetadata and
 * the page component both need the same data, but we don't want to
 * query the database twice.
 * 
 * @param queryFn - The async function that performs the database query
 * @returns A cached version of the query function
 * 
 * @example
 * const getMiniDraw = createCachedQuery(async (id: string) => {
 *   await connectDB();
 *   return await MiniDraw.findById(id).lean();
 * });
 */
export function createCachedQuery<TArgs extends unknown[], TReturn>(
  queryFn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return cache(queryFn);
}

/**
 * Ensures database connection is established once per request.
 * Can be used to wrap functions that need DB access.
 * 
 * @param fn - Function that requires database connection
 * @returns Wrapped function with guaranteed DB connection
 * 
 * @example
 * const fetchData = withDbConnection(async () => {
 *   // DB is already connected here
 *   return await Model.find().lean();
 * });
 */
export async function withDbConnection<T>(
  fn: () => Promise<T>
): Promise<T> {
  await connectDB();
  return fn();
}

/**
 * Executes multiple independent queries in parallel for better performance.
 * All queries are executed simultaneously, reducing total wait time.
 * 
 * @param queries - Array of promises to execute in parallel
 * @returns Promise that resolves when all queries complete
 * 
 * @example
 * const [product, related, user] = await parallelFetch([
 *   getProduct(id),
 *   getRelatedProducts(id),
 *   getUserData(userId)
 * ]);
 */
export async function parallelFetch<T extends readonly unknown[]>(
  queries: [...{ [K in keyof T]: Promise<T[K]> }]
): Promise<T> {
  return Promise.all(queries) as Promise<T>;
}

/**
 * Helper to conditionally execute a query only if a condition is met.
 * Useful for user-specific queries that should only run if authenticated.
 * 
 * @param condition - Whether to execute the query
 * @param queryFn - The query function to execute if condition is true
 * @param defaultValue - Default value to return if condition is false
 * @returns Result of query or default value
 * 
 * @example
 * const userData = await conditionalQuery(
 *   !!session?.user?.id,
 *   () => getUserData(session.user.id),
 *   { hasActiveMembership: false, userEntryCount: 0 }
 * );
 */
export async function conditionalQuery<T>(
  condition: boolean,
  queryFn: () => Promise<T>,
  defaultValue: T
): Promise<T> {
  if (!condition) {
    return defaultValue;
  }
  return queryFn();
}

