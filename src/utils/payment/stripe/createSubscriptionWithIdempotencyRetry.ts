import Stripe from "stripe";

interface CreateSubscriptionWithIdempotencyRetryOptions {
  stripe: Stripe;
  payload: Stripe.SubscriptionCreateParams;
  idempotencyKey: string;
  /** Used to scope orphan-cleanup search after an idempotency conflict. */
  customerId: string;
  /** Used to identify which incomplete subscription is the orphan to cancel. */
  packageId: string;
  /** Optional correlation id for log lines. */
  correlationId?: string;
}

/**
 * Wrap `stripe.subscriptions.create` with a one-shot retry on
 * `StripeIdempotencyError`. The retry first attempts to cancel the orphan
 * incomplete subscription that the original (idempotency-cached) request
 * created on Stripe — matched by `customer + metadata.packageId` — then
 * issues a fresh-key create. Cancel failure is non-fatal: Stripe auto-expires
 * unpaid incomplete subs in ~23 hours.
 *
 * Why this exists: server-side metadata (capi_*, attribution) can drift
 * between retries with the same client-supplied UUID, tripping Stripe's
 * "same key, different params" guard and locking customers out of checkout
 * for 24h. See docs/billing-stripe/gotchas.md.
 */
export async function createSubscriptionWithIdempotencyRetry(
  opts: CreateSubscriptionWithIdempotencyRetryOptions
): Promise<Stripe.Subscription> {
  const { stripe, payload, idempotencyKey, customerId, packageId, correlationId } = opts;

  try {
    return await stripe.subscriptions.create(payload, { idempotencyKey });
  } catch (err) {
    if (!(err instanceof Stripe.errors.StripeIdempotencyError)) {
      throw err;
    }

    console.warn(
      "[createSubscriptionWithIdempotencyRetry] idempotency conflict; cancelling orphan and retrying",
      {
        ...(correlationId ? { correlationId } : {}),
        customerId,
        packageId,
        originalKey: idempotencyKey,
      }
    );

    await cancelMatchingIncompleteSubscription({ stripe, customerId, packageId, correlationId });

    const freshKey = crypto.randomUUID();
    return await stripe.subscriptions.create(payload, { idempotencyKey: freshKey });
  }
}

async function cancelMatchingIncompleteSubscription(opts: {
  stripe: Stripe;
  customerId: string;
  packageId: string;
  correlationId?: string;
}): Promise<void> {
  const { stripe, customerId, packageId, correlationId } = opts;

  try {
    const incomplete = await stripe.subscriptions.list({
      customer: customerId,
      status: "incomplete",
      limit: 5,
    });

    const match = incomplete.data.find((sub) => sub.metadata?.packageId === packageId);
    if (!match) return;

    await stripe.subscriptions.cancel(match.id);
    console.log("[createSubscriptionWithIdempotencyRetry] cancelled orphan incomplete subscription", {
      ...(correlationId ? { correlationId } : {}),
      cancelledId: match.id,
    });
  } catch (cancelErr) {
    console.warn("[createSubscriptionWithIdempotencyRetry] orphan cancel failed (non-fatal)", {
      ...(correlationId ? { correlationId } : {}),
      error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
    });
  }
}
