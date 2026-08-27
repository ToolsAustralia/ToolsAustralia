/**
 * Resolve a discount code the customer TYPED but never pressed Apply on, at the
 * moment they press Purchase.
 *
 * WHY THIS EXISTS. The checkout code box has an Apply button beside it. Until
 * this module, that button was the only thing that made a typed code real:
 * `appliedCouponPayload` gates every code field on `couponApplied`, which only
 * `handleCouponApply` sets, so a customer who typed `BACKIN200` and went
 * straight for Purchase was charged and received nothing — with the code still
 * sitting in the box, looking applied. Entries are money-equivalent and the
 * campaign grant is one-per-customer-for-life attached to a purchase, so that
 * silently burns the purchase the grant was meant to ride on.
 *
 * The two modals call this from inside their submit handlers, AFTER the
 * re-entry lock is taken, and charge on the answer.
 *
 * THE CLASSIFICATION IS THE LOAD-BEARING PART. `/api/codes/validate` returns
 * `{ success: false, valid: false }` for BOTH a 429 (its own rate limiter) and a
 * 500 (its own outage), and `{ success: true, valid: false, message }` at HTTP
 * 200 for a genuine refusal. Reading `!body.valid` would therefore turn our own
 * rate limiter and our own downtime into REFUSED SALES. The only shape that
 * means "we know this code is bad" is:
 *
 *     response.ok && body.success === true && body.valid === false
 *
 * Everything else is `inconclusive`, and inconclusive charges — a bonus lookup
 * has never been allowed to cost a sale. That contract is about our failure to
 * OBTAIN an answer; it was never a promise to ignore a definite answer that the
 * code is wrong, which is why `refused` stops the sale once instead.
 *
 * CLIENT MODULE. No mongoose, no models, no Stripe — it ships in the browser
 * bundle (eslint `internal-norm/no-models-in-client`). The refusal sentences it
 * renders are the SERVER's own, already rule-11 audited in
 * `CampaignCodeValidationService`; that service cannot be imported here (it
 * pulls in models), so the machine-readable `reason` on the response is what
 * selects them — never a comparison against a display string, per the footgun
 * that service's own comment records.
 */

/**
 * Hard cap on the resolve, spent behind the submit button's existing
 * `Processing…` state.
 *
 * Sized on what `/api/codes/validate` actually does: rate-limit check ->
 * `request.json()` -> `connectDB()` -> one `User` read -> one `PromoLink` read
 * -> `getServerSession` -> one or two campaign/issuance reads. No Stripe round
 * trips — which is why it gets 8s where `attachTypedCode` needs 15s for two
 * Stripe calls on a cold lambda. Warm this is comfortably sub-500ms; 8s is the
 * cold-start-plus-connectDB tail with room.
 */
export const TYPED_CODE_RESOLVE_TIMEOUT_MS = 8_000;

export type TypedCodeType = "referral" | "promo" | "campaign";

export type TypedCodePurchaseRequirement = "none" | "membership" | "one-time" | "any";

export type TypedCodeResolution =
  | { status: "none" }
  | {
      status: "resolved";
      code: string;
      type: TypedCodeType;
      referrerName?: string;
      purchaseRequirement?: TypedCodePurchaseRequirement;
    }
  | { status: "refused"; code: string; message: string }
  | { status: "inconclusive"; code: string; reason: "timeout" | "network" | "http" | "shape" };

/** Verbatim from `CampaignCodeValidationService` — kept identical on purpose. */
const ALREADY_REDEEMED_MESSAGE = "This code has already been redeemed.";
const NOT_HELD_MESSAGE = "This code isn't available on your account.";
const GENERIC_REFUSAL_MESSAGE = "This code is not valid right now.";

