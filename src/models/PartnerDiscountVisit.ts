import mongoose, { Document, Schema } from "mongoose";

/**
 * PartnerDiscountVisit — one row per visit to a partner-discount catalogue surface.
 *
 * Answers three questions nothing else could:
 *   1. does the PUBLIC `/discount` page convert non-members
 *   2. is the ACCESS SEAM working (do they reach the locked band and act on it)
 *   3. do members actually use `/my-account/rewards/catalogue`
 *
 * WHY A NEW MODEL RATHER THAN EXTENDING PromoAnalyticsVisit
 * Same shape, different funnel. A promo visit is keyed by a landing-page slug and its
 * engagement columns describe the prize builder; a discount visit is keyed by surface and
 * its engagement columns describe an access ladder. Folding them together would have put
 * two populations in one table and corrupted the promo dashboard's numbers, which are
 * already load-bearing.
 *
 * ENGAGEMENT COLUMNS ARE CUMULATIVE AND WRITTEN WITH `$set`, NEVER `$inc`.
 * The client holds counters for the page-session and flushes ABSOLUTE totals, so a repeat
 * flush — and there are three triggers, deliberately — is harmless. Same rule as
 * `PromoAnalyticsRepository.updateVisitBuild`, for the same reason.
 *
 * PII: an opaque `userId` ref and the `anonymousId` cookie value ONLY. Never email, name,
 * or the offer names the visitor looked at. Mirrors the sibling `PartnerDiscountSsoIssuance`.
 *
 * @see docs/partner/analytics.md
 * @see docs/superpowers/specs/2026-08-11-partner-discount-page-analytics-design.md
 */

/**
 * Which catalogue the visit was on.
 *
 * Named after the routes themselves (`/discount`, `.../catalogue`) rather than
 * "public"/"member", because that is the vocabulary the two page-clients already use for
 * each other ("SISTER SURFACE: /my-account/rewards/catalogue"). Signed-in visitors do reach
 * `/discount`, so a public/member split would have been wrong as well as new.
 */
export type PartnerDiscountSurface = "discount" | "catalogue";

export const PARTNER_DISCOUNT_SURFACES: readonly PartnerDiscountSurface[] = [
  "discount",
  "catalogue",
] as const;

export interface IPartnerDiscountVisit extends Document {
  _id: mongoose.Types.ObjectId;
  surface: PartnerDiscountSurface;
  /**
   * The `ta_anon_id` cookie. This is the join key to `User.signupAttribution.anonymousId`,
   * which is why the visit→signup funnel needs no change to the User model.
   */
  anonymousId?: string;
  /** Set when the visitor was signed in. Opaque ref — never dereferenced for display. */
  userId?: mongoose.Types.ObjectId;
  /** Auth state AT VISIT TIME. Not derivable from `userId` alone once a row ages. */
  signedIn: boolean;
  /**
   * Effective partner-access % at visit time. 0 for guests and lapsed members.
   *
   * OPTIONAL, AND ABSENT IS NOT ZERO. The visit beacon fires immediately on mount so that a
   * visitor who bounces in two seconds is still counted — they are the population "is the
   * seam working" is most about — but a member's tier is resolved asynchronously and may not
   * have arrived yet. Defaulting to 0 would have recorded members as having no access. The
   * engagement flush carries the resolved value and corrects the row; a visitor who left
   * before any flush keeps `undefined`, which reads as "unknown", not "none".
   *
   * Context column only. No rate on the panel divides by it.
   */
  accessPct?: number;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  /**
   * Where this row's UTM values came from: the durable first-touch `_ta_attr` cookie, or the
   * landing URL. Audit column, exactly as on `PromoAnalyticsVisit` — it lets an attribution
   * shift after a deploy be told apart from a real traffic change.
   */
  utmBasis?: "first_touch" | "landing_url";

  // ─── Engagement. Absent until the engagement beacon lands. ───────────────

