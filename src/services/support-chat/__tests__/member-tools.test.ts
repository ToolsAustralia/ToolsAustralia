/**
 * member-tools.test.ts
 *
 * Tests for the 5 read-only member tools:
 *   getMyMembership, getMyEntries, getMyBillingStatus, getDrawStatus, getPartnerVisibility
 *
 * Runs via tsx — NO jest/vitest. Same pattern as chat-service.test.ts:
 *   node:assert/strict + a simple homegrown runner.
 *
 * Zero Mongo, zero Anthropic — all services injected via MemberToolDeps stubs.
 *
 * Per tool, we test:
 *   (a) Anonymous actor → ToolDenied thrown AND stub service NOT called (piiScoped tools)
 *       getDrawStatus (piiScoped: false) → anonymous actor does NOT throw
 *   (b) Member actor → returns the expected projected shape
 *   (c) responseSchema is .strict() — PII field fails parse
 *   (d) Handler uses ctx.actor.userId — stub receives that exact id
 *
 * Run: npm run test:chat-member-tools
 */

import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

// Force registration of all tools before importing buildMemberToolSet
import "../tools/getMyMembership";
import "../tools/getMyEntries";
import "../tools/getMyBillingStatus";
import "../tools/getDrawStatus";
import "../tools/getPartnerVisibility";

import { buildMemberToolSet, ToolDenied, MEMBER_TOOLS } from "../tools/registry";
import type { MemberToolDeps } from "../tools/registry";
import type { ChatActor } from "@/lib/support-chat/types";
import type { IUser } from "@/models/User";
import type { ToolCallOptions } from "ai";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let failures = 0;

function fail(label: string, msg: string): void {
  failures++;
  console.error(`  FAIL  ${label}: ${msg}`);
}

function pass(label: string): void {
  console.log(`  PASS  ${label}`);
}

/** A minimal fake ToolCallOptions — execute() ignores it. */
const fakeToolCtx = {
  toolCallId: "tc_test",
  messages: [],
} as unknown as ToolCallOptions;

const memberActor: ChatActor = {
  kind: "member",
  userId: "test-user-id-123",
  firstName: "Test",
};

const anonymousActor: ChatActor = {
  kind: "anonymous",
  ipKey: "127.0.0.1",
};

/** Build a minimal fake IUser with subscription data. */
function makeFakeUser(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: "test-user-id-123",
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    role: "user",
    savedPaymentMethods: [],
    oneTimePackages: [],
    subscription: {
      packageId: "tradie-subscription",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-01-01"),
      isActive: true,
      autoRenew: true,
      status: "active",
    },
    ...overrides,
  } as unknown as IUser;
}

// ─── Test: MEMBER_TOOLS has all 5 tools ───────────────────────────────────────

async function testAllToolsRegistered() {
  console.log("\nMEMBER_TOOLS — all 5 tools registered");

  const names = MEMBER_TOOLS.map((t) => t.name);
  const expected = [
    "getMyMembership",
    "getMyEntries",
    "getMyBillingStatus",
    "getDrawStatus",
    "getPartnerVisibility",
  ];

  for (const name of expected) {
    if (!names.includes(name)) {
      fail(`${name} registered`, `not in MEMBER_TOOLS: [${names.join(", ")}]`);
      return;
    }
  }

  pass("all 5 tools registered in MEMBER_TOOLS");
}

// ─── getMyMembership ─────────────────────────────────────────────────────────

