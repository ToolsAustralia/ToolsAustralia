/**
 * Pure view-model for `/discount` — the public partner-discount catalogue.
 *
 * THE IDEA THE PAGE IS BUILT ON: the discount is the hook, so nothing about an offer is
 * hidden. Every partner name, logo, category and value line reads in full, signed out
 * included. What a membership buys is the ability to **redeem** — so the list is stacked
 * into bands by the access level each offer needs, and the member physically hits the seam
 * where their access stops.
 *
 * Everything here is pure and free of React so the filtering, banding and route resolution
 * can be reasoned about (and tested) without a DOM. The components own only presentation.
 *
 * TWO DATA SETS, DELIBERATELY NOT MERGED
 * -------------------------------------
 * `PARTNER_CATALOG_BROWSE` is the committed 1,833-row vendor snapshot (six fields, uneven
 * quality, artwork that can contradict its own name). `PARTNER_BRAND_OFFERS` is our own
 * 7 hand-curated direct partners (real logos, controlled copy, no vendor id and no portal
 * deep link). They render in ONE list because that is what a member wants, but they stay
 * tellable apart: direct partners carry their real logo where vendor rows carry a letter,
 * they sit in their own leading band, and their category tag renders red so it is never
 * mistaken for one of the 11 vendor categories.
 *
 * `pct: 0` on a direct partner is a BAND-PLACEMENT KEY ONLY and is never displayed — it
 * puts them in the first band, on the assumption they are a benefit from the entry level
 * up. (Open question carried from the handoff: confirm the real gating.)
 *
 * @module utils/partner-discounts/discount-catalogue
 */

import {
  PARTNER_CATALOG_BROWSE,
  PARTNER_CATALOG_BROWSE_CATEGORIES,
} from "@/generated/partnerCatalogBrowse";
import { PARTNER_CATALOG_TIER_COUNTS, PARTNER_CATALOG_TOTAL } from "@/generated/partnerCatalogPreview";
import { PARTNER_BRAND_OFFERS } from "@/data/partnerBrandOffers";
import { formatPartnerOfferName } from "@/utils/partner-discounts/portal-return";
import { buildPartnerPortalOfferImageUrl } from "@/utils/partner-discounts/portal-offer-url";
import { PARTNER_CATALOG_LADDER_PCTS } from "@/utils/partner-discounts/partner-catalog-visibility";
import { resolveUnlockPackagesForLevel } from "@/utils/partner-discounts/unlock-packages";
import { getPackageById } from "@/data/membershipPackages";

/** Ascending access ladder — the 11 levels an offer can sit at. */
export const DISCOUNT_LEVELS: readonly number[] = [...PARTNER_CATALOG_LADDER_PCTS].sort(
  (a, b) => a - b
);

export { PARTNER_CATALOG_TOTAL, PARTNER_CATALOG_TIER_COUNTS };

/**
 * The one `highlight` string that appears on 675 of 1,833 offers (37% of the catalogue).
 * The popup names the duplication rather than letting a member think they misread it.
 */
export const DUPLICATE_HIGHLIGHT = "Explore New Adventures and get 7% Cashback";

/** How many offers carry {@link DUPLICATE_HIGHLIGHT}. Measured from the committed CSV. */
export const DUPLICATE_HIGHLIGHT_COUNT = 675;

export const fmtAu = (n: number): string => Number(n).toLocaleString("en-AU");

/** Offers unlocked at a percent, or null when the percent is not on the ladder. */
export function offersAtLevel(pct: number): number | null {
  return Object.hasOwn(PARTNER_CATALOG_TIER_COUNTS, pct)
    ? PARTNER_CATALOG_TIER_COUNTS[pct]
    : null;
}

/** Offers the viewer can redeem right now (0 when signed out or below the first rung). */
export function redeemableCount(viewerPct: number, signedIn: boolean): number {
  if (!signedIn) return 0;
  return offersAtLevel(viewerPct) ?? 0;
}

