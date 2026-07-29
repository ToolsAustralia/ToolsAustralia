import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";
import VariantAssignment from "@/models/ab-testing/VariantAssignment";
import PaymentEvent from "@/models/PaymentEvent";
import VariantRepository from "@/repositories/ab-testing/VariantRepository";
import {
  computeExperimentMetrics,
  type AssignmentRow,
  type PaymentRow,
  type RevenueCap,
  type VariantMetrics,
} from "@/utils/ab-testing/experiment-metrics-core";

/** Default conversion window (days) — see plan decision D1. */
export const DEFAULT_CONVERSION_WINDOW_DAYS = 14;

export interface ExperimentMetricsQuery {
  /** Filter the EXPOSURE cohort by assignment date. Omit for all-time (durable, no TTL truncation). */
  exposureRange?: { startDate: Date; endDate: Date };
  conversionWindowDays?: number;
  revenueCap?: RevenueCap;
}

/** Per-variant metrics enriched with the variant's identity + control flag. */
export interface VariantMetricsWithMeta extends VariantMetrics {
  variantName: string;
  isControl: boolean;
}

export interface ExperimentMetricsSummary {
  variants: VariantMetricsWithMeta[];
  windowDays: number;
  appliedCapDollars: number | null;
}

/**
 * Mongo projection for every PaymentEvent row fed to the pure core.
 *
 * ONE constant, used by BOTH the BenefitsGranted query and the refund query, because
 * they diverged once and it cost real money in wrong numbers: the purchases query
 * omitted `eventType`, so `toPaymentRow` produced the string `"undefined"`, the core's
 * `if (p.eventType !== "BenefitsGranted") continue` skipped EVERY purchase, and every
 * experiment reported 0 converters and $0 revenue from 2026-06-15 until 2026-07-29 —
 * with no error anywhere, because zero is a plausible-looking number.
 *
 * Keep this in sync with the fields `toPaymentRow` reads. `test:ab-metrics-projection`
 * asserts exactly that, so a future edit that drops a field fails loudly instead of
 * silently zeroing the business metrics.
 */
export const PAYMENT_ROW_PROJECTION =
  "paymentIntentId userId variantId data isRenewal timestamp eventType";

/**
 * Map a lean PaymentEvent doc to the pure core's `PaymentRow`.
 *
 * Throws on a missing `eventType` rather than coercing it. `String(undefined)` is the
 * exact silent failure described above: it yields a row the core skips, so the metrics
 * come back all-zero and look like "no conversions yet" instead of "the query is wrong".
 * A projection mistake is a programmer error — it should be loud, and it can only reach
 * here in development, since the shipped projection is asserted by a test.
 */
export function toPaymentRow(p: Record<string, unknown>): PaymentRow {
  if (typeof p.eventType !== "string" || !p.eventType) {
    throw new Error(
      "ExperimentMetricsService.toPaymentRow: PaymentEvent row is missing `eventType`. " +
        "The Mongo projection must include it (see PAYMENT_ROW_PROJECTION) — without it every " +
        "purchase is silently dropped and all conversion/revenue metrics read zero."
    );
  }
  const data = (p.data as { price?: number; refundAmount?: number } | undefined) ?? {};
  const ts = p.timestamp as Date | string | undefined;
  return {
    paymentIntentId: String(p.paymentIntentId ?? ""),
    userId: p.userId ? String(p.userId) : "",
    variantId: p.variantId ? String(p.variantId) : null,
    eventType: p.eventType,
    priceDollars: typeof data.price === "number" ? data.price : null,
    refundAmountCents: typeof data.refundAmount === "number" ? data.refundAmount : null,
    isRenewal: !!p.isRenewal,
    timestamp: ts instanceof Date ? ts : new Date(ts ?? 0),
  };
}

/**
 * Experiment Metrics Service — the single source of truth for conversion and
 * revenue. Computes per-USER metrics over the durable assignment + PaymentEvent
 * tables (never from TTL'd events), via the pure `computeExperimentMetrics` core.
 *
 * Scale note: this loads an experiment's assignments + relevant payments into
 * memory. That is correct and simplest at the current scale (hundreds–low
 * thousands of assignments per experiment). If an experiment ever reaches
 * hundreds of thousands of assignments, move the join into an aggregation
 * pipeline — the pure core's contract stays the same.
 */
