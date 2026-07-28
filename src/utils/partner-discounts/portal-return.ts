/**
 * Rewards-return resolution for /membership — the pure, unit-testable core of the
 * partner-portal bounce-back experience (panel-review F-003).
 *
 * Two pieces:
 *  - `resolvePortalReturn` — parses the portal redirect's UNTRUSTED URL params into a
 *    `PortalReturn`. The offers map is DEPENDENCY-INJECTED (never imported here):
 *    `src/generated/partnerCatalogOffers.ts` is a server-only 1,833-row module, and this
 *    file is imported by the CLIENT banner for its types + view resolver — a direct
 *    import would drag the whole map into the client bundle. Only the server
 *    `page.tsx` holds the map and passes it in.
 *  - `resolvePortalBannerView` — the banner's six-state decision matrix as a pure
 *    function (copy + CTA kind), so the states are testable without rendering.
 *
 * Wired as `npm run test:portal-return`
 * (src/utils/partner-discounts/__tests__/portal-return.test.ts).
 *
 * @module utils/partner-discounts/portal-return
 */

/** The partner-catalogue percent ladder — a URL `level` outside it is discarded.
 *  (Mirrors VALID_REQUIRED_PCTS in unlock-packages.ts and ALLOWED_PERCENTS in the
 *  build script — consolidation tracked as panel-review F-016.) */
export const PARTNER_CATALOG_LADDER_PCTS: ReadonlySet<number> = new Set([
  5, 10, 15, 25, 40, 50, 55, 70, 75, 85, 100,
]);

/**
 * Resolved return-visit context, built SERVER-SIDE from the rewards-return URL
 * params. When an `offer_id` matched our catalogue, `offerName` + `requiredPct`
 * come from OUR data (never the raw URL); the sanitized-URL fallback only survives
 * when `level` parsed to a real ladder percent. `generic` marks a return visit
 * with no resolvable offer.
 */
export interface PortalReturn {
  offerName?: string;
  requiredPct?: number;
  generic?: boolean;
}

/** Minimal offer shape the resolver needs (matches PartnerCatalogOffer). */
export interface PortalReturnOffer {
  name: string;
  pct: number;
}

export type PortalSearchParams = { [key: string]: string | string[] | undefined };

export const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Normalise a name for allowlist matching: strip markup chars, collapse whitespace
 *  (vendor names carry double-space location suffixes), lowercase. */
