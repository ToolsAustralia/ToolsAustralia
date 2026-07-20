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
// Phantom field guard (Task 7): the MiniDraw model has no `endDate` path — draws gate on
// isActive/status + minimumEntries. Projecting it selected nothing, and the matching
// `endDate: { $gt: now }` query filter matched zero docs (activeMiniDraws permanently empty).
assert(
  !MY_ACCOUNT_MINI_DRAW_FIELDS.split(" ").includes("endDate"),
  "endDate is a phantom MiniDraw field — must not be projected"
);
for (const required of ["name", "prize", "isActive"]) {
  assert(MY_ACCOUNT_MINI_DRAW_FIELDS.split(" ").includes(required), `${required} required by MyAccountData`);
}
// Phantom field guard (Task 7): Order stores line items under `products`/`tickets`, never
// `items`. The member UI reads only insights.totalSpent (order.totalAmount) + the order count.
assert(
  !MY_ACCOUNT_ORDER_FIELDS.split(" ").includes("items"),
  "items is a phantom Order field — must not be projected"
);
for (const required of ["orderNumber", "totalAmount", "status", "createdAt"]) {
  assert(MY_ACCOUNT_ORDER_FIELDS.split(" ").includes(required), `${required} required by MyAccountData`);
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
// hasPassword is DERIVED on GET /api/users/[id] (a password-only query), never a stored
// User field — so it is intentionally ABSENT from this projection. The Account settings
// page must read it from the users/[id] payload (useUserData), NOT the my-account payload
// (where it was always undefined → passwordless members wrongly shown the change-password flow).
assert(
  !MY_ACCOUNT_USER_FIELDS.split(" ").includes("hasPassword"),
  "hasPassword is derived on /api/users/[id], not a projected my-account field"
);
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

// Query-field guards (Task 7 latent-empty bugs). Order's owner field is `user`, not `userId`;
// a `userId` filter matched zero docs and left recentOrders/totalSpent permanently empty.
// And activeMiniDraws must not filter on the phantom MiniDraw.endDate.
assert(
  /Order\.find\(\{\s*user:/.test(myAccountRoute),
  "my-account route must query Order by `user` (the model owner field)"
);
assert(
  !/Order\.find\(\{\s*userId:/.test(myAccountRoute),
  "my-account route must not query Order by phantom `userId` (→ empty recentOrders/totalSpent)"
);
assert(
  !/MiniDraw\.find\(\{[^}]*endDate/.test(myAccountRoute),
  "my-account activeMiniDraws must not filter on the phantom MiniDraw.endDate (→ empty draws)"
);

console.log("my-account-projection: all assertions passed");
