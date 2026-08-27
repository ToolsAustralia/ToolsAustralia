/**
 * Task 12 — the code-visibility rule, end to end through GET /api/redeemables/status.
 *
 * THE RULE: a campaign code is returned only to a customer who holds an
 * issuance for THAT campaign. Before it existed the route handed
 * `code: campaign.code` for every active campaign to any signed-in user, so
 * anyone with an account could read a trigger code (BACKIN200 / LOCKIN100 /
 * EXTRA100) they had never qualified for and redeem free entries.
 *
 * The rule was proven once by a throwaway script that has since been deleted.
 * This file makes it permanent and rerunnable. It exercises the real handler —
 * the same `getActiveCampaigns()` query, the same issuance load, the same
 * `heldCampaignIds` redaction, on real documents.
 *
 * WHY THE SESSION IS STUBBED. Identity reaches the handler only through a
 * NextAuth session cookie, which a test process has no way to mint. `next-auth`
 * is therefore replaced in `require.cache` before the handler is loaded, so
 * `getServerSession` returns whichever fixture user the test is currently
 * playing. Everything downstream of that — `requireAuthenticatedUser`, the
 * route body, Mongo — is the real thing, unmocked.
 *
 * FIXTURE SAFETY. Both users and both campaigns are created here and removed in
 * `finally`. Issuances are deleted by `userId` (both users are new this run).
 * Each fixture campaign is `manual-users` pinned to its own user, so no real
 * account can be enrolled into one while it briefly exists, and this route
 * performs no enrolment sweep of its own.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import { CampaignService } from "@/services/redeemables/CampaignService";

const RUN_ID = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

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

// --- the session stub -----------------------------------------------------
interface StubSession {
  user: { id: string; email: string };
}
let currentSession: StubSession | null = null;

const nextAuthModulePath = require.resolve("next-auth");
require.cache[nextAuthModulePath] = {
  id: nextAuthModulePath,
  filename: nextAuthModulePath,
  loaded: true,
  children: [],
  paths: [],
  parent: undefined,
  exports: {
    getServerSession: async (): Promise<StubSession | null> => currentSession,
    default: {},
  },
} as unknown as NodeModule;

// --- the shape the route returns -----------------------------------------
interface StatusCampaign {
  id: string;
  code?: string;
}
interface StatusBody {
  success: boolean;
  error?: string;
  data?: {
    activeCampaigns: StatusCampaign[];
    activeCampaign: StatusCampaign | null;
  };
}

const userIds: mongoose.Types.ObjectId[] = [];
const campaignIds: mongoose.Types.ObjectId[] = [];

async function makeUser(suffix: string) {
  const user = await User.create({
    firstName: "Task12",
    lastName: "Visibility",
    email: `task12-visibility-${RUN_ID}-${suffix}@example.test`,
    isActive: true,
    isEmailVerified: true,
  });
  const id = user._id as unknown as mongoose.Types.ObjectId;
  userIds.push(id);
  return id;
}

async function makeCampaign(suffix: string, pinnedUserId: mongoose.Types.ObjectId, startsAt: Date) {
  const campaign = await MonthlyEntryCampaign.create({
    monthKey: "2026-08",
    name: `Task12 visibility ${suffix}`,
    entriesAmount: 5,
    campaignMode: "global",
    targetingMode: "manual-users",
    segmentConfig: { includeUserIds: [String(pinnedUserId)] },
    startsAt,
    endsAt: new Date(Date.now() + 20 * DAY_MS),
    neverExpires: false,
    validForHours: 72,
    isActive: true,
    code: `T12VIS${RUN_ID}${suffix}`.slice(0, 32),
    requiresPurchase: false,
    purchaseRequirement: "none",
  });
  campaignIds.push(campaign._id as unknown as mongoose.Types.ObjectId);
  return campaign;
}

function entryFor(body: StatusBody, campaignId: string): StatusCampaign | undefined {
  return body.data?.activeCampaigns.find((c) => c.id === campaignId);
}

async function run() {
  await connectDB();

  /*
   * `require`, not `await import` — under tsx a dynamic import goes through the
   * ESM loader and bypasses `require.cache`, so the handler would resolve the
   * REAL next-auth and every request below would come back 401. A static import
   * would be hoisted above the seeding, with the same result. This load must
   * therefore happen here, after the seeding, through `require`.
   */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require("@/app/api/redeemables/status/route") as typeof import("../route");

  /** Call the real handler as whoever `currentSession` currently is. */
  async function callStatus(): Promise<{ status: number; body: StatusBody }> {
    const response = await GET();
    if (!response) throw new Error("GET /api/redeemables/status returned no response");
    return { status: response.status, body: (await response.json()) as StatusBody };
  }

  try {
    // Two customers, two live campaigns. HOLDER holds an issuance for CAMPAIGN A
    // only; OTHER holds one for CAMPAIGN B only. Neither may see the other's code.
    const holderId = await makeUser("holder");
    const otherId = await makeUser("other");

    // A is created with the later startsAt so it is deterministically
    // `campaigns[0]` — the row the singular `activeCampaign` field mirrors.
    const campaignB = await makeCampaign("B", otherId, new Date(Date.now() - 5 * 60_000));
    const campaignA = await makeCampaign("A", holderId, new Date(Date.now() - 60_000));
    const campaignAId = String(campaignA._id);
    const campaignBId = String(campaignB._id);

    const mintedA = await CampaignService.ensureCampaignIssuanceForUser({
      userId: String(holderId),
      campaignCode: campaignA.code,
      trigger: "cancel-click",
    });
    const mintedB = await CampaignService.ensureCampaignIssuanceForUser({
      userId: String(otherId),
      campaignCode: campaignB.code,
      trigger: "cancel-click",
    });
    check("fixture: the holder was issued campaign A", mintedA.outcome, "minted");
    check("fixture: the other customer was issued campaign B", mintedB.outcome, "minted");

    // ---------------------------------------------------------------------
    console.log("\n1. The customer who holds the issuance is given the code");
    {
      currentSession = { user: { id: String(holderId), email: `task12-visibility-${RUN_ID}-holder@example.test` } };
      const { body } = await callStatus();

      check("the request succeeds", body.success, true);
      check("campaign A is listed", Boolean(entryFor(body, campaignAId)), true);
      check("…and carries its code", entryFor(body, campaignAId)?.code, campaignA.code);
      check("the singular activeCampaign is campaign A", body.data?.activeCampaign?.id, campaignAId);
      check("…and it carries the code too", body.data?.activeCampaign?.code, campaignA.code);
    }

    // ---------------------------------------------------------------------
    console.log("\n2. A signed-in customer who holds NO issuance for it is not given the code");
    {
      currentSession = { user: { id: String(otherId), email: `task12-visibility-${RUN_ID}-other@example.test` } };
      const { body } = await callStatus();

      check("the request still succeeds", body.success, true);
      const entry = entryFor(body, campaignAId);
      // The campaign is still LISTED — the rule redacts the code, it does not
      // hide the campaign. Asserting only "code is absent" would also pass if
      // the campaign had silently vanished from the response.
      check("campaign A is still listed for them", Boolean(entry), true);
      check("…but the code field is not present at all", Object.prototype.hasOwnProperty.call(entry ?? {}, "code"), false);
      check("…so reading it yields nothing", entry?.code ?? null, null);
      check("the singular activeCampaign is still campaign A", body.data?.activeCampaign?.id, campaignAId);
      check("…with its code withheld", body.data?.activeCampaign?.code ?? null, null);
    }

    // ---------------------------------------------------------------------
    console.log("\n3. Holding SOME issuance is not enough — it must be an issuance for THAT campaign");
    // The naive version of this rule ("does this user hold any issuance?") would
    // pass every assertion above. This is the one that catches it: the same
    // caller, in the same response, sees exactly one of the two codes.
    {
      currentSession = { user: { id: String(otherId), email: `task12-visibility-${RUN_ID}-other@example.test` } };
      const { body } = await callStatus();

      check("they DO see the code for the campaign they hold", entryFor(body, campaignBId)?.code, campaignB.code);
      check("…and still not the one they do not", entryFor(body, campaignAId)?.code ?? null, null);
    }

    // ---------------------------------------------------------------------
    console.log("\n4. With no session there is no response to redact");
    {
      currentSession = null;
      const { status, body } = await callStatus();
      check("unauthenticated callers are refused", [status, body.success], [401, false]);
    }
  } finally {
    currentSession = null;
    // EACH STEP INDIVIDUALLY GUARDED. As unguarded sequential awaits, ONE
    // throwing deleteMany skipped every step below it — and the campaigns this
    // file creates are genuinely LIVE campaigns in a shared database. Leaking
    // one leaves a real `MonthlyEntryCampaign` row carrying a fixture code,
    // which then collides with the unique index on `code` on the next run.
    // Same pattern as campaign-window.test.ts / campaign-enrolment.test.ts.
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["issuances", () => RedeemableIssuance.deleteMany({ userId: { $in: userIds } })],
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
  console.error("code-visibility.test.ts crashed:", error);
  process.exit(1);
});
