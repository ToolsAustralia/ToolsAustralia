import type { IPaymentEvent } from "@/models/PaymentEvent";

/**
 * One reversible step in the BenefitsGranted ledger replay.
 * Keep steps small and named so failures can be recorded in `reversalIssues`.
 */
export interface ReversalContext {
  userId: string;
  originalEvent: IPaymentEvent;
  paymentIntentId: string;
  refundEventId: string;
  reversalIssues: Array<{ step: string; error: string }>;
}

export interface PaymentReverser {
  /** Stable id for logging / reversalIssues (e.g. `drawGrant:major:membership`) */
  readonly stepId: string;
  reverse(ctx: ReversalContext): Promise<void>;
}
