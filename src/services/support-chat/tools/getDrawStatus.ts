/**
 * getDrawStatus — read-only tool (piiScoped: false — no member auth required).
 *
 * Returns public-facing information about the current major draw:
 * name, status, dates, and aggregate entry count. The `entries[]` array is
 * never accessed — getCurrentMajorDrawForDisplay() already omits it
 * (return type: Omit<IMajorDraw, 'entries'>).
 *
 * Services used (injected via MemberToolDeps for testability):
 *   - getCurrentMajorDrawForDisplay() from @/utils/draws/major-draw-helpers
 */

import { z } from "zod";
import { defineMemberTool, emptyInput } from "./registry";
import type { MemberToolCtx, MemberToolDeps } from "./registry";

// ─── Response schema (strict) ──────────────────────────────────────────────────

const responseSchema = z
  .object({
    name: z.string().nullable(),
    status: z.string().nullable(),
    drawDate: z.string().nullable(),
    freezeEntriesAt: z.string().nullable(),
    activationDate: z.string().nullable(),
    totalEntries: z.number(),
  })
  .strict();

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handler(_ctx: MemberToolCtx, deps?: MemberToolDeps): Promise<unknown> {
  // No auth check needed — piiScoped: false means anonymous actors can call this
  let draw: Awaited<ReturnType<typeof import("@/utils/draws/major-draw-helpers").getCurrentMajorDrawForDisplay>>;
  if (deps?.getCurrentMajorDrawForDisplay) {
    draw = await deps.getCurrentMajorDrawForDisplay();
  } else {
    const { getCurrentMajorDrawForDisplay } = await import("@/utils/draws/major-draw-helpers");
    draw = await getCurrentMajorDrawForDisplay();
  }

  if (!draw) {
    return {
      name: null,
      status: null,
      drawDate: null,
      freezeEntriesAt: null,
      activationDate: null,
      totalEntries: 0,
    };
  }

  // Safe fields only — entries[] is already omitted by the return type
  return {
    name: draw.name ?? null,
    status: draw.status ?? null,
    drawDate: draw.drawDate ? new Date(draw.drawDate).toISOString() : null,
    freezeEntriesAt: draw.freezeEntriesAt
      ? new Date(draw.freezeEntriesAt).toISOString()
      : null,
    activationDate: draw.activationDate
      ? new Date(draw.activationDate).toISOString()
      : null,
    totalEntries: draw.totalEntries ?? 0,
  };
}

// ─── Registration ─────────────────────────────────────────────────────────────

export const getDrawStatusTool = defineMemberTool({
  name: "getDrawStatus",
  description:
    "Return public information about the current active major draw: name, status, draw date, freeze time, activation date, and total entry count. Does not require member authentication.",
  inputSchema: emptyInput,
  responseSchema,
  piiScoped: false, // Public data — anonymous actors may call this
  handler,
});