/** The next rung above a percent, or null at the top. */
export function nextLevelAbove(pct: number): number | null {
  return DISCOUNT_LEVELS.find((p) => p > pct) ?? null;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface DiscountRow {
  /** Vendor offer id (all digits) or the direct partner's slug. */
  id: string;
  name: string;
  /** One of the 11 vendor categories, or a direct partner's own short label. */
  cat: string;
  /** Access level that OPENS this offer. 0 = direct partner (band key only, never shown). */
  pct: number;
  /** The vendor's value line, or a direct partner's `discountMessage`. May be "". */
  highlight: string;
  kind: "vendor" | "direct";
  /** Lower-cased `name + cat + highlight`, prepared once for search. */
  haystack: string;
  /** Curated local logo — direct partners only. */
  logo: string | null;
  /** Offer artwork URL — vendor rows with committed artwork only. */
  imageSrc: string | null;
  /** The partner's own site — direct partners only, and null when the record has `"#"`. */
  link: string | null;
}

/** First alphanumeric of the name, for the letter plate. */
export function plateLetter(name: string): string {
  return (/[A-Za-z0-9]/.exec(name) ?? ["?"])[0].toUpperCase();
}

/**
 * The 7 direct partners as list rows.
 *
 * Their `discountMessage` occupies the value-line slot because it IS the value line —
 * "$250 off a wrap when you mention Tools Australia" says both the deal and how to claim it.
 */
export const DIRECT_ROWS: readonly DiscountRow[] = PARTNER_BRAND_OFFERS.map((d) => ({
  id: d.id,
  name: d.name,
  cat: d.category,
  pct: 0,
  highlight: d.discountMessage,
  kind: "direct" as const,
  haystack: `${d.name} ${d.category} ${d.discountMessage}`.toLowerCase(),
  logo: d.logo,
  imageSrc: null,
  // Two of the seven have no real link yet; `"#"` must never become an href.
  link: d.businessLink && d.businessLink !== "#" ? d.businessLink : null,
}));

/**
 * The full committed vendor snapshot as list rows.
 *
 * Built once at module scope: the generated browse table is a frozen literal, so there is
 * nothing per-render to recompute, and 1,833 rows is a measurable cost to redo on a keystroke.
 */
export const VENDOR_ROWS: readonly DiscountRow[] = PARTNER_CATALOG_BROWSE.map(
  ([name, catIdx, pct, id, highlight, imageExt]) => {
    const display = formatPartnerOfferName(name);
    const cat = PARTNER_CATALOG_BROWSE_CATEGORIES[catIdx] ?? "";
    return {
      id,
      name: display,
      cat,
      pct,
      highlight,
      kind: "vendor" as const,
      haystack: `${display} ${cat} ${highlight}`.toLowerCase(),
      logo: null,
      // ONLY where the probe/harvest confirmed artwork, and with the reference they found.
      // Guessing a path or extension 403s through our own image optimiser.
      imageSrc: imageExt ? buildPartnerPortalOfferImageUrl(id, imageExt) : null,
      link: null,
    };
  }
);

export const ALL_ROWS: readonly DiscountRow[] = [...DIRECT_ROWS, ...VENDOR_ROWS];

/** Category chips: "All" plus the 11 vendor categories with their catalogue-wide counts. */
export interface DiscountCategoryChip {
  label: string;
  /** null = All. */
  value: string | null;
  count: number;
}

export const CATEGORY_CHIPS: readonly DiscountCategoryChip[] = [
  { label: "All", value: null, count: PARTNER_CATALOG_TOTAL },
  ...PARTNER_CATALOG_BROWSE_CATEGORIES.map((name) => ({
    label: name,
    value: name,
    count: VENDOR_ROWS.filter((r) => r.cat === name).length,
  })).sort((a, b) => b.count - a.count),
];

/** Access-level chips: "Any" plus each rung of the 11-level ladder. */
export interface DiscountLevelChip {
  label: string;
  /** null = Any level. */
  value: number | null;
  count: number;
}

/**
 * The access ladder as filter chips — **EXACT rungs, multi-select**.
 *
 * Each chip is the set of offers that rung *itself* opens, and chips union. So one tap on
 * 50% answers "what does 50% specifically unlock?", and tapping 5 + 10 + 15 + 25 + 40 + 50
 * builds the "everything up to 50%" view. Both questions, one mechanism.
 *
 * This started out CUMULATIVE (`pct <= level`) and that was wrong for the reason the chips
 * make obvious: cumulative makes the **100% chip a no-op** — it selects all 1,833, which is
 * exactly what "Any" already does — and it makes every high rung nearly one, since 85%
 * would show 1,559 of 1,833. The interesting question at the top of the ladder is "what does
 * this tier ADD", and only exact rungs answer it.
 *
 * Counts are per-rung and measured off `VENDOR_ROWS`, the same way `CATEGORY_CHIPS` counts
 * its categories — so a chip's number is exactly what selecting it returns, with no offset to
 * explain. They therefore do NOT match `PARTNER_CATALOG_TIER_COUNTS` (which is cumulative and
 * still what the band headers and gate panels quote); the two answer different questions and
 * `npm run test:discount-catalogue` pins the relationship between them.
 *
 * Direct partners sit at `pct: 0`, which is a band key and not a real rung, so they are not
 * chipped and are excluded whenever any rung is selected — they are "included with any
 * membership", not unlocked at a percent.
 */
export const LEVEL_CHIPS: readonly DiscountLevelChip[] = [
  { label: "Any", value: null, count: PARTNER_CATALOG_TOTAL },
  ...DISCOUNT_LEVELS.map((pct) => ({
    label: `${pct}%`,
    value: pct,
    count: VENDOR_ROWS.filter((r) => r.pct === pct).length,
  })),
];

// ---------------------------------------------------------------------------
// Filter + sort
// ---------------------------------------------------------------------------

export type DiscountSort = "access" | "az" | "category";

export const DISCOUNT_SORTS: readonly { key: DiscountSort; label: string }[] = [
  { key: "access", label: "Access level" },
  { key: "az", label: "Offer name A–Z" },
  { key: "category", label: "Category" },
];

export interface DiscountFilterInput {
  query: string;
  category: string | null;
  /** "Only what I can use" — hides `pct > viewerPct`. Signed-in only. */
  openOnly: boolean;
  /**
   * Access-level filter — the EXACT rungs selected, unioned. Empty = the whole ladder.
   *
   * Exact rather than cumulative so the top of the ladder stays useful: `pct <= 100` selects
   * everything, making a cumulative 100% chip identical to "Any". Multi-select is what gives
   * back the cumulative view when it is wanted — picking 5…50 is "up to 50%".
   *
   * Composes with `openOnly` rather than fighting it: `openOnly` is still relative to the
   * VIEWER, so a member who selects a rung above their own access sees it filtered back out.
   */
  levels: readonly number[];
  sort: DiscountSort;
  viewerPct: number;
  signedIn: boolean;
}

export function filterAndSortRows(
  rows: readonly DiscountRow[],
  input: DiscountFilterInput
): DiscountRow[] {
  const q = input.query.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (input.category !== null && r.cat !== input.category) return false;
    if (input.openOnly && input.signedIn && r.pct > input.viewerPct) return false;
    if (input.levels.length > 0 && !input.levels.includes(r.pct)) return false;
    if (q && !r.haystack.includes(q)) return false;
    return true;
  });

  if (input.sort === "access") {
    return out.sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));
  }
  if (input.sort === "az") return out.sort((a, b) => a.name.localeCompare(b.name));
  return out.sort((a, b) => a.cat.localeCompare(b.cat) || a.pct - b.pct);
}