async function testGetMyMembership() {
  console.log("\ngetMyMembership");

  // (a) Anonymous actor → ToolDenied, stub NOT called
  {
    const stubCalled = { called: false };
    const deps: MemberToolDeps = {
      findUserById: async () => {
        stubCalled.called = true;
        return null;
      },
    };
    const tools = buildMemberToolSet(anonymousActor, deps);
    const tool = tools["getMyMembership"];

    let threw: unknown = null;
    try {
      await tool.execute!({}, fakeToolCtx);
    } catch (e) {
      threw = e;
    }

    if (!(threw instanceof ToolDenied)) {
      fail("anonymous → ToolDenied", `got ${threw}`);
    } else if ((threw as ToolDenied).reason !== "login_required") {
      fail("ToolDenied reason=login_required", `got ${(threw as ToolDenied).reason}`);
    } else if (stubCalled.called) {
      fail("stub NOT called before auth check", "findUserById was called");
    } else {
      pass("anonymous actor → ToolDenied(login_required), stub not called");
    }
  }

  // (b) Member actor → returns projected shape
  {
    const fakeUser = makeFakeUser();
    const capturedId: string[] = [];

    const deps: MemberToolDeps = {
      findUserById: async (id) => {
        capturedId.push(id);
        return fakeUser;
      },
      getCurrentUserBenefits: (user) => {
        void user;
        return {
          entriesPerMonth: 2,
          shopDiscountPercent: 5,
          partnerDiscountDays: 7,
          packageName: "Tradie",
          packageId: "tradie-subscription",
          isPendingChange: false,
        };
      },
      getActivePackage: (user) => {
        void user;
        return {
          source: "subscription",
          isActive: true,
          packageData: null,
          entriesPerMonth: 2,
          pointsPerMonth: 0,
          expiresAt: new Date("2027-01-01"),
        };
      },
    };

    const tools = buildMemberToolSet(memberActor, deps);
    let result: unknown;
    try {
      result = await tools["getMyMembership"].execute!({}, fakeToolCtx);
    } catch (e) {
      fail("member actor → no throw", `threw: ${e}`);
      return;
    }

    const r = result as Record<string, unknown>;
    if (r["tier"] !== "Tradie") {
      fail("tier === Tradie", `got ${r["tier"]}`);
    } else if (r["isActive"] !== true) {
      fail("isActive === true", `got ${r["isActive"]}`);
    } else if (r["source"] !== "subscription") {
      fail("source === subscription", `got ${r["source"]}`);
    } else if (typeof r["expiresAt"] !== "string") {
      fail("expiresAt is ISO string", `got ${typeof r["expiresAt"]}`);
    } else if (r["isPendingChange"] !== false) {
      fail("isPendingChange === false", `got ${r["isPendingChange"]}`);
    } else if (r["pendingChange"] !== null) {
      fail("pendingChange === null", `got ${JSON.stringify(r["pendingChange"])}`);
    } else {
      pass("member actor → valid projection shape");
    }

    // (d) handler uses ctx.actor.userId
    if (capturedId[0] !== "test-user-id-123") {
      fail("findUserById called with ctx.actor.userId", `got ${capturedId[0]}`);
    } else {
      pass("findUserById called with ctx.actor.userId");
    }
  }

  // (c) responseSchema is strict — PII field fails parse
  {
    const def = MEMBER_TOOLS.find((t) => t.name === "getMyMembership");
    if (!def) {
      fail("responseSchema strict test", "tool not found");
      return;
    }
    const validShape = {
      tier: "Tradie",
      packageId: "tradie-subscription",
      entriesPerMonth: 2,
      isActive: true,
      source: "subscription",
      expiresAt: null,
      isPendingChange: false,
      pendingChange: null,
    };
    let threw = false;
    try {
      def.responseSchema.parse({ ...validShape, email: "attacker@evil.com" });
    } catch {
      threw = true;
    }
    if (!threw) {
      fail("responseSchema.parse with email → ZodError", "did not throw");
    } else {
      pass("responseSchema.strict() rejects extra PII field (email)");
    }
  }
}

// ─── getMyEntries ─────────────────────────────────────────────────────────────

