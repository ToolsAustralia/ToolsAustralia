import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MY_ACCOUNT_MINI_DRAW_FIELDS,
  MY_ACCOUNT_ORDER_FIELDS,
  MY_ACCOUNT_USER_FIELDS,
} from "../my-account-projection";

// The regression this guards: entries[] (one subdoc per participant) must never ship.
for (const banned of ["entries", "winner"]) {
  assert(!MY_ACCOUNT_MINI_DRAW_FIELDS.split(" ").includes(banned), `${banned} must not be projected`);
}
for (const required of ["name", "prize", "endDate", "isActive"]) {
  assert(MY_ACCOUNT_MINI_DRAW_FIELDS.split(" ").includes(required), `${required} required by MyAccountData`);
}
// NOTE: miniDrawParticipation is NOT in this banned list — it was an exclusion
// candidate but IS consumed (my-account/draws/page.tsx reads dash.user.miniDrawParticipation
// for the DrawsMini participation view), so it stays projected.
for (const banned of ["processedPayments", "upsellHistory", "upsellPurchases", "redemptionHistory", "cart"]) {
  assert(!MY_ACCOUNT_USER_FIELDS.split(" ").includes(banned), `${banned} is wire bloat`);
}
// Auth secrets must never ship — the FULL excluded cluster (the include-list replaced a
// 3-field exclude-list that still leaked most of these to the member's own client).
for (const banned of [
  "password",
  "emailVerificationToken",
  "passwordResetToken",
  "emailVerificationCode",
  "emailVerificationExpires",
  "emailVerificationAttempts",
  "mobileVerificationToken",
  "smsOtpCode",
  "smsOtpExpires",
  "smsOtpAttempts",
  "loginCode",
  "loginCodeExpires",
  "loginCodeAttempts",
  "passwordResetExpires",
  "inviteToken",
  "inviteTokenExpires",
]) {
  assert(!MY_ACCOUNT_USER_FIELDS.split(" ").includes(banned), `${banned} is an auth secret`);
}
// Fields member UI verifiably reads — a missed field silently breaks /my-account.
for (const required of [
  "subscription", // streak fields, renewal date, tier — useDashboardState, ManageSheet
  "oneTimePackages", // getActivePackage
  "miniDrawParticipation", // my-account/draws page
  "partnerDiscountQueue", // route reconcile step + partner-catalog-visibility
  "profileSetupCompleted", // my-account setup-modal gate
  "birthdate", // my-account setup-modal gate
  "rewardsPoints", // rewards redemption
  "entryWallet",
  "accumulatedEntries",
  "stripeSubscriptionId", // PaymentTab
  "savedPaymentMethods",
  "createdAt", // route-internal memberSince
]) {
  assert(MY_ACCOUNT_USER_FIELDS.split(" ").includes(required), `${required} is required by member UI`);
}
assert(!MY_ACCOUNT_MINI_DRAW_FIELDS.startsWith("-"), "must be an include-list, not an exclude-list");
assert(!MY_ACCOUNT_ORDER_FIELDS.startsWith("-"), "must be an include-list, not an exclude-list");
assert(!MY_ACCOUNT_USER_FIELDS.startsWith("-"), "must be an include-list, not an exclude-list");
assert(!MY_ACCOUNT_USER_FIELDS.includes("-"), "no exclude entries allowed in an include-list");

// Static tie: the constants only protect the wire if the routes actually apply them.
// Read both route files and assert the .select() calls are present — catches a future
// "route drops the projection entirely" regression the constant assertions can't see.
const repoRoot = process.cwd();
const myAccountRoute = readFileSync(
  path.join(repoRoot, "src", "app", "api", "users", "[id]", "my-account", "route.ts"),
  "utf8"
);
const userByIdRoute = readFileSync(
  path.join(repoRoot, "src", "app", "api", "users", "[id]", "route.ts"),
  "utf8"
);
assert(
  myAccountRoute.includes(".select(MY_ACCOUNT_USER_FIELDS)"),
  "my-account route must select MY_ACCOUNT_USER_FIELDS"
);
assert(
  myAccountRoute.includes(".select(MY_ACCOUNT_MINI_DRAW_FIELDS)"),
  "my-account route must select MY_ACCOUNT_MINI_DRAW_FIELDS (the entries[] leak guard)"
);
assert(
  myAccountRoute.includes(".select(MY_ACCOUNT_ORDER_FIELDS)"),
  "my-account route must select MY_ACCOUNT_ORDER_FIELDS"
);
assert(
  userByIdRoute.includes(".select(MY_ACCOUNT_USER_FIELDS)"),
  "users/[id] route must select MY_ACCOUNT_USER_FIELDS"
);

console.log("my-account-projection: all assertions passed");
