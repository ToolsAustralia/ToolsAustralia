/**
 * Force-collect the CURRENT cycle for a stranded `no_held_draft` past-due member —
 * one who is `past_due` + `pause_collection: keep_as_draft`, whose failed-renewal invoice
 * is dead, and who has NO held draft yet (their next cycle hasn't minted one). The existing
 * `prepareRecoveredCycleInvoice` recovery can't help them (nothing to finalize); this mints
 * a fresh current cycle on demand.
 *
 * Mechanism (verified on a Stripe Test Clock — `npm run stripe:probe-rebill-cycle`):
 *   unpause (Stripe REJECTS invoice creation on a paused sub) → `billing_cycle_anchor: 'now'`
 *   + `proration_behavior: 'none'` → Stripe immediately creates AND auto-charges a fresh cycle
 *   invoice on the customer's default card, AND moves the next renewal ~1 month out (so this
 *   call doubles as the reanchor — no separate `trial_end` step). The minted invoice's
 *   `billing_reason` is **`subscription_update`** (NOT `subscription_cycle`); the entry-grant
 *   webhook normalizes that to a full renewal-size grant off the subscription's LIVE metadata,
 *   which is correct for a straight re-bill (no tier change). The dead original is voided last.
 *
 * Serialized by the per-subscription `RecoveryClaim` so it can never run concurrently with the
 * member Pay-Now / Force-Charge / other recovery flows (the double-charge guard). A SUCCESSFUL
 * mint leaves the member `active` with the renewal moved out, so they no longer route here — the
 * natural idempotency backstop. Best-effort void; a void failure never fails the collection.
 */
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { acquireRecoveryClaim, releaseRecoveryClaim } from "@/utils/payment/recovery/recovery-claim";

export type MintCurrentCycleResult =
  | { ok: true; invoiceId: string; status: Stripe.Invoice.Status | null; amountPaid: number }
  | {
      ok: false;
      reason:
        | "claim_held"
        | "member_ending"
        | "already_collected"
        | "subscription_inactive"
        | "anchor_failed"
        | "no_minted_invoice"
        | "charge_failed";
      message: string;
      invoiceId?: string;
    };

/** Injectable side-effecting deps — default to the real Stripe client + RecoveryClaim. */
export interface MintCurrentCycleDeps {
  acquireClaim: (subscriptionId: string, claimedBy: string) => Promise<boolean>;
  releaseClaim: (subscriptionId: string) => Promise<void>;
  /** Live re-read UNDER the claim — the double-charge + cancel guards read `status` + `cancel_at_period_end` off this. */
  getSubscription: (subscriptionId: string) => Promise<Stripe.Subscription>;
  /** Unpause + set billing_cycle_anchor:'now' + proration_behavior:'none'; returns the updated sub with `latest_invoice` expanded. */
  unpauseAndAnchorNow: (subscriptionId: string) => Promise<Stripe.Subscription>;
  voidInvoice: (invoiceId: string) => Promise<void>;
}

function defaultDeps(): MintCurrentCycleDeps {
  return {
    acquireClaim: acquireRecoveryClaim,
    releaseClaim: releaseRecoveryClaim,
    getSubscription: (subscriptionId) => stripe.subscriptions.retrieve(subscriptionId),
    unpauseAndAnchorNow: (subscriptionId) =>
      stripe.subscriptions.update(subscriptionId, {
        pause_collection: "", // MUST unpause first — Stripe rejects invoice creation while paused.
        billing_cycle_anchor: "now",
        proration_behavior: "none",
        // billing_anchor_rule: a durable AUDIT tag identifying this as a re-bill (not read by the webhook
        // — the renewal-vs-upgrade split is driven by upgradeFrom below + the success-path entry
        // normalization; the failure-side "Subscription Renewal Failed" event is driven by `isRebill`,
        // i.e. a subscription_update failure while past_due/unpaid). ALSO blank any stale upgrade markers —
        // Stripe MERGES metadata, and a previously-upgraded member still carries upgradeFrom/upgradeType,
        // which would misclassify this re-bill as an upgrade (promo-inflated entries). "" deletes the key.
        metadata: {
          billing_anchor_rule: "rebill_current_cycle",
          upgradeFrom: "",
          upgradeType: "",
          upgradeDate: "",
          upgradeFromName: "",
        },
        expand: ["latest_invoice"],
      }),
    voidInvoice: async (invoiceId) => {
      await stripe.invoices.voidInvoice(invoiceId);
    },
  };
}