const VALID_TYPES: readonly string[] = ["referral", "promo", "campaign"];
const VALID_REQUIREMENTS: readonly string[] = ["none", "membership", "one-time", "any"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Sentence 1 of the refusal — what is wrong.
 *
 * `not_found` gets our own sentence rather than the server's terse "Invalid
 * campaign code", because at this moment the customer has just pasted a code out
 * of an email and the overwhelmingly likely cause is a typo: naming the exact
 * string back at them is what makes that visible. The other three are the
 * server's own strings, passed through and never re-worded.
 */
function refusalProblemSentence(params: {
  code: string;
  reason?: string;
  message?: string;
}): string {
  switch (params.reason) {
    case "not_found":
      return `We don't recognise ${params.code}.`;
    case "already_redeemed":
      return params.message ?? ALREADY_REDEEMED_MESSAGE;
    case "not_held":
      return params.message ?? NOT_HELD_MESSAGE;
    case "expired":
      // Dated, and produced server-side — there is no client-side equivalent, so
      // a missing message falls back to the generic rather than inventing a date.
      return params.message ?? GENERIC_REFUSAL_MESSAGE;
    default:
      return params.message ?? GENERIC_REFUSAL_MESSAGE;
  }
}

/**
 * The refusal line the customer reads, assembled: what is wrong, then the way
 * out. `ctaLabel` is the surface's real button text ("Purchase" / "Buy Now") —
 * the escape lives here, in the code row, rather than by relabelling the payment
 * CTA on the last screen before money.
 *
 * Rule 11: entries are a FREE INCLUSION with the package, never sold and never
 * priced per unit; nothing here frames a draw in odds/chance terms.
 */
export function typedCodeRefusalCopy(
  resolution: Extract<TypedCodeResolution, { status: "refused" }>,
  ctaLabel: string
): string {
  const verb = ctaLabel.toLowerCase() === "buy now" ? "tap" : "press";
  return `${resolution.message} Check the code from your email, or ${verb} ${ctaLabel} again to continue without it — you'll still get everything your package includes.`;
}

/**
 * THE PURCHASE-REQUIREMENT GATE — the one stop in this design that is NOT about
 * whether the code is real.
 *
 * A campaign can be configured `purchaseRequirement: "membership"` (or
 * `"one-time"`). The code is genuine, held by this customer, and simply aimed at
 * a different kind of purchase than the one selected. Before the purchase-click
 * resolve existed, a typed-but-never-applied code never reached this gate at
 * all: the code was dropped and THE SALE COMPLETED. Resolving at Purchase brings
 * live codes to the gate for the first time, which is why the gate now has to
 * obey the same contract every other stop here does:
 *
 *   ASKED ONCE, AT ZERO COST — AND THE SECOND PRESS ALWAYS BUYS.
 *
 * That contract is enforced *structurally*, by `previousStop`, rather than by
 * trusting a caller to clear the right pieces of React state. A stop that the
 * customer cannot press their way out of is worse than the bug this whole branch
 * exists to fix, so the escape cannot depend on four setters landing in the
 * right order — the second press must be safe by construction.
 *
 * WHY THE STOP IS KEYED ON (code + purchase kind), NOT ON THE CODE ALONE.
 * A requirement mismatch is a fact about a PAIRING, not about the code: the same
 * `BACKIN200` this gate refuses on a one-time pack is perfectly valid on a
 * membership. The stop's own sentence names the pack as the problem, so the
 * sensible customer does exactly what it implies — switches to a membership —
 * and a stop remembered by code alone would then skip the resolve, silently drop
 * their one-per-lifetime grant, and charge them anyway with the code still
 * sitting in the box looking applied. Definite refusals ("we don't recognise
 * this", "already redeemed") ARE facts about the code alone and the caller
 * remembers those separately; only this stop carries the purchase kind with it.
 *
 * Shared by BOTH checkout modals so the decision and the sentence cannot drift
 * apart again (they already had: one modal recorded the refusal and let the
 * second tap through, the other blocked forever).
 */
export type PurchaseRequirementStop = {
  /** The normalized campaign code the customer was stopped on. */
  code: string;
  /** The kind of purchase it was stopped FOR. Switching kind re-arms the gate. */
  isSubscriptionPurchase: boolean;
};

export type PurchaseRequirementGateResult =
  /** Charge, carrying the code. */
  | { outcome: "allow" }
  /**
   * THE SECOND PRESS. Charge, but WITHOUT the code — we already told the
   * customer it does not apply to this package and they pressed again, which is
   * the answer. Sending it anyway would stamp a code `RedemptionService` refuses
   * as `ineligible` a moment later, so the sale would carry a promise it cannot
   * keep.
   */
  | { outcome: "allow_without_code" }
  | { outcome: "stop"; stop: PurchaseRequirementStop; message: string };

export function evaluatePurchaseRequirementGate(params: {
  /** The campaign code actually about to be charged with. */
  campaignCode?: string;
  purchaseRequirement?: TypedCodePurchaseRequirement | null;
  /** True for a monthly membership, false for a one-time / pack purchase. */
  isSubscriptionPurchase: boolean;
  /** The surface's real button text — "Purchase" / "Buy Now". */
  ctaLabel: string;
  /** A (code + purchase kind) pairing this surface has already stopped on once. */
  previousStop?: PurchaseRequirementStop | null;
}): PurchaseRequirementGateResult {
  const code = params.campaignCode?.trim().toUpperCase();
  if (!code) return { outcome: "allow" };

  // THE SECOND PRESS. We already asked about this exact code FOR THIS KIND OF
  // PURCHASE and they pressed again — that is the answer: buy without it.
  // Checked before the requirement so no re-arming of state anywhere can
  // resurrect the wall.
  if (
    params.previousStop &&
    params.previousStop.code.trim().toUpperCase() === code &&
    params.previousStop.isSubscriptionPurchase === params.isSubscriptionPurchase
  ) {
    return { outcome: "allow_without_code" };
  }

  // "none" / "any" / absent impose nothing. Only the two directional values stop.
  const mismatch =
    params.purchaseRequirement === "membership" && !params.isSubscriptionPurchase
      ? ("membership" as const)
      : params.purchaseRequirement === "one-time" && params.isSubscriptionPurchase
        ? ("one-time" as const)
        : null;

  if (!mismatch) return { outcome: "allow" };

  const verb = params.ctaLabel.toLowerCase() === "buy now" ? "Tap" : "Press";
  const problem =
    mismatch === "membership"
      ? "This code is for membership packs only."
      : "This code is for one-time packages only.";

  // Rule 11: the package is the purchasable unit and the entries come free with
  // it. Nothing is sold per entry and no draw is framed in odds terms.
  return {
    outcome: "stop",
    stop: { code, isSubscriptionPurchase: params.isSubscriptionPurchase },
    message: `${problem} ${verb} ${params.ctaLabel} again to continue without it — you'll still get everything your package includes.`,
  };
}

/**
 * Ask the server what the typed code is, with a hard timeout.
 *
 * `preferType: "auto"` keeps the existing three-way classification (referral ->
 * promo -> campaign) exactly as the Apply button gets it; this is not "attach a
 * campaign code".
 */
export async function resolveTypedCodeAtCheckout(params: {
  code: string;
  inviteeUserId?: string;
  inviteeEmail?: string;
}): Promise<TypedCodeResolution> {
  const code = params.code.trim().toUpperCase();
  if (!code) return { status: "none" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TYPED_CODE_RESOLVE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("/api/codes/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        inviteeUserId: params.inviteeUserId,
        inviteeEmail: params.inviteeEmail,
        preferType: "auto",
      }),
      signal: controller.signal,
    });
  } catch {
    const aborted = controller.signal.aborted;
    return { status: "inconclusive", code, reason: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }

  // 429 (our rate limiter) and 5xx (our outage) land here. NOT refusals.
  if (!response.ok) return { status: "inconclusive", code, reason: "http" };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "inconclusive", code, reason: "shape" };
  }

  if (!isRecord(body) || body.success !== true) {
    return { status: "inconclusive", code, reason: "http" };
  }

  if (body.valid === false) {
    return {
      status: "refused",
      code,
      message: refusalProblemSentence({
        code,
        reason: asString(body.reason),
        message: asString(body.message),
      }),
    };
  }

  if (body.valid === true && typeof body.type === "string" && VALID_TYPES.includes(body.type)) {
    const data = isRecord(body.data) ? body.data : {};
    const requirement = asString(data.purchaseRequirement);
    return {
      status: "resolved",
      code,
      type: body.type as TypedCodeType,
      referrerName: asString(data.referrerName),
      purchaseRequirement:
        requirement && VALID_REQUIREMENTS.includes(requirement)
          ? (requirement as TypedCodePurchaseRequirement)
          : undefined,
    };
  }

  return { status: "inconclusive", code, reason: "shape" };
}

