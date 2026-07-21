/**
 * classifyMemberResolveMintOutcome — pure mapper for the member "Resolve past due" mint branch.
 * No network / no Mongo (the imported type is erased at runtime). Run: npm run test:member-resolve-mint
 */
import assert from "node:assert/strict";
import { classifyMemberResolveMintOutcome } from "../member-resolve-mint-policy";
import type { MintCurrentCycleResult } from "@/services/subscription/mintCurrentCycleInvoice";

function run() {
  // Auto-charged on the default card → success state.
  assert.equal(
    classifyMemberResolveMintOutcome({ ok: true, invoiceId: "in_1", status: "paid", amountPaid: 2000 }).kind,
    "collected",
    "ok → collected"
  );

  // A prior re-bill already collected → member is active → treat as done (success), NOT an error.
  assert.equal(
    classifyMemberResolveMintOutcome({ ok: false, reason: "already_collected", message: "" }).kind,
    "collected",
    "already_collected → collected"
  );

  // Default card declined / needs 3DS off_session → prompt add-a-card (route returns requiresNewCardPreflight).
  assert.equal(
    classifyMemberResolveMintOutcome({ ok: false, reason: "charge_failed", message: "", invoiceId: "in_1" }).kind,
    "retry_interactively",
    "charge_failed → retry_interactively"
  );

  // Blocked states → terminal contact-support.
  for (const reason of ["member_ending", "subscription_inactive", "anchor_failed", "no_minted_invoice", "claim_held"] as const) {
    const out = classifyMemberResolveMintOutcome({ ok: false, reason, message: "" } as MintCurrentCycleResult);
    assert.equal(out.kind, "blocked", `${reason} → blocked`);
    if (out.kind === "blocked") assert.equal(out.reason, reason, `blocked carries the reason (${reason})`);
  }

  console.log("member-resolve-mint-policy tests passed");
}

run();
