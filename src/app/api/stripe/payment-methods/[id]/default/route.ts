import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

/**
 * PUT /api/stripe/payment-methods/[id]/default
 * Set a payment method as default
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id: paymentMethodId } = await params;
    console.log(`⭐ Setting payment method as default: ${paymentMethodId} for user: ${session.user.id}`);

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.stripeCustomerId) {
      return NextResponse.json({ error: "User does not have a Stripe customer ID" }, { status: 400 });
    }

    // Find the payment method in user's saved methods
    const paymentMethod = user.savedPaymentMethods.find(
      (pm: Record<string, unknown>) => pm.paymentMethodId === paymentMethodId
    );

    if (!paymentMethod) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }

    // Remove default from all other payment methods
    user.savedPaymentMethods.forEach((pm: Record<string, unknown>) => {
      pm.isDefault = false;
    });

    // Set the selected payment method as default
    paymentMethod.isDefault = true;
    paymentMethod.lastUsed = new Date();

    const paymentMethodRecord = paymentMethod as {
      paymentMethodId: string;
      isDefault: boolean;
      createdAt: Date;
      lastUsed?: Date;
      card?: {
        brand?: string;
        last4?: string;
        expMonth?: number;
        expYear?: number;
      };
    };

    // Verify payment method exists and is attached to customer
    try {
      const stripePaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      
      // If payment method is not attached to customer, attach it first
      if (!stripePaymentMethod.customer || stripePaymentMethod.customer !== user.stripeCustomerId) {
        try {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: user.stripeCustomerId,
          });
          console.log(`✅ Attached payment method ${paymentMethodId} to customer ${user.stripeCustomerId}`);
        } catch (attachError: unknown) {
          // If attach fails because payment method was detached, we need to handle it differently
          // Check if the error is about the payment method being previously used
          const error = attachError as { code?: string; message?: string };
          if (error?.code === "resource_already_exists" || error?.message?.includes("previously used")) {
            // Payment method might be attached to another customer or detached
            // Try to detach it first, then reattach
            try {
              if (stripePaymentMethod.customer) {
                await stripe.paymentMethods.detach(paymentMethodId);
                console.log(`⚠️ Detached payment method ${paymentMethodId} from previous customer`);
              }
              await stripe.paymentMethods.attach(paymentMethodId, {
                customer: user.stripeCustomerId,
              });
              console.log(`✅ Re-attached payment method ${paymentMethodId} to customer ${user.stripeCustomerId}`);
            } catch (reattachError) {
              console.error("Error re-attaching payment method:", reattachError);
              return NextResponse.json(
                { 
                  success: false, 
                  error: `Payment method cannot be reused. Please add a new payment method.` 
                },
                { status: 400 }
              );
            }
          } else {
            throw attachError;
          }
        }
      }
    } catch (error) {
      console.error("Error retrieving/attaching payment method:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      // Provide a more user-friendly error message
      if (errorMessage.includes("previously used") || errorMessage.includes("detached")) {
        return NextResponse.json(
          { 
            success: false, 
            error: `This payment method cannot be used. Please add a new payment method.` 
          },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to verify payment method: ${errorMessage}` 
        },
        { status: 400 }
      );
    }

    // Sync with Stripe so invoicing/subscriptions use the same default
    try {
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      console.log(`✅ Updated Stripe customer default payment method: ${paymentMethodId}`);
    } catch (error) {
      console.error("Stripe customer update failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to update Stripe default payment method: ${errorMessage}` 
        },
        { status: 502 }
      );
    }

    await user.save();

    console.log(`✅ Payment method set as default successfully: ${paymentMethodId}`);

    return NextResponse.json({
      success: true,
      data: {
        paymentMethodId,
        isDefault: true,
        createdAt: paymentMethodRecord.createdAt,
        lastUsed: paymentMethodRecord.lastUsed,
        card: paymentMethodRecord.card,
      },
    });
  } catch (error) {
    console.error("Error setting default payment method:", error);
    return NextResponse.json({ success: false, error: "Failed to set default payment method" }, { status: 500 });
  }
}
