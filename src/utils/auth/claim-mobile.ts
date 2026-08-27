/**
 * Claim a mobile number for a NEW user account, without ever failing the caller.
 *
 * `User.mobile` is a login identifier and carries a `unique` index. Three payment
 * paths create accounts with a mobile and none of them checked uniqueness:
 * [account-manager.ts](../payment/account-manager.ts),
 * [user-subscription-utils.ts](../payment/user-subscription-utils.ts) and
 * `/api/stripe/create-subscription`. Under the unique index a collision there is
 * an `E11000` thrown **inside account creation for someone who has already been
 * charged** — the worst possible place to surface a data-integrity error.
 *
 * So: if the number is already on another account, the new account is created
 * WITHOUT it. The customer keeps their purchase, their entries and their account;
 * they simply have no mobile on file until they add one from Settings (where the
 * check is friendly and interactive). The collision is logged with `console.error`
 * so it survives the production console strip and is visible in Vercel logs.
 *
 * Deliberately NOT a hard failure and NOT a silent overwrite of the other
 * account: a phone number is recoverable, a broken checkout is not.
 *
 * @module utils/auth/claim-mobile
 */

import User from "@/models/User";
import { normaliseAuMobile } from "@/lib/sms";

/**
 * @param rawMobile Whatever the caller collected — any accepted AU form.
 * @param context   Short label for the log line (e.g. "create-subscription").
 * @returns The normalised `+61…` number if it is free, otherwise `undefined`.
 */
export async function claimMobileForNewUser(
  rawMobile: string | null | undefined,
  context: string
): Promise<string | undefined> {
  const normalised = normaliseAuMobile(rawMobile);
  if (!normalised) {
    // Not a valid AU mobile. Storing it would fail the schema validator on save
    // and take the whole account creation with it, so drop it.
    if (rawMobile) {
      console.error(`[claim-mobile:${context}] dropping unusable mobile "${rawMobile}" on new account`);
    }
    return undefined;
  }

  const taken = await User.exists({ mobile: normalised });
  if (taken) {
    console.error(
      `[claim-mobile:${context}] mobile ${normalised} is already on account ${String(taken._id)} — ` +
        `creating the new account WITHOUT a mobile so the purchase is not blocked. ` +
        `The customer can add one from Settings.`
    );
    return undefined;
  }

  return normalised;
}
