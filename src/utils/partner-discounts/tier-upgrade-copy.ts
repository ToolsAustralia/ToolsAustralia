/**
 * THE tier-upgrade sentence — one source for every surface that tells a member an offer
 * sits above their level, including the one iGoDirect renders inside their portal.
 *
 * WHY THIS IS SHARED WITH THE VENDOR (portal audit, 2026-07-31)
 * The portal's locked-offer banner is customer-facing copy about **Tools Australia's own
 * packs**, written by a third party. That is a legal exposure, not a style preference:
 * CLAUDE.md rule 11 forbids gambling framing and forbids ever describing entries as
 * something a member buys, and the vendor has no reason to know either rule. Their current
 * banner happens to be clean — but nothing keeps it clean through their next content edit.
 *
 * So TA supplies the string. `buildVendorLockedOfferCopy()` renders exactly what we want in
 * their template, from OUR numbers, and `docs/partner/vendor-copy-contract.md` is the page
 * we hand them. If they template it with their own placeholders, the wording is still ours.
 *
 * The same builder feeds our side (the browse catalogue's locked rows), so the two surfaces
 * cannot drift: change the sentence here and both move together.
 *
 * COPY RULES BAKED IN — do not "improve" these away:
 *  - Never "odds" / "chance(s)" / "lottery" / "raffle" / "sweepstake" / "bet".
 *  - Entries are a FREE INCLUSION with a membership or pack, never a thing being sold.
 *    This module therefore never mentions entries at all — the subject is catalogue access.
 *  - Australian English: "catalogue", not "catalog".
 *
 * @module utils/partner-discounts/tier-upgrade-copy
 */

import { PARTNER_CATALOG_TIER_COUNTS, PARTNER_CATALOG_TOTAL } from "@/generated/partnerCatalogPreview";

const fmtAu = (n: number): string => n.toLocaleString("en-AU");

/** The subscription rungs a member can climb to, in ascending catalogue access. */
export const MEMBERSHIP_TIER_LADDER: readonly { name: string; pct: number }[] = [
  { name: "Tradie", pct: 50 },
  { name: "Foreman", pct: 75 },
  { name: "Boss", pct: 100 },
];

/**
 * The cheapest membership tier that opens `requiredPct`, or null when the member's own
 * access already covers it (or nothing on the ladder does — a one-time pack case, which
 * the caller handles by pointing at the packs rather than naming a tier).
 */
export function resolveCoveringTier(
  requiredPct: number,
  currentPct: number
): { name: string; pct: number } | null {
  if (currentPct >= requiredPct) return null;
  return MEMBERSHIP_TIER_LADDER.find((t) => t.pct >= requiredPct) ?? null;
}

export interface TierUpgradeCopy {
  /** One line, no CTA — "Foreman opens this, plus 458 more offers." */
  line: string;
  /** Bare label for a button. Never prices entries (rule 11). */
  cta: string;
}

/**
 * Our own surfaces' version: the member's context is known, so name the covering tier and
 * what it ADDS (the delta), not its total — "458 more offers" is the reason to move;
 * "1,375 offers" is a number they cannot act on.
 */
export function buildTierUpgradeCopy(requiredPct: number, currentPct: number): TierUpgradeCopy {
  const tier = resolveCoveringTier(requiredPct, currentPct);
  if (!tier) return { line: "Open on your membership.", cta: "Open partner portal" };

  const now = PARTNER_CATALOG_TIER_COUNTS[currentPct] ?? 0;
  const then = PARTNER_CATALOG_TIER_COUNTS[tier.pct];
  const delta = typeof then === "number" ? then - now : null;

  return {
    line:
      delta && delta > 0
        ? `${tier.name} opens this, plus ${fmtAu(delta)} more offers.`
        : `${tier.name} opens this offer.`,
    cta: `See ${tier.name}`,
  };
}

/**
 * Where a locked offer sends the member: `/membership`, carrying the offer so the page can
 * name it.
 *
 * REUSES THE PORTAL'S OWN FUNNEL. `resolvePortalReturn` already treats an `offer_id` as a
 * rewards-return, resolves the offer against our committed catalogue, and
 * `resolvePortalBannerView` already picks the cheapest covering plan and handles every
 * lifecycle state (guest, past-due with and without a live pack, paused, active). So a locked
 * card needs no upsell logic of its own — it hands the same id to the same machinery, and the
 * member lands on "You're at 50% — {offer} needs 75%" with the right plan already chosen.
 *
 * `utm_source` distinguishes OUR catalogue from the vendor's redirect while keeping
 * `utm_campaign=rewards-return`, which is what the resolver and the existing reporting key on.
 * That split is the point: it makes "how much upgrade intent does our own catalogue create,
 * versus the portal turning people away" a question the analytics can actually answer.
 */
export function buildLockedOfferUpgradeHref(offerId: string): string {
  const params = new URLSearchParams({
    utm_source: "rewards_catalogue",
    utm_medium: "internal",
    utm_campaign: "rewards-return",
    offer_id: offerId,
  });
  return `/membership?${params.toString()}`;
}

/**
 * The vendor-facing version, for iGoDirect's locked-offer banner.
 *
 * Differences from ours, both deliberate: it must stand alone for a member who has just
 * been refused inside a third-party UI (so it says who we are and where to go), and it is
 * written to be templated — the vendor substitutes the member's level and the required
 * level, everything else is fixed wording we own.
 *
 * Handed over as `docs/partner/vendor-copy-contract.md`.
 */
export function buildVendorLockedOfferCopy(input: {
  requiredPct: number;
  currentPct: number;
  /** Where their button should send the member. Ours, so the funnel stays measurable. */
  membershipUrl?: string;
}): { headline: string; body: string; cta: string; href: string } {
  const { requiredPct, currentPct, membershipUrl = "https://toolsaustralia.com.au/membership" } = input;
  const tier = resolveCoveringTier(requiredPct, currentPct);
  const then = tier ? PARTNER_CATALOG_TIER_COUNTS[tier.pct] : null;

  return {
    headline: "This offer is above your current access level.",
    body: tier
      ? `Your membership opens ${fmtAu(PARTNER_CATALOG_TIER_COUNTS[currentPct] ?? 0)} of ${fmtAu(
          PARTNER_CATALOG_TOTAL
        )} partner offers. ${tier.name} opens ${fmtAu(then ?? 0)} — including this one.`
      : `Your membership opens ${fmtAu(
          PARTNER_CATALOG_TIER_COUNTS[currentPct] ?? 0
        )} of ${fmtAu(PARTNER_CATALOG_TOTAL)} partner offers. A one-time pack opens more of the catalogue.`,
    cta: tier ? `Upgrade to ${tier.name}` : "See packages",
    // offer_id is appended by the vendor so our /membership banner can name the offer the
    // member was refused — that param is already parsed by resolvePortalReturn.
    href: `${membershipUrl}?utm_source=partner_portal&utm_medium=referral&utm_campaign=rewards-return`,
  };
}
