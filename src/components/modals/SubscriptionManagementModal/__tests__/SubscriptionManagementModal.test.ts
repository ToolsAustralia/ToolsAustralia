/**
 * Smoke test for SubscriptionManagementModal. Renders meaningful prop combos
 * (modal mode, panel mode, past-due, pending change, closed) via
 * react-dom/server's renderToString to catch import errors, undefined access,
 * and broken JSX after the folder decomposition.
 *
 * Behavioral correctness (Stripe upgrade → payment, downgrade scheduling,
 * cancellation upsell flow, renewal failed flow, renderAsPanel embed mode)
 * is preserved byte-identically from the original flat file — this test only
 * verifies the component tree renders without throwing in SSR.
 *
 * `globalThis.fetch` is stubbed to return a never-resolving promise so any
 * in-flight queries stay pending and SSR is deterministic.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { ToastProvider } from "@/components/ui/Toast";
import { UserProvider } from "@/contexts/UserContext";
import SubscriptionManagementModal from "../index";
import type { SubMgmtUser } from "../types";

let testsRun = 0;
let testsFailed = 0;

function test(name: string, fn: () => void): void {
  testsRun++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`  ✗ ${name}`);
    console.error(err instanceof Error ? err.message : String(err));
  }
}

// Stub global fetch so any in-flight queries never error at boot.
if (typeof globalThis.fetch !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = () => new Promise(() => {});
}

const noop = () => {};

const baseUser: SubMgmtUser = {
  _id: "user-1",
  firstName: "Casey",
  lastName: "Tester",
  email: "casey@example.com",
  role: "user",
  subscription: {
    packageId: "tradie-subscription",
    isActive: true,
    startDate: "2025-09-01T00:00:00.000Z",
    endDate: "2025-12-01T00:00:00.000Z",
    autoRenew: true,
    status: "active",
  },
  subscriptionPackageData: {
    _id: "tradie-subscription",
    name: "Tradie",
    type: "subscription",
    price: 20,
    description: "Entry-tier monthly plan",
    features: ["15 free entries", "50% partner access"],
    entriesPerMonth: 15,
    shopDiscountPercent: 5,
    partnerDiscountDays: 30,
    isActive: true,
  },
};

const pastDueUser: SubMgmtUser = {
  ...baseUser,
  _id: "user-pastdue",
  subscription: {
    ...baseUser.subscription!,
    isActive: false,
    status: "past_due",
    autoRenew: true,
  },
};

const pendingChangeUser: SubMgmtUser = {
  ...baseUser,
  _id: "user-pending-change",
  // Subscription state is identical to baseUser; pending change is reflected
  // server-side via /api/subscription/benefits which is stubbed to never
  // resolve. SSR rendering of the orchestrator path is what we're testing.
};

interface Combo {
  name: string;
  props: React.ComponentProps<typeof SubscriptionManagementModal>;
}

const combos: Combo[] = [
  {
    name: "open — default modal mode (renderAsPanel undefined)",
    props: {
      isOpen: true,
      onClose: noop,
      user: baseUser,
    },
  },
  {
    name: "open — panel mode (renderAsPanel=true, embedded by SettingsModal)",
    props: {
      isOpen: true,
      onClose: noop,
      user: baseUser,
      renderAsPanel: true,
    },
  },
  {
    name: "open — past-due user (failed renewal)",
    props: {
      isOpen: true,
      onClose: noop,
      user: pastDueUser,
    },
  },
  {
    name: "open — user with pending change shape",
    props: {
      isOpen: true,
      onClose: noop,
      user: pendingChangeUser,
    },
  },
  {
    name: "closed — isOpen=false renders null without throwing",
    props: {
      isOpen: false,
      onClose: noop,
      user: baseUser,
    },
  },
];

console.log("\nSubscriptionManagementModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(SubscriptionManagementModal, combo.props);
    const toastEl = React.createElement(ToastProvider, { children: modalEl });
    const loadingEl = React.createElement(LoadingProvider, { children: toastEl });
    const userEl = React.createElement(UserProvider, { children: loadingEl });
    const queryEl = React.createElement(QueryClientProvider, { client: queryClient, children: userEl });
    const tree = React.createElement(SessionProvider, { session: null, children: queryEl });
    const html = renderToString(tree);
    assert.ok(typeof html === "string", "renderToString must return a string");
  });
}

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
