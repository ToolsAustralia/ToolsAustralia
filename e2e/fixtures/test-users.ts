// e2e/fixtures/test-users.ts
//
// Single source of truth for the E2E user roster.
// Both the seed script and Playwright specs import from here so emails,
// roles, and worker scoping are defined exactly once.

export type Role =
  | "guest"
  | "fresh"
  | "tradie"
  | "foreman"
  | "boss"
  | "cancelling"
  | "pastdue"
  | "affiliate";

/**
 * Maps an authenticated member role to the membership package _id used in
 * src/data/membershipPackages.ts. cancelling/pastdue both ride on the
 * Tradie tier (cheapest active sub) — they only differ in subscription
 * field state, not the underlying package.
 */
export const PACKAGE_ID_BY_ROLE: Record<
  Exclude<Role, "guest" | "fresh" | "affiliate">,
  string
> = {
  tradie:     "tradie-subscription",
  foreman:    "foreman-subscription",
  boss:       "boss-subscription",
  cancelling: "tradie-subscription",
  pastdue:    "tradie-subscription",
};

export interface RoleProfile {
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * Resolve the worker-scoped email for a role. Playwright sets
 * TEST_WORKER_INDEX in env (0, 1, 2, …) when running in parallel.
 * Outside Playwright (seed script CLI) this defaults to "0".
 */
export function emailFor(role: Role, workerIndex?: number): string {
  if (role === "guest") {
    throw new Error("guest has no email — it is unauthenticated");
  }
  const idx = workerIndex ?? Number(process.env.TEST_WORKER_INDEX ?? "0");
  return `test-e2e-${role}-w${idx}@example.com`;
}

/**
 * Workers Playwright will spawn. Read from PLAYWRIGHT_WORKERS env or default to 4.
 * The seed script multiplies the roster by this count.
 */
export function workerCount(): number {
  const fromEnv = Number(process.env.PLAYWRIGHT_WORKERS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 4;
}

/**
 * Materialised roster for a given worker index.
 * Used by seed and cleanup scripts.
 */
export function rosterFor(workerIndex: number): RoleProfile[] {
  const make = (
    role: Role,
    firstName: string,
    lastName: string,
  ): RoleProfile => ({
    role,
    email: emailFor(role, workerIndex),
    firstName,
    lastName,
  });
  return [
    make("fresh",      "Fresh",      "Tester"),
    make("tradie",     "Tradie",     "Member"),
    make("foreman",    "Foreman",    "Member"),
    make("boss",       "Boss",       "Member"),
    make("cancelling", "Cancelling", "Member"),
    make("pastdue",    "PastDue",    "Member"),
    make("affiliate",  "Affiliate",  "Partner"),
  ];
}

export const E2E_USER_PASSWORD = process.env.E2E_TEST_USER_PASSWORD ?? "";
