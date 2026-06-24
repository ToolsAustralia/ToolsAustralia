/**
 * registry.ts — Norm-style read-only member tool registry for the support chatbot.
 *
 * Security invariants (enforced here):
 *   I-1: Identity from session only. `ctx.actor` is the source of truth.
 *         If `piiScoped !== false` and the caller is not a member → ToolDenied('login_required').
 *         NO tool takes a userId/email as model input — all inputSchemas are empty z.object({}).
 *   I-2: Egress-projected, fail-closed. `responseSchema.parse(result)` is called before
 *         returning to the model. A projection miss or extra field throws (strict schemas).
 *   I-3: Reuses existing services — no new DB queries defined here.
 *   I-4: A tool registered without a responseSchema is a TypeScript compile error.
 *
 * Usage:
 *   const tools = buildMemberToolSet(ctx.actor, deps);
 *   // Then pass to streamText({ tools })
 */

import { tool, type ToolSet } from "ai";
import { z, type ZodTypeAny } from "zod";
import type { ChatActor } from "@/lib/support-chat/types";
import type { IUser } from "@/models/User";

// ─── Imports for MemberToolDeps (type-only — services are injected, not called here) ───

import type { getCurrentUserBenefits as getCurrentUserBenefitsOrig } from "@/utils/membership/subscription-benefits";
import type { getActivePackage as getActivePackageOrig } from "@/utils/membership/get-active-package";
import type { getCurrentMajorDrawForDisplay as getCurrentMajorDrawForDisplayOrig } from "@/utils/draws/major-draw-helpers";
import type { getUserMajorDrawStats as getUserMajorDrawStatsOrig } from "@/utils/database/queries/major-draw-queries";
import type {
  resolvePartnerCatalogPlanId as resolvePartnerCatalogPlanIdOrig,
} from "@/utils/partner-discounts/partner-catalog-visibility";
import type { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";

// ─── ToolDenied ───────────────────────────────────────────────────────────────

/**
 * Thrown by the registry wrapper when the tool cannot be called:
 *   - `'login_required'` — tool is piiScoped and actor is not a member
 *   - `'user_not_found'` — DB lookup returned null for ctx.actor.userId
 */
export class ToolDenied extends Error {
  constructor(public readonly reason: string) {
    super(`ToolDenied: ${reason}`);
    this.name = "ToolDenied";
  }
}

// ─── MemberToolDeps ───────────────────────────────────────────────────────────

/**
 * Injectable dependencies for member tools.
 * Defaults to real service calls; tests inject stubs to avoid Mongo / external calls.
 */
export interface MemberToolDeps {
  findUserById?: (id: string) => Promise<IUser | null>;
  getCurrentUserBenefits?: (user: IUser) => ReturnType<typeof getCurrentUserBenefitsOrig>;
  getActivePackage?: (user: IUser) => ReturnType<typeof getActivePackageOrig>;
  getCurrentMajorDrawForDisplay?: () => ReturnType<typeof getCurrentMajorDrawForDisplayOrig>;
  getUserMajorDrawStats?: (userId: string, drawId: string) => ReturnType<typeof getUserMajorDrawStatsOrig>;
  resolvePartnerCatalogPlanId?: (user: IUser) => ReturnType<typeof resolvePartnerCatalogPlanIdOrig>;
  getPartnerCatalogAccessPercentForPlanId?: (planId: string) => number;
  getPartnerCatalogVisibleSliceLength?: (total: number, planId: string | null) => number;
  partnerBrandOffers?: typeof PARTNER_BRAND_OFFERS;
}

// ─── Tool definition types ────────────────────────────────────────────────────

/** Context passed to each tool handler — carries the actor for identity. */
export interface MemberToolCtx {
  actor: ChatActor;
}

/** Definition of a single member tool before wrapping into the AI SDK. */
interface MemberToolDef<
  TInput extends ZodTypeAny,
  TResponse extends ZodTypeAny,
> {
  name: string;
  description: string;
  inputSchema: TInput;
  responseSchema: TResponse; // Required — enforced by TypeScript
  piiScoped?: boolean; // default true; false means anonymous actors can call it
  handler: (ctx: MemberToolCtx, deps?: MemberToolDeps) => Promise<unknown>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const _MEMBER_TOOLS: MemberToolDef<ZodTypeAny, ZodTypeAny>[] = [];

/**
 * Factory: define and register a member tool.
 * `responseSchema` is required at the type level (no optional here).
 */
export function defineMemberTool<
  TInput extends ZodTypeAny,
  TResponse extends ZodTypeAny,
>(def: MemberToolDef<TInput, TResponse>): MemberToolDef<TInput, TResponse> {
  _MEMBER_TOOLS.push(def as MemberToolDef<ZodTypeAny, ZodTypeAny>);
  return def;
}

/** All registered tool definitions (read-only view). */
export const MEMBER_TOOLS: ReadonlyArray<MemberToolDef<ZodTypeAny, ZodTypeAny>> = _MEMBER_TOOLS;

// ─── buildMemberToolSet ───────────────────────────────────────────────────────

/**
 * Wrap all registered member tools into an AI SDK ToolSet for one request.
 *
 * @param actorOrCtx — Either a `ChatActor` directly, or an object with `.actor: ChatActor`
 * @param deps       — Injectable deps; defaults applied inside each handler
 *
 * Per tool, the wrapper:
 *   1. If `piiScoped !== false` AND actor is not a member → throw ToolDenied('login_required')
 *   2. Call handler(ctx, deps)
 *   3. Return responseSchema.parse(result) — fail-closed egress projection
 */
export function buildMemberToolSet(
  actorOrCtx: ChatActor | { actor: ChatActor },
  deps?: MemberToolDeps
): ToolSet {
  const actor: ChatActor =
    "actor" in actorOrCtx ? actorOrCtx.actor : actorOrCtx;
  const ctx: MemberToolCtx = { actor };

  const toolSet: ToolSet = {};

  for (const def of _MEMBER_TOOLS) {
    const { name, description, inputSchema, responseSchema, piiScoped, handler } = def;

    toolSet[name] = tool({
      description,
      inputSchema,
      execute: async (_input: unknown) => {
        // I-1: auth gate
        if (piiScoped !== false && actor.kind !== "member") {
          throw new ToolDenied("login_required");
        }

        // Run handler
        const result = await handler(ctx, deps);

        // I-2: fail-closed egress projection — throws ZodError on any mismatch
        return responseSchema.parse(result);
      },
    });
  }

  return toolSet;
}

// Export the empty input schema for reuse across tool files
export const emptyInput = z.object({});
