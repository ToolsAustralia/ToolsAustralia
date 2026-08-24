import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Stripe from "stripe";
import { enforceMajorDrawOpenForNewPurchasesOr403 } from "@/utils/draws/major-draw-gate-http";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
import { extractTikTokContext } from "@/utils/tracking/tiktok-helpers";
import { safeEventSourceUrl } from "@/utils/tracking/event-source-url";
import { isStripeCardError } from "@/utils/payment/stripe/payment-error-detection";
import { analyzeStripePayErrorForExcessiveRetry } from "@/utils/payment/stripe/stripe-excessive-retry";
import {
  getSubscriptionPeriodStart,
  getSubscriptionPeriodEnd,
} from "@/utils/payment/stripe/subscription-period";
import { getNextAnchorTimestamp, getReanchorTrialEndTimestamp } from "@/utils/billing/anchor-billing";

/**
 * Minimum runway between an upgrade and the anchor `trial_end` we re-apply after it.
 *
 * `trial_end` is a BILLING boundary, not a grace date — Stripe charges the FULL amount when it
 * arrives. The upgrading member has just paid a full month up front, so re-applying an anchor that
 * is only days away would charge them twice within days, and `proration_behavior: "none"` means no
 * credit for the overlap. (Concretely: a 26-July joiner anchored to 24 Aug who upgrades on 20 Aug
 * would pay full price on the 20th and full price again on the 24th.)
 *
 * 14 days is half a monthly cycle: they paid for a month, so they get at least half of one before
 * the next charge. Erring generous is deliberate — the failure mode on the other side is
 * double-charging a paying member, which costs refunds, chargebacks and trust. This mirrors the
 * strictly-after intent already baked into `getReanchorTrialEndTimestamp`, which exists so a
 * recovered member is not re-billed a fortnight later on a stale anchor.
 */
const MIN_REAPPLIED_ANCHOR_RUNWAY_SECONDS = 14 * 24 * 60 * 60;

const upgradeSubscriptionPaymentSchema = z.object({
  newPackageId: z.string().min(1, "New package ID is required"),
  paymentMethodId: z.string().optional(), // Optional for existing customers with saved payment methods
});

/**
 * POST /api/stripe/upgrade-subscription-payment
 * ✅ STRIPE BEST PRACTICE: Update existing subscription with proration
 *
 * This endpoint follows Stripe's recommended pattern:
 * - Uses subscription.update() instead of creating new subscription
 * - Automatic proration calculation by Stripe
 * - Maintains single subscription ID for better tracking
 * - Webhook-driven activation for reliability
 */