export class ExperimentMetricsService {
  async getExperimentMetrics(
    experimentId: string,
    query: ExperimentMetricsQuery = {}
  ): Promise<ExperimentMetricsSummary> {
    await connectDB();

    const experimentObjId = new mongoose.Types.ObjectId(experimentId);
    const conversionWindowDays = query.conversionWindowDays ?? DEFAULT_CONVERSION_WINDOW_DAYS;

    // 1. Variants (so zero-exposure variants still appear; baseline = isControl).
    const variants = await VariantRepository.findByExperimentId(experimentId);
    const variantIds = variants.map((v) =>
      v._id instanceof mongoose.Types.ObjectId ? v._id.toString() : String(v._id)
    );

    // 2. Exposure (denominator) — durable assignment table, optionally cohort-filtered.
    const assignmentQuery: Record<string, unknown> = { experimentId: experimentObjId };
    if (query.exposureRange) {
      assignmentQuery.assignedAt = { $gte: query.exposureRange.startDate, $lte: query.exposureRange.endDate };
    }
    const assignmentDocs = await VariantAssignment.find(assignmentQuery)
      .select("variantId userId anonymousId assignedAt")
      .lean();

    const assignments: AssignmentRow[] = assignmentDocs.map((a) => ({
      variantId: a.variantId?.toString() ?? "",
      userId: a.userId ? a.userId.toString() : null,
      anonymousId: a.anonymousId ?? null,
      assignedAt: a.assignedAt instanceof Date ? a.assignedAt : new Date(a.assignedAt),
    }));

    const assignedUserObjIds = Array.from(
      new Set(assignmentDocs.filter((a) => a.userId).map((a) => a.userId!.toString()))
    ).map((id) => new mongoose.Types.ObjectId(id));

    // 3. Purchases: any BenefitsGranted stamped with this experiment (covers
    //    unmerged-anon buyers) OR made by an assigned user (covers buyers whose
    //    payment was stamped to a different/no experiment). Attribution to the
    //    correct variant happens in the pure core (assignment authority).
    const benefitsDocs = await PaymentEvent.find({
      eventType: "BenefitsGranted",
      $or: [{ experimentId }, ...(assignedUserObjIds.length ? [{ userId: { $in: assignedUserObjIds } }] : [])],
    })
      .select(PAYMENT_ROW_PROJECTION)
      .lean();

    // 4. Refunds for those payments (refund events carry no experimentId).
    const paymentIntentIds = Array.from(new Set(benefitsDocs.map((b) => b.paymentIntentId).filter(Boolean)));
    const refundDocs = paymentIntentIds.length
      ? await PaymentEvent.find({
          eventType: { $in: ["RefundProcessed", "RefundPartial"] },
          paymentIntentId: { $in: paymentIntentIds },
        })
          .select(PAYMENT_ROW_PROJECTION)
          .lean()
      : [];

    const payments: PaymentRow[] = [...benefitsDocs, ...refundDocs].map((p) =>
      toPaymentRow(p as Record<string, unknown>)
    );

    // 5. Pure computation.
    const result = computeExperimentMetrics({
      variantIds,
      assignments,
      payments,
      options: { conversionWindowDays, revenueCap: query.revenueCap },
    });

    // 6. Enrich with variant identity + control flag.
    const metaById = new Map(
      variants.map((v) => {
        const id = v._id instanceof mongoose.Types.ObjectId ? v._id.toString() : String(v._id);
        return [id, { name: v.name, isControl: !!v.isControl }];
      })
    );
    const enriched: VariantMetricsWithMeta[] = result.variants.map((m) => ({
      ...m,
      variantName: metaById.get(m.variantId)?.name ?? "Unknown",
      isControl: metaById.get(m.variantId)?.isControl ?? false,
    }));

    return { variants: enriched, windowDays: result.windowDays, appliedCapDollars: result.appliedCapDollars };
  }
}

const experimentMetricsService = new ExperimentMetricsService();
export default experimentMetricsService;
