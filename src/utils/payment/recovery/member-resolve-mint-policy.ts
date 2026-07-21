import type { MintCurrentCycleResult } from "@/services/subscription/mintCurrentCycleInvoice";

/**
 * Member "Resolve past due" → current-cycle mint outcome, mapped to what the modal does next.
 *
 * When a stranded `no_held_draft` member clicks "Resolve payment", `pay-failed-invoice` mints a
 * fresh current cycle on their DEFAULT card via `mintCurrentCycleInvoice` (the same primitive the
 * admin per-user Charge and the bulk run use). This pure mapper turns the mint result into the
 * member-facing response category, so the route branch is unit-testable without Stripe/Mongo.
 *
 *  - `collected`           → the card auto-charged (ok), OR a prior re-bill already made the member
 *                            active/trialing (`already_collected`) → show the success state.
 *  - `retry_interactively` → the off_session auto-charge on the default card didn't settle (a decline,
 *                            or a 3DS/SCA card that off_session can't authenticate). The route responds
 *                            with `requiresNewCardPreflight` (prompt the member to add a working card);
 *                            their retry then collects on the new default via the NORMAL open-invoice pay
 *                            path (the minted invoice stays `still_chargeable`, so it is not re-minted).
 *  - `blocked`             → member is scheduled to cancel (re-billing would silently reverse that), the
 *                            subscription is not collectible (canceled / incomplete / incomplete_expired →
 *                            `subscription_inactive`), a Stripe error occurred while minting, or the claim
 *                            is held (unreachable under `skipClaim`) → terminal "contact support" state.
 */
export type MemberResolveMintOutcome =
  | { kind: "collected" }
  | { kind: "retry_interactively" }
  | { kind: "blocked"; reason: string };

export function classifyMemberResolveMintOutcome(
  mint: MintCurrentCycleResult
): MemberResolveMintOutcome {
  if (mint.ok) return { kind: "collected" };
  switch (mint.reason) {
    case "already_collected":
      return { kind: "collected" };
    case "charge_failed":
      return { kind: "retry_interactively" };
    case "member_ending":
    case "subscription_inactive":
    case "anchor_failed":
    case "no_minted_invoice":
    case "claim_held":
      return { kind: "blocked", reason: mint.reason };
    default: {
      // Exhaustiveness guard: a new MintCurrentCycleResult reason surfaces here as a compile error.
      const _exhaustive: never = mint.reason;
      void _exhaustive;
      return { kind: "blocked", reason: String((mint as { reason?: unknown }).reason) };
    }
  }
}
