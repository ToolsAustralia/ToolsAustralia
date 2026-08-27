/**
 * BonusCodeNotifier — emits the "Bonus Code Issued" Klaviyo event for a
 * per-customer bonus-entry code (see docs/rewards-redeemables/) and persists
 * the outcome onto the issuance so support can answer "why didn't this
 * customer get their code?".
 *
 * Awaited, not fire-and-forget (unlike every other `trackEventBackground`
 * call site in this codebase): `trackEvent` cannot throw — its own catch
 * returns `{ success: false }` — so awaiting it is bounded by one request
 * timeout, and the caller needs the result to write `notifiedAt`/`notifyError`.
 */
import type { IUser } from "@/models/User";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import { klaviyo } from "@/lib/klaviyo";
import { createBonusCodeIssuedEvent } from "@/utils/integrations/klaviyo/klaviyo-events";
import type { StampedIssuance } from "./CampaignService";
import type { BonusCodeTrigger } from "@/utils/redeemables/bonus-code-policy";

export class BonusCodeNotifier {
  static async notify(params: { user: IUser; issuance: StampedIssuance; trigger: BonusCodeTrigger }): Promise<void> {
    // INNER BACKSTOP ONLY. The authoritative production gate lives in
    // `mintBonusCodeForTrigger`, ahead of the MINT — gating just the email would
    // still let a preview deploy write the issuance row and burn a real customer's
    // one-per-lifetime grant. There is now exactly one path here: the Klaviyo
    // webhook route `POST /api/bonus-codes/v1/issue` → `mintBonusCodeForTrigger`
    // → notify, and that route asserts the same thing a third time before it
    // delegates. So this can never fire in practice; it is kept so a future
    // direct caller of notify() cannot email a real customer from a preview.
    if (process.env.VERCEL_ENV !== "production") {
      console.error("[bonus-code] skipped emit outside production", {
        userId: String(params.user._id),
        code: params.issuance.campaignCode,
        vercelEnv: process.env.VERCEL_ENV,
      });
      return;
    }

    const event = createBonusCodeIssuedEvent(params.user, {
      code: params.issuance.campaignCode,
      entriesAmount: params.issuance.entriesAmount,
      issuedAt: params.issuance.issuedAt,
      expiresAt: params.issuance.expiresAt,
      trigger: params.trigger,
    });
    // Same issuance + same deadline collapses to one event; a re-armed deadline
    // is legitimately a new one.
    event.unique_id = `${params.issuance.id}:${params.issuance.expiresAt.toISOString()}`;

    const res = await klaviyo.trackEvent(event, { retryOnFailure: false });

    await RedeemableIssuance.updateOne(
      { _id: params.issuance.id },
      {
        $set: res.success
          ? { notifiedAt: new Date(), notifyError: null }
          : { notifiedAt: null, notifyError: res.error ?? "unknown" },
      }
    );

    if (!res.success) {
      console.error("[bonus-code] Klaviyo emit failed", {
        issuanceId: params.issuance.id,
        error: res.error,
      });
    }
  }
}