async function testGetMyEntries() {
  console.log("\ngetMyEntries");

  // (a) Anonymous → ToolDenied, stub NOT called
  {
    const stubCalled = { called: false };
    const deps: MemberToolDeps = {
      getCurrentMajorDrawForDisplay: async () => {
        stubCalled.called = true;
        return null;
      },
    };
    const tools = buildMemberToolSet(anonymousActor, deps);
    let threw: unknown = null;
    try {
      await tools["getMyEntries"].execute!({}, fakeToolCtx);
    } catch (e) {
      threw = e;
    }
    if (!(threw instanceof ToolDenied)) {
      fail("anonymous → ToolDenied", `got ${threw}`);
    } else if (stubCalled.called) {
      fail("stub NOT called before auth check", "getCurrentMajorDrawForDisplay was called");
    } else {
      pass("anonymous actor → ToolDenied(login_required), stub not called");
    }
  }

  // (b) Member actor → returns projected shape
  {
    const capturedUserId: string[] = [];

    const fakeDraw = {
      _id: { toString: () => "draw-id-001" },
      name: "July 2026 Power Tool Bundle",
      status: "active",
      drawDate: new Date("2026-07-27"),
      freezeEntriesAt: new Date("2026-07-27"),
      activationDate: new Date("2026-07-01"),
      totalEntries: 500,
    };

    const deps: MemberToolDeps = {
      getCurrentMajorDrawForDisplay: async () => fakeDraw as never,
      getUserMajorDrawStats: async (userId, drawId) => {
        capturedUserId.push(userId);
        void drawId;
        return {
          totalEntries: 4,
          membershipEntries: 2,
          oneTimeEntries: 2,
          currentDrawEntries: 4,
          totalDrawsEntered: 1,
          entriesByPackage: [
            {
              packageName: "Membership Entries",
              packageId: "tradie-subscription",
              entryCount: 2,
              source: "membership" as const,
            },
          ],
        };
      },
    };

    const tools = buildMemberToolSet(memberActor, deps);
    let result: unknown;
    try {
      result = await tools["getMyEntries"].execute!({}, fakeToolCtx);
    } catch (e) {
      fail("member actor → no throw", `threw: ${e}`);
      return;
    }

    const r = result as Record<string, unknown>;
    if (r["drawName"] !== "July 2026 Power Tool Bundle") {
      fail("drawName set", `got ${r["drawName"]}`);
    } else if (r["totalEntries"] !== 4) {
      fail("totalEntries === 4", `got ${r["totalEntries"]}`);
    } else if (r["membershipEntries"] !== 2) {
      fail("membershipEntries === 2", `got ${r["membershipEntries"]}`);
    } else if (!Array.isArray(r["entriesByPackage"])) {
      fail("entriesByPackage is array", `got ${typeof r["entriesByPackage"]}`);
    } else {
      // Verify packageId is NOT in the projection
      const ep = (r["entriesByPackage"] as Array<Record<string, unknown>>)[0];
      if (ep && "packageId" in ep) {
        fail("packageId NOT in entriesByPackage projection", "packageId leaked");
      } else {
        pass("member actor → valid projection (packageId omitted)");
      }
    }

    // (d) getUserMajorDrawStats called with ctx.actor.userId
    if (capturedUserId[0] !== "test-user-id-123") {
      fail("getUserMajorDrawStats called with ctx.actor.userId", `got ${capturedUserId[0]}`);
    } else {
      pass("getUserMajorDrawStats called with ctx.actor.userId");
    }
  }

  // (c) strict schema — PII field fails
  {
    const def = MEMBER_TOOLS.find((t) => t.name === "getMyEntries");
    if (!def) { fail("responseSchema strict test", "tool not found"); return; }
    const validShape = {
      drawName: "Test Draw",
      totalEntries: 0,
      membershipEntries: 0,
      oneTimeEntries: 0,
      entriesByPackage: [],
    };
    let threw = false;
    try {
      def.responseSchema.parse({ ...validShape, email: "x@x.com" });
    } catch {
      threw = true;
    }
    if (!threw) {
      fail("responseSchema.parse with email → ZodError", "did not throw");
    } else {
      pass("responseSchema.strict() rejects extra PII field (email)");
    }
  }

  // No-draw case → zero counts
  {
    const deps: MemberToolDeps = {
      getCurrentMajorDrawForDisplay: async () => null,
    };
    const tools = buildMemberToolSet(memberActor, deps);
    const result = await tools["getMyEntries"].execute!({}, fakeToolCtx) as Record<string, unknown>;
    if (result["drawName"] !== null || result["totalEntries"] !== 0) {
      fail("no-draw → zero counts", `got ${JSON.stringify(result)}`);
    } else {
      pass("no active draw → drawName: null, totalEntries: 0");
    }
  }
}