const normName = (s: string): string =>
  s.replace(/[<>&]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Per-map memo of the name→offer allowlist index (the offers map is a stable module
 *  const on the server, so this builds once per process, not per request). */
const nameIndexCache = new WeakMap<object, Map<string, PortalReturnOffer>>();
function nameIndex(
  offersById: Readonly<Record<string, PortalReturnOffer>>
): Map<string, PortalReturnOffer> {
  let idx = nameIndexCache.get(offersById);
  if (!idx) {
    idx = new Map();
    for (const offer of Object.values(offersById)) idx.set(normName(offer.name), offer);
    nameIndexCache.set(offersById, idx);
  }
  return idx;
}

/**
 * Resolve the rewards-return context from the portal's redirect URL. URL params are
 * UNTRUSTED: when `offer_id` matches the injected catalogue map, name + percent come
 * from OUR data. The `offer_name` fallback (panel F-008) is ALLOWLISTED — it resolves
 * only when the name matches a real catalogue offer (whitespace/case-insensitive),
 * and then the CATALOGUE's name + percent are used; the URL `level` param is ignored
 * entirely. Nothing user-typed is ever rendered — a crafted link can no longer put
 * arbitrary text (or banned vocabulary) into the banner. A recognised return with
 * nothing resolvable still gets the generic banner.
 *
 * The id lookup is guarded against prototype-chain keys (`?offer_id=__proto__` /
 * `constructor`): ids must be all-digits (the build script's invariant) AND an own
 * property of the map.
 */
export function resolvePortalReturn(
  params: PortalSearchParams,
  offersById: Readonly<Record<string, PortalReturnOffer>>
): PortalReturn | undefined {
  const utmCampaign = firstParam(params.utm_campaign);
  const offerId = firstParam(params.offer_id);
  const offerNameRaw = firstParam(params.offer_name);

  const isPortalReturn =
    utmCampaign === "rewards-return" || Boolean(offerId) || Boolean(offerNameRaw);
  if (!isPortalReturn) return undefined;

  if (offerId && /^\d+$/.test(offerId) && Object.hasOwn(offersById, offerId)) {
    const offer = offersById[offerId];
    return { offerName: offer.name, requiredPct: offer.pct };
  }

  if (offerNameRaw) {
    const match = nameIndex(offersById).get(normName(offerNameRaw));
    if (match) return { offerName: match.name, requiredPct: match.pct };
  }

  return { generic: true };
}

// ─── Banner view resolution (the six-state matrix) ────────────────────────────

/** Account states the banner distinguishes (subset of DashboardAccountState). */
export type PortalBannerAcct = "active" | "onetime" | "pastdue" | "paused" | "none";

/** The recommendation input: cheapest covering plan, pre-mapped by the caller. */
export interface PortalBannerRecommendation {
  planName: string;
  /** Whether the recommended plan is a monthly subscription (drives F-005 routing). */
  planIsSubscription: boolean;
  cumulativeCount: number;
}

export type PortalBannerCta =
  | {
      kind: "unlock";
      planName: string;
      planIsSubscription: boolean;
      cumulativeCount: number;
      /** Authed short-of-offer state also shows the catalogue meta line + "See all packages". */
      showCatalogueMeta: boolean;
    }
  | { kind: "sso" }
  | { kind: "payment" }
  | { kind: "manage" }
  | { kind: "scroll"; label: string };

export interface PortalBannerView {
  headline: string;
  sub: string;
  cta: PortalBannerCta | null;
  /** Guest states show "Already a member? Log in…" (panel-review F-004). */
  showLoginHint: boolean;
}

const fmtAu = (n: number): string => n.toLocaleString("en-AU");

/**
 * Pure six-state copy/CTA matrix for the rewards-return banner. All strings are
 * customer-facing (CLAUDE.md rule 11 applies — free-entry framing, no gambling
 * vocabulary, British "catalogue").
 */
export function resolvePortalBannerView(input: {
  portalReturn: PortalReturn;
  acct: PortalBannerAcct;
  partnerAccessPct: number;
  ssoEnabled: boolean;
  recommended: PortalBannerRecommendation | null;
  catalogTotal: number;
  /** Pre-formatted resume date for a retention-paused member (e.g. "12 August"),
   *  or null when unknown — drives the F-009 paused branch. */
  pausedUntilLabel?: string | null;
}): PortalBannerView {
  const {
    portalReturn,
    acct,
    partnerAccessPct,
    ssoEnabled,
    recommended,
    catalogTotal,
    pausedUntilLabel = null,
  } = input;
  const offerName = portalReturn.offerName;
  const requiredPct = portalReturn.requiredPct ?? null;
  const offerKnown = Boolean(offerName) && requiredPct != null;
  const guest = acct === "none";
  const total = fmtAu(catalogTotal);

  const unlockCta = (showCatalogueMeta: boolean): PortalBannerCta =>
    recommended
      ? {
          kind: "unlock",
          planName: recommended.planName,
          planIsSubscription: recommended.planIsSubscription,
          cumulativeCount: recommended.cumulativeCount,
          showCatalogueMeta,
        }
      : { kind: "scroll", label: "See all packages" };

  if (acct === "pastdue") {
    return {
      headline: "Your membership payment needs attention.",
      sub: "Update payment to restore your discounts.",
      cta: { kind: "payment" },
      showLoginHint: false,
    };
  }

  // F-009: a retention-paused member's access returns on resume — never upsell them
  // a package they already own; point at the manage sheet (resume lives there).
  if (acct === "paused") {
    return {
      headline: "Your membership is paused.",
      sub: pausedUntilLabel
        ? `It resumes ${pausedUntilLabel} — resume now to restore your discounts.`
        : "Resume your membership to restore your discounts.",
      cta: { kind: "manage" },
      showLoginHint: false,
    };
  }

  if (offerKnown && offerName && requiredPct != null) {
    if (guest) {
      return {
        headline: `${offerName} unlocks at ${requiredPct}% access.`,
        sub: "Grab a membership or a one-time pack to unlock it — it takes about a minute.",
        cta: unlockCta(false),
        showLoginHint: true,
      };
    }
    if (partnerAccessPct >= requiredPct) {
      return {
        headline: `You're set — your ${partnerAccessPct}% access covers ${offerName}.`,
        // F-006: with SSO dark there is no button — name the one path that works
        // (their still-open portal tab) instead of pointing at a door we can't open.
        sub: ssoEnabled
          ? "Head back to the portal to redeem it."
          : "Head back to the partner portal tab you came from — this offer is ready to redeem.",
        cta: ssoEnabled ? { kind: "sso" } : null, // flag off → sub only
        showLoginHint: false,
      };
    }
    return {
      headline: `You're at ${partnerAccessPct}% — ${offerName} needs ${requiredPct}%.`,
      sub: "Upgrade your membership or grab a one-time pack and it unlocks straight away.",
      cta: unlockCta(true),
      showLoginHint: false,
    };
  }

  if (guest) {
    return {
      headline: "Unlock the partner catalogue",
      sub: `Up to ${total} offers from Australia's top brands — included with any membership or one-time pack.`,
      cta: { kind: "scroll", label: "See packages" },
      showLoginHint: true,
    };
  }

  return {
    headline: "Back from the partner portal?",
    sub: `You're at ${partnerAccessPct}% of the partner catalogue. Upgrade your membership or grab a one-time pack to unlock more of the ${total} offers.`,
    cta: { kind: "scroll", label: "See packages" },
    showLoginHint: false,
  };
}