// ---------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------

export interface DiscountBand {
  /** Access level that opens this band; 0 = the direct-partner band. */
  level: number;
  rows: DiscountRow[];
  /** Whether the viewer can redeem everything in this band. */
  reachable: boolean;
  /** True on the FIRST band the viewer cannot reach — where the wall marker is drawn. */
  wall: boolean;
  name: string;
  /** Right-hand count, e.g. "917 of 1,833 redeemable at 50%". */
  total: string;
  /** Wall copy; only meaningful when `wall` is true. */
  wallText: string;
  wallTextShort: string;
}

/**
 * Group rows by the ACCESS LEVEL that opens them — not by membership name. The catalogue
 * has 11 levels and there are only 3 memberships; the other 8 are reached with one-time
 * packs, so naming bands after tiers would leave 8 of them unnameable.
 *
 * Bands (and the wall) are a view of the ACCESS-LEVEL sort only. Under A–Z or Category they
 * would cut across the chosen ordering, so the caller passes `banded: false` and the list
 * goes flat — each row still states its own access state.
 */
export function buildBands(
  rows: DiscountRow[],
  input: { viewerPct: number; signedIn: boolean; banded: boolean }
): DiscountBand[] {
  if (!input.banded) {
    return [
      {
        level: -1,
        rows,
        reachable: true,
        wall: false,
        name: "",
        total: "",
        wallText: "",
        wallTextShort: "",
      },
    ];
  }

  const levels = [...new Set(rows.map((r) => r.pct))].sort((a, b) => a - b);
  const behind = PARTNER_CATALOG_TOTAL - redeemableCount(input.viewerPct, input.signedIn);
  let wallDrawn = false;

  return levels.map((level) => {
    const reachable = input.signedIn && input.viewerPct >= level;
    const wall = !reachable && !wallDrawn;
    if (wall) wallDrawn = true;

    const atLevel = offersAtLevel(level);
    return {
      level,
      rows: rows.filter((r) => r.pct === level),
      reachable,
      wall,
      name:
        level === 0
          ? "Included with any membership"
          : reachable
            ? `Yours at ${level}%`
            : `Needs ${level}% to redeem`,
      total:
        level === 0
          ? `${DIRECT_ROWS.length} direct partners`
          : atLevel !== null
            ? `${fmtAu(atLevel)} of ${fmtAu(PARTNER_CATALOG_TOTAL)} redeemable at ${level}%`
            : `${fmtAu(PARTNER_CATALOG_TOTAL)} in the catalogue`,
      wallText: input.signedIn
        ? `Your access stops at ${input.viewerPct}% · ${fmtAu(behind)} you cannot redeem yet`
        : "Readable below — a membership is what lets you claim them",
      wallTextShort: input.signedIn
        ? `${fmtAu(behind)} beyond ${input.viewerPct}%`
        : "Log in to claim these",
    };
  });
}