// ─── getMyBillingStatus ───────────────────────────────────────────────────────

async function testGetMyBillingStatus() {
  console.log("\ngetMyBillingStatus");

  // (a) Anonymous → ToolDenied, stub NOT called
  {
    const stubCalled = { called: false };
    const deps: MemberToolDeps = {
      findUserById: async () => {
        stubCalled.called = true;
        return null;
      },
    };
    const tools = buildMemberToolSet(anonymousActor, deps);
    let threw: unknown = null;
    try {
      await tools["getMyBillingStatus"].execute!({}, fakeToolCtx);
    } catch (e) {
      threw = e;
    }
    if (!(threw instanceof ToolDenied)) {
      fail("anonymous → ToolDenied", `got ${threw}`);
    } else if (stubCalled.called) {
      fail("stub NOT called before auth check", "findUserById was called");
    } else {
      pass("anonymous actor → ToolDenied(login_required), stub not called");
    }
  }

  // (b) Member actor → valid projection
  {
    const capturedId: string[] = [];
    const deps: MemberToolDeps = {
      findUserById: async (id) => {
        capturedId.push(id);
        return makeFakeUser();
      },
    };
    const tools = buildMemberToolSet(memberActor, deps);
    let result: unknown;
    try {
      result = await tools["getMyBillingStatus"].execute!({}, fakeToolCtx);
    } catch (e) {
      fail("member actor → no throw", `threw: ${e}`);
      return;
    }

    const r = result as Record<string, unknown>;
    if (r["subscriptionStatus"] !== "active") {
      fail("subscriptionStatus === active", `got ${r["subscriptionStatus"]}`);
    } else if (r["isActive"] !== true) {
      fail("isActive === true", `got ${r["isActive"]}`);
    } else if (r["autoRenew"] !== true) {
      fail("autoRenew === true", `got ${r["autoRenew"]}`);
    } else if (typeof r["nextBillingDate"] !== "string") {
      fail("nextBillingDate is ISO string", `got ${r["nextBillingDate"]}`);
    } else if (r["isCancelled"] !== false) {
      fail("isCancelled === false", `got ${r["isCancelled"]}`);
    } else {
      pass("member actor → valid billing projection");
    }

    // (d) uses ctx.actor.userId
    if (capturedId[0] !== "test-user-id-123") {
      fail("findUserById with ctx.actor.userId", `got ${capturedId[0]}`);
    } else {
      pass("findUserById called with ctx.actor.userId");
    }
  }

  // (c) strict schema — no Stripe IDs allowed
  {
    const def = MEMBER_TOOLS.find((t) => t.name === "getMyBillingStatus");
    if (!def) { fail("responseSchema strict test", "tool not found"); return; }
    const validShape = {
      subscriptionStatus: "active",
      isActive: true,
      autoRenew: true,
      nextBillingDate: null,
      isCancelled: false,
    };
    // stripeCustomerId must not be accepted
    let threw = false;
    try {
      def.responseSchema.parse({ ...validShape, stripeCustomerId: "cus_xxx" });
    } catch {
      threw = true;
    }
    if (!threw) {
      fail("responseSchema.parse with stripeCustomerId → ZodError", "did not throw");
    } else {
      pass("responseSchema.strict() rejects stripeCustomerId");
    }
  }
}

// ─── getDrawStatus (piiScoped: false) ─────────────────────────────────────────