export async function mintCurrentCycleInvoice(
  params: {
    subscriptionId: string;
    /** The dead stranded original to void after minting (best-effort). Omit if none. */
    originalInvoiceId?: string | null;
    /** For the RecoveryClaim audit — e.g. `"admin:<id>"` or `"member"`. */
    claimedBy: string;
    /** When the CALLER already holds this subscription's RecoveryClaim (the BULK charge job), skip
     *  acquiring + releasing it here — otherwise the mint would always self-deadlock to `claim_held`
     *  under bulk. The per-user path holds no claim, so it leaves this false and the mint acquires its own. */
    skipClaim?: boolean;
  },
  deps: MintCurrentCycleDeps = defaultDeps()
): Promise<MintCurrentCycleResult> {
  const { subscriptionId, originalInvoiceId, claimedBy } = params;

  const claimed = params.skipClaim ? true : await deps.acquireClaim(subscriptionId, claimedBy);
  if (!claimed) {
    return {
      ok: false,
      reason: "claim_held",
      message: "Another recovery for this subscription is already in progress. Try again shortly.",
    };
  }

  try {
    // Guards on a LIVE re-read, UNDER the claim (race-safe — not fooled by webhook/DB lag):
    let live: Stripe.Subscription;
    try {
      live = await deps.getSubscription(subscriptionId);
    } catch (err) {
      return { ok: false, reason: "anchor_failed", message: err instanceof Error ? err.message : String(err) };
    }
    // (D) Never re-bill a member who is ENDING — `billing_cycle_anchor:'now'` would extend their renewal
    // ~1 month and silently reverse the cancellation they requested. `cancel_at_period_end` mirrors DB autoRenew.
    if (live.cancel_at_period_end === true) {
      return { ok: false, reason: "member_ending", message: "Member is scheduled to cancel — not re-billed." };
    }
    // (A) Idempotency: a member whose prior re-bill already SUCCEEDED is `active`/`trialing` now, not
    // past_due — refuse to re-anchor (a second charge). A FAILED prior mint leaves them past_due (+
    // unpaused), still retryable → correctly allowed. Live status (not DB) so webhook lag can't trick it
    // into a double-charge. Split OUT the terminal non-collectible statuses (canceled / incomplete /
    // incomplete_expired): those are NOT "already collected", and a caller (member Resolve) must not
    // report a false "paid" for a canceled member — surface a distinct `subscription_inactive` reason.
    if (live.status !== "past_due" && live.status !== "unpaid") {
      if (live.status === "active" || live.status === "trialing") {
        return {
          ok: false,
          reason: "already_collected",
          message: `Subscription is "${live.status}" — a prior re-bill already collected this cycle.`,
        };
      }
      return {
        ok: false,
        reason: "subscription_inactive",
        message: `Subscription is "${live.status}", not collectible — cannot re-bill.`,
      };
    }

    let updated: Stripe.Subscription;
    try {
      updated = await deps.unpauseAndAnchorNow(subscriptionId);
    } catch (err) {
      return { ok: false, reason: "anchor_failed", message: err instanceof Error ? err.message : String(err) };
    }

    // The forced cycle invoice is the sub's latest_invoice after the anchor reset.
    const latest = updated.latest_invoice;
    const invoice = latest && typeof latest !== "string" ? (latest as Stripe.Invoice) : null;
    if (!invoice?.id) {
      return { ok: false, reason: "no_minted_invoice", message: "billing_cycle_anchor:'now' produced no invoice" };
    }

    // Void the dead original LAST (best-effort — collection already happened on the new invoice).
    if (originalInvoiceId && originalInvoiceId !== invoice.id) {
      try {
        await deps.voidInvoice(originalInvoiceId);
      } catch {
        // non-fatal: a lingering dead original is cleanup, not a collection failure.
      }
    }

    // 'paid' = auto-charged successfully on unpause+anchor. Anything else = the card didn't settle;
    // the member is effectively past_due again on a fresh cycle (a later run can retry).
    if (invoice.status === "paid") {
      return { ok: true, invoiceId: invoice.id, status: invoice.status, amountPaid: invoice.amount_paid ?? 0 };
    }
    return {
      ok: false,
      reason: "charge_failed",
      message: `Minted cycle invoice did not settle (status=${invoice.status ?? "unknown"})`,
      invoiceId: invoice.id,
    };
  } finally {
    if (!params.skipClaim) await deps.releaseClaim(subscriptionId).catch(() => {});
  }
}
