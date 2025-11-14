/**
 * Rewards guard utilities.
 *
 * API routes can import these helpers to return a consistent response when the
 * rewards system is paused. We centralise the logic so every handler stays in
 * sync and new engineers can find the behaviour quickly.
 */
import { NextResponse } from "next/server";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";

const REWARDS_DISABLED_STATUS = 503;

/**
 * Returns a JSON payload detailing that the rewards programme is paused.
 */
export const rewardsDisabledResponse = () =>
  NextResponse.json(
    {
      success: false,
      error: rewardsDisabledMessage(),
      code: "REWARDS_PAUSED",
    },
    { status: REWARDS_DISABLED_STATUS }
  );

/**
 * Helper that API routes can call at the top of the handler. It returns a
 * NextResponse when the rewards system is disabled, otherwise `null` so callers
 * can continue normal execution.
 */
export const guardRewardsEnabled = () => {
  if (!rewardsEnabled()) {
    return rewardsDisabledResponse();
  }

  return null;
};
