// src/services/facebook-ads/PurchaseAuditService.ts
//
// Readonly comparison: local `PaymentEvent` (non-renewal) revenue vs Meta
// Insights purchase revenue for the same AEST calendar window.
//
// Extracted from `src/app/api/admin/facebook-ads/purchase-audit/route.ts` so
// the admin route and Norm projection call the same orchestration and report
// identical numbers by construction. Framework-agnostic — no Request /
// NextResponse types; throws plain Errors for the caller to translate.

import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { computeAccountTrueRoas } from "@/services/facebook-ads-health/accountTrueRoasService";
import { getStartOfTodayInAEST } from "@/utils/common/timezone";

const AEST = "Australia/Sydney";

export type PurchaseAuditRange = "today" | "7d" | "30d";

export interface PurchaseAuditServiceResult {
  range: PurchaseAuditRange;
  window: { start: string; end: string };
  facebookInsightsRange: { since: string; until: string };
  local: {
    benefitsGrantedNonRenewalCount: number;
    revenueAud: number;
    note: string;
  };
  meta: {
    purchaseRevenueAud: number | null;
    purchaseConversions: number | null;
    error: string | null;
  };
  reconciliation: {
    differenceMetaMinusLocalAud: number | null;
    interpretation: string;
  };
}

export class PurchaseAuditService {
  constructor(
    private deps: {
      accessToken?: string;
      adAccountId?: string;
    } = {},
  ) {}

  async audit(range: PurchaseAuditRange): Promise<PurchaseAuditServiceResult> {
    const accessToken = this.deps.accessToken ?? process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
    const adAccountId = this.deps.adAccountId ?? process.env.FACEBOOK_AD_ACCOUNT_ID;

    const now = new Date();
    let startDate: Date;
    let endDate: Date;
    let fbSince: string;
    let fbUntil: string;

    if (range === "today") {
      const startOfToday = getStartOfTodayInAEST();
      startDate = startOfToday;
      const tomorrowStart = new Date(startOfToday);
      tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
      endDate = new Date(tomorrowStart.getTime() - 1);
      const y = parseInt(formatInTimeZone(now, AEST, "yyyy"), 10);
      const m = parseInt(formatInTimeZone(now, AEST, "M"), 10);
      const d = parseInt(formatInTimeZone(now, AEST, "d"), 10);
      const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      fbSince = ds;
      fbUntil = ds;
    } else {
      const days = range === "7d" ? 7 : 30;
      const end = now;
      const start = subDays(getStartOfTodayInAEST(), days - 1);
      startDate = start;
      endDate = end;
      fbSince = formatInTimeZone(start, AEST, "yyyy-MM-dd");
      fbUntil = formatInTimeZone(end, AEST, "yyyy-MM-dd");
    }

    // Delegate the local non-renewal revenue tally + Meta account-level fetch to the
    // shared `computeAccountTrueRoas` service so the admin route, the Facebook Ads
    // Health card, and this Norm projection all report identical numbers. When env
    // credentials are absent, skip the Meta call and surface a config-specific error.
    const missingCredentials = !accessToken || !adAccountId;

    const result = await computeAccountTrueRoas({
      startDate,
      endDate,
      fbSince,
      fbUntil,
      accessToken: missingCredentials ? "" : accessToken,
      adAccountId: missingCredentials ? "" : adAccountId,
    });

    const metaError = missingCredentials
      ? "FACEBOOK_MARKETING_ACCESS_TOKEN or FACEBOOK_AD_ACCOUNT_ID not configured"
      : result.error;

    const localRevenueAud = Math.round(result.localRevenueAud * 100) / 100;
    const metaPurchaseRevenueAud = missingCredentials ? null : result.metaPurchaseRevenueAud;
    const metaPurchaseConversions = missingCredentials ? null : result.metaPurchaseConversions;

    const diffAud =
      metaPurchaseRevenueAud != null
        ? Math.round((metaPurchaseRevenueAud - localRevenueAud) * 100) / 100
        : null;

    return {
      range,
      window: { start: startDate.toISOString(), end: endDate.toISOString() },
      facebookInsightsRange: { since: fbSince, until: fbUntil },
      local: {
        benefitsGrantedNonRenewalCount: result.localEventCount,
        revenueAud: localRevenueAud,
        note: "Excludes membership subscription_cycle (renewals). Uses PaymentEvent.data.price.",
      },
      meta: {
        purchaseRevenueAud: metaPurchaseRevenueAud,
        purchaseConversions: metaPurchaseConversions,
        error: metaError,
      },
      reconciliation: {
        differenceMetaMinusLocalAud: diffAud,
        interpretation:
          diffAud == null
            ? "Meta revenue unavailable"
            : diffAud > 0
              ? "Meta attributes more purchase revenue than local non-renewal total (duplicates, attribution window, or refunds)"
              : diffAud < 0
                ? "Local non-renewal total exceeds Meta purchase revenue (missing CAPI, non-ads attribution, or pixel)"
                : "Exact match (unusual)",
      },
    };
  }
}
