import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { DrawGrantService } from "@/services/redeemables/DrawGrantService";
import { canOfferCancellationUpsellRedeem } from "@/utils/redeemables/cancellation-upsell-eligibility";

/**
 * POST /api/cancellation-upsell/redeem
 * Redeem 100 free entries for users trying to cancel their subscription
 * This is a one-time offer to encourage retention
 */
export async function POST() {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // console.log(`🎁 Processing cancellation upsell redemption for user: ${session.user.id}`);

    // Get the user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has already redeemed this offer
    if (user.cancellationUpsellRedeemed) {
      return NextResponse.json({ error: "You have already redeemed this offer" }, { status: 400 });
    }

    if (!canOfferCancellationUpsellRedeem(user)) {
      return NextResponse.json(
        { error: "No active membership found. This offer is only available to active members." },
        { status: 400 }
      );
    }

    const entriesToAdd = 100;

    // ── DRAW FIRST, COUNTER SECOND ────────────────────────────────────────────────────────
    //
    // This order is the fix for a defect that ran from 2025-12 to 2026-06 and cost 373 members
    // the entries they were promised. The route used to increment `accumulatedEntries`, THEN
    // call a bespoke helper that looked up `MajorDraw.findOne({ isActive: true })` and returned
    // SILENTLY when that found nothing (a draw-transition window). The member's counter went
    // up, this endpoint replied "100 free entries successfully added to your account", and no
    // draw ever received the entries. Of 590 redeemers, 373 were left with nothing in a draw.
    //
    // Granting the draw entries first means a failure leaves the member UNCHANGED and able to
    // retry, instead of silently diverging. `DrawGrantService` is the canonical grant path —
    // it resolves the target draw via `getTargetMajorDraw` (which transitions if needed, reads
    // `status` rather than the legacy `isActive` flag, and routes around a frozen draw) and
    // reports whether the entries landed. Its own docblock states the contract this route
    // previously broke: callers granting an entitlement must treat anything but "landed" as
    // "not delivered".
    const grant = await DrawGrantService.grantMonthlyCouponEntries(
      user._id.toString(),
      entriesToAdd,
      "cancellation-upsell"
    );

    if (grant.status === "unconfirmed") {
      // The write may have reached the live draw. "Your offer is still available"
      // would invite a retry that grants the same 100 entries a SECOND time, so
      // this answer says the opposite. The offer stays unburned deliberately —
      // a human decides, off the log line below.
      console.error(
        `[cancellation-upsell] REDEEM UNCONFIRMED — the draw write could not be verified; ` +
          `NOT retryable, reconcile by hand for user ${user._id}: ${grant.reason}`
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "We couldn't confirm your free entries landed. We've logged it for our team to check — " +
            "please don't try again; contact support if you don't see them.",
        },
        { status: 500 }
      );
    }

    if (grant.status !== "landed") {
      // Loud, and honest to the member. console.error survives production builds.
      console.error(
        `[cancellation-upsell] REDEEM FAILED — nothing was granted (${grant.reason}) ` +
          `and the offer remains unredeemed for user ${user._id}`
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "We couldn't add your free entries just now — the next giveaway is being set up. " +
            "Please try again shortly; your offer is still available.",
        },
        { status: 503 }
      );
    }

    // Entries are in the draw. Only now record them on the member and burn the one-time offer.
    await User.findByIdAndUpdate(
      user._id,
      {
        $inc: {
          accumulatedEntries: entriesToAdd,
        },
        $set: {
          cancellationUpsellRedeemed: true,
          cancellationUpsellRedeemedAt: new Date(),
        },
      },
      { new: false }
    );

    return NextResponse.json({
      success: true,
      message: "100 free entries successfully added to your account",
      data: {
        entriesAdded: entriesToAdd,
        totalEntries: (user.accumulatedEntries || 0) + entriesToAdd,
      },
    });
  } catch (error) {
    console.error("Cancellation upsell redemption error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to redeem free entries. Please try again.",
      },
      { status: 500 }
    );
  }
}
