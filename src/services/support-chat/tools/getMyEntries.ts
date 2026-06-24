/**
 * getMyEntries — read-only member tool.
 *
 * Returns the authenticated member's entry counts for the current active major draw.
 * If no active draw exists, returns zero counts. The `entries[]` array is never
 * loaded from the DB — getUserMajorDrawStats uses a targeted $elemMatch projection.
 *
 * Services used (injected via MemberToolDeps for testability):
 *   - getCurrentMajorDrawForDisplay() from @/utils/draws/major-draw-helpers
 *   - getUserMajorDrawStats(userId, drawId) from @/utils/database/queries/major-draw-queries
 */

import { z } from "zod";
import { defineMemberTool, emptyInput, ToolDenied } from "./registry";
import type { MemberToolCtx, MemberToolDeps } from "./registry";

// ─── Response schema (strict — packageId omitted, PII absent) ─────────────────

const responseSchema = z
  .object({
    drawName: z.string().nullable(),
    totalEntries: z.number(),
    membershipEntries: z.number(),
    oneTimeEntries: z.number(),
    entriesByPackage: z.array(
      z.object({
        packageName: z.string(),
        entryCount: z.number(),
        source: z.string(),
      }).strict()
    ),
  })
  .strict();

const emptyResult = {
  drawName: null,
  totalEntries: 0,
  membershipEntries: 0,
  oneTimeEntries: 0,
  entriesByPackage: [],
};

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handler(ctx: MemberToolCtx, deps?: MemberToolDeps): Promise<unknown> {
  const { actor } = ctx;
  if (actor.kind !== "member") throw new ToolDenied("login_required");

  // getCurrentMajorDrawForDisplay
  let draw: Awaited<ReturnType<typeof import("@/utils/draws/major-draw-helpers").getCurrentMajorDrawForDisplay>>;
  if (deps?.getCurrentMajorDrawForDisplay) {
    draw = await deps.getCurrentMajorDrawForDisplay();
  } else {
    const { getCurrentMajorDrawForDisplay } = await import("@/utils/draws/major-draw-helpers");
    draw = await getCurrentMajorDrawForDisplay();
  }
  if (!draw) return emptyResult;

  // getUserMajorDrawStats
  const drawId = (draw as { _id: { toString(): string } })._id.toString();
  let stats: Awaited<ReturnType<typeof import("@/utils/database/queries/major-draw-queries").getUserMajorDrawStats>>;
  if (deps?.getUserMajorDrawStats) {
    stats = await deps.getUserMajorDrawStats(actor.userId, drawId);
  } else {
    const { getUserMajorDrawStats } = await import("@/utils/database/queries/major-draw-queries");
    stats = await getUserMajorDrawStats(actor.userId, drawId);
  }

  return {
    drawName: draw.name ?? null,
    totalEntries: stats.totalEntries,
    membershipEntries: stats.membershipEntries,
    oneTimeEntries: stats.oneTimeEntries,
    entriesByPackage: stats.entriesByPackage.map((ep) => ({
      packageName: ep.packageName,
      entryCount: ep.entryCount,
      source: ep.source,
      // packageId intentionally omitted from projection
    })),
  };
}

// ─── Registration ─────────────────────────────────────────────────────────────

export const getMyEntriesTool = defineMemberTool({
  name: "getMyEntries",
  description:
    "Return the authenticated member's entry counts for the current active major draw (total, membership-sourced, one-time-sourced, and a per-source breakdown). Returns zero counts when no active draw exists.",
  inputSchema: emptyInput,
  responseSchema,
  piiScoped: true,
  handler,
});
