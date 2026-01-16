/**
 * DELETE /api/admin/users/[id]/delete
 *
 * Permanently delete a user and all associated references.
 * This is a hard delete operation - the user and all related data will be permanently removed.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteUserWithCascade } from "@/utils/admin/delete-user-cascade";
import { getUserDeletionSummary } from "@/utils/admin/get-user-deletion-summary";
import { removeUserFromIntegrations } from "@/utils/integrations/remove-user-from-integrations";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import mongoose from "mongoose";

/**
 * DELETE a user with cascade cleanup
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { id } = await params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    // Get user to verify existence and check for active subscription
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Cancel active Stripe subscription if exists
    if (user.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        if (subscription.status === "active" || subscription.status === "trialing") {
          await stripe.subscriptions.cancel(user.stripeSubscriptionId);
          console.log(`✅ Canceled active subscription before deletion: ${user.stripeSubscriptionId}`);
        }
      } catch (stripeError) {
        console.error(`⚠️ Error canceling subscription:`, stripeError);
        // Continue with deletion even if subscription cancellation fails
        // The subscription will be canceled in Stripe anyway
      }
    }

    // Remove user from third-party integrations (non-blocking)
    let integrationCleanup = null;
    try {
      console.log(`🔄 Removing user ${user.email} from third-party integrations...`);
      integrationCleanup = await removeUserFromIntegrations(user);
      console.log(`✅ Integration cleanup completed for ${user.email}:`, {
        klaviyo: integrationCleanup.klaviyo.success,
        stripe: integrationCleanup.stripe.success,
      });
    } catch (integrationError) {
      console.error(`⚠️ Error removing user from integrations (non-blocking):`, integrationError);
      // Continue with deletion even if integration cleanup fails
      integrationCleanup = {
        klaviyo: { success: false, error: "Cleanup failed", operations: {} },
        stripe: { success: false, error: "Cleanup failed" },
      };
    }

    // Get deletion summary for audit trail
    const deletionSummary = await getUserDeletionSummary(id);

    // TODO: Create deletion record for audit trail
    // This should be stored in a separate collection or admin logs
    // For now, we'll log it
    console.log(`📝 Deletion record:`, {
      userId: id,
      deletedBy: session.user.id,
      deletedAt: new Date(),
      deletionSummary,
    });

    // Perform cascade deletion
    const result = await deleteUserWithCascade(id);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || "Failed to delete user",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "User deleted successfully",
      data: {
        deletionSummary: result.deletionSummary,
        cleanupReport: result.cleanupReport,
        integrationCleanup: integrationCleanup,
      },
    });
  } catch (error) {
    console.error(`❌ Error deleting user:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete user",
      },
      { status: 500 }
    );
  }
}
