/**
 * `resolveTypedCodeAtCheckout` — the purchase-click resolve for a discount code
 * the customer typed but never pressed Apply on.
 *
 * WHY EACH CASE EARNS ITS PLACE.
 *
 * 1. THE 429/500 CASES ARE THE POINT OF THIS FILE. `/api/codes/validate` returns
 *    `{ success: false, valid: false }` for BOTH its own rate limiter (429) and
 *    its own outage (500), and `{ success: true, valid: false }` at HTTP 200 for
 *    a genuine refusal. A `!body.valid` read would therefore make our rate
 *    limiter and our downtime START STOPPING SALES — a strictly worse failure
 *    than the bug being fixed, and one `tsc` cannot see. Both directions are
 *    pinned: a real refusal must refuse, and an infrastructure answer must not.
 *
 * 2. CLASSIFICATION SURVIVES. The code box takes three kinds of code (referral,
 *    promo-link, campaign) and the modals branch on the type. A resolve that
 *    flattened them to "campaign" would silently convert a referral into a
 *    campaign claim, so each type is asserted separately.
 *
 * 3. THE TIMEOUT IS EXERCISED, not assumed. A fetch that never settles must abort
 *    at the cap and come back `inconclusive` — the branch that keeps the sale
 *    alive when we cannot get an answer. An unexercised timeout is a promise, not
 *    a behaviour.
 *
 * 4. RULE 11 over the assembled copy. Every string here is customer-facing at the
 *    most sensitive moment there is, and the ban list mirrors the FAQ corpus's.
 *
 * What this file CANNOT prove: that the modals thread the answer into the charge.
 * There is no DOM runner in this repo, and a source-text grep guard is the exact
 * pattern `campaign-code-metadata.test.ts` was written to replace. The e2e case
 * "types the code, never presses Apply" in e2e/specs/membership/bonus-code-journey.spec.ts
 * is the executable proof of that half.
 */

