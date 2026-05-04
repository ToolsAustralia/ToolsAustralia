import { Types } from "mongoose";
import AllowlistAction, { IAllowlistAction } from "@/models/AllowlistAction";
import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";
import type { AllowlistRepository } from "./types";

/**
 * PaymentEvent eventTypes we treat as "user has successfully paid at least once."
 * Mirrors the success markers used elsewhere in billing-stripe.
 */
const SUCCEEDED_EVENT_TYPES = [
  "PaymentProcessed",
  "BenefitsGranted",
  "SubscriptionActivated",
];

export class MongoAllowlistRepository implements AllowlistRepository {
  async findUserId(args: {
    stripeCustomerId: string | null;
    customerEmail: string | null;
  }): Promise<Types.ObjectId | null> {
    if (args.stripeCustomerId) {
      const byCustomer = await User.findOne({ stripeCustomerId: args.stripeCustomerId })
        .select("_id")
        .lean();
      if (byCustomer?._id) return new Types.ObjectId(String(byCustomer._id));
    }
    if (args.customerEmail) {
      const byEmail = await User.findOne({ email: args.customerEmail }).select("_id").lean();
      if (byEmail?._id) return new Types.ObjectId(String(byEmail._id));
    }
    return null;
  }

  async userHasSucceededPayment(userId: Types.ObjectId): Promise<boolean> {
    const exists = await PaymentEvent.exists({
      userId,
      eventType: { $in: SUCCEEDED_EVENT_TYPES },
    });
    return Boolean(exists);
  }

  async findActiveAddedActionByFingerprint(cardFingerprint: string): Promise<IAllowlistAction | null> {
    return AllowlistAction.findOne({ cardFingerprint, action: "added" })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findActionById(actionId: Types.ObjectId): Promise<IAllowlistAction | null> {
    return AllowlistAction.findById(actionId).exec();
  }

  async insertAction(
    doc: Omit<IAllowlistAction, "_id" | "createdAt"> & { createdAt?: Date }
  ): Promise<IAllowlistAction> {
    return AllowlistAction.create({ ...doc, createdAt: doc.createdAt ?? new Date() });
  }

  async listRecentActions(args: {
    limit: number;
    action: "added" | "skipped" | "removed" | "all";
  }): Promise<IAllowlistAction[]> {
    const filter = args.action === "all" ? {} : { action: args.action };
    return AllowlistAction.find(filter).sort({ createdAt: -1 }).limit(args.limit).exec();
  }
}