async function testGetDrawStatus() {
  console.log("\ngetDrawStatus (piiScoped: false)");

  const fakeDraw = {
    _id: { toString: () => "draw-id-001" },
    name: "July 2026 Power Tool Bundle",
    status: "active",
    drawDate: new Date("2026-07-27T10:00:00.000Z"),
    freezeEntriesAt: new Date("2026-07-27T09:30:00.000Z"),
    activationDate: new Date("2026-07-01T00:00:00.000Z"),
    totalEntries: 500,
  };

  const deps: MemberToolDeps = {
    getCurrentMajorDrawForDisplay: async () => fakeDraw as never,
  };

  // (a) Anonymous actor → should NOT throw (piiScoped: false)
  {
    const tools = buildMemberToolSet(anonymousActor, deps);
    let threw: unknown = null;
    try {
      await tools["getDrawStatus"].execute!({}, fakeToolCtx);
    } catch (e) {
      threw = e;
    }
    if (threw instanceof ToolDenied) {
      fail("anonymous actor should NOT throw for piiScoped:false tool", `got ToolDenied`);
    } else if (threw) {
      fail("anonymous actor → no throw", `got: ${threw}`);
    } else {
      pass("anonymous actor → no ToolDenied (piiScoped: false)");
    }
  }

  // (b) Member actor → valid projection
  {
    const tools = buildMemberToolSet(memberActor, deps);
    let result: unknown;
    try {
      result = await tools["getDrawStatus"].execute!({}, fakeToolCtx);
    } catch (e) {
      fail("member actor → no throw", `threw: ${e}`);
      return;
    }

    const r = result as Record<string, unknown>;
    if (r["name"] !== "July 2026 Power Tool Bundle") {
      fail("name set", `got ${r["name"]}`);
    } else if (r["status"] !== "active") {
      fail("status === active", `got ${r["status"]}`);
    } else if (typeof r["drawDate"] !== "string") {
      fail("drawDate is ISO string", `got ${r["drawDate"]}`);
    } else if (r["totalEntries"] !== 500) {
      fail("totalEntries === 500", `got ${r["totalEntries"]}`);
    } else if ("entries" in r) {
      fail("entries NOT in projection", "entries key leaked");
    } else {
      pass("member actor → valid draw status projection");
    }
  }

  // (c) strict schema — extra field fails
  {
    const def = MEMBER_TOOLS.find((t) => t.name === "getDrawStatus");
    if (!def) { fail("responseSchema strict test", "tool not found"); return; }
    const validShape = {
      name: "Test Draw",
      status: "active",
      drawDate: null,
      freezeEntriesAt: null,
      activationDate: null,
      totalEntries: 0,
    };
    let threw = false;
    try {
      def.responseSchema.parse({ ...validShape, email: "x@x.com" });
    } catch {
      threw = true;
    }
    if (!threw) {
      fail("responseSchema.parse with email → ZodError", "did not throw");
    } else {
      pass("responseSchema.strict() rejects extra field");
    }
  }

  // No-draw case
  {
    const noDrawDeps: MemberToolDeps = {
      getCurrentMajorDrawForDisplay: async () => null,
    };
    const tools = buildMemberToolSet(memberActor, noDrawDeps);
    const result = await tools["getDrawStatus"].execute!({}, fakeToolCtx) as Record<string, unknown>;
    if (result["name"] !== null || result["totalEntries"] !== 0) {
      fail("no-draw → null name, 0 entries", `got ${JSON.stringify(result)}`);
    } else {
      pass("no active draw → null name, totalEntries: 0");
    }
  }
}

// ─── getPartnerVisibility ─────────────────────────────────────────────────────