/**
 * WHAT A PURCHASE ROUTE REPORTS IT ACTUALLY STAMPED ONTO THE CHARGE.
 *
 * Keys are the request-body / Stripe-metadata names verbatim (`referralCode`,
 * `promoLinkCode`, `campaignCode`) — the same three the webhook later reads, so
 * there is no third vocabulary for the same three legs.
 *
 * `null` on a leg means the charge is NOT carrying that code. For `campaignCode`
 * that is a real decision: the create routes re-run `resolveCodeForCheckout`
 * against a SERVER-resolved user id and drop a code this customer does not hold
 * — expired between Apply and Buy Now, or redeemed in another tab. The other two
 * legs are carried as sent, so `null` there simply means none was sent.
 */
export type AppliedCheckoutCodes = {
  referralCode?: string | null;
  promoLinkCode?: string | null;
  campaignCode?: string | null;
};

/** The receipt line's two halves: which kind of code, and the code itself. */
export type AppliedCodeReceiptLabel = {
  label: "Referral" | "Promo" | "Campaign";
  code: string;
};

/** One place the three type words become the three display words. */
const TYPED_CODE_RECEIPT_LABEL: Record<TypedCodeType, AppliedCodeReceiptLabel["label"]> = {
  referral: "Referral",
  promo: "Promo",
  campaign: "Campaign",
};

