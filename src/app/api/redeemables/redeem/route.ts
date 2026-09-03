import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { RedemptionService } from "@/services/redeemables";
import {
  CAMPAIGN_CODE_ALREADY_REDEEMED_MESSAGE,
  campaignCodeExpiredMessage,
} from "@/services/redeemables/CampaignCodeValidationService";

const redeemSchema = z
  .object({
    code: z.string().trim().min(6).max(32).optional(),
    issuanceId: z.string().optional(),
  })
  .refine((data) => Boolean(data.code || data.issuanceId), {
    message: "Either code or issuanceId is required",
  });

/**
 * Human copy for a redemption refusal reason — the raw internal reason string
 * (e.g. "campaign_not_active") is meaningless to a customer. Rule 11: entries
 * are always a free inclusion, never framed as bought/sold, and never phrased
 * with odds/chance/lottery language.
 *
 * expiresAtLabel is formatted here from RedemptionService.redeem() result.expiresAt
 * — the ACTUAL issuance the service matched before deciding "expired". The
 * service already does the issuance-identification work (issuanceId, then
 * code as a personal issuance code / campaign code / milestone reward code);
 * this route must never re-derive that lookup itself, or the two can find
 * DIFFERENT rows (e.g. a customer holding several MilestoneIssuance rows for
 * the same reward+user — repeatable milestones are keyed by
 * {milestoneRewardId, userId, streakGeneration, achievementCycle}, not
 * {milestoneRewardId, userId} — and disagree on which one expired and when).
 */
function humanRefusalMessage(reason: string | undefined, expiresAt?: Date): string {
  switch (reason) {
    case "unauthorized":
      return "Please sign in again to redeem this code.";
    case "campaign_not_found":
    case "invalid_code":
      return "We couldn't find a code that matches. Double-check the code and try again.";
    case "campaign_not_active":
      return "This code isn't available for redemption right now.";
    case "already_redeemed":
      // Shared with /api/codes/validate — the same refusal used to render two
      // different sentences depending on which endpoint the customer hit, and
      // this one was missing the "on" in the expired case below.
      return CAMPAIGN_CODE_ALREADY_REDEEMED_MESSAGE;
    case "expired":
      return expiresAt ? campaignCodeExpiredMessage(expiresAt) : "This code has expired.";
    case "ineligible":
      return "This code isn't unlocked on your account yet.";
    case "concurrency_conflict":
      return "That code was just redeemed — refresh and try again.";
    case "grant_unavailable":
      // The claim was valid and has been fully reversed — the customer still holds
      // it. Say both halves: nothing landed, and the code is still theirs. Telling
      // them "added!" here is the defect this reason exists to prevent.
      // Rule 11: free entries, a giveaway being set up — no odds/chance framing.
      return "We couldn't add your free entries just now — the next giveaway is being set up. Your code is still yours, so please try again shortly.";
    case "grant_unresolved":
      // NOT the sentence above: this claim is spent and could NOT be handed back,
      // so promising "your code is still yours" would be the false reassurance
      // that reason exists to avoid. Say what is true in both ways this happens
      // (the entries may have landed, or the reversal failed) and stop the
      // customer retrying a code that is already gone.
      // Rule 11: free entries, included — never bought, no odds/chance framing.
      return "Your code has been used, but we couldn't confirm your free entries landed. We've logged it for our team to check — please don't try again; contact support if you don't see them.";
    default:
      return "Redemption failed";
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser();
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }

    await connectDB();
    const body = await request.json();
    const payload = redeemSchema.parse(body);

    const result = await RedemptionService.redeem({
      userId: authResult.session.user.id,
      code: payload.code,
      issuanceId: payload.issuanceId,
    });

    if (!result.success) {
      const statusByReason: Record<string, number> = {
        unauthorized: 401,
        campaign_not_found: 404,
        campaign_not_active: 400,
        invalid_code: 400,
        already_redeemed: 409,
        expired: 400,
        ineligible: 403,
        concurrency_conflict: 409,
        // 503, matching /api/cancellation-upsell/redeem: the request was fine,
        // the draw wasn't there to receive it. Retryable, and nothing was spent.
        grant_unavailable: 503,
        // 500, NOT 503: 503 invites a retry, and there is nothing to retry — the
        // claim is spent and a human has to reconcile it.
        grant_unresolved: 500,
      };
      return NextResponse.json(
        { success: false, error: humanRefusalMessage(result.reason, result.expiresAt) },
        { status: statusByReason[result.reason || ""] || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: `Redeemed successfully. ${result.entriesGranted || 0} entries added.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }
    console.error("Error redeeming code:", error);
    return NextResponse.json({ success: false, error: "Failed to redeem code" }, { status: 500 });
  }
}
