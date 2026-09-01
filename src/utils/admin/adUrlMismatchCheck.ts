import { TOOLSET_LANDING_SLUGS, TOOLBOX_LANE_ORDER } from "@/config/promo-landing-slugs";

/**
 * Ad-URL mismatch check — flags a Meta ad whose CAMPAIGN/AD NAME names one brand while its
 * landing URL points somewhere else. Built after `Draw 10 | Sales | STIHL | Sep 2026` sent 567
 * visits (98% of that campaign) to `/promotions/makita` in production, undetected.
 *
 * See docs/superpowers/specs/2026-09-01-coupon-audience-and-ad-url-check-design.md, section B,
 * for the full decision record (B1-B7) and the threading checklist (T1-T4) this module exists
 * to satisfy.
 *
 * ## Why this is NOT a naive string comparison
 *
 * A campaign/ad name vs. `canonicalUrl` (path only, query stripped) comparison flags ~90% false
 * positives (spec B5) — because Tools Australia prizes have TWO independent brand axes:
 *
 *   toolset — the power-tool brand   (ryobi | milwaukee | dewalt | makita | hikoki | stihl)
 *   toolbox — the storage brand      (sidchrome | kincrome | milwaukee | gearwrench)
 *
 * `/promotions/<toolset>` is a bare evergreen page; the toolbox is expressed EITHER as a second
 * hyphenated slug segment (`/promotions/milwaukee-kincrome`) OR as a `?toolbox=`/`?toolset=`
 * query param (`/promotions/milwaukee?toolbox=kincrome`) — both mean the same thing (spec B2).
 * A page that simply doesn't commit to a toolbox (no second segment, no param) is normal and
 * correct, NOT a finding (spec B4) — `Draw 9 | Sales | GearWrench` pointing at bare
 * `/promotions/milwaukee` is GearWrench+Milwaukee working as designed.
 *
 * So a toolbox-only brand (sidchrome/kincrome/gearwrench) named in the campaign/ad is only
 * flagged when the URL POSITIVELY commits to a *different* toolbox. A toolset brand (including
 * Milwaukee, which is both) is always checked against the URL's toolset, because a resolvable
 * `/promotions/<slug>` URL always names a toolset — there is no "missing toolset" case.
 */

/** The toolset (power-tool) axis — always present on a resolvable `/promotions/<slug>` URL. */
export const AD_URL_CHECK_TOOLSET_BRANDS: readonly string[] = TOOLSET_LANDING_SLUGS;

/** The toolbox (storage) axis — may be entirely absent from a URL; absence is never a finding. */
export const AD_URL_CHECK_TOOLBOX_BRANDS: readonly string[] = TOOLBOX_LANE_ORDER;

/**
 * Every brand this check can recognise, derived from the SAME registry every other brand
 * analytics surface reads (`src/config/promo-landing-slugs.ts`) rather than hand-restated here.
 *
 * Threading row T3: a brand missing from this list makes its ads silently unverifiable (they
 * read "unknown" forever, never "mismatch" and never "ok") — so it must stay derived, not
 * copied, or a new brand landing page ships invisible to this check.
 */
export const AD_URL_CHECK_BRANDS: readonly string[] = [
  ...new Set<string>([...TOOLSET_LANDING_SLUGS, ...TOOLBOX_LANE_ORDER]),
];

const ALL_BRAND_SET = new Set<string>(AD_URL_CHECK_BRANDS);
const TOOLSET_BRAND_SET = new Set<string>(AD_URL_CHECK_TOOLSET_BRANDS);
/** Toolbox brands with NO toolset meaning of their own (Milwaukee is excluded — it has both). */
const TOOLBOX_ONLY_BRAND_SET = new Set<string>(
  AD_URL_CHECK_TOOLBOX_BRANDS.filter((brand) => !TOOLSET_BRAND_SET.has(brand))
);

interface ParsedAdUrl {
  /** Recognised brand segments of the `/promotions/<slug>` path, in order (e.g. [milwaukee, kincrome]). */
  slugBrandSegments: string[];
  toolboxParamBrand?: string;
  toolsetParamBrand?: string;
}

