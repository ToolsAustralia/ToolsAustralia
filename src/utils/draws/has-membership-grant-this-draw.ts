/**
 * Returns true when the user already received a membership-source entry grant
 * in the currently active major draw. Used by the upgrade flow to decide
 * between Mode A (stack accumulated) and Mode B (legacy formula) — see
 * docs/superpowers/specs/2026-05-20-upgrade-accumulator-stacking-design.md.
 *
 * Fails open (returns false) on any error. Defaulting to Mode A is the
 * intended behavior; the worst case is a rare over-credit in the
 * renewal-then-upgrade-same-period edge case.
 */

import { Types } from "mongoose";
import MajorDraw, { type IMajorDraw } from "@/models/MajorDraw";

type MajorDrawEntry = IMajorDraw["entries"][number];

export async function hasMembershipGrantInCurrentDrawPeriod(
  userId: Types.ObjectId | string
): Promise<boolean> {
  try {
    const draw = await MajorDraw.findOne({ status: "active" })
      .select({ entries: 1 })
      .lean<Pick<IMajorDraw, "entries">>();
    if (!draw) return false;

    const userIdStr = userId.toString();
    const entry = (draw.entries ?? []).find(
      (e: MajorDrawEntry) => e.userId.toString() === userIdStr
    );
    const membershipCount = entry?.entriesBySource?.membership ?? 0;
    return membershipCount > 0;
  } catch (err) {
    console.error("hasMembershipGrantInCurrentDrawPeriod failed; defaulting to false", err);
    return false;
  }
}