import {
  evaluatePurchaseRequirementGate,
  resolveTypedCodeAtCheckout,
  typedCodeRefusalCopy,
  TYPED_CODE_RESOLVE_TIMEOUT_MS,
  type TypedCodeResolution,
} from "../typed-code-at-checkout";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const pass = Object.is(actual, expected);
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${pass ? "" : ` — expected ${String(expected)}, got ${String(actual)}`}`);
}

function checkTrue(label: string, actual: boolean): void {
  check(label, actual, true);
}

type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function stubFetch(handler: FetchStub): void {
  (globalThis as { fetch: FetchStub }).fetch = handler;
}

/** A minimal Response stand-in — the module reads only `ok` and `json()`. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Captured request bodies, so the `preferType: "auto"` contract is checkable. */
const sentBodies: Record<string, unknown>[] = [];

function respondWith(status: number, body: unknown): void {
  stubFetch(async (_input, init) => {
    if (init?.body && typeof init.body === "string") {
      sentBodies.push(JSON.parse(init.body) as Record<string, unknown>);
    }
    return jsonResponse(status, body);
  });
}

const RULE_11_BANNED = [
  "odds",
  "chance",
  "lottery",
  "lotto",
  "raffle",
  "sweepstake",
  "gamble",
  "bet ",
  "per entry",
  "buy entries",
  "purchase entries",
];

async function run(): Promise<void> {
  console.log("resolveTypedCodeAtCheckout\n");

  // ── 1. RESOLVED, one leg per code type ──────────────────────────────────
  respondWith(200, {
    success: true,
    valid: true,
    type: "campaign",
    data: { code: "BACKIN200", purchaseRequirement: "membership" },
  });
  let res: TypedCodeResolution = await resolveTypedCodeAtCheckout({ code: "backin200" });
  check("campaign code resolves", res.status, "resolved");
  check("  …as a campaign", res.status === "resolved" ? res.type : null, "campaign");
  check("  …normalized+uppercased", res.status === "resolved" ? res.code : null, "BACKIN200");
  check(
    "  …carrying the purchase requirement",
    res.status === "resolved" ? res.purchaseRequirement : null,
    "membership"
  );
  check("  …asking for auto classification", sentBodies.at(-1)?.preferType, "auto");

  respondWith(200, {
    success: true,
    valid: true,
    type: "referral",
    data: { referrerName: "Dave" },
  });
  res = await resolveTypedCodeAtCheckout({ code: "MATE-CODE", inviteeEmail: "a@b.com" });
  check("referral code resolves as a REFERRAL, not flattened", res.status === "resolved" ? res.type : null, "referral");
  check("  …carrying the referrer name", res.status === "resolved" ? res.referrerName : null, "Dave");
  check("  …passing the invitee email through", sentBodies.at(-1)?.inviteeEmail, "a@b.com");

  respondWith(200, {
    success: true,
    valid: true,
    type: "promo",
    data: { code: "SPRING25", bonusEntries: 5 },
  });
  res = await resolveTypedCodeAtCheckout({ code: "SPRING25" });
  check("promo code resolves as a PROMO", res.status === "resolved" ? res.type : null, "promo");
  check("  …with no purchase requirement invented", res.status === "resolved" ? res.purchaseRequirement : null, undefined);

  // ── 2. REFUSED — a definite server answer that the code is wrong ─────────
  respondWith(200, { success: true, valid: false, reason: "not_found", message: "Invalid campaign code" });
  res = await resolveTypedCodeAtCheckout({ code: "BACKIN20" });
  check("an unrecognised code is REFUSED", res.status, "refused");
  check(
    "  …named back to the customer, because it is a typo",
    res.status === "refused" ? res.message : null,
    "We don't recognise BACKIN20."
  );

  respondWith(200, {
    success: true,
    valid: false,
    reason: "already_redeemed",
    message: "This code has already been redeemed.",
  });
  res = await resolveTypedCodeAtCheckout({ code: "LOCKIN100" });
  check("an already-redeemed code is REFUSED", res.status, "refused");
  check(
    "  …using the server's own sentence verbatim",
    res.status === "refused" ? res.message : null,
    "This code has already been redeemed."
  );

  respondWith(200, {
    success: true,
    valid: false,
    reason: "expired",
    message: "This code expired on Monday 5 October 2026, 3:00PM AEDT.",
  });
  res = await resolveTypedCodeAtCheckout({ code: "EXTRA100" });
  check(
    "an expired code keeps the DATED server sentence",
    res.status === "refused" ? res.message : null,
    "This code expired on Monday 5 October 2026, 3:00PM AEDT."
  );

  respondWith(200, { success: true, valid: false, reason: "not_held", message: "This code isn't available on your account." });
  res = await resolveTypedCodeAtCheckout({ code: "EXTRA100" });
  check("a not-held code is REFUSED", res.status, "refused");

  // ── 3. INCONCLUSIVE — our failure, never the customer's ──────────────────
  // These four are the reason this module exists as a shared classifier.
  respondWith(429, { success: false, valid: false, error: "Too many requests" });
  res = await resolveTypedCodeAtCheckout({ code: "BACKIN200" });
  check("OUR RATE LIMITER (429) is inconclusive, NOT a refusal", res.status, "inconclusive");
  check("  …classified as http", res.status === "inconclusive" ? res.reason : null, "http");

  respondWith(500, { success: false, valid: false, error: "Failed to validate code" });
  res = await resolveTypedCodeAtCheckout({ code: "BACKIN200" });
  check("OUR OUTAGE (500) is inconclusive, NOT a refusal", res.status, "inconclusive");

  respondWith(400, { success: false, valid: false, error: "Validation error" });
  res = await resolveTypedCodeAtCheckout({ code: "BACKIN200" });
  check("a 400 is inconclusive, NOT a refusal", res.status, "inconclusive");

  respondWith(200, { success: false });
  res = await resolveTypedCodeAtCheckout({ code: "BACKIN200" });
  check("HTTP 200 with success:false is inconclusive", res.status, "inconclusive");

  respondWith(200, { success: true, valid: true, type: "mystery", data: {} });
  res = await resolveTypedCodeAtCheckout({ code: "BACKIN200" });
  check("an UNKNOWN type is inconclusive, never guessed at", res.status, "inconclusive");
  check("  …classified as shape", res.status === "inconclusive" ? res.reason : null, "shape");

  respondWith(200, { success: true });
  res = await resolveTypedCodeAtCheckout({ code: "BACKIN200" });
  check("a body with neither valid:true nor valid:false is inconclusive", res.status, "inconclusive");

  stubFetch(async () => {
    throw new Error("network down");
  });
  res = await resolveTypedCodeAtCheckout({ code: "BACKIN200" });
  check("a thrown fetch is inconclusive", res.status, "inconclusive");
  check("  …classified as network", res.status === "inconclusive" ? res.reason : null, "network");

  stubFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("not json");
    },
  }) as unknown as Response);
  res = await resolveTypedCodeAtCheckout({ code: "BACKIN200" });
  check("an unparseable body is inconclusive", res.status, "inconclusive");

  // ── 4. EMPTY ────────────────────────────────────────────────────────────
  let fetchCalls = 0;
  stubFetch(async () => {
    fetchCalls++;
    return jsonResponse(200, { success: true, valid: true, type: "campaign", data: { code: "X" } });
  });
  res = await resolveTypedCodeAtCheckout({ code: "   " });
  check("a whitespace-only box resolves to none", res.status, "none");
  check("  …without touching the network", fetchCalls, 0);

  // ── 5. THE TIMEOUT, ACTUALLY EXERCISED ──────────────────────────────────
  // A fetch that honours the abort signal and never settles otherwise — the
  // real-world shape of a stalled lambda.
  stubFetch((_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(new Error("The operation was aborted.")));
    })
  );
  const startedAt = Date.now();
  res = await resolveTypedCodeAtCheckout({ code: "BACKIN200" });
  const elapsed = Date.now() - startedAt;
  check("a fetch that never settles ends inconclusive", res.status, "inconclusive");
  check("  …classified as timeout", res.status === "inconclusive" ? res.reason : null, "timeout");
  checkTrue(
    `  …at the cap (${TYPED_CODE_RESOLVE_TIMEOUT_MS}ms), not forever — took ${elapsed}ms`,
    elapsed >= TYPED_CODE_RESOLVE_TIMEOUT_MS - 250 && elapsed < TYPED_CODE_RESOLVE_TIMEOUT_MS + 2_000
  );

  // ── 6. THE PURCHASE-REQUIREMENT GATE — THE SECOND PRESS MUST BUY ────────
  //
  // THE REGRESSION THIS SECTION EXISTS TO STOP COMING BACK.
  //
  // The gate that rejects a "memberships only" code typed on a one-time pack
  // used to toast and return WITHOUT recording anything. The next press re-read
  // the same state, hit the same branch, and stopped again — with no second
  // press that worked and no sentence telling the customer how to get out. That
  // is a permanently blocked sale, which is strictly worse than the silent
  // dropped code this whole branch was written to fix: before it, that customer
  // simply bought the pack.
  //
  // So the load-bearing assertion is not "the first press stops". It is
  // "THE SECOND PRESS, WITH THE SAME INPUTS, BUYS." Both directions are pinned,
  // for both requirement values, on both surfaces' button labels.
  console.log("\nevaluatePurchaseRequirementGate — asked once, second press buys\n");

  // Press 1: member on a ONE-TIME pack types a membership-only campaign code.
  const firstPress = evaluatePurchaseRequirementGate({
    campaignCode: "MEMBERSONLY",
    purchaseRequirement: "membership",
    isSubscriptionPurchase: false,
    ctaLabel: "Purchase",
    previousStop: null,
  });
  check("press 1 stops the customer", firstPress.outcome, "stop");
  // `check` compares by identity, so the pairing is compared as text — it is the
  // PAIRING that matters here, not the object.
  check(
    "  …and names the exact code AND the purchase kind to remember",
    JSON.stringify(firstPress.outcome === "stop" ? firstPress.stop : null),
    JSON.stringify({ code: "MEMBERSONLY", isSubscriptionPurchase: false })
  );
  checkTrue(
    "  …and the message tells them what pressing Purchase again will do",
    firstPress.outcome === "stop" && firstPress.message.includes("Press Purchase again to continue without it")
  );

  // Press 2: IDENTICAL inputs, plus the refusal the surface recorded. This is
  // the assertion. If it ever reads "stop", the sale is walled off again.
  const secondPress = evaluatePurchaseRequirementGate({
    campaignCode: "MEMBERSONLY",
    purchaseRequirement: "membership",
    isSubscriptionPurchase: false,
    ctaLabel: "Purchase",
    previousStop: { code: "MEMBERSONLY", isSubscriptionPurchase: false },
  });
  check(
    "PRESS 2 WITH THE SAME INPUTS BUYS — the sale is never walled off",
    secondPress.outcome,
    "allow_without_code"
  );

  // ── 6b. A1 — THE SWITCH THE STOP'S OWN COPY SENDS THEM ON ────────────────
  //
  // THE REGRESSION THIS SECTION EXISTS TO STOP COMING BACK.
  //
  // The stop above says, in these words, "This code is for membership packs
  // only." The sensible customer does exactly what that implies: they switch to
  // a membership tier, where the code is perfectly valid. When the stop was
  // remembered by CODE ALONE, that switch was silently fatal — the surface saw
  // "already refused", skipped the resolve, and charged them for the membership
  // with their one-per-lifetime grant dropped and the code still sitting in the
  // box looking applied. The fix's own message was what routed them into the
  // loss, which makes it worse than an inherited bug.
  //
  // The stop is therefore keyed on (code + purchase kind). Switching kind is a
  // NEW question and must be asked again — and here, with the requirement now
  // satisfied, the answer is simply "allow", carrying the code.
  check(
    "A1: the SAME code, after switching to a membership, is honoured — not remembered as refused",
    evaluatePurchaseRequirementGate({
      campaignCode: "MEMBERSONLY",
      purchaseRequirement: "membership",
      // The switch. Everything else is identical to the press that stopped.
      isSubscriptionPurchase: true,
      ctaLabel: "Purchase",
      previousStop: { code: "MEMBERSONLY", isSubscriptionPurchase: false },
    }).outcome,
    "allow"
  );
  // …and the escape is not lost by the switch either: coming BACK to a one-time
  // pack still buys on the next press rather than re-walling the sale.
  check(
    "A1: switching back to a pack still lets the next press buy, without the code",
    evaluatePurchaseRequirementGate({
      campaignCode: "MEMBERSONLY",
      purchaseRequirement: "membership",
      isSubscriptionPurchase: false,
      ctaLabel: "Purchase",
      previousStop: { code: "MEMBERSONLY", isSubscriptionPurchase: false },
    }).outcome,
    "allow_without_code"
  );
  // The mirror image, so the rule is symmetric and not an accident of one value:
  // a one-time-only code stopped on a membership must come back on a pack.
  check(
    "A1 (mirror): a pack-only code stopped on a membership is honoured on a pack",
    evaluatePurchaseRequirementGate({
      campaignCode: "PACKONLY",
      purchaseRequirement: "one-time",
      isSubscriptionPurchase: false,
      ctaLabel: "Buy Now",
      previousStop: { code: "PACKONLY", isSubscriptionPurchase: true },
    }).outcome,
    "allow"
  );

  // The escape survives the normalisation the modals apply to the field.
  check(
    "  …and survives casing/whitespace drift between press and memory",
    evaluatePurchaseRequirementGate({
      campaignCode: "MEMBERSONLY",
      purchaseRequirement: "membership",
      isSubscriptionPurchase: false,
      ctaLabel: "Purchase",
      previousStop: { code: "  membersonly ", isSubscriptionPurchase: false },
    }).outcome,
    "allow_without_code"
  );

  // A DIFFERENT code is a different question — the escape must not leak across.
  check(
    "a different code is still asked about once",
    evaluatePurchaseRequirementGate({
      campaignCode: "OTHERCODE",
      purchaseRequirement: "membership",
      isSubscriptionPurchase: false,
      ctaLabel: "Purchase",
      previousStop: { code: "MEMBERSONLY", isSubscriptionPurchase: false },
    }).outcome,
    "stop"
  );

  // The mirrored requirement, on the other surface's label.
  const oneTimeOnly = evaluatePurchaseRequirementGate({
    campaignCode: "PACKONLY",
    purchaseRequirement: "one-time",
    isSubscriptionPurchase: true,
    ctaLabel: "Buy Now",
    previousStop: null,
  });
  check("a one-time-only code on a membership stops once", oneTimeOnly.outcome, "stop");
  checkTrue(
    "  …in that surface's own words",
    oneTimeOnly.outcome === "stop" && oneTimeOnly.message.includes("Tap Buy Now again to continue without it")
  );
  check(
    "  …and its second tap buys too",
    evaluatePurchaseRequirementGate({
      campaignCode: "PACKONLY",
      purchaseRequirement: "one-time",
      isSubscriptionPurchase: true,
      ctaLabel: "Buy Now",
      previousStop: { code: "PACKONLY", isSubscriptionPurchase: true },
    }).outcome,
    "allow_without_code"
  );

  // Nothing else may stop a sale. These are the live configurations today —
  // all three codes going out this week are `purchaseRequirement: "none"`.
  for (const [label, args] of [
    ["a matching requirement", { purchaseRequirement: "membership" as const, isSubscriptionPurchase: true }],
    ["`none`", { purchaseRequirement: "none" as const, isSubscriptionPurchase: false }],
    ["`any`", { purchaseRequirement: "any" as const, isSubscriptionPurchase: false }],
    ["an absent requirement", { purchaseRequirement: null, isSubscriptionPurchase: false }],
  ] as const) {
    check(
      `${label} never stops a sale`,
      evaluatePurchaseRequirementGate({
        campaignCode: "BACKIN200",
        ctaLabel: "Purchase",
        ...args,
      }).outcome,
      "allow"
    );
  }
  check(
    "no code at all never stops a sale",
    evaluatePurchaseRequirementGate({
      campaignCode: undefined,
      purchaseRequirement: "membership",
      isSubscriptionPurchase: false,
      ctaLabel: "Purchase",
    }).outcome,
    "allow"
  );

  // Rule 11 over the gate's own sentences — same ban list as the refusal copy.
  for (const copy of [
    firstPress.outcome === "stop" ? firstPress.message : "",
    oneTimeOnly.outcome === "stop" ? oneTimeOnly.message : "",
  ]) {
    const lowered = copy.toLowerCase();
    for (const banned of RULE_11_BANNED) {
      checkTrue(`rule 11: "${banned.trim()}" absent from the gate copy`, !lowered.includes(banned));
    }
  }

  // ── 7. THE COPY ─────────────────────────────────────────────────────────
  console.log("\ntypedCodeRefusalCopy\n");
  const refusal = { status: "refused", code: "BACKIN20", message: "We don't recognise BACKIN20." } as const;
  const membershipCopy = typedCodeRefusalCopy(refusal, "Purchase");
  const packCopy = typedCodeRefusalCopy(refusal, "Buy Now");

  checkTrue("membership copy names the escape hatch", membershipCopy.includes("press Purchase again to continue without it"));
  checkTrue("pack copy uses THAT surface's real button label", packCopy.includes("tap Buy Now again to continue without it"));
  checkTrue("the problem sentence leads", membershipCopy.startsWith("We don't recognise BACKIN20."));
  checkTrue(
    "the customer is told the package still delivers",
    membershipCopy.includes("you'll still get everything your package includes")
  );

  // RULE 11 IS A LEGAL LINE. Entries are a free inclusion with the package,
  // never sold and never priced per unit; no draw may be framed in odds terms.
  for (const copy of [membershipCopy, packCopy]) {
    const lowered = copy.toLowerCase();
    for (const banned of RULE_11_BANNED) {
      checkTrue(`rule 11: "${banned.trim()}" absent from "${copy.slice(0, 28)}…"`, !lowered.includes(banned));
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed");
}

run().catch((error) => {
  console.error("typed-code-at-checkout.test.ts crashed:", error);
  process.exit(1);
});
