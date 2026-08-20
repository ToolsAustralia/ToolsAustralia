/**
 * Explicit wire projections for GET /api/users/[id] and /api/users/[id]/my-account.
 * The my-account payload is polled on a cadence for every member — an unprojected
 * MiniDraw.find() once shipped the full per-user entries[] arrays (MB-scale, 2026-07
 * perf audit). Keep these lists in sync with the UserData / MyAccountData client types.
 * Guarded by: npm run test:my-account-projection.
 *
 * MY_ACCOUNT_USER_FIELDS is an ADDITIVE INCLUDE-LIST (Mongoose `.select()` include
 * projection — `_id` ships implicitly). If you add a new client-consumed field to the
 * User model, you MUST add it here or it silently vanishes from the member UI.
 *
 * Excluded on purpose:
 * - Wire bloat (verified consumed only by server-side code that queries the DB
 *   directly, never by a client of these routes): `processedPayments`,
 *   `upsellHistory`, `upsellPurchases`, `redemptionHistory`, `cart`.
 *   NOTE: `miniDrawParticipation` was an exclusion candidate but IS consumed
 *   (my-account/draws/page.tsx reads it off `dash.user`) — it stays IN.
 * - Auth secrets / verification material (the old 3-field exclude-list still shipped
 *   most of these): `password`, `emailVerificationToken`, `emailVerificationCode`,
 *   `emailVerificationExpires`, `emailVerificationAttempts`, `mobileVerificationToken`,
 *   `smsOtpCode`, `smsOtpExpires`, `smsOtpAttempts`, `loginCode`, `loginCodeExpires`,
 *   `loginCodeAttempts`, `passwordResetToken`, `passwordResetExpires`, `inviteToken`,
 *   `inviteTokenExpires`. (GET /api/users/[id] derives `hasPassword` via a separate
 *   password-only query — that stays intact.)
 *
 * `subscription` is projected as the WHOLE subdocument, which covers the streak
 * fields (`streakMonths`, `streakGeneration`, `lastStreakStartInvoiceId`),
 * `lastMonthAccumulatedEntries`, `previousSubscription`, etc.
 */
// NOTE: no `endDate` — MiniDraw has no such path (draws close on isActive/status +
// minimumEntries, not a date). It was a phantom projection field that never shipped.
export const MY_ACCOUNT_MINI_DRAW_FIELDS = "name description prize isActive";
// NOTE: no `items` — Order stores line items under `products`/`tickets`, not `items`
// (see src/models/Order.ts). `items` was a phantom field; the member UI reads only
// `totalAmount` (insights.totalSpent) + the order count, both covered below.
export const MY_ACCOUNT_ORDER_FIELDS = "orderNumber totalAmount status createdAt";
export const MY_ACCOUNT_USER_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "mobile",
  "state",
  "profession",
  // Last-used delivery address, so checkout can prefill instead of asking the
  // customer to retype it. Distinct from "state" above, which is draw eligibility.
  "shippingAddress",
  "birthdate",
  "profileSetupCompleted",
  "role",
  "stripeCustomerId",
  "stripeSubscriptionId",
  "savedPaymentMethods",
  "subscription",
  "oneTimePackages",
  "miniDrawPackages",
  "miniDrawParticipation",
  "accumulatedEntries",
  "entryWallet",
  "rewardsPoints",
  "isEmailVerified",
  "isMobileVerified",
  "lastLogin",
  "isActive",
  "acceptsPromotionalEmail",
  "pendingKlaviyoMergeFromEmail",
  "cancellationUpsellRedeemed",
  "cancellationUpsellRedeemedAt",
  "retentionOffersConsumed",
  "upsellStats",
  "referral",
  "affiliateReferral",
  "signupAttribution",
  "partnerDiscountQueue",
  "roleId",
  "userType",
  "serviceAccount",
  "invitedBy",
  "invitedAt",
  "tokenVersion",
  "createdAt",
  "updatedAt",
].join(" ");
