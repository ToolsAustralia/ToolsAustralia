import { Schema, models, model } from "mongoose";

/**
 * Audit log of MyRewards/iGoDirect SSO hand-offs — one row per `POST
 * /api/partner-discount/sso` that minted a token. MyRewards sends us no activity
 * data back, so this is our ONLY record of who entered the portal and at what tier.
 *
 * PII-safe by design: stores an opaque `userId` ref ONLY — never email/name, and
 * never the signed JWT or the returned portal token. Mirrors the NormCallLog shape
 * (TTL-expiring, hashes-not-secrets). See docs/auth/igodirect-sso-implementation-plan.md §3.
 */
const partnerDiscountSsoIssuanceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** Resolved effective access-% at hand-off time (the tier we WOULD send as member_level). */
    memberLevelPercent: { type: Number, required: false },
    /** Whether `member_level` was actually included in the signed token (false until the vendor confirms encoding — §5a). */
    memberLevelSent: { type: Boolean, required: true, default: false },
    /** Did `/generatetoken` accept the token and return a portal login token. */
    success: { type: Boolean, required: true },
    /** MyRewards' `response` string, e.g. "User found" / "New user created" / "User level upgraded". */
    providerResponse: { type: String, required: false },
    /** MyRewards' `response_code` / the HTTP status from `/generatetoken`. */
    providerResponseCode: { type: Number, required: false },
    /** Set on failure for diagnosis (never a secret). */
    errorCode: { type: String, required: false },
    // TTL: 90 days (operational audit, not a permanent record).
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
  },
  { collection: "partnerdiscountssoissuances" }
);

partnerDiscountSsoIssuanceSchema.index({ userId: 1, createdAt: -1 });
partnerDiscountSsoIssuanceSchema.index({ success: 1, createdAt: -1 });

const PartnerDiscountSsoIssuance =
  models.PartnerDiscountSsoIssuance || model("PartnerDiscountSsoIssuance", partnerDiscountSsoIssuanceSchema);

export default PartnerDiscountSsoIssuance;
