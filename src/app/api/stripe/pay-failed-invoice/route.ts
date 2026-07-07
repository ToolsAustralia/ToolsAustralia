/**
 * POST /api/stripe/pay-failed-invoice
 *
 * Pay Now Flow for Failed Subscription Renewals
 *
 * This endpoint allows users with failed subscription renewals to immediately pay
 * their existing Stripe invoice using the existing PaymentIntent.
 *
 * Key Principles:
 * - Reuses existing failed invoice (does NOT create new invoices)
 * - Reuses existing PaymentIntent from invoice
 * - Does NOT create new subscriptions or payment intents
 * - Trusts Stripe webhooks as source of truth for subscription state
 * - Allows Stripe's automatic retry system to remain enabled
 *
 * Flow:
 * 1. Retrieves user's subscription
 * 2. Gets failed invoice from Stripe (subscription's latest invoice with status "open")
 * 3. Extracts existing PaymentIntent from invoice
 * 4. If customer has default payment method: pays invoice immediately
 * 5. If no default payment method: returns PaymentIntent client_secret for Payment Element
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getFailedInvoicePaymentData,
  extractPaymentIntentFromInvoice,
} from "@/utils/payment/failed-invoice-handler";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import { analyzePaymentIntentForExcessiveRetry } from "@/utils/payment/stripe/stripe-excessive-retry";
import {
  dropNonConfirmableInvoicePaymentIntent,
  isPaymentIntentClientConfirmable,
} from "@/utils/payment/stripe/payment-intent-payable";
import { classifyStripeInvoicePayInitFailure } from "@/utils/payment/stripe/stripe-invoice-pay-errors";
import {
  isOriginalInvoiceEligibleForRecovery,
  deriveExpectedCycleAmountCents,
} from "@/utils/payment/recovery/stranded-invoice-policy";
import { prepareRecoveredCycleInvoice } from "@/services/subscription/prepareRecoveredCycleInvoice";
import { acquireRecoveryClaim, releaseRecoveryClaim } from "@/utils/payment/recovery/recovery-claim";
import { getPackageById } from "@/data/membershipPackages";

export async function POST(_request: NextRequest) {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Get the user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has a subscription
    if (!user.subscription) {
      return NextResponse.json({ error: "No subscription found" }, { status: 400 });
    }

    // Check if user has a Stripe subscription ID
    if (!user.stripeSubscriptionId) {
      return NextResponse.json({ error: "No Stripe subscription ID found" }, { status: 400 });
    }

    // Failed renewal: Stripe uses past_due (most common) or unpaid — Mongo isActive may still be true or false
    const renewalStatus = (user.subscription.status ?? "").toLowerCase();
    const isFailedRenewalState = renewalStatus === "past_due" || renewalStatus === "unpaid";
    if (!isFailedRenewalState) {
      return NextResponse.json(
        { error: "Subscription is not in a failed renewal state" },
        { status: 400 }
      );
    }

    // Retrieve failed invoice payment data using business logic utility
    const invoiceData = await getFailedInvoicePaymentData(user.stripeSubscriptionId);

    if (!invoiceData.success) {
      return NextResponse.json(
        { error: invoiceData.error || "Failed to retrieve invoice data" },
        { status: 500 }
      );
    }

    if (!invoiceData.invoice) {
      return NextResponse.json({ error: "No invoice found" }, { status: 404 });
    }

    // Check if invoice is already paid
    if (invoiceData.invoice.status === "paid") {
      return NextResponse.json({
        success: true,
        message: "Invoice has already been paid",
        data: {
          invoiceId: invoiceData.invoice.id,
          status: "paid",
        },
      });
    }

    // ── STRANDED RECOVERY (guarded EARLY RETURN — must NOT fall through to invoices.pay() below) ──
    // If the selected invoice is "stranded" (open-but-retry-exhausted / uncollectible / void),
    // Stripe rejects stripe.invoices.pay() on it ("This invoice can no longer be paid…"). Recover
    // instead: void it + finalize the held cycle draft, and return that finalized draft's
    // PaymentIntent client_secret via the SAME requiresPaymentConfirmation shape the client already
    // confirms. See prepareRecoveredCycleInvoice + docs/FAILED_RENEWAL_PAY_NOW.md.
    if (isOriginalInvoiceEligibleForRecovery(invoiceData.invoice).eligible) {
      const subscriptionId = user.stripeSubscriptionId;
      const STRANDED_SUPPORT_DETAILS =
        "This renewal needs to be reopened in billing before you can pay. Please contact support and we'll fix it for you.";

      const claimed = await acquireRecoveryClaim(subscriptionId, "pay-failed-invoice");
      if (!claimed) {
        return NextResponse.json(
          {
            success: false,
            error: "Recovery in progress",
            details: "We're already reopening this renewal. Please wait a moment and try again.",
          },
          { status: 409 }
        );
      }

      try {
        // Expected cycle amount from the LIVE subscription price (survives a past-due tier switch).
        let subscription: Stripe.Subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);
        } catch {
          return NextResponse.json(
            {
              success: false,
              error: "Invoice cannot be paid",
              details: STRANDED_SUPPORT_DETAILS,
              failureCode: "invoice_not_payable",
            },
            { status: 400 }
          );
        }
        const pid = user.subscription?.packageId;
        const pkgId =
          typeof pid === "string"
            ? pid
            : pid && typeof pid === "object" && "_id" in pid
              ? String((pid as { _id: unknown })._id)
              : undefined;
        const pkg = pkgId ? getPackageById(pkgId) : undefined;
        const packageFallbackCents =
          pkg && pkg.isActive && typeof pkg.price === "number" ? Math.round(pkg.price * 100) : null;
        const expectedAmountCents = deriveExpectedCycleAmountCents(subscription, packageFallbackCents);

        const customerId =
          user.stripeCustomerId ||
          (typeof invoiceData.invoice.customer === "string"
            ? invoiceData.invoice.customer
            : invoiceData.invoice.customer?.id) ||
          "";

        if (!expectedAmountCents || expectedAmountCents <= 0) {
          return NextResponse.json(
            {
              success: false,
              error: "Invoice cannot be paid",
              details: STRANDED_SUPPORT_DETAILS,
              failureCode: "invoice_not_payable",
            },
            { status: 400 }
          );
        }

        const prepared = await prepareRecoveredCycleInvoice({
          subscriptionId,
          strandedInvoice: invoiceData.invoice,
          expectedAmountCents,
          audit: {
            actor: "member",
            userId: String(user._id),
            customerId,
            amount: expectedAmountCents,
          },
        });

        if (!prepared.ok) {
          // no_held_draft / finalize_failed — surface the terminal, member-safe error the modal
          // already handles (terminalCollectionFailure). Never fall through to invoices.pay().
          return NextResponse.json(
            {
              success: false,
              error: "Invoice cannot be paid",
              details: STRANDED_SUPPORT_DETAILS,
              failureCode: "invoice_not_payable",
            },
            { status: 400 }
          );
        }

        // Finalize may have auto-collected if a default PM was attached — treat a paid invoice as success.
        if (prepared.finalizedInvoice.status === "paid") {
          return NextResponse.json({
            success: true,
            message: "Invoice has been paid successfully",
            data: { invoiceId: prepared.finalizedInvoice.id, status: "paid" },
          });
        }

        const pi = prepared.paymentIntent;
        if (!pi?.client_secret || !isPaymentIntentClientConfirmable(pi)) {
          return NextResponse.json(
            {
              success: false,
              error: "Payment setup error",
              details: "Unable to start payment for this invoice. Please contact support.",
              failureCode: "payment_intent_not_payable",
            },
            { status: 400 }
          );
        }

        // Return the finalized draft's PI via the existing interactive shape (client confirms it).
        return NextResponse.json({
          success: false,
          requiresPaymentConfirmation: true,
          message: "Payment confirmation required",
          data: {
            paymentIntent: {
              id: pi.id,
              clientSecret: pi.client_secret,
              amount: pi.amount,
              currency: pi.currency,
              status: pi.status,
            },
            invoiceId: prepared.finalizedInvoice.id,
          },
        });
      } finally {
        await releaseRecoveryClaim(subscriptionId).catch(() => {});
      }
    }

    // Get PaymentIntent - use the one from invoiceData, or extract/retrieve if needed
    let paymentIntent: Stripe.PaymentIntent | null = invoiceData.paymentIntent || null;

    if (!paymentIntent) {
      // Try to extract PaymentIntent from invoice
      paymentIntent = extractPaymentIntentFromInvoice(invoiceData.invoice);

      // If still not found, try to extract ID string and retrieve
      if (!paymentIntent) {
        const invoiceWithPaymentIntent = invoiceData.invoice as Stripe.Invoice & {
          payment_intent?: string | Stripe.PaymentIntent;
          latest_payment_intent?: string | Stripe.PaymentIntent;
        };

        const paymentIntentIdString =
          typeof invoiceWithPaymentIntent.payment_intent === "string"
            ? invoiceWithPaymentIntent.payment_intent
            : typeof invoiceWithPaymentIntent.latest_payment_intent === "string"
            ? invoiceWithPaymentIntent.latest_payment_intent
            : null;

        if (paymentIntentIdString) {
          try {
            paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentIdString, {
              expand: ["payment_method"],
            });
          } catch (retrieveError) {
            console.error("Failed to retrieve PaymentIntent:", retrieveError);
            return NextResponse.json(
              { error: "Failed to retrieve payment intent" },
              { status: 500 }
            );
          }
        }
      }
    }

    paymentIntent = dropNonConfirmableInvoicePaymentIntent(invoiceData.invoice, paymentIntent);

    // ✅ STRIPE BEST PRACTICE: Reuse existing PaymentIntent from invoice
    // If no PaymentIntent found, we need to get Stripe to create/reuse one via invoice operations
    // We should NEVER manually create a PaymentIntent - let Stripe handle it
    if (!paymentIntent) {
      try {
        // If invoice is draft, finalize it first (this will create a PaymentIntent if needed)
        if (invoiceData.invoice.status === "draft" && invoiceData.invoice.id) {
          const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoiceData.invoice.id, {
            expand: ["payment_intent"],
          });
          paymentIntent = extractPaymentIntentFromInvoice(finalizedInvoice);
          
          // If still not expanded, retrieve by ID
          if (!paymentIntent) {
            const finalizedWithPI = finalizedInvoice as Stripe.Invoice & {
              payment_intent?: string | Stripe.PaymentIntent;
              latest_payment_intent?: string | Stripe.PaymentIntent;
            };
            
            const paymentIntentIdString =
              typeof finalizedWithPI.payment_intent === "string"
                ? finalizedWithPI.payment_intent
                : typeof finalizedWithPI.latest_payment_intent === "string"
                ? finalizedWithPI.latest_payment_intent
                : null;

            if (paymentIntentIdString) {
              paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentIdString, {
                expand: ["payment_method"],
              });
            }
          }
        }
        
        // If still no PaymentIntent and invoice is open, retrieve the invoice again with proper expansion
        // Sometimes the PaymentIntent exists but wasn't expanded in the initial retrieval
        if (!paymentIntent && invoiceData.invoice.status === "open" && invoiceData.invoice.id) {
          try {
            // ✅ STRIPE BEST PRACTICE: Retrieve invoice again with full expansion to get PaymentIntent
            // Stripe should have created a PaymentIntent for the failed subscription invoice
            const refreshedInvoice = await stripe.invoices.retrieve(invoiceData.invoice.id, {
              expand: ["payment_intent"],
            });
            
            paymentIntent = extractPaymentIntentFromInvoice(refreshedInvoice);
            
            // If still not expanded, retrieve by ID
            if (!paymentIntent) {
              const refreshedWithPI = refreshedInvoice as Stripe.Invoice & {
                payment_intent?: string | Stripe.PaymentIntent;
                latest_payment_intent?: string | Stripe.PaymentIntent;
              };
              
              const paymentIntentIdString =
                typeof refreshedWithPI.payment_intent === "string"
                  ? refreshedWithPI.payment_intent
                  : typeof refreshedWithPI.latest_payment_intent === "string"
                  ? refreshedWithPI.latest_payment_intent
                  : null;

              if (paymentIntentIdString) {
                paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentIdString, {
                  expand: ["payment_method"],
                });
              }
            }
          } catch (retrieveError) {
            console.error("Error retrieving invoice with PaymentIntent expansion:", retrieveError);
            // Continue - we'll return an error below if still no PaymentIntent
          }
        }
      } catch (error) {
        console.error("Error retrieving PaymentIntent from invoice:", error);
        return NextResponse.json(
          {
            error: "Failed to retrieve payment information from invoice",
            details: error instanceof Error ? error.message : "Unable to process payment. Please contact support.",
          },
          { status: 500 }
        );
      }
    }

    paymentIntent = dropNonConfirmableInvoicePaymentIntent(invoiceData.invoice, paymentIntent);

    // ✅ STRIPE BEST PRACTICE: If invoice is open but has no PaymentIntent,
    // use stripe.invoices.pay() to create/attach the correct PaymentIntent
    // This is the ONLY correct way to handle invoices without PaymentIntents
    // DO NOT create standalone PaymentIntents - they won't be attached to the invoice
    if (!paymentIntent && invoiceData.invoice.status === "open" && invoiceData.invoice.id) {
      try {
        console.log(
          `⚠️ No PaymentIntent found for open invoice ${invoiceData.invoice.id} - using stripe.invoices.pay() to create correct PaymentIntent`
        );

        // ✅ CORRECT: Use stripe.invoices.pay() with off_session: false
        // This will create (or reuse) the correct PaymentIntent and attach it to the invoice
        // off_session: false means user is present and can provide payment method via Payment Element
        // We don't pass payment_method here - user will provide it via Payment Element
        // This prevents auto-payment and allows user to choose payment method
        const paidInvoiceAttempt = await stripe.invoices.pay(invoiceData.invoice.id, {
          off_session: false, // User is present, will provide payment method via Payment Element
          expand: ["payment_intent"], // Expand to get PaymentIntent
        });

        // Check if invoice was paid (might happen if default payment method exists and succeeds)
        if (paidInvoiceAttempt.status === "paid") {
          return NextResponse.json({
            success: true,
            message: "Invoice has been paid successfully",
            data: {
              invoiceId: paidInvoiceAttempt.id,
              status: "paid",
            },
          });
        }

        // Extract PaymentIntent from the paid invoice attempt
        paymentIntent = extractPaymentIntentFromInvoice(paidInvoiceAttempt);

        // If PaymentIntent is still not expanded, retrieve it by ID
        if (!paymentIntent) {
          const paidInvoiceWithPI = paidInvoiceAttempt as Stripe.Invoice & {
            payment_intent?: string | Stripe.PaymentIntent;
            latest_payment_intent?: string | Stripe.PaymentIntent;
          };

          const paymentIntentIdString =
            typeof paidInvoiceWithPI.payment_intent === "string"
              ? paidInvoiceWithPI.payment_intent
              : typeof paidInvoiceWithPI.latest_payment_intent === "string"
              ? paidInvoiceWithPI.latest_payment_intent
              : null;

          if (paymentIntentIdString) {
            paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentIdString, {
              expand: ["payment_method"],
            });
          }
        }

        if (paymentIntent) {
          // ✅ Payment methods are restricted at Payment Element level (frontend)
          // Do NOT modify invoice-linked PaymentIntents - they are owned by Stripe Billing
          // Modifying them can break future retries and conflict with dashboard settings
          console.log(
            `✅ Retrieved PaymentIntent ${paymentIntent.id} from invoice ${invoiceData.invoice.id} via stripe.invoices.pay()`
          );
        }
          } catch (payError: unknown) {
            // Type guard to check if error has Stripe error properties
            const isStripeError = (error: unknown): error is { code?: string; payment_intent?: string | { id: string }; message?: string } => {
              return typeof error === "object" && error !== null;
            };

            console.error("Error using stripe.invoices.pay() to get PaymentIntent:", payError);

            // If invoice was already paid, that's okay
            if (isStripeError(payError) && payError.code === "invoice_already_paid") {
              return NextResponse.json({
                success: true,
                message: "Invoice has already been paid",
                data: {
                  invoiceId: invoiceData.invoice.id,
                  status: "paid",
                },
              });
            }

            // If payment failed but we got a PaymentIntent, extract it
            if (isStripeError(payError) && payError.payment_intent) {
              const paymentIntentId =
                typeof payError.payment_intent === "string" ? payError.payment_intent : payError.payment_intent.id;
              try {
                paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
                  expand: ["payment_method"],
                });

                const excessiveRetry = await analyzePaymentIntentForExcessiveRetry(stripe, paymentIntent.id);
                if (excessiveRetry.requiresDifferentPaymentMethod) {
                  return NextResponse.json(
                    {
                      success: false,
                      error: "Payment blocked",
                      details:
                        "This card can't be charged right now because it was declined too many times. Add or use a different card, or try again later.",
                      requiresDifferentPaymentMethod: true,
                      ...(excessiveRetry.failureReason && { failureReason: excessiveRetry.failureReason }),
                    },
                    { status: 400 }
                  );
                }

                paymentIntent = dropNonConfirmableInvoicePaymentIntent(invoiceData.invoice, paymentIntent);
              } catch (retrieveError) {
                console.error("Error retrieving PaymentIntent from error:", retrieveError);
              }
            }

            // invoices.pay() can fail when the Customer has no default payment method — the open invoice may still reference a PaymentIntent
            if (!paymentIntent && invoiceData.invoice.id) {
              const msg = isStripeError(payError) ? String(payError.message || "") : "";
              const likelyMissingDefault =
                msg.includes("default_payment_method") ||
                msg.includes("Default payment method") ||
                msg.toLowerCase().includes("no default payment method");

              if (likelyMissingDefault) {
                try {
                  const refreshed = await stripe.invoices.retrieve(invoiceData.invoice.id, {
                    expand: ["payment_intent"],
                  });
                  let pi = extractPaymentIntentFromInvoice(refreshed);
                  if (!pi) {
                    const inv = refreshed as Stripe.Invoice & {
                      latest_payment_intent?: string | Stripe.PaymentIntent;
                      payment_intent?: string | Stripe.PaymentIntent;
                    };
                    const piIdStr =
                      typeof inv.latest_payment_intent === "string"
                        ? inv.latest_payment_intent
                        : typeof inv.payment_intent === "string"
                          ? inv.payment_intent
                          : null;
                    if (piIdStr) {
                      pi = await stripe.paymentIntents.retrieve(piIdStr, { expand: ["payment_method"] });
                    }
                  }
                  if (pi) {
                    paymentIntent = dropNonConfirmableInvoicePaymentIntent(invoiceData.invoice, pi);
                  }
                } catch (refreshErr) {
                  console.error("Invoice refresh after invoices.pay default PM error:", refreshErr);
                }
              }
            }

            // If we still don't have a PaymentIntent, return error
            if (!paymentIntent) {
              const classified = classifyStripeInvoicePayInitFailure(payError);
              if (classified) {
                return NextResponse.json(
                  {
                    success: false,
                    error: classified.error,
                    details: classified.details,
                    failureCode: classified.failureCode,
                  },
                  { status: classified.httpStatus }
                );
              }
              const errorMessage = isStripeError(payError)
                ? payError.message
                : "Unable to process payment. Please contact support.";
              const msgLower = String(errorMessage).toLowerCase();
              const noDefaultPm =
                msgLower.includes("default_payment_method") || msgLower.includes("default payment method");

              if (noDefaultPm) {
                return NextResponse.json(
                  {
                    success: false,
                    requiresNewCardPreflight: true,
                    error: "Payment method required",
                    details:
                      "No saved card is on file for this renewal. Add a new card in this window, then try again — or add a card below and we will retry automatically.",
                  },
                  { status: 400 }
                );
              }

              return NextResponse.json(
                {
                  success: false,
                  error: "Failed to initialize payment",
                  details: errorMessage || "Unable to process payment. Please contact support.",
                },
                { status: 500 }
              );
            }
          }
    }

    // If still no PaymentIntent after all attempts, we can't proceed
    if (!paymentIntent) {
      return NextResponse.json(
        {
          error: "No payment intent found for invoice",
          details: "The invoice does not have a payment intent available and we could not create one. Please contact support for assistance.",
        },
        { status: 400 }
      );
    }

    // Always return PaymentIntent client secret for Payment Element
    // Never auto-pay - let user choose payment method (saved or new) to handle expired/insufficient funds cases
    // This allows users to:
    // 1. Select a different saved payment method if default failed
    // 2. Enter a new payment method
    // 3. See clear error messages if payment fails
    if (!paymentIntent?.client_secret) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment setup error",
          details: "Unable to start payment for this invoice. Please contact support.",
          failureCode: "payment_intent_not_payable",
        },
        { status: 400 }
      );
    }

    if (!isPaymentIntentClientConfirmable(paymentIntent)) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment setup error",
          details:
            "This payment session is no longer valid. Please try again, or contact support if the problem continues.",
          failureCode: "payment_intent_not_payable",
        },
        { status: 400 }
      );
    }

    const excessiveRetryFinal = await analyzePaymentIntentForExcessiveRetry(stripe, paymentIntent.id);
    if (excessiveRetryFinal.requiresDifferentPaymentMethod) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment blocked",
          details:
            "This card can't be charged right now because it was declined too many times. Add or use a different card, or try again later.",
          requiresDifferentPaymentMethod: true,
          ...(excessiveRetryFinal.failureReason && { failureReason: excessiveRetryFinal.failureReason }),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: false,
      requiresPaymentConfirmation: true,
      message: "Payment confirmation required",
      data: {
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
        },
        invoiceId: invoiceData.invoice.id,
      },
    });
  } catch (error) {
    console.error("Error in pay-failed-invoice endpoint:", error);

    return NextResponse.json(
      {
        error: "Failed to process payment request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

