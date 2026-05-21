import type { PaymentReverser, ReversalContext } from "./types";

/**
 * Runs reversal steps in order. Each step is responsible for catching errors
 * and pushing to `ctx.reversalIssues` when appropriate (non-fatal layers).
 *
 * Add new benefit types by registering another {@link PaymentReverser} in
 * `buildLedgerReversalSteps` (`refund-ledger-reversal.ts`).
 */
export async function runReversalOrchestrator(
  ctx: ReversalContext,
  reversers: readonly PaymentReverser[]
): Promise<void> {
  for (const r of reversers) {
    await r.reverse(ctx);
  }
}
