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
      reason: "claim_held" | "anchor_failed" | "no_minted_invoice" | "charge_failed";
      message: string;
      invoiceId?: string;
    };

/** Injectable side-effecting deps — default to the real Stripe client + RecoveryClaim. */
export interface MintCurrentCycleDeps {
  acquireClaim: (subscriptionId: string, claimedBy: string) => Promise<boolean>;
  releaseClaim: (subscriptionId: string) => Promise<void>;
  /** Unpause + set billing_cycle_anchor:'now' + proration_behavior:'none'; returns the updated sub with `latest_invoice` expanded. */
  unpauseAndAnchorNow: (subscriptionId: string) => Promise<Stripe.Subscription>;
  voidInvoice: (invoiceId: string) => Promise<void>;
}

function defaultDeps(): MintCurrentCycleDeps {
  return {
    acquireClaim: acquireRecoveryClaim,
    releaseClaim: releaseRecoveryClaim,
    unpauseAndAnchorNow: (subscriptionId) =>
      stripe.subscriptions.update(subscriptionId, {
        pause_collection: "", // MUST unpause first — Stripe rejects invoice creation while paused.
        billing_cycle_anchor: "now",
        proration_behavior: "none",
        metadata: { billing_anchor_rule: "rebill_current_cycle" },
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
  },
  deps: MintCurrentCycleDeps = defaultDeps()
): Promise<MintCurrentCycleResult> {
  const { subscriptionId, originalInvoiceId, claimedBy } = params;

  const claimed = await deps.acquireClaim(subscriptionId, claimedBy);
  if (!claimed) {
    return {
      ok: false,
      reason: "claim_held",
      message: "Another recovery for this subscription is already in progress. Try again shortly.",
    };
  }

  try {
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
    await deps.releaseClaim(subscriptionId).catch(() => {});
  }
}