  /** Touched search, a filter, a category or the sort at all. */
  interacted?: boolean;
  /** Offer modals / cards opened. */
  offersOpened?: number;
  /**
   * Of `offersOpened`, the ones ABOVE the visitor's access level.
   *
   * The upgrade-intent signal: a visitor who opens a locked offer has told us which offer
   * they want. Deliberately a subset of `offersOpened`, never a separate population.
   */
  lockedOffersOpened?: number;
  /**
   * Was a seam ever rendered on this visit — i.e. was there a wall to reach at all.
   *
   * THE DENOMINATOR, and the reason this is two fields rather than one. `/discount` only
   * bands by access level under the ACCESS sort (`buildBands(..., { banded })`), and the
   * member catalogue never bands. Without this, seam-reach rate would divide by visits that
   * had no seam, understating it by however many people sorted A–Z.
   */
  seamRendered?: boolean;
  /** The seam scrolled into view. Only meaningful where `seamRendered` is true. */
  seamReached?: boolean;
  /** "Unlock this" / an unlock-route CTA that opened the membership modal. */
  unlockClicks?: number;
  /** A portal hand-off was started from this surface (redeem, or open-portal). */
  portalHandoff?: boolean;
  /**
   * A search returned nothing.
   *
   * Both surfaces are written around this failure — their empty states deliberately refuse
   * to claim "we don't carry it", because our snapshot is a known-incomplete subset of the
   * vendor's portal. This counts how often a visitor hits that wall.
   */
  zeroResultSearch?: boolean;

  timestamp: Date;
}

const PartnerDiscountVisitSchema = new Schema<IPartnerDiscountVisit>(
  {
    surface: {
      type: String,
      required: [true, "Surface is required"],
      enum: PARTNER_DISCOUNT_SURFACES as unknown as string[],
    },
    anonymousId: { type: String, required: false },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: false },
    signedIn: { type: Boolean, required: true, default: false },
    accessPct: { type: Number, required: false, min: 0, max: 100 },
    referrer: { type: String, required: false, trim: true },
    utmSource: { type: String, required: false, trim: true },
    utmMedium: { type: String, required: false, trim: true },
    utmCampaign: { type: String, required: false, trim: true },
    utmBasis: { type: String, enum: ["first_touch", "landing_url"], required: false },

    interacted: { type: Boolean, required: false },
    offersOpened: { type: Number, required: false, min: 0 },
    lockedOffersOpened: { type: Number, required: false, min: 0 },
    seamRendered: { type: Boolean, required: false },
    seamReached: { type: Boolean, required: false },
    unlockClicks: { type: Number, required: false, min: 0 },
    portalHandoff: { type: Boolean, required: false },
    zeroResultSearch: { type: Boolean, required: false },

    timestamp: { type: Date, default: Date.now, required: true },
  },
  {
    timestamps: false,
    collection: "partnerdiscountvisits",
  }
);

// The admin read: every aggregation matches surface + a timestamp window.
PartnerDiscountVisitSchema.index({ surface: 1, timestamp: -1 });

/**
 * Serves BOTH write paths, which is why `surface` sits in the middle rather than being a
 * second index:
 *   - the visit beacon's 60s dedup read   (anonymousId + surface + timestamp >= floor)
 *   - the engagement beacon's targeted update (anonymousId + surface, sorted timestamp desc)
 * Equality on the first two fields with a range/sort on the third is exactly the shape an
 * ESR-ordered compound index answers without a fetch-and-sort.
 */
PartnerDiscountVisitSchema.index({ anonymousId: 1, surface: 1, timestamp: -1 });

/** Member-side lookups (a specific member's catalogue history). */
PartnerDiscountVisitSchema.index({ userId: 1, timestamp: -1 });

/**
 * How long a visit row survives.
 *
 * Exported because the READ SIDE MUST KNOW IT. `User` and `PaymentEvent` never expire, so a
 * requested window starting before this floor divides COMPLETE signups and revenue by
 * TRUNCATED visits — the promo dashboard shipped a literal 250% column that way once. The
 * range resolver clamps to this so every number on the panel comes from one population.
 *
 * 90 days also matches the sibling `PartnerDiscountSsoIssuance` TTL, so the hand-off leg of
 * the funnel and the visit leg age out together rather than leaving one half of a ratio.
 */
export const PARTNER_DISCOUNT_VISIT_RETENTION_DAYS = 90;

PartnerDiscountVisitSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: PARTNER_DISCOUNT_VISIT_RETENTION_DAYS * 24 * 60 * 60,
    name: "partner_discount_visits_ttl",
  }
);

const PartnerDiscountVisit =
  (mongoose.models.PartnerDiscountVisit as mongoose.Model<IPartnerDiscountVisit>) ||
  mongoose.model<IPartnerDiscountVisit>("PartnerDiscountVisit", PartnerDiscountVisitSchema);

export default PartnerDiscountVisit;
