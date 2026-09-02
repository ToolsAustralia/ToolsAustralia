/**
 * Task 5 — the four campaign-window truncation sites.
 *
 * `isCampaignRedeemable` / `personalWindowGoverns` are already fully unit
 * tested in bonus-code-policy.test.ts (test:bonus-code-policy). That coverage
 * proves the PREDICATE is correct in isolation; it proves nothing about
 * whether the four call sites actually CONSULT it. This file closes that gap
 * by exercising the real, unmocked service/route code against a live DB:
 *
 *   1. RedemptionService.redeem()        — the redemption window check
 *   2. RedemptionService.redeem()        — the by-code campaign resolve ($or)
 *   3. RedemptionService.redeem()        — the purchase-requirement ceiling
 *   3'. RedeemablesWalletService         — the identical ceiling mirror
 *   4. CampaignCodeValidationService     — the checkout preview gate
 *
 * THIS SUITE REACHES SHARED DATA. Three scenarios drive a SUCCESSFUL
 * `RedemptionService.redeem()`, which grants real entries into the live target
 * `MajorDraw` and can issue a `MilestoneIssuance`. Both are undone in `finally`,
 * filtered to this run's throwaway users — see the cleanup block. Point a
 * `MONGODB_URI` at production and this writes to production.
 *
 * Every fixture is created fresh under a distinctive code/email prefix and
 * removed in `finally`. Test users deliberately carry NO active subscription
 * except where a "membership" purchaseRequirement test needs one — see the
 * comment on USER_ONE_TIME for why the wallet-service scenario uses
 * purchaseRequirement "one-time" instead: RedeemablesWalletService.getUserWallet
 * calls CampaignService.ensureActiveCampaignIssuancesForUser() internally,
 * which auto-issues from EVERY currently-active real campaign in this shared
 * dev DB that targets "all-active-subscribers" — a user with an active
 * subscription would risk minting real issuances (and later, real Klaviyo
 * sends) against production campaign data. A subscription-less user is
 * invisible to that sweep (it requires `subscription.isActive === true` for
 * every non-manual targeting mode), so it is safe here.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import MajorDraw from "@/models/MajorDraw";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import { RedemptionService } from "../RedemptionService";
import { RedeemablesWalletService } from "../RedeemablesWalletService";
import { CampaignCodeValidationService } from "../CampaignCodeValidationService";
import { formatExpiryLabelAEST } from "@/utils/common/timezone";
import { NEVER_EXPIRES_ISSUANCE_DATE } from "@/utils/redeemables/bonus-code-policy";

const RUN_ID = Date.now();
const NOW = new Date();
const STARTS_AT = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
const BACKSTOP_PASSED = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000); // campaign endsAt, 10 days ago
const PURCHASE_AFTER_BACKSTOP = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago — after endsAt, before now
const PERSONAL_STILL_VALID = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
const PERSONAL_ALREADY_EXPIRED = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
const FUTURE_ENDS_AT = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000); // campaign endsAt, still open
/**
 * The far-future sentinel `expiresAt` production rows carry when they were minted
 * before an expiry was configured. Same instant as NEVER_EXPIRES_ISSUANCE_DATE —
 * copied rather than aliased so a fixture can never mutate the shared constant.
 */
