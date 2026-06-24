/**
 * getMyBillingStatus — read-only member tool.
 *
 * Returns a safe billing status projection from the user's subscription field.
 * NEVER exposes: stripeCustomerId, stripeSubscriptionId, savedPaymentMethods,
 * card data, or any payment method identifiers.
 *
 * Services used (injected via MemberToolDeps for testability):
 *   - findUserById(ctx.actor.userId) — direct User model access
 */

import { z } from "zod";
import { defineMemberTool, emptyInput, ToolDenied } from "./registry";
import type { MemberToolCtx, MemberToolDeps } from "./registry";

// ─── Response schema (strict) ──────────────────────────────────────────────────

const responseSchema = z
  .object({
    subscriptionStatus: z.string().nullable(),
    isActive: z.boolean(),
    autoRenew: z.boolean(),
    nextBillingDate: z.string().nullable(),
    isCancelled: z.boolean(),
  })
  .strict();

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handler(ctx: MemberToolCtx, deps?: MemberToolDeps): Promise<unknown> {
  const { actor } = ctx;
  if (actor.kind !== "member") throw new ToolDenied("login_required");

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

  const sub = user.subscription;

  const subscriptionStatus = sub?.status ?? null;
  const isActive = !!sub?.isActive;
  const autoRenew = !!sub?.autoRenew;
  const nextBillingDate = sub?.endDate
    ? new Date(sub.endDate).toISOString()
    : null;
  // isCancelled: user turned off auto-renew but the period hasn't expired yet
  const isCancelled = !sub?.autoRenew && !!sub?.isActive;

  return {
    subscriptionStatus,
    isActive,
    autoRenew,
    nextBillingDate,
    isCancelled,
  };
}

// ─── Registration ─────────────────────────────────────────────────────────────

export const getMyBillingStatusTool = defineMemberTool({
  name: "getMyBillingStatus",
  description:
    "Return the authenticated member's subscription billing status — active/inactive, auto-renew flag, next billing date, and whether it has been cancelled. Never exposes Stripe IDs, card data, or payment methods.",
  inputSchema: emptyInput,
  responseSchema,
  piiScoped: true,
  handler,
});
