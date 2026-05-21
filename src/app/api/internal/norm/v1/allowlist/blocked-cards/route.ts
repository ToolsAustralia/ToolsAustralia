import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormAllowlistBlockedCardsListSchema } from "@/lib/internal-norm/schemas/allowlist";
import { getAllowlistService } from "@/services/allowlist";
import type { BlockedFilter, EligibilityKind } from "@/services/allowlist/types";
import { computeEligibilityKind } from "@/utils/admin/blockedTransactionEligibility";

const VALID_ELIGIBILITY: ReadonlySet<EligibilityKind> = new Set([
  "auto_eligible",
  "already_allowlisted",
  "fraud_signal",
  "permanent_issue",
  "not_member",
]);

const QuerySchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  declineCodes: z.string().optional(),
  eligibility: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function parseCsv(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "allowlist.blocked-cards.list",
    requiredPermission: "users.view",
    responseSchema: NormAllowlistBlockedCardsListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const eligibilityRaw = parseCsv(parsed.data.eligibility);
    const eligibility = eligibilityRaw
      ? eligibilityRaw.filter((v): v is EligibilityKind =>
          VALID_ELIGIBILITY.has(v as EligibilityKind)
        )
      : undefined;

    const filter: BlockedFilter = {
      dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : thirtyDaysAgo,
      dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : now,
      declineCodes: parseCsv(parsed.data.declineCodes),
      eligibility,
    };

    const result = await getAllowlistService().listBlocked(filter, {
      cursor: parsed.data.cursor ?? null,
      limit: parsed.data.limit,
    });

    return ctx.ok({
      total: result.total,
      nextCursor: result.nextCursor,
      rows: result.rows.map((r) => ({
        paymentIntentId: r.paymentIntentId,
        chargeId: r.chargeId,
        userId: r.userId,
        createdAt: r.createdAt.toISOString(),
        amount: r.amount,
        currency: r.currency,
        cardFingerprint: r.cardFingerprint,
        cardLast4: r.cardLast4,
        cardBrand: r.cardBrand,
        declineCode: r.declineCode,
        failureCode: r.failureCode,
        preview: r.preview,
        alreadyAllowlisted: r.alreadyAllowlisted,
        eligibilityKind: computeEligibilityKind({
          alreadyAllowlisted: r.alreadyAllowlisted,
          preview: r.preview,
        }),
      })),
    });
  }
);