const SENTINEL_EXPIRY = new Date(NEVER_EXPIRES_ISSUANCE_DATE.getTime());

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}\n        expected: ${e}\n        actual:   ${a}`);
  }
}

const userIds: mongoose.Types.ObjectId[] = [];
const campaignIds: mongoose.Types.ObjectId[] = [];
const issuanceIds: mongoose.Types.ObjectId[] = [];

async function makeUser(suffix: string, extra: Record<string, unknown> = {}) {
  const user = await User.create({
    firstName: "Task5",
    lastName: "Test",
    email: `task5-window-${RUN_ID}-${suffix}@example.test`,
    isActive: true,
    isEmailVerified: true,
    ...extra,
  });
  userIds.push(user._id as unknown as mongoose.Types.ObjectId);
  return user;
}

async function makeCampaign(suffix: string, over: Record<string, unknown>) {
  const campaign = await MonthlyEntryCampaign.create({
    monthKey: "2026-08",
    name: `Task5 window test ${suffix}`,
    entriesAmount: 5,
    campaignMode: "unique",
    targetingMode: "manual-users",
    startsAt: STARTS_AT,
    endsAt: BACKSTOP_PASSED,
    neverExpires: false,
    isActive: true,
    code: `TASK5WIN${RUN_ID}${suffix}`.slice(0, 32),
    requiresPurchase: false,
    purchaseRequirement: "none",
    ...over,
  });
  campaignIds.push(campaign._id as unknown as mongoose.Types.ObjectId);
  return campaign;
}

async function makeIssuance(campaignId: mongoose.Types.ObjectId, userId: mongoose.Types.ObjectId, over: Record<string, unknown>) {
  const issuance = await RedeemableIssuance.create({
    campaignId,
    userId,
    monthKey: "2026-08",
    status: "active",
    source: "monthly-coupon",
    entriesAmount: 5,
    issuedAt: NOW,
    expiresAt: PERSONAL_STILL_VALID,
    ...over,
  });
  issuanceIds.push(issuance._id as mongoose.Types.ObjectId);
  return issuance;
}

async function run() {
  await connectDB();

  /*
   * `require`, deliberately — NOT a static import. The route now imports
   * `@/lib/auth` (to resolve the caller's session), which pulls in
   * `@/lib/jwt`, which THROWS at module scope if `NEXTAUTH_SECRET` is unset.
   * Static imports are hoisted above the `dotenv.config()` call at the top of
   * this file, so a static import of the route crashes the suite before a
   * single assertion runs. Loading it here, inside `run()`, is the same pattern
   * as the deferred route load in bonus-code-webhook.test.ts:190-192 — that one
   * defers for its own reason (keeping a `require.cache` stub in effect), so
   * copy the mechanism from it, not the justification.
   */
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { POST } = require("@/app/api/codes/validate/route") as typeof import("@/app/api/codes/validate/route");
  /* eslint-enable @typescript-eslint/no-require-imports */

  try {
    console.log("Site 1 + 2 — global-mode personal-window issuance survives a passed campaign backstop");
    {
      const user = await makeUser("global");
      const campaign = await makeCampaign("GLOB", { campaignMode: "global", validForHours: 336 });
      // campaignMode "global" issuances carry NO code of their own — this is
      // exactly the row Site 2's $or leg exists to keep reachable.
      await makeIssuance(campaign._id as unknown as mongoose.Types.ObjectId, user._id as unknown as mongoose.Types.ObjectId, {
        code: undefined,
        expiresAt: PERSONAL_STILL_VALID,
      });

      const result = await RedemptionService.redeem({ userId: String(user._id), code: campaign.code });
      check("redeem succeeds despite endsAt in the past", result.success, true);
      check("entries granted", result.entriesGranted, 5);
    }

    console.log("\nSite 1 + 2 — legacy campaign (validForHours unset) parity: still refused once ended");
    {
      const user = await makeUser("legacy-global");
      const campaign = await makeCampaign("LEGG", { campaignMode: "global" }); // validForHours unset
      await makeIssuance(campaign._id as unknown as mongoose.Types.ObjectId, user._id as unknown as mongoose.Types.ObjectId, {
        code: undefined,
        expiresAt: PERSONAL_STILL_VALID,
      });

      const result = await RedemptionService.redeem({ userId: String(user._id), code: campaign.code });
      check("legacy ended campaign still invalid_code (Site 2 query unchanged)", result, {
        success: false,
        reason: "invalid_code",
      });
    }

    console.log("\nSite 1 — legacy campaign reached via direct issuance code still refused once ended");
    {
      const user = await makeUser("legacy-unique");
      const campaign = await makeCampaign("LEGU", { campaignMode: "unique" }); // validForHours unset
      await makeIssuance(campaign._id as unknown as mongoose.Types.ObjectId, user._id as unknown as mongoose.Types.ObjectId, {
        code: campaign.code,
        expiresAt: PERSONAL_STILL_VALID,
      });

      const result = await RedemptionService.redeem({ userId: String(user._id), code: campaign.code });
      check("legacy ended campaign still campaign_not_active (Site 1 unchanged for legacy)", result, {
        success: false,
        reason: "campaign_not_active",
      });
    }

    console.log("\nSite 3 — RedemptionService purchase-ceiling: personal window lets a late purchase qualify");
    {
      const purchaseStart = new Date(STARTS_AT.getTime() + 24 * 60 * 60 * 1000);
      const user = await makeUser("membership", {
        subscription: { isActive: true, startDate: PURCHASE_AFTER_BACKSTOP },
      });
      const campaign = await makeCampaign("MEMB", {
        campaignMode: "unique",
        validForHours: 336,
        purchaseRequirement: "membership",
        startsAt: purchaseStart,
      });
      await makeIssuance(campaign._id as unknown as mongoose.Types.ObjectId, user._id as unknown as mongoose.Types.ObjectId, {
        code: campaign.code,
        expiresAt: PERSONAL_STILL_VALID,
      });

      const result = await RedemptionService.redeem({ userId: String(user._id), code: campaign.code });
      check(
        "purchase made AFTER endsAt but before now still qualifies (ceiling=now, not endsAt)",
        result.success,
        true
      );
    }

    console.log("\nSite 3 — RedemptionService purchase-ceiling NOT widened for legacy campaigns");
    {
      // A legacy campaign guarantees campaign.endsAt >= now by the time we
      // reach the purchase check (Site 1 already refused it otherwise), so an
      // ordinary past purchase date can never distinguish "ceiling=endsAt"
      // from a buggy "ceiling=now" — both would already contain it. Use a
      // purchase date BETWEEN now and endsAt: the correct (unwidened) ceiling
      // (endsAt, in the future) still contains it; a bug that unconditionally
      // widened the ceiling to `now` for every campaign would exclude it.
      const purchaseStart = new Date(STARTS_AT.getTime() + 24 * 60 * 60 * 1000);
      const futureEndsAt = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
      const purchaseBetweenNowAndEndsAt = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
      const user = await makeUser("legacy-membership", {
        subscription: { isActive: true, startDate: purchaseBetweenNowAndEndsAt },
      });
      const campaign = await makeCampaign("LEGM", {
        campaignMode: "unique",
        purchaseRequirement: "membership",
        startsAt: purchaseStart,
        endsAt: futureEndsAt, // still open — Site 1 passes, purchase check is what's under test
      });
      await makeIssuance(campaign._id as unknown as mongoose.Types.ObjectId, user._id as unknown as mongoose.Types.ObjectId, {
        code: campaign.code,
        expiresAt: PERSONAL_STILL_VALID,
      });

      const result = await RedemptionService.redeem({ userId: String(user._id), code: campaign.code });
      check("legacy ceiling stays campaign.endsAt, not now", result.success, true);
    }

    console.log("\nSite 3' — RedeemablesWalletService mirrors the same purchase-ceiling override");
    {
      const purchaseStart = new Date(STARTS_AT.getTime() + 24 * 60 * 60 * 1000);
      // No active subscription — invisible to ensureActiveCampaignIssuancesForUser's
      // auto-issuance sweep (see file header). purchaseRequirement is "one-time" so
      // hasQualifyingPurchase checks oneTimePackages, not subscription state.
      const user = await makeUser("one-time", {
        oneTimePackages: [
          {
            packageId: "task5-window-test-pkg",
            purchaseDate: PURCHASE_AFTER_BACKSTOP,
            endDate: new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000),
            isActive: true,
          },
        ],
      });
      const campaign = await makeCampaign("ONET", {
        campaignMode: "unique",
        validForHours: 336,
        purchaseRequirement: "one-time",
        startsAt: purchaseStart,
      });
      const issuance = await makeIssuance(campaign._id as unknown as mongoose.Types.ObjectId, user._id as unknown as mongoose.Types.ObjectId, {
        code: campaign.code,
        expiresAt: PERSONAL_STILL_VALID,
      });

      const wallet = await RedeemablesWalletService.getUserWallet(String(user._id));
      const item = wallet.items.find((i) => i.issuanceId === String(issuance._id));
      assert.ok(item, "wallet must return the manually-created issuance");
      check(
        "wallet isRedeemableNow true — purchase after endsAt still qualifies via the personal-window ceiling",
        item!.isRedeemableNow,
        true
      );
    }

    console.log("\nSite 3'' — the wallet DELEGATES the campaign half, so it cannot offer a claim the server refuses (ANZACDAY25 regression)");
    {
      // PRODUCTION SHAPE, REPRODUCED EXACTLY. Campaign ANZAC DAY 25
      // (`ANZACDAY25`) ran 2026-04-24 -> endsAt 2026-04-27T10:00Z with
      // neverExpires false and NO validForHours, but was left `isActive: true`.
      // 452 of its issuances had been minted with the far-future sentinel
      // expiry before an expiry was configured; 188 were still status "active".
      //
      // Pre-fix, RedeemablesWalletService spelled out its own PARTIAL copy of
      // isCampaignRedeemable — `campaign.isActive !== false` and nothing else —
      // so `endsAt` never entered the wallet's answer. Every condition passed
      // and 188 members were shown an ENABLED Claim button on 25 entries that
      // RedemptionService then refused with `campaign_not_active`.
      //
      // MUTATION-CHECKED 2026-09-01: restoring `campaign.isActive !== false` in
      // place of `isCampaignRedeemable(campaign, now)` turns the third assertion
      // below red (`expected: false, actual: true`) while every other assertion
      // in this suite stays green. That is the whole point of the fixture — the
      // campaign IS active, so an isActive-only gate cannot see the defect.
      const user = await makeUser("anzac-ended");
      // makeCampaign's defaults ARE the ANZAC shape: endsAt = BACKSTOP_PASSED
      // (10 days ago), neverExpires false, isActive true, validForHours unset.
      const campaign = await makeCampaign("ANZ1", { campaignMode: "unique" });
      const issuance = await makeIssuance(
        campaign._id as unknown as mongoose.Types.ObjectId,
        user._id as unknown as mongoose.Types.ObjectId,
        { code: campaign.code, expiresAt: SENTINEL_EXPIRY }
      );

      const wallet = await RedeemablesWalletService.getUserWallet(String(user._id));
      const item = wallet.items.find((i) => i.issuanceId === String(issuance._id));
      assert.ok(item, "wallet must return the manually-created issuance");
      // The two preconditions that made this bite, asserted rather than assumed:
      // if a future change expires the row or deactivates the campaign, the
      // headline assertion below would pass for the WRONG reason.
      check(
        "precondition — row is active with a far-future expiry, so every issuance-level gate passes",
        [item!.status, item!.expiresAt.getTime() > NOW.getTime()],
        ["active", true]
      );
      check(
        "precondition — the campaign is still isActive: true, the ONLY campaign gate the old code had",
        campaign.isActive,
        true
      );
      check("wallet isRedeemableNow FALSE — the passed endsAt is now consulted", item!.isRedeemableNow, false);

      // THE INVARIANT, stated as an assertion: whatever the wallet says about a
      // campaign, the redeem path must say the same. Pre-fix these disagreed.
      const result = await RedemptionService.redeem({ userId: String(user._id), code: campaign.code });
      check("…and the server agrees — no button the server would refuse", result, {
        success: false,
        reason: "campaign_not_active",
      });
    }

    console.log("\nSite 3'' — inverse: a genuinely live campaign still yields an enabled Claim button");
    {
      // The other half of the fix: delegating to isCampaignRedeemable must not
      // silently kill every claim. Same row shape as above — active, sentinel
      // expiry — with the ONE difference that the campaign's window is open.
      const user = await makeUser("anzac-live");
      const campaign = await makeCampaign("ANZ2", { campaignMode: "unique", endsAt: FUTURE_ENDS_AT });
      const issuance = await makeIssuance(
        campaign._id as unknown as mongoose.Types.ObjectId,
        user._id as unknown as mongoose.Types.ObjectId,
        { code: campaign.code, expiresAt: SENTINEL_EXPIRY }
      );

      const wallet = await RedeemablesWalletService.getUserWallet(String(user._id));
      const item = wallet.items.find((i) => i.issuanceId === String(issuance._id));
      assert.ok(item, "wallet must return the manually-created issuance");
      check("wallet isRedeemableNow TRUE — a live campaign is unaffected by the fix", item!.isRedeemableNow, true);
    }

    console.log("\nSite 4 — CampaignCodeValidationService: personal window still valid at checkout despite endsAt passed");
    {
      const user = await makeUser("checkout-valid");
      const campaign = await makeCampaign("CKV1", { campaignMode: "global", validForHours: 336 });
      await makeIssuance(campaign._id as unknown as mongoose.Types.ObjectId, user._id as unknown as mongoose.Types.ObjectId, {
        code: undefined,
        expiresAt: PERSONAL_STILL_VALID,
      });

      const result = await CampaignCodeValidationService.validate({ code: campaign.code, userId: String(user._id) });
      check("checkout accepts the code", result.valid, true);
    }

    console.log("\nSite 4 — CampaignCodeValidationService: personal window ALSO expired -> dated refusal, not bare invalid");
    {
      const user = await makeUser("checkout-expired");
      const campaign = await makeCampaign("CKV2", { campaignMode: "global", validForHours: 336 });
      const issuance = await makeIssuance(campaign._id as unknown as mongoose.Types.ObjectId, user._id as unknown as mongoose.Types.ObjectId, {
        code: undefined,
        expiresAt: PERSONAL_ALREADY_EXPIRED,
      });

      const result = await CampaignCodeValidationService.validate({ code: campaign.code, userId: String(user._id) });
      check("checkout returns the dated expiry reason", result, {
        valid: false,
        reason: "expired",
        message: `This code expired on ${formatExpiryLabelAEST(issuance.expiresAt)}.`,
      });
    }

    console.log("\nSite 4 — CampaignCodeValidationService: an identified caller holding NO issuance is refused");
    {
      // Checkout used to answer `valid: true` here purely on the campaign
      // window, while RedemptionService.redeem returns campaign_not_found for a
      // non-holder and payment-processing treats that as non-blocking — so the
      // modal showed APPLIED, the customer paid, and nothing was granted with no
      // error at any point. These codes are forwardable, so this is the ordinary
      // "someone shared their code" case, not an exotic one.
      const user = await makeUser("checkout-nonholder");
      const campaign = await makeCampaign("CKV6", { campaignMode: "global", validForHours: 336 });
      const result = await CampaignCodeValidationService.validate({ code: campaign.code, userId: String(user._id) });
      check("a non-holder is told the code is not on their account", result, {
        valid: false,
        reason: "not_held",
        message: "This code isn't available on your account.",
      });
    }

    console.log("\nSite 4 — CampaignCodeValidationService: a REFUNDED grant is refused at checkout too");
    {
      // The refund path restores status:"active" and $unsets redeemedAt, so
      // without honouring redeemedEverAt this reads as a live claimable code —
      // and checkout would tell the customer it applies.
      const user = await makeUser("checkout-refunded");
      const campaign = await makeCampaign("CKV7", { campaignMode: "global", validForHours: 336 });
      await makeIssuance(campaign._id as unknown as mongoose.Types.ObjectId, user._id as unknown as mongoose.Types.ObjectId, {
        code: undefined,
        expiresAt: PERSONAL_STILL_VALID,
        status: "active",
        redeemedEverAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000),
      });
      const result = await CampaignCodeValidationService.validate({ code: campaign.code, userId: String(user._id) });
      check("checkout refuses a spent-then-refunded grant", result, {
        valid: false,
        reason: "already_redeemed",
        message: "This code has already been redeemed.",
      });
    }

    console.log("\nSite 4 — CampaignCodeValidationService: guest checkout (no userId) falls back to the campaign window only");
    {
      const campaign = await makeCampaign("CKV3", { campaignMode: "global", validForHours: 336 });
      const result = await CampaignCodeValidationService.validate({ code: campaign.code });
      check("guest sees the campaign as valid (personal window backstop doesn't veto)", result.valid, true);
    }

    console.log("\nSite 4 — CampaignCodeValidationService: legacy campaign parity, ended -> invalid, unchanged");
    {
      const campaign = await makeCampaign("CKV4", { campaignMode: "global" }); // validForHours unset
      const result = await CampaignCodeValidationService.validate({ code: campaign.code });
      check("legacy ended campaign still invalid at checkout", result, {
        valid: false,
        reason: "not_found",
        message: "Invalid campaign code",
      });
    }

    console.log("\nSite 4 — CampaignCodeValidationService: a malformed caller id is treated as a guest, not a 500");
    {
      const campaign = await makeCampaign("CKV8", { campaignMode: "global", validForHours: 336 });
      const result = await CampaignCodeValidationService.validate({ code: campaign.code, userId: "not-an-objectid" });
      check("a non-ObjectId id does not CastError out of the service", result.valid, true);
    }

    console.log("\nSite 4 (end-to-end) — POST /api/codes/validate does NOT take identity from the request body");
    {
      // This assertion used to read the other way round: it PASSED a victim's id
      // in `inviteeUserId` and asserted the dated per-user message came back.
      // That was the leak. `inviteeUserId` is a referral-graph input, and this
      // endpoint is unauthenticated and public, so trusting it for identity let
      // anyone holding a mass-emailed code plus an ObjectId read back whether
      // that customer held the code, whether they had spent it, and the exact
      // instant of their personal window. Identity is the session now; with no
      // session this must answer as a guest.
      const user = await makeUser("checkout-e2e");
      const campaign = await makeCampaign("CKV5", { campaignMode: "global", validForHours: 336 });
      const issuance = await makeIssuance(campaign._id as unknown as mongoose.Types.ObjectId, user._id as unknown as mongoose.Types.ObjectId, {
        code: undefined,
        expiresAt: PERSONAL_ALREADY_EXPIRED,
      });

      const request = new NextRequest("http://localhost/api/codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: campaign.code, inviteeUserId: String(user._id), preferType: "auto" }),
      });
      const response = await POST(request);
      const body = await response.json();
      const dated = `This code expired on ${formatExpiryLabelAEST(issuance.expiresAt)}.`;
      check("the victim's personal deadline is NOT disclosed to an unauthenticated caller", body.message === dated, false);
      check("…and the guest answer is the plain campaign-window one", [body.success, body.valid], [true, true]);

      // The route has no injectable session (getServerSession is a non-
      // configurable CJS getter, so it cannot be stubbed in a tsx harness), so
      // this pins the wiring at the source level instead: identity must come
      // from the session and must never be re-wired back to the body field.
      const routeSource = readFileSync(
        path.resolve(process.cwd(), "src/app/api/codes/validate/route.ts"),
        "utf8"
      );
      check(
        "the route resolves the campaign caller from the session",
        routeSource.includes("userId: await resolveCallerId()") &&
          routeSource.includes("await getServerSession(authOptions)"),
        true
      );
      check("…and never from the request body", routeSource.includes("userId: parsed.inviteeUserId"), false);
    }

    console.log("\nSite 5 — resolveCodeForCheckout: the GUEST leg, which is the population these codes target");
    {
      // THE FAILURE THIS CLOSES. MembershipModal computes its user id as
      // `isAuthenticated ? userData._id : guestUserData.userId`, and step-1
      // registration does NOT authenticate in this codebase — so a customer
      // applying a code straight after registering arrives here as a GUEST.
      // /api/codes/validate answers a guest from the campaign window alone, so
      // it says APPLIED. Only this server-side check, at the point the code is
      // written into Stripe metadata, can refuse it BEFORE the payment.
      const holder = await makeUser("checkout-guest-holder");
      const nonHolder = await makeUser("checkout-guest-nonholder");
      const campaign = await makeCampaign("CKV9", { campaignMode: "global", validForHours: 336 });
      const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;
      await makeIssuance(campaignId, holder._id as unknown as mongoose.Types.ObjectId, {
        code: undefined,
        expiresAt: PERSONAL_STILL_VALID,
      });

      // What the guest leg of /api/codes/validate would have answered.
      const guestPreview = await CampaignCodeValidationService.validate({ code: campaign.code });
      check("the checkout PREVIEW still tells a guest the code is valid", guestPreview.valid, true);

      check(
        "…but the metadata write REFUSES it when no account could be resolved",
        await CampaignCodeValidationService.resolveCodeForCheckout({
          code: campaign.code,
          userId: undefined,
          context: "test-guest",
        }),
        undefined
      );

      check(
        "…and refuses it for a resolved account that holds no issuance",
        await CampaignCodeValidationService.resolveCodeForCheckout({
          code: campaign.code,
          userId: String(nonHolder._id),
          context: "test-nonholder",
        }),
        undefined
      );

      check(
        "…while a genuine holder still gets the code through, canonicalised",
        await CampaignCodeValidationService.resolveCodeForCheckout({
          code: campaign.code.toLowerCase(),
          userId: String(holder._id),
          context: "test-holder",
        }),
        campaign.code
      );
    }

    console.log("\nSite 5 — resolveCodeForCheckout: an expired or refunded holder is refused too");
    {
      // Two separate campaigns on purpose: `{campaignId, code}` is unique and a
      // campaignMode "global" issuance stores `code: null`, so two of them on ONE
      // campaign collide. Every other fixture in this file pairs one campaign
      // with one user for the same reason.
      const expiredHolder = await makeUser("checkout-guest-expired");
      const expiredCampaign = await makeCampaign("CKV10", { campaignMode: "global", validForHours: 336 });
      await makeIssuance(
        expiredCampaign._id as unknown as mongoose.Types.ObjectId,
        expiredHolder._id as unknown as mongoose.Types.ObjectId,
        { code: undefined, expiresAt: PERSONAL_ALREADY_EXPIRED }
      );

      const refundedHolder = await makeUser("checkout-guest-refunded");
      const refundedCampaign = await makeCampaign("CKV11", { campaignMode: "global", validForHours: 336 });
      await makeIssuance(
        refundedCampaign._id as unknown as mongoose.Types.ObjectId,
        refundedHolder._id as unknown as mongoose.Types.ObjectId,
        {
          code: undefined,
          expiresAt: PERSONAL_STILL_VALID,
          redeemedEverAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000),
        }
      );

      check(
        "a lapsed personal window is refused before payment, not after",
        await CampaignCodeValidationService.resolveCodeForCheckout({
          code: expiredCampaign.code,
          userId: String(expiredHolder._id),
          context: "test-expired",
        }),
        undefined
      );

      check(
        "a spent-then-refunded grant is refused before payment, not after",
        await CampaignCodeValidationService.resolveCodeForCheckout({
          code: refundedCampaign.code,
          userId: String(refundedHolder._id),
          context: "test-refunded",
        }),
        undefined
      );
    }

    // Site 5 — "every Stripe route writes the VERIFIED code into metadata,
    // never the body field" — MOVED, not dropped. It lived here as two
    // `src.includes(...)` checks against each route read as TEXT, which pinned
    // nothing: the positive leg passed if the call sat in a dead branch or a
    // comment, and the negative leg was defeated by any rewrite of the same bug
    // (`const { campaignCode } = validatedData`, `validatedData?.campaignCode`,
    // `body.campaignCode`) — each of which ships a customer-supplied,
    // unvalidated code into Stripe metadata that is redeemed later. Both were
    // demonstrated against the real files.
    //
    // It is now `npm run test:campaign-code-metadata`
    // (src/app/api/stripe/__tests__/campaign-code-metadata.test.ts), which
    // DRIVES all four handlers with Stripe stubbed as the recorder and asserts
    // the argument Stripe would actually have received — in both directions:
    // resolver refuses → no `campaignCode` key at all; resolver returns a
    // canonicalised value → that value, not the caller's. It needs a
    // require.cache stub set installed before any route module loads, which is
    // why it is its own file rather than another section here.
    //
    // What stays in THIS file is the behaviour underneath it: sites 4 and 5
    // above drive the real `resolveCodeForCheckout` through guest, non-holder,
    // expired and refunded cases.
  } finally {
    // Three scenarios above drive a SUCCESSFUL RedemptionService.redeem(), and
    // RedemptionService calls DrawGrantService.grantMonthlyCouponEntries, which
    // pushes an entry subdocument into the live target MajorDraw and save()s it
    // — then runs MilestoneService.checkAndIssueMilestones. Deleting only the
    // issuances/campaigns/users left both behind permanently on every run.
    //
    // Each step is individually caught, for the same reason the steps exist at
    // all: as unguarded sequential awaits, ONE throwing deleteMany would skip
    // the MajorDraw $pull below it and silently reinstate the exact defect this
    // cleanup was added to close. Same pattern as campaign-enrolment.test.ts.
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["issuances", () => RedeemableIssuance.deleteMany({ _id: { $in: issuanceIds } })],
      [
        "major-draw entries",
        () =>
          MajorDraw.updateMany(
            { "entries.userId": { $in: userIds } },
            { $pull: { entries: { userId: { $in: userIds } } } }
          ),
      ],
      ["milestone issuances", () => MilestoneIssuance.deleteMany({ userId: { $in: userIds } })],
      ["campaigns", () => MonthlyEntryCampaign.deleteMany({ _id: { $in: campaignIds } })],
      ["users", () => User.deleteMany({ _id: { $in: userIds } })],
      ["connection", () => mongoose.connection.close()],
    ];
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error) {
        console.error(`  CLEANUP FAILED (${name}) — check for leaked fixtures`, error);
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed");
}

run().catch((error) => {
  console.error("campaign-window.test.ts crashed:", error);
  process.exit(1);
});
