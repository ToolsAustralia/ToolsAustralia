/**
 * bonus-code-webhook/resolveCustomer.ts
 *
 * Turns the two identity fields a Klaviyo flow can send — `{{ person.user_id }}`
 * and `{{ person.email }}` — into the one customer a bonus code will be minted
 * to, or into a refusal.
 *
 * WHY `userId` IS OPTIONAL, AND WHY THE EMAIL FALLBACK EXISTS.
 * `{{ person.user_id }}` legitimately renders empty on real profiles:
 *  - newsletter-form profiles never receive it (`src/app/api/newsletter/subscribe/route.ts`
 *    sets three properties, none of them `user_id`);
 *  - at registration the server-side profile write that sets it is
 *    fire-and-forget behind swallowing catches, and short-circuits entirely
 *    when `KLAVIYO_ENABLED === "false"`;
 *  - the client-side identify only fires for an authenticated session, and
 *    registration step 1 does not log the user in.
 * Guest checkout-start is the cohort most exposed to that, and it is one of the
 * three triggers. An endpoint that required `user_id` would silently issue
 * nothing to exactly the customers the flow was built for.
 *
 * THE DISAGREEMENT CASE IS A REFUSAL, NOT A PREFERENCE. When both fields are
 * present and resolve to DIFFERENT accounts, something upstream is stale or two
 * Klaviyo profiles were merged — which is precisely the situation where minting
 * to the wrong person is possible. A grant is money-equivalent and capped at one
 * per person for life, so silently picking a winner can burn a real customer's
 * lifetime grant. We refuse (409) and log loudly instead.
 *
 * THIS FUNCTION DOES NOT SWALLOW DATABASE ERRORS. A thrown query must reach the
 * route so it can answer 500 and let Klaviyo retry. Returning "not found" on a
 * Mongo blip would answer 200, stop the retry, and permanently lose the grant
 * while the discount email is already in flight — the exact failure this whole
 * rework exists to prevent.
 *
 * PROJECTION. Only the fields the mint and the Klaviyo emit actually read are
 * selected (`getCustomerProperties` needs email/firstName/lastName/mobile;
 * `isActive` gates here). A bare `findById()` would drag the whole user document,
 * `entries[]` included, into a per-send webhook.
 */

import mongoose from "mongoose";
import User, { type IUser } from "@/models/User";

export type BonusCodeCustomerResolution =
  | { ok: true; user: IUser }
  /** No such account, or the account is deactivated. Not retryable. */
  | { ok: false; reason: "not_found" }
  /** `userId` and `email` name two different accounts. Refuse. */
  | { ok: false; reason: "identity_conflict"; userIdMatch: string; emailMatch: string };

/** Everything `mintBonusCodeForTrigger` + `BonusCodeNotifier` read off the user. */
const WEBHOOK_USER_PROJECTION = "_id email firstName lastName mobile isActive";

/**
 * Resolve the customer for one webhook call.
 *
 * Order (mirrors the endpoint contract — it is an ELSE-IF, not two attempts):
 *  1. `userId`, when present AND a valid ObjectId, resolves by `_id`.
 *  2. ELSE `email`, when present, resolves by `findOne({ email })` on the
 *     normalised address. Safe and exact: `User.email` is `unique` +
 *     `lowercase` + `trim` at the schema level, so a lowercased exact match is
 *     the whole space.
 *  3. Both present and resolving to different users → `identity_conflict`.
 *
 * A `userId` that is not a valid ObjectId is treated as absent rather than as
 * an error: that is what an empty or half-rendered merge tag looks like, and
 * the email fallback is exactly the path built for it.
 *
 * A USABLE `userId` THAT RESOLVES TO NOTHING IS A REFUSAL, NOT A RETRY AGAINST
 * THE EMAIL. The email branch is the fallback for an ABSENT id, never a second
 * attempt after a failed lookup. A stale or merged Klaviyo profile can carry a
 * dead account's `user_id` alongside a live address belonging to someone else;
 * falling through would then mint that other person's ONE-PER-LIFETIME grant on
 * a signal that was never theirs — the exact substitution the 409 exists to
 * prevent, only silent, because there is no second document to disagree with.
 * We answer `not_found` (200, `console.error`d by the route, audited), which
 * costs one dead code in an email and makes the data problem visible as a
 * rising rate, instead of burning a bystander's grant invisibly.
 *
 * @throws whatever Mongo throws. Deliberate — see the module header.
 */
export async function resolveBonusCodeCustomer(input: {
  userId?: string;
  email?: string;
}): Promise<BonusCodeCustomerResolution> {
  const byIdCandidate =
    input.userId && mongoose.Types.ObjectId.isValid(input.userId) ? input.userId : undefined;
  const byEmailCandidate = input.email ? input.email.trim().toLowerCase() : undefined;

  const [byId, byEmail] = await Promise.all([
    byIdCandidate
      ? User.findById(byIdCandidate).select(WEBHOOK_USER_PROJECTION)
      : Promise.resolve(null),
    byEmailCandidate
      ? User.findOne({ email: byEmailCandidate }).select(WEBHOOK_USER_PROJECTION)
      : Promise.resolve(null),
  ]);

  // The refusal is checked FIRST, before the isActive gate: a disagreement
  // between two identities is a data-integrity problem regardless of whether
  // either account happens to be active.
  if (byId && byEmail && String(byId._id) !== String(byEmail._id)) {
    return {
      ok: false,
      reason: "identity_conflict",
      userIdMatch: String(byId._id),
      emailMatch: String(byEmail._id),
    };
  }

  // A USABLE id is authoritative. If it named no account, the email is NOT
  // tried: see the note above — that fallback is for an absent id, and using it
  // here would mint to whoever happens to own the address on a stale profile.
  if (byIdCandidate && !byId) return { ok: false, reason: "not_found" };

  // `byId` wins when both agree (they are the same document) and when only it
  // landed. An email that matches nothing while the id resolves is not a
  // disagreement — an address can change without the profile's user_id changing.
  const user = byId ?? byEmail;
  if (!user || user.isActive === false) return { ok: false, reason: "not_found" };

  return { ok: true, user };
}