// ---------------------------------------------------------------------------
// The two routes past the wall
// ---------------------------------------------------------------------------

export interface DiscountUnlockRoute {
  kind: "membership" | "pack";
  packageId: string;
  name: string;
  price: number;
  /** The package's own access percent (>= the level asked for). */
  pct: number;
  /** Day window for a one-time pack; 0 for a subscription (lifecycle-gated). */
  days: number;
  entries: number;
  kindLabel: string;
  tagLabel: string;
  /** e.g. "+458 redeemable" — from the cumulative tier counts. */
  gainLabel: string;
  ctaLabel: string;
  accessCaption: string;
  periodLabel: string;
}

/** Entries a static package grants, whichever field its type uses. */
function packageEntries(packageId: string): number {
  const pkg = getPackageById(packageId);
  if (!pkg) return 0;
  return pkg.entriesPerMonth ?? pkg.totalEntries ?? 0;
}

/**
 * The cheapest membership AND the cheapest one-time pack that reach `level`.
 *
 * Both, always — a member who will not take a subscription still has a route, which is the
 * whole reason the popup shows two. Delegates to `resolveUnlockPackagesForLevel` so the
 * pricing and the percent-resolution trap documented there are not re-implemented here.
 */
export function resolveDiscountRoutes(level: number, viewerRedeemable: number): DiscountUnlockRoute[] {
  const { subscription, oneTime } = resolveUnlockPackagesForLevel(level);
  const out: DiscountUnlockRoute[] = [];

  const build = (
    option: { packageId: string; name: string; price: number; pct: number },
    kind: "membership" | "pack"
  ): DiscountUnlockRoute => {
    const atPct = offersAtLevel(option.pct);
    const gain = atPct === null ? null : atPct - viewerRedeemable;
    const days = getPackageById(option.packageId)?.partnerDiscountDays ?? 0;
    return {
      kind,
      packageId: option.packageId,
      name: option.name,
      price: option.price,
      pct: option.pct,
      days,
      entries: packageEntries(option.packageId),
      kindLabel: kind === "membership" ? "Membership" : "One-time pack",
      // Membership is cheaper than the covering pack at every one of the 11 levels, so the
      // labels are stable rather than computed — but they describe different things: price
      // ("cheapest way in") against commitment ("no subscription").
      tagLabel: kind === "membership" ? "Cheapest way in" : "No subscription",
      gainLabel:
        gain !== null && gain > 0 ? `+${fmtAu(gain)} redeemable` : "Reaches this offer",
      // One-time package names already end in "Pack" ("Foreman Pack"), so appending the
      // word again reads "Get the Foreman Pack pack". The article carries the difference
      // instead: "Get Tradie" (a membership you join) vs "Get the Foreman Pack" (a thing
      // you buy once).
      ctaLabel: kind === "membership" ? `Get ${option.name}` : `Get the ${option.name}`,
      // Both captions name the thing being accessed. "4-day access" alone left the pack tile
      // saying what the membership tile said in full ("partner discount access") — beside each
      // other in the same popup, the shorter one read as a different, vaguer benefit.
      accessCaption:
        kind === "membership" || days <= 0
          ? "partner discount access"
          : `${days}-day discount access`,
      periodLabel: kind === "membership" ? "per month · cancel anytime" : "One Time",
    };
  };

  if (subscription) out.push(build(subscription, "membership"));
  if (oneTime) out.push(build(oneTime, "pack"));
  return out;
}