async function testGetPartnerVisibility() {
  console.log("\ngetPartnerVisibility");

  const fakeOffers = [
    { id: "brand-a", name: "Brand A", logo: "/logo-a.png", discount: "10% OFF", discountMessage: "10% off", gradient: "from-gray-900", businessLink: "https://a.com" },
    { id: "brand-b", name: "Brand B", logo: "/logo-b.png", discount: "20% OFF", discountMessage: "20% off", gradient: "from-blue-900", businessLink: "https://b.com" },
    { id: "brand-c", name: "Brand C", logo: "/logo-c.png", discount: "30% OFF", discountMessage: "30% off", gradient: "from-red-900", businessLink: "https://c.com" },
  ];

  // (a) Anonymous → ToolDenied, stub NOT called
  {
    const stubCalled = { called: false };
    const deps: MemberToolDeps = {
      findUserById: async () => {
        stubCalled.called = true;
        return null;
      },
      partnerBrandOffers: fakeOffers,
    };
    const tools = buildMemberToolSet(anonymousActor, deps);
    let threw: unknown = null;
    try {
      await tools["getPartnerVisibility"].execute!({}, fakeToolCtx);
    } catch (e) {
      threw = e;
    }
    if (!(threw instanceof ToolDenied)) {
      fail("anonymous → ToolDenied", `got ${threw}`);
    } else if (stubCalled.called) {
      fail("stub NOT called before auth check", "findUserById was called");
    } else {
      pass("anonymous actor → ToolDenied(login_required), stub not called");
    }
  }

  // (b) Member actor → valid projection (name + discount only)
  {
    const capturedId: string[] = [];
    const deps: MemberToolDeps = {
      findUserById: async (id) => {
        capturedId.push(id);
        return makeFakeUser();
      },
      resolvePartnerCatalogPlanId: (_user) => "tradie-subscription",
      getPartnerCatalogAccessPercentForPlanId: (_planId) => 50,
      getPartnerCatalogVisibleSliceLength: (total, _planId) => Math.ceil(total * 0.5),
      partnerBrandOffers: fakeOffers,
    };

    const tools = buildMemberToolSet(memberActor, deps);
    let result: unknown;
    try {
      result = await tools["getPartnerVisibility"].execute!({}, fakeToolCtx);
    } catch (e) {
      fail("member actor → no throw", `threw: ${e}`);
      return;
    }

    const r = result as Record<string, unknown>;
    if (r["accessPercent"] !== 50) {
      fail("accessPercent === 50", `got ${r["accessPercent"]}`);
    } else if (!Array.isArray(r["visibleBrands"])) {
      fail("visibleBrands is array", `got ${typeof r["visibleBrands"]}`);
    } else {
      const brands = r["visibleBrands"] as Array<Record<string, unknown>>;
      // 50% of 3 → ceil(1.5) = 2 brands
      if (brands.length !== 2) {
        fail("visibleBrands.length === 2 (50% of 3)", `got ${brands.length}`);
      } else if ("logo" in brands[0] || "businessLink" in brands[0] || "id" in brands[0]) {
        fail("logo/businessLink/id NOT in projection", `keys: ${Object.keys(brands[0]).join(", ")}`);
      } else if (!("name" in brands[0]) || !("discount" in brands[0])) {
        fail("name + discount in projection", `keys: ${Object.keys(brands[0]).join(", ")}`);
      } else {
        pass("member actor → valid partner visibility (name+discount only, no logo/link/id)");
      }
    }

    // (d) uses ctx.actor.userId
    if (capturedId[0] !== "test-user-id-123") {
      fail("findUserById with ctx.actor.userId", `got ${capturedId[0]}`);
    } else {
      pass("findUserById called with ctx.actor.userId");
    }
  }

  // (c) strict schema — extra field fails
  {
    const def = MEMBER_TOOLS.find((t) => t.name === "getPartnerVisibility");
    if (!def) { fail("responseSchema strict test", "tool not found"); return; }
    const validShape = {
      accessPercent: 50,
      visibleBrands: [{ name: "Brand A", discount: "10% OFF" }],
    };
    let threw = false;
    try {
      def.responseSchema.parse({ ...validShape, email: "x@x.com" });
    } catch {
      threw = true;
    }
    if (!threw) {
      fail("responseSchema.parse with email → ZodError", "did not throw");
    } else {
      pass("responseSchema.strict() rejects extra PII field (email)");
    }
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  await testAllToolsRegistered();
  await testGetMyMembership();
  await testGetMyEntries();
  await testGetMyBillingStatus();
  await testGetDrawStatus();
  await testGetPartnerVisibility();

  console.log(`\n${"─".repeat(60)}`);

  if (failures > 0) {
    console.error(`member-tools tests FAILED — ${failures} assertion(s) failed`);
    process.exit(1);
  }

  console.log("PASS — member-tools test");
  console.log("  Covered: 5 tools registered, ToolDenied for anonymous (piiScoped tools),");
  console.log("           piiScoped:false allows anonymous (getDrawStatus),");
  console.log("           projected shapes correct, strict schema rejects PII,");
  console.log("           ctx.actor.userId flows to service stubs");
  process.exit(0);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