/** Which reported leg answers for each kind of typed code. */
const TYPED_CODE_APPLIED_KEY: Record<TypedCodeType, keyof AppliedCheckoutCodes> = {
  referral: "referralCode",
  promo: "promoLinkCode",
  campaign: "campaignCode",
};

/**
 * MAY THE RECEIPT SAY THIS CODE APPLIED?
 *
 * Only if the ROUTE REPORTED IT ON THE CHARGE. The label is read back out of the
 * route's own report of what it stamped, never out of the browser's hope.
 *
 * WHAT EACH LEG ACTUALLY PROVES — they are NOT equal, and the difference is the
 * whole reason this comment is long:
 *
 *  - `campaignCode` is CHECKED. The route re-runs `resolveCodeForCheckout`
 *    against a SERVER-resolved user id and reports its answer, so `null` here is
 *    a real refusal (a code this customer does not hold, or holds no longer) and
 *    a value here is the canonical string the resolver returned.
 *
 *  - `referralCode` and `promoLinkCode` are the REQUEST BODY ECHOED BACK. The
 *    route stamps them verbatim without validating either. So for those two legs
 *    this function proves DELIVERY — the code is on the charge and the webhook
 *    will see it — and NOT ACCEPTANCE. A returning customer typing a mate's
 *    referral code (invalid: new customers only) is still told "Referral code
 *    MATE-CODE applied" while the webhook grants nothing. That is a known,
 *    deliberate limit of this round, unchanged from the local-state label this
 *    replaced; closing it means giving those two legs their own server-side
 *    check, which is a bigger change than the receipt fix.
 *
 * `MembershipModal` gets its campaign answer from the attach seam's `slot`
 * instead — same rule, different seam. The surfaces that deliver the code in the
 * CREATE BODY have no attach call to veto them, which is why the route reports.
 *
 * THREE WAYS TO GET NULL, and all three mean "print nothing":
 *  - nothing was typed (or we never learned its kind) — the `?promo=` attribution
 *    fallback rides in `promoLinkCode` with nothing typed, and surfacing THAT as
 *    "Promo code X applied" would be a claim the customer never made;
 *  - the route said nothing at all (`applied` absent) — silence is not consent,
 *    exactly as an `unknown` attach outcome does not license the claim either;
 *  - the route answered and that leg is empty — for `campaignCode`, a definite
 *    refusal; for the other two, simply that none was sent.
 *
 * A dropped code goes UNMENTIONED. The purchase succeeded and the package still
 * delivers everything it includes; an apology on a successful receipt would turn
 * a silent omission into a customer-facing failure that has not happened yet.
 *
 * The code PRINTED is the one on the charge, not the one in the box: for a
 * campaign code that is the resolver's canonical string.
 */
export function settleAppliedCodeLabel(params: {
  /** The raw string the customer settled on, or null if the box was empty. */
  typedCode?: string | null;
  /** Our best reading of its kind. Never a claim on its own. */
  typedCodeType?: TypedCodeType | null;
  /** The route's report of what it stamped. Absent = it did not say. */
  applied?: AppliedCheckoutCodes | null;
}): AppliedCodeReceiptLabel | null {
  const type = params.typedCodeType;
  if (!params.typedCode?.trim() || !type) return null;
  if (!params.applied) return null;

  const acceptedCode = params.applied[TYPED_CODE_APPLIED_KEY[type]]?.trim();
  if (!acceptedCode) return null;

  return { label: TYPED_CODE_RECEIPT_LABEL[type], code: acceptedCode };
}

/**
 * THE ONE SENTENCE that tells a customer their code applied.
 *
 * Three surfaces used to build this string by hand — `MembershipModal`'s success
 * screen and both of `SpecialPackagesModal`'s. One sentence, one place: it is
 * customer-facing copy at the most sensitive moment there is (rule 11 — the
 * package is what was bought, the entries come free with it), and three copies
 * is three chances for one of them to drift.
 *
 * `settled` IS REQUIRED AND MAY BE NULL, deliberately. "The server did not
 * license a claim" has to be said out loud, because the only other way to say it
 * was by OMISSION — and omission is exactly how five call sites in
 * `MembershipModal` quietly opted out of the veto and printed a claim from local
 * browser state for a code the server had refused.
 *
 * @returns the line to print, or `null` when nothing may be claimed.
 */
export function appliedCodeReceiptLine(
  settled: AppliedCodeReceiptLabel | null,
): string | null {
  if (!settled) return null;
  return `${settled.label} code ${settled.code} applied`;
}
