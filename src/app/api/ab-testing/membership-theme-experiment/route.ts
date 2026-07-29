import { NextResponse } from "next/server";
import experimentService from "@/services/ab-testing/ExperimentService";

/** Sentinel slug target that isolates the site-wide membership dark-mode test
 *  from slug-targeted promo experiments. Must match the experiment's
 *  slugTargets in the admin UI. Documented in docs/ab-testing/. */
const MEMBERSHIP_THEME_SLUG = "__membership-theme__";

/**
 * GET /api/ab-testing/membership-theme-experiment
 * Returns the active site-wide membership dark-mode experiment id (or null).
 * Read-only: assignment/tracking is delegated to POST /api/ab-testing/assign.
 */
export async function GET() {
  try {
    const experiment = await experimentService.getActiveExperimentForSentinelSlug(
      MEMBERSHIP_THEME_SLUG,
    );
    return NextResponse.json({
      experimentId: experiment ? String(experiment._id) : null,
    });
  } catch (error) {
    console.error("Error resolving membership-theme experiment:", error);
    return NextResponse.json({ experimentId: null });
  }
}
