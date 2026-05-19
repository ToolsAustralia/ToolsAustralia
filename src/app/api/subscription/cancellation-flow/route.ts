import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import mongoose from "mongoose";
import { CANCELLATION_REASONS, type CancellationReason, OFFER_TYPES, type OfferType } from "@/models/CancellationFlowEvent";
import {
  planFlow,
  startFlow,
  recordOutcome,
  getUserCancellationContext,
  acceptOffer,
  AcceptOfferError,
} from "@/services/subscription/CancellationFlowService";

const StartSchema = z.object({
  action: z.literal("start"),
  reason: z.enum([...CANCELLATION_REASONS] as [string, ...string[]]),
  reasonText: z.string().max(2000).optional(),
});

const OutcomeSchema = z.object({
  action: z.literal("outcome"),
  eventId: z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), "invalid eventId"),
  outcome: z.enum(["saved", "cancelled"]),
  offerAccepted: z.enum([...OFFER_TYPES] as [string, ...string[]]).optional(),
});

const AcceptOfferSchema = z.object({
  action: z.literal("accept_offer"),
  eventId: z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), "invalid eventId"),
  offer: z.enum([...OFFER_TYPES] as [string, ...string[]]),
});

const Body = z
  .discriminatedUnion("action", [StartSchema, OutcomeSchema, AcceptOfferSchema])
  .superRefine((data, ctx) => {
    // "other" must carry free-text — admin needs to know what "other" means.
    if (
      data.action === "start" &&
      data.reason === "other" &&
      (!data.reasonText || data.reasonText.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reasonText"],
        message: "reasonText is required when reason is 'other'",
      });
    }
  });

/**
 * POST /api/subscription/cancellation-flow
 *
 * Two actions:
 *   { action: "start", reason, reasonText? }
 *     → { eventId, offersShown, pastDue }
 *
 *   { action: "outcome", eventId, outcome: "saved"|"cancelled", offerAccepted? }
 *     → { ok: true }
 *
 *   { action: "accept_offer", eventId, offer }
 *     → { ok: true, resumesAt }  ("pause_30d")
 *     → { ok: true, couponId }   ("discount_50_2mo")
 *     → { ok: true }             ("unsubscribe_marketing")
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const userId = session.user.id;

  try {
    if (parsed.data.action === "start") {
      const ctx = await getUserCancellationContext(userId);
      const { offersShown, pastDue } = planFlow({
        reason: parsed.data.reason as CancellationReason,
        ...ctx,
      });
      const eventId = await startFlow({
        userId,
        reason: parsed.data.reason as CancellationReason,
        reasonText: parsed.data.reasonText,
        pastDue,
        offersShown,
      });
      return NextResponse.json({ eventId, offersShown, pastDue });
    }

    if (parsed.data.action === "accept_offer") {
      const result = await acceptOffer({
        userId,
        eventId: parsed.data.eventId,
        offer: parsed.data.offer as OfferType,
      });
      // `result` carries `resumesAt` (pause_30d) or `couponId` (discount_50_2mo);
      // spread so the route stays thin and offer-agnostic.
      return NextResponse.json({ ok: true, ...result });
    }

    await recordOutcome({
      eventId: parsed.data.eventId,
      userId,
      outcome: parsed.data.outcome,
      offerAccepted: parsed.data.offerAccepted as OfferType | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AcceptOfferError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof Error && err.message === "user not found") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("cancellation-flow route error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
