"use client";

import { useCallback, useEffect, useState } from "react";

export const PROMO_WELCOME_SHOWN_PREFIX = "tools-aus:promo-welcome-shown:";

function shownStorageKey(code: string): string {
  return `${PROMO_WELCOME_SHOWN_PREFIX}${code}`;
}

export type PromoWelcomeCampaignType = "general" | "cancelled-membership-comeback";

/**
 * Public promo-link metadata returned from GET /api/promo/link/validate
 * (subset of PromoLink; safe for the client)
 */
export interface PromoWelcomeData {
  code: string;
  campaignType: PromoWelcomeCampaignType;
  eligibilityAudience: "all" | "cancelled-members";
  title?: string;
  description?: string;
  bonusEntries: number;
  appliesToMembership: boolean;
  appliesToOneTime: boolean;
  expiresAt?: string;
}

function parseWelcomeData(raw: unknown): PromoWelcomeData | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const code = typeof d.code === "string" ? d.code : null;
  const campaignType = d.campaignType;
  if (
    !code ||
    (campaignType !== "general" && campaignType !== "cancelled-membership-comeback")
  ) {
    return null;
  }
  return {
    code,
    campaignType,
    eligibilityAudience:
      d.eligibilityAudience === "cancelled-members" || d.eligibilityAudience === "all"
        ? d.eligibilityAudience
        : "all",
    title: typeof d.title === "string" ? d.title : undefined,
    description: typeof d.description === "string" ? d.description : undefined,
    bonusEntries: typeof d.bonusEntries === "number" ? d.bonusEntries : 0,
    appliesToMembership: d.appliesToMembership === true,
    appliesToOneTime: d.appliesToOneTime === true,
    expiresAt: typeof d.expiresAt === "string" ? d.expiresAt : undefined,
  };
}

/**
 * Fetches validated promo link metadata and controls one welcome popup per code per session.
 * Pass `promoCode` from the parent (e.g. a single `usePromoLink()` in PromoLinkTracker) to avoid
 * multiple hook instances.
 */
export function usePromoWelcomeModal(promoCode: string | null) {
  const [isOpen, setIsOpen] = useState(false);
  const [campaignData, setCampaignData] = useState<PromoWelcomeData | null>(null);

  useEffect(() => {
    if (!promoCode) {
      setIsOpen(false);
      setCampaignData(null);
      return;
    }
    if (typeof window === "undefined") return;

    if (window.sessionStorage.getItem(shownStorageKey(promoCode)) === "1") {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/promo/link/validate?code=${encodeURIComponent(promoCode)}`,
          { method: "GET" }
        );
        const json = (await res.json()) as {
          success?: boolean;
          valid?: boolean;
          data?: unknown;
        };
        if (cancelled) return;
        if (!json.success || !json.valid || !json.data) {
          return;
        }
        const parsed = parseWelcomeData(json.data);
        if (!parsed) return;
        if (window.sessionStorage.getItem(shownStorageKey(promoCode)) === "1") {
          return;
        }
        setCampaignData(parsed);
        setIsOpen(true);
      } catch {
        if (!cancelled) {
          // silent — do not show modal on network error
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [promoCode]);

  const dismiss = useCallback(() => {
    const code = campaignData?.code ?? promoCode;
    if (typeof window !== "undefined" && code) {
      window.sessionStorage.setItem(shownStorageKey(code), "1");
    }
    setIsOpen(false);
  }, [campaignData?.code, promoCode]);

  return {
    isOpen: isOpen && campaignData !== null,
    campaignData,
    dismiss,
  };
}