export async function POST(request: NextRequest) {
  try {
    // console.log(`🚀 [UPGRADE] Starting upgrade process - USING SUBSCRIPTION.UPDATE()`);

    await connectDB();
    // console.log(`✅ Database connected`);

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      // console.log(`❌ No session found`);
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = upgradeSubscriptionPaymentSchema.parse(body);
    // console.log(`✅ Data validated:`, validatedData);

    const { newPackageId: _newPackageId } = validatedData;
    // console.log(`📦 Upgrading to package: ${newPackageId}`);

    // Get the existing user
    const user = await User.findById(session.user.id);
    if (!user) {
      // console.log(`❌ User not found: ${session.user.id}`);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // console.log(`👤 User found: ${user.email}`);
    // console.log(`📊 Current subscription:`, {
    //   packageId: user.subscription?.packageId,
    //   stripeSubscriptionId: user.stripeSubscriptionId,
    //   isActive: user.subscription?.isActive,
    //   status: user.subscription?.status,
    // });

    // Check if user has an active subscription
    if (!user.subscription?.isActive || !user.stripeSubscriptionId) {
      // console.log(`❌ No active subscription found for user: ${user.email}`);
      return NextResponse.json({ error: "No active subscription found to upgrade" }, { status: 400 });
    }

    const gateResponse = await enforceMajorDrawOpenForNewPurchasesOr403();
    if (gateResponse) return gateResponse;

    // ✅ FIX: Get current package from Stripe subscription metadata (source of truth)
    let currentStripeSubscription;
    try {
      currentStripeSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    } catch (error) {
      console.error(`❌ Failed to retrieve Stripe subscription: ${error}`);
      return NextResponse.json({ error: "Failed to retrieve subscription details" }, { status: 500 });
    }

    // Get current package from Stripe metadata (most accurate)
    const currentPackageId = currentStripeSubscription.metadata.packageId || user.subscription.packageId;
    const currentPackage = currentPackageId ? getPackageById(currentPackageId) : null;
    const newPackage = getPackageById(validatedData.newPackageId);

    if (!currentPackage || !newPackage) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    // Check if it's the same package
    if (currentPackage._id === newPackage._id) {
      return NextResponse.json(
        { error: "You are already subscribed to this package. Please select a different package to upgrade." },
        { status: 400 }
      );
    }

    // Check if it's actually an upgrade
    if (newPackage.price <= currentPackage.price) {
      return NextResponse.json(
        { error: "This is not an upgrade. Please select a higher tier package." },
        { status: 400 }
      );
    }

    // Validate Stripe configuration
    if (!newPackage.stripePriceId) {
      console.error(`❌ No Stripe Price ID configured for package: ${newPackage.name}`);
      return NextResponse.json(
        {
          success: false,
          error: `Stripe configuration missing for ${newPackage.name}. Please contact support.`,
        },
        { status: 500 }
      );
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: {
          userId: user._id.toString(),
          userEmail: user.email,
        },
      });
      stripeCustomerId = stripeCustomer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // Get payment method
    // console.log(`💳 Getting payment method...`);
    let paymentMethod: Stripe.PaymentMethod;

    if (validatedData.paymentMethodId) {
      // console.log(`💳 Using provided payment method: ${validatedData.paymentMethodId}`);
      paymentMethod = await stripe.paymentMethods.retrieve(validatedData.paymentMethodId);
    } else if (user.savedPaymentMethods && user.savedPaymentMethods.length > 0) {
      const defaultPaymentMethod = user.savedPaymentMethods.find((pm) => pm.isDefault) || user.savedPaymentMethods[0];
      // console.log(`💳 Using saved payment method: ${defaultPaymentMethod.paymentMethodId}`);
      paymentMethod = await stripe.paymentMethods.retrieve(defaultPaymentMethod.paymentMethodId);
    } else {
      // console.log(`❌ No payment method available`);
      return NextResponse.json({ error: "No payment method available" }, { status: 400 });
    }

    // Attach payment method to customer if needed
    if (paymentMethod.customer !== stripeCustomerId) {
      await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: stripeCustomerId,
      });
      // console.log(`✅ Payment method attached to customer`);
    }

    // Set as default payment method
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });
    // console.log(`✅ Payment method set as default`);

    // ✅ STRIPE BEST PRACTICE: Retrieve current subscription to get item ID
    // console.log(`📊 Retrieving current subscription: ${user.stripeSubscriptionId}`);
    const currentSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

    if (!currentSubscription.items.data || currentSubscription.items.data.length === 0) {
      console.error(`❌ No subscription items found`);
      return NextResponse.json({ error: "Invalid subscription configuration" }, { status: 500 });
    }

    // Basil API (2025-08-27.basil): current_period_start/end live on subscription ITEMS,
    // not the subscription root. Resolve once via the helper (supports legacy + Basil shapes).
    const currentSubPeriodStart = getSubscriptionPeriodStart(currentSubscription);
    const currentSubPeriodEnd = getSubscriptionPeriodEnd(currentSubscription);

    // ── Anchor-24 members are on a Stripe "trial" ──────────────────────────────────
    // Joining on the 25th-27th (AEST) intentionally puts the member on a pending
    // `trial_end` so their billing re-anchors to the 24th — `billing_anchor_rule:
    // "join_25_27_to_24"`. (Past-due reanchor does the same with its own clamped day.)
    // Stripe REJECTS the pay-first `billing_cycle_anchor: "now"` below while a trial end
    // is pending — "Trial end (...) cannot be after billing_cycle_anchor (...)" — which is
    // why every upgrade from these members failed with a 400. We capture the pending
    // anchor here, end the trial in the update below so the charge can land, and put the
    // anchor back afterwards (see the re-apply block after the proration validation).
    const wasTrialing = currentSubscription.status === "trialing";
    const pendingTrialEnd = typeof currentSubscription.trial_end === "number" ? currentSubscription.trial_end : null;

    const currentSubscriptionItem = currentSubscription.items.data[0];
    // console.log(`📦 Current subscription item:`, {
    //   id: currentSubscriptionItem.id,
    //   priceId: currentSubscriptionItem.price.id,
    //   productId: currentSubscriptionItem.price.product,
    // });

    // ✅ STRIPE BEST PRACTICE: Update existing subscription instead of creating new one
    // console.log(`🔄 [UPGRADE] Updating subscription with proration...`);
    // console.log(`🔄 From Price: ${currentSubscriptionItem.price.id} ($${currentPackage.price})`);
    // console.log(`🔄 To Price: ${newPackage.stripePriceId} ($${newPackage.price})`);
    // console.log(`🔄 Strategy: always_invoice + unchanged billing cycle (accurate proration)`);
    // console.log(
    //   `📅 Current billing period: ${new Date(
    //     currentSubscription.current_period_start * 1000
    //   ).toLocaleDateString()} - ${new Date(currentSubscription.current_period_end * 1000).toLocaleDateString()}`
    // );

    // ✅ STRIPE BEST PRACTICE: For immediate upgrade with payment collection
    // Use 'always_invoice' to create invoice and attempt immediate payment
    // Use 'unchanged' billing cycle to maintain consistent billing dates and accurate proration
    // Format description for Stripe transactions tab: "Tradie to Foreman Upgrade"
    const upgradeDescription = `${currentPackage.name} to ${newPackage.name} Upgrade`;

    // Extract request context for Facebook CAPI (IP, user agent, fbc, fbp)
    // Store in subscription metadata so webhook can use it for improved match quality
    // Carries every provider's match signals: Meta's fbc/fbp and TikTok's ttclid/ttp.
    // Both get stashed in Stripe metadata (capi_*) because Purchase fires from the
    // webhook, which has no cookies to read them back from. A paid `subscription_update`
    // proration invoice is NOT a renewal, so it does produce a Purchase.
    const requestContext = { ...extractRequestContext(request), ...extractTikTokContext(request) };
    // Upgrades run from StripePaymentModal on the account surface, not the shop, so the
    // no-referer fallback points at /my-account rather than /shop.
    const capiEventSourceUrl = safeEventSourceUrl(
      request.headers.get("referer") ??
      (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/my-account` : undefined)
    );

    let updatedSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [
        {
          id: currentSubscriptionItem.id,
          price: newPackage.stripePriceId, // ✅ Use existing Price ID
        },
      ],
      // ✅ NO PRORATION UPGRADE: charge full price now and reset billing cycle
      proration_behavior: "none",
      billing_cycle_anchor: "now",
      // End the anchor trial in the SAME call so "now" is a legal anchor (this is exactly
      // what Stripe's own rejection message tells you to do). Only sent for a trialing
      // member — the anchor is re-applied for the next cycle after the charge is proven.
      ...(wasTrialing ? { trial_end: "now" as const } : {}),
      // A member can upgrade while scheduled to cancel at period end. Stripe (API > 2018-02-28) does NOT
      // auto-clear a pending cancel on an item swap, so we must clear it explicitly — otherwise the upgrade
      // "sticks" in the DB (webhook sets autoRenew=true) but Stripe still cancels at period end. Charge-safe:
      // cancel_at_period_end does not trigger prorations/invoices.
      cancel_at_period_end: false,
      payment_behavior: "error_if_incomplete", // ✅ CRITICAL: Force payment collection, error if payment fails
      default_payment_method: paymentMethod.id,
      expand: ["latest_invoice.payment_intent"], // ✅ Get payment intent for frontend
      description: upgradeDescription, // ✅ Formatted upgrade description for Stripe dashboard
      metadata: {
        ...currentSubscription.metadata,
        packageId: newPackage._id,
        packageName: newPackage.name,
        upgradeFrom: currentPackage._id,
        upgradeFromName: currentPackage.name,
        upgradeDate: new Date().toISOString(),
        upgradeType: "no_proration", // Track that this used NO proration
        // Store request context for Facebook CAPI (webhook will extract and use).
        // Stamped AFTER the currentSubscription.metadata spread on purpose: the carried-over
        // capi_* keys are from the original signup (possibly months ago), so the live upgrade
        // request's IP/UA/click ids are the ones that actually match this Purchase.
        ...(requestContext.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
        ...(requestContext.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
        ...(requestContext.fbc ? { capi_fbc: requestContext.fbc } : {}),
        ...(requestContext.fbp ? { capi_fbp: requestContext.fbp } : {}),
        ...(requestContext.ttclid ? { capi_ttclid: requestContext.ttclid } : {}),
        ...(requestContext.ttp ? { capi_ttp: requestContext.ttp } : {}),
        ...(capiEventSourceUrl ? { capi_event_source_url: capiEventSourceUrl } : {}),
        originalBillingDate: currentSubPeriodStart
          ? new Date(currentSubPeriodStart * 1000).toISOString()
          : new Date().toISOString(),
      },
    });

    // console.log(`✅ [UPGRADE] Subscription updated successfully: ${updatedSubscription.id}`);
    // console.log(`📊 Updated subscription status: ${updatedSubscription.status}`);

    // Extract latest invoice and payment intent
    const latestInvoice = updatedSubscription.latest_invoice as Stripe.Invoice;
    const invoiceWithPaymentIntent = latestInvoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent };
    const paymentIntent = invoiceWithPaymentIntent?.payment_intent as Stripe.PaymentIntent;
    const _invoiceWithPaid = latestInvoice as Stripe.Invoice & { paid?: boolean };
    // console.log(`💰 Invoice payment status: ${invoiceWithPaid.paid ? "Paid" : "Unpaid"}`);

    // console.log(`💳 Latest invoice:`, {
    //   id: latestInvoice?.id,
    //   status: latestInvoice?.status,
    //   amount: latestInvoice?.amount_due,
    //   paid: invoiceWithPaid?.paid,
    // });
    // console.log(`💳 Payment intent:`, {
    //   id: paymentIntent?.id,
    //   status: paymentIntent?.status,
    //   amount: paymentIntent?.amount,
    //   clientSecret: paymentIntent?.client_secret ? "present" : "missing",
    // });

    // Calculate proration amount from invoice
    const prorationAmount = latestInvoice?.amount_due || 0;
    // console.log(`💰 Proration amount calculated by Stripe: $${(prorationAmount / 100).toFixed(2)}`);

    // ✅ CRITICAL: Validate proration amount for upgrades
    // When upgrading, user should ALWAYS pay something (at minimum the price difference)
    const expectedMinimumCharge = (newPackage.price - currentPackage.price) * 100; // Convert to cents
    // console.log(`💰 Expected minimum charge: $${(expectedMinimumCharge / 100).toFixed(2)}`);

    if (prorationAmount < expectedMinimumCharge * 0.5) {
      // If proration is less than 50% of expected, something is wrong
      console.error(`❌ Proration amount ($${(prorationAmount / 100).toFixed(2)}) is too low!`);
      console.error(`❌ Expected minimum: $${(expectedMinimumCharge / 100).toFixed(2)}`);
      console.error(`❌ This could indicate a billing cycle issue`);

      return NextResponse.json(
        {
          error: "Upgrade pricing error",
          details: `Expected charge: $${(expectedMinimumCharge / 100).toFixed(2)}, but Stripe calculated: $${(
            prorationAmount / 100
          ).toFixed(2)}. Please contact support.`,
        },
        { status: 500 }
      );
    }

    // ── Re-apply the anchor-24 trial for the NEXT cycle ────────────────────────────
    // Ending the trial above was only half the job: leaving it ended would silently drop
    // this member's anchor-24 billing date, quietly undoing the join rule for them.
    //
    // Placement is load-bearing, twice over:
    //  - AFTER the `latest_invoice` / `prorationAmount` reads above. This update makes
    //    Stripe spawn a $0 "Trial period" invoice that becomes `latest_invoice`; reading
    //    it first would see $0 and trip the "Upgrade pricing error" 500 above.
    //  - AFTER `payment_behavior: "error_if_incomplete"` has proven the charge landed —
    //    that param throws on an unpaid invoice, so reaching this line means paid.
    //
    // Footgun (docs/PAST_DUE_REANCHOR.md): setting `trial_end` on an EXISTING subscription
    // makes Stripe auto-create AND auto-pay a separate $0 invoice
    // (`billing_reason: "subscription_update"`, total 0), firing a second
    // `invoice.payment_succeeded`. It must NOT grant entries — the real grant comes from
    // the paid upgrade invoice above, and idempotency-by-id will not save us because the
    // $0 invoice carries its own fresh id. `isZeroAmountTrialUpdateInvoice`
    // (src/utils/billing/trial-invoice.ts) already classifies exactly this shape and the
    // webhook early-returns; Case D of `npm run test:zero-trial-guard` pins it for THIS
    // flow specifically (the paid + $0 pair, distinct ids). Read that checklist before
    // changing anything in this block.
    if (wasTrialing) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      let trialEndToReapply: number | null = null;

      try {
        // Re-apply the member's OWN pending anchor when it is still ahead of us — that IS
        // their renewal day, whichever rule set it (`join_25_27_to_24`, or a past-due
        // reanchor whose clamped day is not the 24th). No date math is re-derived here.
        //
        // The fallback is the shared `getNextAnchorTimestamp` (the join rule's and
        // `migrate-anchor-billing-24`'s helper) and it always lands the 24th, so it CANNOT
        // preserve a non-24 anchor day — a member reanchored to, say, the 9th would be moved
        // to the 24th. Accepted deliberately: this branch needs a lapsed or missing
        // `trial_end`, which a `trialing` subscription by definition does not have, and a
        // stale timestamp is not a trustworthy anchor to rebuild a day from. The 24th is the
        // platform's canonical anchor, so that is where an unknown lands.
        const capturedAnchor =
          pendingTrialEnd && pendingTrialEnd > nowSeconds + 60
            ? pendingTrialEnd
            : getNextAnchorTimestamp(new Date());

        // ⚠️ DOUBLE-CHARGE FLOOR — see MIN_REAPPLIED_ANCHOR_RUNWAY_SECONDS. Keep the member's
        // anchor DAY, but push to the next OCCURRENCE of it when the nearest one is under half
        // a cycle away, so they are not billed the full amount again days after paying for the
        // upgrade. `getReanchorTrialEndTimestamp` is exactly the right tool: it returns the next
        // occurrence of that same day-of-month STRICTLY AFTER the instant given, short-month
        // safe (a kept 31 becomes Feb 28/29). One advance always clears the floor, because a
        // month is at least 28 days and the floor is 14.
        trialEndToReapply =
          capturedAnchor < nowSeconds + MIN_REAPPLIED_ANCHOR_RUNWAY_SECONDS
            ? getReanchorTrialEndTimestamp(new Date(capturedAnchor * 1000))
            : capturedAnchor;
      } catch (anchorError) {
        // `getReanchorTrialEndTimestamp` throws on malformed input rather than guessing. Leave
        // `trialEndToReapply` null and skip below — the upgrade itself has already succeeded.
        console.error(`⚠️ [UPGRADE] Could not compute the re-applied anchor (non-fatal):`, anchorError);
      }

      // Future-floor. Stripe does NOT reject a past `trial_end` — it ends the trial
      // immediately and charges — so a non-future value must abort the re-anchor rather
      // than be sent. Same guard the past-due reanchor applies to its computed timestamp.
      if (trialEndToReapply === null || trialEndToReapply <= nowSeconds + 60) {
        console.error(
          `⚠️ [UPGRADE] Skipping anchor re-apply for ${user.stripeSubscriptionId}: computed trial_end ${trialEndToReapply} is not usable.`
        );
      } else {
        try {
          updatedSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
            trial_end: trialEndToReapply,
            // Explicit, never Stripe's `create_prorations` default: the member has just
            // paid the full new tier price, so this must neither charge nor credit.
            proration_behavior: "none",
            metadata: {
              ...updatedSubscription.metadata,
              billing_anchor_rule: "upgrade_reanchor",
            },
          });

          // Mirror `endDate` from the SAME computed timestamp, exactly as
          // `reanchorAfterPastDueRecovery` does — never read it back from Stripe, which can lag,
          // and the two `customer.subscription.updated` events from this request can arrive out
          // of order. Every return branch below calls `user.save()`, so this needs no extra
          // write. It matters most on the floor path above, where the anchor really does move.
          user.subscription.endDate = new Date(trialEndToReapply * 1000);

          // Klaviyo holds `next_renewal_date` / `subscription_end_date` as pushed SNAPSHOTS, so
          // unlike every in-app surface they do not self-correct on the next fetch. Fire-and-
          // forget, same as the sibling reanchor.
          try {
            const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
            ensureUserProfileSynced(user);
          } catch (klaviyoError) {
            console.error(`⚠️ [UPGRADE] Klaviyo re-sync after anchor re-apply failed (non-fatal):`, klaviyoError);
          }

          // Deliberately NO `MembershipStatusHistory` row. That model records subscription STATE
          // transitions, and the past-due reanchor writes one because a recovery moves the anchor
          // DAY. Here the day is preserved by construction — only the occurrence can shift, by one
          // cycle — and the member is active throughout. The Stripe-side audit is the
          // `billing_anchor_rule: "upgrade_reanchor"` tag plus `subscription.lastUpgradeDate`.
        } catch (reanchorError) {
          // Non-fatal. The upgrade is paid and the member has their new tier; losing the
          // re-anchor costs one off-anchor renewal date, not the upgrade. Failing the
          // request here would tell an already-charged member their upgrade failed.
          console.error(`⚠️ [UPGRADE] Anchor trial re-apply failed (non-fatal):`, reanchorError);
        }
      }
    }

    // Check if payment is already completed.
    // `trialing` is a success state here: the re-apply above deliberately puts an
    // anchor-24 member back on a Stripe trial for the next cycle. They are fully paid and
    // active (docs/PAST_DUE_REANCHOR.md — "Member-facing status"), and the member UI maps
    // trialing -> "Active" via `getSubscriptionStatusText`. Nothing below surfaces "Trial".
    if (
      latestInvoice?.status === "paid" &&
      (updatedSubscription.status === "active" || updatedSubscription.status === "trialing")
    ) {
      // console.log(`✅ Payment already processed - invoice is paid, subscription is active`);

      // 🔒 Enhanced verification for immediate activation
      const invoiceId = latestInvoice.id;
      const isAlreadyProcessed = user.processedPayments?.includes(`invoice_${invoiceId}`);

      if (isAlreadyProcessed) {
        // console.log(`⚠️ Upgrade already processed (duplicate request)`);
        return NextResponse.json({
          success: true,
          message: `Upgrade to ${newPackage.name} was already processed!`,
          data: {
            subscription: {
              id: updatedSubscription.id,
              packageId: newPackage._id,
              packageName: newPackage.name,
              price: newPackage.price,
              status: "active",
            },
          },
        });
      }

      // ✅ CRITICAL FIX: Don't mark as processed here - let webhook handle it
      // The webhook will add to processedPayments after successfully processing benefits
      // Adding it here prevents the webhook from processing the payment

      // Update user subscription with pending change for webhook processing
      user.subscription.pendingChange = {
        newPackageId: newPackage._id,
        changeType: "upgrade",
        stripeSubscriptionId: updatedSubscription.id,
        paymentIntentId: paymentIntent?.id,
        upgradeAmount: prorationAmount,
      };
      user.subscription.lastUpgradeDate = new Date();

      await user.save();

      // Track Meta CAPI Custom Event `MembershipUpgrade` (server-side — no live Pixel call).
      try {
        const { trackPixelSubscriptionUpgrade } = await import("@/utils/tracking/pixel-purchase-tracking");
        // Reuses the hoisted requestContext (Meta + TikTok signals) rather than re-deriving a
        // Meta-only one, so MembershipUpgrade carries the same match signals as the Purchase.
        await trackPixelSubscriptionUpgrade({
          oldValue: currentPackage.price,
          newValue: newPackage.price,
          currency: "AUD",
          oldPackageId: currentPackage._id,
          newPackageId: newPackage._id,
          oldPackageName: currentPackage.name,
          newPackageName: newPackage.name,
          subscriptionId: updatedSubscription.id,
          userId: user._id.toString(),
          userEmail: user.email,
          userPhone: user.mobile,
          userFirstName: user.firstName,
          userLastName: user.lastName,
          userState: user.state,
          userBirthdate: user.birthdate,
          paymentIntentId: paymentIntent?.id,
          prorationAmount: prorationAmount / 100,
          entriesAdded: (newPackage.entriesPerMonth || 0) - (currentPackage.entriesPerMonth || 0),
          requestContext,
        });
      } catch (pixelError) {
        console.error("❌ Pixel upgrade tracking failed (non-blocking):", pixelError);
      }

      // console.log(`📝 Upgrade marked for webhook processing (immediate activation)`);

      // Basil API: period fields live on subscription items, not the root.
      const updatedPeriodStart = getSubscriptionPeriodStart(updatedSubscription);
      const updatedPeriodEnd = getSubscriptionPeriodEnd(updatedSubscription);

      return NextResponse.json({
        success: true,
        message: `Upgrade to ${newPackage.name} successful! Your new benefits are activating now.`,
        data: {
          subscription: {
            id: updatedSubscription.id,
            packageId: newPackage._id,
            packageName: newPackage.name,
            price: newPackage.price,
            status: "processing", // Webhook will complete activation
          },
          upgrade: {
            fromPackage: { id: currentPackage._id, name: currentPackage.name, price: currentPackage.price },
            toPackage: { id: newPackage._id, name: newPackage.name, price: newPackage.price },
            prorationAmount: prorationAmount / 100,
            billingInfo: {
              currentBillingDate: new Date(
                (updatedPeriodStart ?? Math.floor(Date.now() / 1000)) * 1000
              ).toLocaleDateString(),
              nextBillingDate: new Date(
                (updatedPeriodEnd ?? Math.floor(Date.now() / 1000)) * 1000
              ).toLocaleDateString(),
              nextBillingAmount: newPackage.price,
              billingDateStays: true,
            },
            benefits: {
              entriesPerMonth: newPackage.entriesPerMonth,
              shopDiscountPercent: newPackage.shopDiscountPercent,
              partnerDiscountDays: newPackage.partnerDiscountDays,
            },
          },
          note: "Payment confirmed - your upgrade is activating!",
        },
      });
    }

    // ✅ FIX: Handle case where payment intent might not exist (already paid or $0 proration)
    // This can happen in test mode with saved cards or when proration is very small
    if (!paymentIntent) {
      // console.log(`⚠️ No payment intent found - invoice may be already paid or proration is $0`);

      // Check if subscription is already active (payment succeeded immediately).
      // `trialing` counts as active here for the same reason as the branch above — an
      // anchor-24 member carries a re-applied `trial_end` for the next cycle.
      if (updatedSubscription.status === "active" || updatedSubscription.status === "trialing") {
        // console.log(`✅ Subscription already active - treating as immediate success`);

        // Update user subscription immediately
        user.subscription.packageId = newPackage._id;
        user.subscription.isActive = true;
        user.subscription.status = "active";
        user.subscription.pendingChange = undefined;

        // Update saved payment methods
        const isAlreadySaved = user.savedPaymentMethods?.some((pm) => pm.paymentMethodId === paymentMethod.id);

        if (!isAlreadySaved) {
          user.savedPaymentMethods = user.savedPaymentMethods || [];
          user.savedPaymentMethods.forEach((pm) => {
            pm.isDefault = false;
          });
          user.savedPaymentMethods.push({
            paymentMethodId: paymentMethod.id,
            isDefault: true,
            createdAt: new Date(),
            lastUsed: new Date(),
          });
        }

        await user.save();

        return NextResponse.json({
          success: true,
          message: `Upgrade to ${newPackage.name} successful!`,
          data: {
            subscription: {
              id: updatedSubscription.id,
              packageId: newPackage._id,
              packageName: newPackage.name,
              price: newPackage.price,
              status: "active",
            },
            upgrade: {
              fromPackage: { id: currentPackage._id, name: currentPackage.name, price: currentPackage.price },
              toPackage: { id: newPackage._id, name: newPackage.name, price: newPackage.price },
              prorationAmount: prorationAmount / 100,
              benefits: {
                entriesPerMonth: newPackage.entriesPerMonth,
                shopDiscountPercent: newPackage.shopDiscountPercent,
                partnerDiscountDays: newPackage.partnerDiscountDays,
              },
            },
            note: "Upgrade completed successfully!",
          },
        });
      }

      // If not active and no payment intent, something is wrong
      console.error(`❌ Subscription not active and no payment intent found`);
      return NextResponse.json({ error: "Failed to process upgrade. Please try again." }, { status: 500 });
    }

    // Payment requires confirmation (has client_secret)
    if (!paymentIntent.client_secret) {
      console.error(`❌ Payment intent exists but missing client_secret`);
      return NextResponse.json({ error: "Failed to create payment confirmation" }, { status: 500 });
    }

    // Update user model with pending change (webhook will activate after payment)
    user.subscription.pendingChange = {
      newPackageId: newPackage._id,
      changeType: "upgrade",
      stripeSubscriptionId: updatedSubscription.id,
      paymentIntentId: paymentIntent.id,
      upgradeAmount: prorationAmount,
    };
    user.subscription.lastUpgradeDate = new Date();

    // Update saved payment methods
    const isAlreadySaved = user.savedPaymentMethods?.some((pm) => pm.paymentMethodId === paymentMethod.id);

    if (!isAlreadySaved) {
      user.savedPaymentMethods = user.savedPaymentMethods || [];
      user.savedPaymentMethods.forEach((pm) => {
        pm.isDefault = false;
      });
      user.savedPaymentMethods.push({
        paymentMethodId: paymentMethod.id,
        isDefault: true,
        createdAt: new Date(),
        lastUsed: new Date(),
      });
    } else {
      const existingPm = user.savedPaymentMethods.find((pm) => pm.paymentMethodId === paymentMethod.id);
      if (existingPm) {
        existingPm.lastUsed = new Date();
        existingPm.isDefault = true;
        user.savedPaymentMethods.forEach((pm) => {
          if (pm.paymentMethodId !== paymentMethod.id) pm.isDefault = false;
        });
      }
    }

    await user.save();

    // console.log(`📝 Upgrade pending payment confirmation. Webhook will activate after payment.`);

    // Return payment intent for frontend confirmation
    return NextResponse.json({
      success: true,
      message: `Upgrade to ${newPackage.name} ready! Complete payment to activate immediately.`,
      data: {
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: prorationAmount,
          currency: "aud",
          status: paymentIntent.status,
        },
        subscription: {
          id: updatedSubscription.id,
          packageId: newPackage._id,
          packageName: newPackage.name,
          price: newPackage.price,
          status: updatedSubscription.status,
        },
        upgrade: {
          fromPackage: { id: currentPackage._id, name: currentPackage.name, price: currentPackage.price },
          toPackage: { id: newPackage._id, name: newPackage.name, price: newPackage.price },
          prorationAmount: prorationAmount / 100,
          prorationDetails: `Prorated charge for remaining billing period`,
          billingInfo: {
            currentBillingDate: new Date(
              (currentSubPeriodStart ?? Math.floor(Date.now() / 1000)) * 1000
            ).toLocaleDateString(),
            nextBillingDate: new Date(
              (currentSubPeriodEnd ?? Math.floor(Date.now() / 1000)) * 1000
            ).toLocaleDateString(),
            nextBillingAmount: newPackage.price,
            billingDateStays: true,
          },
          benefits: {
            entriesPerMonth: newPackage.entriesPerMonth,
            shopDiscountPercent: newPackage.shopDiscountPercent,
            partnerDiscountDays: newPackage.partnerDiscountDays,
          },
        },
        note: "Complete payment to upgrade immediately. You will be charged the prorated difference.",
      },
    });
  } catch (error) {
    console.error("❌ [UPGRADE] Error:", error);
    console.error("❌ Error stack:", error instanceof Error ? error.stack : "No stack trace");

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data", details: error.issues }, { status: 400 });
    }

    // Card declines: subscriptions.update with payment_behavior
    // "error_if_incomplete" THROWS a StripeCardError on decline. Return the
    // sibling 400 "Payment failed" shape (see create-subscription-existing-user)
    // so the client can show accurate decline guidance instead of a generic 500.
    if (isStripeCardError(error)) {
      const stripeError = error as { message?: string; code?: string; decline_code?: string; type?: string };
      const excessiveRetry = await analyzeStripePayErrorForExcessiveRetry(stripe, error);
      return NextResponse.json(
        {
          success: false,
          error: "Payment failed",
          details: stripeError.message || "Unable to process payment",
          ...(stripeError.code && { code: stripeError.code }),
          ...(stripeError.decline_code && { decline_code: stripeError.decline_code }),
          ...(stripeError.type && { type: stripeError.type }),
          ...(excessiveRetry.requiresDifferentPaymentMethod && {
            requiresDifferentPaymentMethod: true,
            ...(excessiveRetry.failureReason && { failureReason: excessiveRetry.failureReason }),
          }),
        },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        error: "Failed to process upgrade. Please try again.",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
