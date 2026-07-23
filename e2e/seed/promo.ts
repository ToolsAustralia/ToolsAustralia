import type { Connection } from "mongoose";
import { ADMIN } from "../helpers/db";

/**
 * Seeds an active sitewide membership promo — ONLY when `E2E_PROMO` is set (the
 * dedicated `npm run e2e:journey` mode via run.ts's `--promo` flag).
 *
 * NEVER seeded in ordinary runs: an active membership promo multiplies every
 * subscription grant (webhook: baseEntries × promoMultiplier,
 * src/utils/payment/subscription-entries-calculator.ts:66), which would break the
 * sibling purchase specs' exact-count assertions (toBe(15)) and invalidate the
 * /membership + /my-account visual baselines (X{n} badges, multiplied figures).
 *
 * Doc shape mirrors exactly what POST /api/admin/promo/toggle creates
 * (src/app/api/admin/promo/toggle/route.ts:81-92); the resolver reads it via
 * Promo.findOne({ type, isActive: true }).sort({ createdAt: -1 }) with priority
 * Scheduled > Toggle > Alternating (src/services/admin/PromoMultiplierResolverService.ts)
 * and NO server-side caching — effective immediately. Raw-driver insert bypasses
 * Mongoose defaults, so isActive/createdAt are set explicitly.
 */
export async function seedPromoIfRequested(c: Connection): Promise<void> {
  const raw = process.env.E2E_PROMO;
  if (!raw) return;
  const multiplier = Number(raw);
  // 5 and 10 are the two production-style promo tiers whose upsell artwork variants
  // exist on disk (membership/apprentice-50x.webp / -100x.webp) — the journey spec
  // asserts the promo-correct image, so only these values are meaningful here.
  if (multiplier !== 5 && multiplier !== 10) {
    throw new Error(`E2E_PROMO must be 5 or 10 (got "${raw}")`);
  }

  const admin = await c.collection("users").findOne({ email: ADMIN.email }, { projection: { _id: 1 } });
  if (!admin) throw new Error("seedPromoIfRequested: seed users before the promo — admin not found");

  const now = new Date();
  await c.collection("promos").insertOne({
    type: "membership-packages",
    multiplier,
    isActive: true,
    createdBy: admin._id,
    // Backward-compat fields the admin toggle route also writes (optional in schema):
    startDate: now,
    endDate: new Date(now.getTime() + 365 * 24 * 3600 * 1000),
    duration: 24,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`[e2e] seeded active ${multiplier}x membership promo (E2E_PROMO=${raw})`);
}
