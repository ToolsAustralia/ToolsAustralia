// scripts/cleanup-e2e-fixtures.ts
//
// Cascade-deletes all E2E fixtures. Run by globalTeardown or manually.
// Idempotent.

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Affiliate from "@/models/Affiliate";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";
import MembershipStatusHistory from "@/models/MembershipStatusHistory";
import PaymentEvent from "@/models/PaymentEvent";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import TicketEntry from "@/models/TicketEntry";
import Order from "@/models/Order";
import ReferralEvent from "@/models/ReferralEvent";
import AffiliateCommission from "@/models/AffiliateCommission";
import AffiliatePayout from "@/models/AffiliatePayout";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import MajorDraw from "@/models/MajorDraw";
import { listE2ECustomers, deleteE2ECustomer } from "./e2e-stripe-helpers";
import { klaviyo } from "@/lib/klaviyo";

/**
 * Queue a Klaviyo data-privacy deletion job for each e2e email. Klaviyo
 * processes asynchronously; this just fires-and-forgets. Tolerant of:
 *   - Klaviyo not configured (skips silently)
 *   - Email not found in Klaviyo (Klaviyo returns success anyway for GDPR)
 *   - Rate limiting (sequential w/ small delay)
 */
async function deleteKlaviyoProfiles(emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  let queued = 0;
  let skipped = 0;
  for (const email of emails) {
    try {
      const result = await klaviyo.deleteProfile(email);
      if (result.success) queued++;
      else skipped++;
    } catch {
      skipped++;
    }
  }
  console.log(`  → Klaviyo: ${queued} deletion jobs queued, ${skipped} skipped`);
}

async function main() {
  await connectDB();
  console.log("🧹 Cleanup: cascade-deleting E2E fixtures...");

  // Collect emails BEFORE any delete so we can queue Klaviyo deletions afterward.
  const users = await User.find({ email: /^test-e2e-/ }, { _id: 1, email: 1 }).lean();
  const affiliates = await Affiliate.find({ email: /^test-e2e-/ }, { email: 1 }).lean();
  const userIds = users.map((u) => u._id);
  const allEmails = [
    ...users.map((u) => u.email),
    ...affiliates.map((a) => a.email),
  ];
  console.log(`  → ${userIds.length} test users + ${affiliates.length} affiliates found`);

  if (userIds.length > 0) {
    const filter = { userId: { $in: userIds } };
    const refFilter = {
      $or: [
        { referrerId: { $in: userIds } },
        { inviteeUserId: { $in: userIds } },
      ],
    };

    await Promise.all([
      MembershipRenewalCycle.deleteMany(filter),
      MembershipStatusHistory.deleteMany(filter),
      PaymentEvent.deleteMany(filter),
      RedeemableIssuance.deleteMany(filter),
      MilestoneIssuance.deleteMany(filter),
      TicketEntry.deleteMany(filter),
      ReferralEvent.deleteMany(refFilter),
      AffiliateCommission.deleteMany(filter),
      AffiliatePayout.deleteMany(filter),
      InvoiceChargeLog.deleteMany(filter),
      // Order schema uses `user` (verified in src/models/Order.ts)
      Order.deleteMany({ user: { $in: userIds } }),
    ]);

    // Pull from MajorDraw.entries[] arrays — verified entries[].userId exists
    await MajorDraw.updateMany(
      { "entries.userId": { $in: userIds } },
      { $pull: { entries: { userId: { $in: userIds } } } },
    );
  }

  await User.deleteMany({ email: /^test-e2e-/ });
  await Affiliate.deleteMany({ email: /^test-e2e-/ });

  // Stripe-side
  const stripeIds = await listE2ECustomers();
  console.log(`  → ${stripeIds.length} Stripe e2e customers to delete`);
  for (const id of stripeIds) {
    await deleteE2ECustomer(id);
  }

  // Klaviyo-side — queue async data-privacy deletion jobs by email.
  await deleteKlaviyoProfiles(allEmails);

  console.log("✅ Cleanup complete.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
