// e2e/fixtures/seed-helpers.ts
//
// Per-test helpers used in beforeEach to reset a mutated fixture user
// to its baseline state. Cheap (single Mongo update). Imports the
// shared models — must run in the Node side of Playwright fixtures
// (use via `test.beforeEach(async () => { await resetUser('tradie') })`).

import User from "@/models/User";
import Order from "@/models/Order";
import MiniDraw from "@/models/MiniDraw";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import PartnerApplication from "@/models/PartnerApplication";
import ContactSubmission from "@/models/ContactSubmission";
import {
  emailFor,
  type Role,
  PACKAGE_ID_BY_ROLE,
} from "./test-users";
import connectDB from "@/lib/mongodb";

let connected = false;

async function ensureConnection() {
  if (connected) return;
  await connectDB();
  connected = true;
}

/**
 * Reset a member fixture's subscription fields to baseline (active, autoRenew=true,
 * 30-day endDate). Use in beforeEach for specs that mutate state (cancel, upgrade,
 * downgrade, resume). Cancelling and pastdue baselines re-apply their variant patches.
 *
 * IMPORTANT: pass `test.info().parallelIndex` as the second arg so this resets
 * the SAME user the spec is authenticated as. Without it, falls back to
 * TEST_WORKER_INDEX which can differ from parallelIndex after worker respawns.
 */
export async function resetUser(
  role: Exclude<Role, "guest" | "fresh" | "affiliate">,
  workerIndex?: number,
): Promise<void> {
  await ensureConnection();
  const email = emailFor(role, workerIndex);
  const packageId = PACKAGE_ID_BY_ROLE[role];
  const startDate = new Date();
  const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const baseline: Record<string, unknown> = {
    "subscription.packageId": packageId,
    "subscription.isActive": true,
    "subscription.status": "active",
    "subscription.autoRenew": true,
    "subscription.startDate": startDate,
    "subscription.endDate": endDate,
  };
  const unsetFields: Record<string, ""> = {
    "subscription.cancelledAt": "",
    "subscription.pastDueAt": "",
    "subscription.pendingChange": "",
    // Top-level retention flag set by /api/cancellation-upsell/redeem.
    // Unsetting it here means every member spec starts with a clean slate
    // and the cancel-upsell modal will fire when triggered.
    cancellationUpsellRedeemed: "",
    cancellationUpsellRedeemedAt: "",
  };

  if (role === "cancelling") {
    baseline["subscription.autoRenew"] = false;
    baseline["subscription.cancelledAt"] = new Date();
    delete unsetFields["subscription.cancelledAt"];
  } else if (role === "pastdue") {
    baseline["subscription.isActive"] = false;
    baseline["subscription.status"] = "past_due";
    baseline["subscription.pastDueAt"] = new Date();
    delete unsetFields["subscription.pastDueAt"];
  }

  await User.updateOne({ email }, { $set: baseline, $unset: unsetFields });
}

/**
 * For specs that need an ephemeral, never-shared user (e.g., the
 * "first-time membership purchase" walk test). Returns an email and a
 * cleanup callback. The spec is responsible for actually creating the
 * Mongo document (so it can choose the baseline state it needs).
 */
export async function withFreshMember(): Promise<{
  email: string;
  cleanup: () => Promise<void>;
}> {
  await ensureConnection();
  const email = `test-e2e-fresh-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
  return {
    email,
    cleanup: async () => {
      await User.deleteOne({ email });
    },
  };
}

/**
 * Connect to Mongo and return a model module via top-level imports here, so
 * specs don't have to fight tsx's CJS/ESM dynamic-import double-default
 * wrapping. Re-exported model accessors below; add more on demand.
 *
 * Use these instead of `(await import("@/models/X")).default` from a spec.
 */
export async function getDb() {
  await ensureConnection();
  return { User, Order, MiniDraw, RedeemableIssuance, MonthlyEntryCampaign, PartnerApplication, ContactSubmission };
}
