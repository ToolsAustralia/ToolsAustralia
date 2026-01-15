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
  payInvoiceWithDefaultMethod,
  extractPaymentIntentFromInvoice,
} from "@/utils/payment/failed-invoice-handler";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
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

    // Check if subscription status is past_due (failed renewal)
    if (user.subscription.status !== "past_due" || user.subscription.isActive) {
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

    if (!paymentIntent) {
      return NextResponse.json({ error: "No PaymentIntent found for invoice" }, { status: 404 });
    }

    // If customer has default payment method, pay invoice immediately
    if (invoiceData.hasDefaultPaymentMethod && invoiceData.invoice.customer) {
      try {
        // Extract customer ID with proper type handling
        const customer = invoiceData.invoice.customer;
        
        // Extract customer ID safely - explicit type narrowing
        let customerId: string | undefined;

        if (typeof customer === "string") {
          customerId = customer;
        } else if (customer && typeof customer === "object") {
          // Check if customer.id exists and is a string
          const customerIdFromObj = customer.id;
          if (customerIdFromObj && typeof customerIdFromObj === "string") {
            customerId = customerIdFromObj;
          }
        }

        // Early return if no customerId - this ensures TypeScript knows customerId is string below
        if (!customerId) {
          console.error("❌ No customer ID found on invoice");
          return NextResponse.json({ error: "Failed to retrieve customer information" }, { status: 500 });
        }

        // Assign to const after validation - use type assertion since we've already validated above
        // TypeScript's control flow analysis doesn't always narrow let variables properly,
        // but we know customerId is a string at this point due to the early return above
        const validatedCustomerId = customerId as string;

        // Ensure invoice ID exists (Stripe invoices always have an id, but TypeScript needs help)
        if (!invoiceData.invoice?.id) {
          return NextResponse.json({ error: "Invoice ID not found" }, { status: 500 });
        }

        const paidInvoice = await payInvoiceWithDefaultMethod(
          invoiceData.invoice.id,
          validatedCustomerId
        );

        return NextResponse.json({
          success: true,
          message: "Invoice paid successfully. Subscription will be reactivated shortly.",
          data: {
            invoiceId: paidInvoice.id,
            status: paidInvoice.status,
            paymentIntentId: paymentIntent.id,
          },
        });
      } catch (paymentError) {
        console.error("Error paying invoice with default payment method:", paymentError);

        // If payment failed, return PaymentIntent client secret for user to try different payment method
        if (paymentIntent.client_secret) {
          return NextResponse.json({
            success: false,
            requiresPaymentConfirmation: true,
            message: "Default payment method failed. Please use a different payment method.",
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
        }

        return NextResponse.json(
          {
            error: "Failed to pay invoice",
            details: paymentError instanceof Error ? paymentError.message : "Payment failed",
          },
          { status: 500 }
        );
      }
    }

    // No default payment method - return PaymentIntent client secret for Payment Element
    if (!paymentIntent.client_secret) {
      return NextResponse.json(
        { error: "PaymentIntent does not have a client secret" },
        { status: 500 }
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

