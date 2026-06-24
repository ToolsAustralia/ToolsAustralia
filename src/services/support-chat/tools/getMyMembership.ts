/**
 * getMyMembership — read-only member tool.
 *
 * Returns the caller's current membership tier, activity, expiry, and any
 * pending package change. All data comes from the server-side session actor
 * (never model-supplied). Projection is fail-closed (strict Zod schema).
 *
 * Services used (injected via MemberToolDeps for testability):
 *   - User.findById(ctx.actor.userId)
 *   - getCurrentUserBenefits(user) from @/utils/membership/subscription-benefits
 *   - getActivePackage(user)       from @/utils/membership/get-active-package
 */

import { z } from "zod";
import { defineMemberTool, emptyInput, ToolDenied } from "./registry";
import type { MemberToolCtx, MemberToolDeps } from "./registry";

// ─── Response schema (strict — extra fields throw, PII fields absent) ─────────

const responseSchema = z
  .object({
    tier: z.string().nullable(),
    packageId: z.string().nullable(),
    entriesPerMonth: z.number(),
    isActive: z.boolean(),
    source: z.string().nullable(),
    expiresAt: z.string().nullable(),
    isPendingChange: z.boolean(),
    pendingChange: z
      .object({
        newPackageName: z.string(),
        effectiveDate: z.string(),
      })
      .nullable(),
  })
  .strict();

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handler(ctx: MemberToolCtx, deps?: MemberToolDeps): Promise<unknown> {
  const { actor } = ctx;
  // I-1: must be a member (enforced by registry, but guard again for clarity)
  if (actor.kind !== "member") throw new ToolDenied("login_required");

  // User lookup — use injected dep or fall back to real User model
  const findUser =
    deps?.findUserById ??
    (async (id: string) => {
      const { default: connectDB } = await import("@/lib/mongodb");
      const { default: User } = await import("@/models/User");
      await connectDB();
      return User.findById(id).lean<import("@/models/User").IUser>();
    });

  const user = await findUser(actor.userId);
  if (!user) throw new ToolDenied("user_not_found");

  // Benefits
  let benefits: ReturnType<typeof import("@/utils/membership/subscription-benefits").getCurrentUserBenefits>;
  if (deps?.getCurrentUserBenefits) {
    benefits = deps.getCurrentUserBenefits(user);
  } else {
    const { getCurrentUserBenefits } = await import("@/utils/membership/subscription-benefits");
    benefits = getCurrentUserBenefits(user);
  }

  // Active package
  let activePkg: ReturnType<typeof import("@/utils/membership/get-active-package").getActivePackage>;
  if (deps?.getActivePackage) {
    activePkg = deps.getActivePackage(user);
  } else {
    const { getActivePackage } = await import("@/utils/membership/get-active-package");
    activePkg = getActivePackage(user);
  }

  // Build projection
  const tier = benefits?.packageName ?? null;
  const packageId = benefits?.packageId ?? null;
  const entriesPerMonth = benefits?.entriesPerMonth ?? 0;
  const isActive = activePkg.isActive;
  const source = activePkg.source;
  const expiresAt = activePkg.expiresAt ? activePkg.expiresAt.toISOString() : null;
  const isPendingChange = benefits?.isPendingChange ?? false;

  let pendingChange: { newPackageName: string; effectiveDate: string } | null = null;
  if (isPendingChange && benefits?.pendingChange) {
    pendingChange = {
      newPackageName: benefits.pendingChange.newPackageName,
      effectiveDate: benefits.pendingChange.effectiveDate instanceof Date
        ? benefits.pendingChange.effectiveDate.toISOString()
        : String(benefits.pendingChange.effectiveDate),
    };
  }

  return {
    tier,
    packageId,
    entriesPerMonth,
    isActive,
    source,
    expiresAt,
    isPendingChange,
    pendingChange,
  };
}

// ─── Registration ─────────────────────────────────────────────────────────────

export const getMyMembershipTool = defineMemberTool({
  name: "getMyMembership",
  description:
    "Return the authenticated member's current membership tier, entry allocation, active status, expiry date, and any pending package change. Does not expose PII.",
  inputSchema: emptyInput,
  responseSchema,
  piiScoped: true,
  handler,
});