// ---------------------------------------------------------------------------
// Gate copy
// ---------------------------------------------------------------------------

export interface DiscountGate {
  locked: boolean;
  title: string;
  body: string;
  /** Left tally cell. */
  tallyLabel: string;
  tallyValue: string;
  /** Right tally cell. */
  tallyLabel2: string;
  tallyValue2: string;
  /** Primary footer CTA label; null when there is no footer action. */
  ctaLabel: string | null;
  footNote: string;
  /** Show the two unlock routes (signed-in, locked, vendor offer). */
  showRoutes: boolean;
  /** Show the gold "log in" CTA inside the gate panel. */
  showLoginCta: boolean;
  /** The access bar's notch level, or null for no notch. */
  notchPct: number | null;
  /** Direct partners have no vendor access bar at all. */
  showBar: boolean;
}

/**
 * The gate panel's copy for one row.
 *
 * Say "redeem", never "open": anyone can open an offer and read it — access is what buys
 * the ability to redeem. The whole page depends on that distinction holding in the words.
 */
export function buildGate(row: DiscountRow, viewerPct: number, signedIn: boolean): DiscountGate {
  const open = signedIn && row.pct <= viewerPct;
  const now = redeemableCount(viewerPct, signedIn);
  const direct = row.kind === "direct";
  const atRowLevel = offersAtLevel(row.pct);

  if (direct && open) {
    return {
      locked: false,
      title: "Yours as a Tools Australia member",
      body: "A direct partner of ours — mention Tools Australia at the counter. No code and no portal involved.",
      tallyLabel: "The deal",
      tallyValue: row.highlight || "Member offer",
      tallyLabel2: "Kind",
      tallyValue2: "Direct partner",
      ctaLabel: row.link ? "Visit their site" : null,
      footNote: row.link
        ? "Discount applied in store when you mention Tools Australia."
        : "No site listed yet — mention Tools Australia in store.",
      showRoutes: false,
      showLoginCta: false,
      notchPct: null,
      showBar: false,
    };
  }

  if (direct) {
    return {
      locked: true,
      title: "Log in to see the full deal",
      body: "You are seeing the headline. A membership lets you read the detail and claim it in store.",
      tallyLabel: "Kind",
      tallyValue: "Direct partner",
      tallyLabel2: "Claimed",
      tallyValue2: "In store",
      ctaLabel: null,
      footNote: "Direct partner, not in the vendor catalogue.",
      showRoutes: false,
      showLoginCta: true,
      notchPct: null,
      showBar: false,
    };
  }

  if (open) {
    return {
      locked: false,
      title: `Redeemable on your ${viewerPct}% access`,
      body: `Needs ${row.pct}% · you have ${viewerPct}%.`,
      tallyLabel: "Redeemable now",
      tallyValue: `${fmtAu(now)} offers`,
      tallyLabel2: "Catalogue",
      tallyValue2: `${fmtAu(PARTNER_CATALOG_TOTAL)} offers`,
      ctaLabel: "Redeem in portal",
      footNote: "Opens our rewards partner's site.",
      showRoutes: false,
      showLoginCta: false,
      notchPct: null,
      showBar: true,
    };
  }

  if (!signedIn) {
    return {
      locked: true,
      title: "Log in to redeem",
      body: `Reading is free. Redeeming needs ${row.pct}% access.`,
      tallyLabel: "Needs",
      tallyValue: `${row.pct}% access`,
      tallyLabel2: "Catalogue",
      tallyValue2: `${fmtAu(PARTNER_CATALOG_TOTAL)} offers`,
      ctaLabel: null,
      footNote: "",
      showRoutes: false,
      showLoginCta: true,
      notchPct: row.pct,
      showBar: true,
    };
  }

  return {
    locked: true,
    title: `Needs ${row.pct}% to redeem`,
    body: `You have ${viewerPct}%.`,
    tallyLabel: "You are on",
    tallyValue: `${viewerPct}% · ${fmtAu(now)} offers`,
    tallyLabel2: `At ${row.pct}%`,
    tallyValue2: atRowLevel !== null ? `${fmtAu(atRowLevel)} offers` : "—",
    ctaLabel: null,
    footNote: "",
    showRoutes: true,
    showLoginCta: false,
    notchPct: row.pct,
    showBar: true,
  };
}
