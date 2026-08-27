/**
 * Is `change` a REAL pending subscription upgrade?
 *
 * `User.subscription.pendingChange` is a Mongoose NESTED OBJECT whose sub-fields are all
 * optional, so Mongoose materialises it as `{}` on every hydrated document even when nothing
 * is stored. A truthiness check (`!!user.subscription?.pendingChange`) is therefore ALWAYS
 * TRUE — which is exactly what shipped: measured on 2026-08-26, all 56,360 production
 * profiles carried `subscription_has_pending_upgrade: true` while ZERO users had a real one.
 *
 * Check the payload, never the object's existence.
 *
 * Lives in `utils/` (not `services/`) so the Klaviyo profile projection and the Stripe
 * webhook handlers can share ONE definition — `utils/` may not import from `services/`.
 */
export function isValidPendingUpgrade(change: unknown): boolean {
  if (!change || typeof change !== "object") return false;

  const candidate = change as { changeType?: unknown; newPackageId?: unknown };

  return (
    candidate.changeType === "upgrade" &&
    typeof candidate.newPackageId === "string" &&
    candidate.newPackageId.length > 0
  );
}
