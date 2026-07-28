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

import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

// The percent ladder is single-sourced in partner-catalog-visibility (panel F-016);
// re-exported here because this module's tests + callers validate against it.
export { PARTNER_CATALOG_LADDER_PCTS } from "@/utils/partner-discounts/partner-catalog-visibility";

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

/** Display form of a vendor offer name (F-013): 329 catalogue names embed
 *  double-space location suffixes ("World Heritage Cruises  Strahan  TAS") that
 *  collapse into an unpunctuated run-on in HTML — join them with commas for
 *  display ("World Heritage Cruises, Strahan, TAS"). The generated file stays
 *  vendor-faithful; only the rendered string changes. */
const displayName = (s: string): string => s.replace(/\s{2,}/g, ", ");

/**
 * Per-map memo of the name→offer allowlist index (the offers map is a stable module
 * const on the server, so this builds once per process, not per request).
 *
 * AMBIGUOUS NAMES ARE EXCLUDED (panel F-029). 11 catalogue names normalise
 * identically and 6 of those pairs carry DIFFERENT access percents (e.g. "Get Wines
 * Direct" exists at both 100% and 50%). A last-write-wins `Map.set` would resolve
 * those to whichever id happened to iterate last, so a 50% member could be told
 * "you're covered" for a 100% offer and then refused at the merchant. A name that
 * cannot identify one percent is dropped, degrading to the generic banner — the same
 * graceful outcome as a name that misses the allowlist entirely. `offer_id` is
 * unaffected: it is exact and remains the reliable templating key for the vendor.
 */
const nameIndexCache = new WeakMap<object, Map<string, PortalReturnOffer>>();
function nameIndex(
  offersById: Readonly<Record<string, PortalReturnOffer>>
): Map<string, PortalReturnOffer> {
  let idx = nameIndexCache.get(offersById);
  if (!idx) {
    idx = new Map();
    const ambiguous = new Set<string>();
    for (const offer of Object.values(offersById)) {
      const key = normName(offer.name);
      const seen = idx.get(key);
      if (seen && seen.pct !== offer.pct) ambiguous.add(key);
      else if (!seen) idx.set(key, offer);
    }
    for (const key of ambiguous) idx.delete(key);
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
    return { offerName: displayName(offer.name), requiredPct: offer.pct };
  }

  if (offerNameRaw) {
    const match = nameIndex(offersById).get(normName(offerNameRaw));
    if (match) return { offerName: displayName(match.name), requiredPct: match.pct };
  }

  return { generic: true };
}

// ─── Banner view resolution (the six-state matrix) ────────────────────────────

/**
 * Account states the banner distinguishes — structurally TIED to the dashboard's own
 * union rather than hand-duplicated (panel F-046). The duplicate meant a caller had to
 * cast, which silenced the one compile-time signal that matters: add a 6th state to
 * `DashboardAccountState` and it would have fallen silently into the generic arm,
 * skipping the pastdue/paused special-casing — exactly the bug class F-009 was filed
 * for. Type-only import, so it is erased and cannot reach the client bundle.
 */
export type PortalBannerAcct = DashboardAccountState;

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
  /** Whether a session exists (panel F-028). `acct === "none"` is NOT "signed out" —
   *  it is also every authenticated user without an active membership or pack, so the
   *  login hint must key on the SESSION, never on acct alone. */
  isAuthenticated?: boolean;
}): PortalBannerView {
  const {
    portalReturn,
    acct,
    partnerAccessPct,
    ssoEnabled,
    recommended,
    catalogTotal,
    pausedUntilLabel = null,
    isAuthenticated = false,
  } = input;
  const offerName = portalReturn.offerName;
  const requiredPct = portalReturn.requiredPct ?? null;
  const offerKnown = Boolean(offerName) && requiredPct != null;
  const guest = acct === "none";
  /** Only a genuinely signed-out visitor is offered /login — an authenticated user
   *  with no active benefits would be bounced straight back to /my-account, out of
   *  the funnel (F-028). */
  const showLoginHint = guest && !isAuthenticated;
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

  // F-031: a past-due member KEEPS any one-time pack access they paid for
  // (useDashboardState preserves partnerAccessPct for exactly this case, and the
  // Rewards card renders "Active from your pack"). Telling them their discounts are
  // gone would be false — and if the pack covers the offer they came for, they should
  // fall through to the covered state and go redeem it. Only a past-due member with NO
  // live access gets the plain payment prompt.
  if (acct === "pastdue" && partnerAccessPct === 0) {
    return {
      headline: "Your membership payment needs attention.",
      sub: "Update payment to restore your discounts.",
      cta: { kind: "payment" },
      showLoginHint: false,
    };
  }
  if (acct === "pastdue" && !(offerKnown && partnerAccessPct >= (requiredPct ?? 0))) {
    // Live pack, but it does not cover this offer (or no offer resolved): say what is
    // actually true — the pack still works — while still surfacing the billing fix.
    return {
      headline: "Your pack access is still running.",
      sub: "Update payment to bring your membership discounts back on top of it.",
      cta: { kind: "payment" },
      showLoginHint: false,
    };
  }
  // Past-due WITH a pack that covers this offer falls through to the covered state below.

  // F-009: a retention-paused member's access returns on resume — never upsell them
  // a package they already own; point at the manage sheet (resume lives there).
  if (acct === "paused") {
    // Name the offer they came for when we know it (F-048): otherwise the banner talks
    // only about billing and the member cannot tell whether resuming unlocks THAT offer.
    const thenCheck = offerName ? `, then check ${offerName} again` : "";
    return {
      headline: "Your membership is paused.",
      sub: pausedUntilLabel
        ? `It resumes ${pausedUntilLabel} — resume now to get your discounts back${thenCheck}.`
        : `Resume your membership to get your discounts back${thenCheck}.`,
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
        showLoginHint,
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
      // F-025: "included with any…" read as "all 1,833 with any purchase" — an
      // Apprentice Pack opens 459. Name the variance instead of implying the lot.
      sub: `Up to ${total} offers from Australia's top brands — your membership or one-time pack sets how much of the catalogue you unlock.`,
      cta: { kind: "scroll", label: "See packages" },
      showLoginHint,
    };
  }

  return {
    headline: "Back from the partner portal?",
    sub: `You're at ${partnerAccessPct}% of the partner catalogue. Upgrade your membership or grab a one-time pack to unlock more of the ${total} offers.`,
    cta: { kind: "scroll", label: "See packages" },
    showLoginHint: false,
  };
}