/**
 * Splits a landing URL into its slug segments and `toolbox`/`toolset` query params.
 * Tolerant of non-standard schemes (`unknown://meta-ad/<id>`, which `new URL()` parses fine but
 * never matches `/promotions/`) and of a bare path with no scheme at all.
 */
function parseAdUrl(url: string): ParsedAdUrl {
  const trimmed = (url ?? "").trim();
  let pathname = trimmed;
  let search = "";

  try {
    const parsed = new URL(trimmed);
    pathname = parsed.pathname;
    search = parsed.search;
  } catch {
    const queryIndex = trimmed.indexOf("?");
    if (queryIndex !== -1) {
      pathname = trimmed.slice(0, queryIndex);
      search = trimmed.slice(queryIndex);
    }
  }

  const slugMatch = pathname.match(/\/promotions\/([^/?#]+)/i);
  const slugBrandSegments = slugMatch
    ? slugMatch[1]
        .toLowerCase()
        .split("-")
        .filter((segment) => ALL_BRAND_SET.has(segment))
    : [];

  const params = new URLSearchParams(search);
  const toolboxParamRaw = params.get("toolbox")?.toLowerCase().trim();
  const toolsetParamRaw = params.get("toolset")?.toLowerCase().trim();

  return {
    slugBrandSegments,
    toolboxParamBrand: toolboxParamRaw && ALL_BRAND_SET.has(toolboxParamRaw) ? toolboxParamRaw : undefined,
    toolsetParamBrand: toolsetParamRaw && ALL_BRAND_SET.has(toolsetParamRaw) ? toolsetParamRaw : undefined,
  };
}

function allBrandsOf(parsed: ParsedAdUrl): string[] {
  const brands = new Set<string>(parsed.slugBrandSegments);
  if (parsed.toolboxParamBrand) brands.add(parsed.toolboxParamBrand);
  if (parsed.toolsetParamBrand) brands.add(parsed.toolsetParamBrand);
  return [...brands];
}

/**
 * The brand set a single landing URL resolves to — the union of slug segments AND query params
 * (`?toolbox=`, `?toolset=`), lowercased and deduped (spec B2). `/promotions/milwaukee-kincrome`
 * and `/promotions/milwaukee?toolbox=kincrome` both resolve to `["milwaukee", "kincrome"]`.
 *
 * Returns `[]` for anything that doesn't resolve a recognised brand at all — a non-promo URL,
 * an `unknown://` placeholder, or a slug/param naming a brand outside `AD_URL_CHECK_BRANDS`.
 */
export function resolveAdUrlBrands(url: string): string[] {
  return allBrandsOf(parseAdUrl(url));
}

/** True when the URL's toolset axis is positively specified (always true for a resolvable `/promotions/<slug>` URL). */
function toolsetAxisPresent(parsed: ParsedAdUrl): boolean {
  const firstSegment = parsed.slugBrandSegments[0];
  return (firstSegment !== undefined && TOOLSET_BRAND_SET.has(firstSegment)) || parsed.toolsetParamBrand !== undefined;
}

/** True when the URL's toolbox axis is positively specified (compound slug OR `?toolbox=`). Absence is never a finding (spec B4). */
function toolboxAxisPresent(parsed: ParsedAdUrl): boolean {
  return parsed.slugBrandSegments.length >= 2 || parsed.toolboxParamBrand !== undefined;
}

function isToolboxOnlyBrand(brand: string): boolean {
  return TOOLBOX_ONLY_BRAND_SET.has(brand);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every recognised brand mentioned as a whole word in free text, case-insensitive. */
function brandsMentionedInText(text: string | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const brand of AD_URL_CHECK_BRANDS) {
    const re = new RegExp(`\\b${escapeRegExp(brand)}\\b`, "i");
    if (re.test(text)) found.add(brand);
  }
  return [...found];
}

/**
 * The single brand a campaign/ad's naming implies. Campaign name is authoritative; ad name is
 * consulted ONLY when the campaign name names zero brands (e.g. a generic "Sales | Sep 2026"
 * campaign whose individual ads are named per brand). Either source naming 2+ brands, or both
 * naming 0, resolves to `undefined` — the "unknown" case (spec: "campaign/ad naming 0 or 2+
 * brands → unknown").
 */
function resolveNamedBrand(campaignName: string | undefined, adName: string | undefined): string | undefined {
  const campaignBrands = brandsMentionedInText(campaignName);
  if (campaignBrands.length === 1) return campaignBrands[0];
  if (campaignBrands.length > 1) return undefined;

  const adBrands = brandsMentionedInText(adName);
  return adBrands.length === 1 ? adBrands[0] : undefined;
}

export type AdUrlMismatchVerdict = "ok" | "mismatch" | "unknown";

export interface CheckAdUrlMismatchInput {
  campaignName?: string;
  adName?: string;
  /** Every landing URL this ad points at — pass `rawUrls`, never `canonicalUrl` (spec B1: the query is load-bearing). Multiple entries = a carousel/multi-URL ad (spec B6). */
  urls: string[];
}

export interface CheckAdUrlMismatchResult {
  verdict: AdUrlMismatchVerdict;
  /** The single brand the campaign/ad naming resolved to. Absent when naming was ambiguous (0 or 2+ brands) — always an "unknown" verdict in that case. */
  campaignBrand?: string;
  /** Union of every brand resolved across all `urls`. */
  urlBrands: string[];
}

type UrlEvaluation = "match" | "contradiction" | "silent";

/**
 * How one URL relates to the named brand:
 *  - "match"          the brand is in this URL's resolved brand set
 *  - "contradiction"  the brand's axis is positively specified by this URL, and disagrees
 *  - "silent"         nothing to say — either the URL resolved no brand at all, or the named
 *                      brand is toolbox-only and this URL simply never commits to a toolbox
 */
function evaluateUrlAgainstBrand(url: string, namedBrand: string): UrlEvaluation {
  const parsed = parseAdUrl(url);
  const brands = allBrandsOf(parsed);
  if (brands.length === 0) return "silent";
  if (brands.includes(namedBrand)) return "match";

  const axisPresent = isToolboxOnlyBrand(namedBrand) ? toolboxAxisPresent(parsed) : toolsetAxisPresent(parsed);
  return axisPresent ? "contradiction" : "silent";
}

/**
 * The ad-URL mismatch verdict for one ad.
 *
 * `mismatch` fires ONLY on a positive contradiction (spec B3): the naming resolves to exactly
 * one brand, at least one URL resolves a brand at all, and NONE of the URLs either name that
 * brand or are silent about its axis. Every other case — ambiguous naming, no resolvable URL
 * brand anywhere (including `unknown://` placeholders), or a toolbox-only brand whose URLs
 * simply never commit to a toolbox — resolves to `unknown` or `ok`, never `mismatch`. A
 * multi-URL ad (carousel) is `ok` if ANY url matches (spec B6).
 */
export function checkAdUrlMismatch(input: CheckAdUrlMismatchInput): CheckAdUrlMismatchResult {
  const urls = input.urls ?? [];
  const urlBrands = [...new Set(urls.flatMap((url) => resolveAdUrlBrands(url)))];
  const namedBrand = resolveNamedBrand(input.campaignName, input.adName);

  if (!namedBrand) {
    return { verdict: "unknown", urlBrands };
  }

  const anyUrlResolved = urls.some((url) => resolveAdUrlBrands(url).length > 0);
  if (!anyUrlResolved) {
    return { verdict: "unknown", campaignBrand: namedBrand, urlBrands };
  }

  const evaluations = urls.map((url) => evaluateUrlAgainstBrand(url, namedBrand));
  if (evaluations.includes("match")) {
    return { verdict: "ok", campaignBrand: namedBrand, urlBrands };
  }
  if (evaluations.includes("contradiction")) {
    return { verdict: "mismatch", campaignBrand: namedBrand, urlBrands };
  }
  // Every resolved URL was "silent" for this brand: namedBrand is toolbox-only and no URL
  // committed to a toolbox at all. Spec B4 — a missing `?toolbox=` is never a finding.
  return { verdict: "ok", campaignBrand: namedBrand, urlBrands };
}
