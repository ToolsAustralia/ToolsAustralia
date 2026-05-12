/**
 * Smoke test for PaymentMethodsTab. Renders meaningful prop combos
 * (default user, active subscription, stripeSubscriptionId set, all optional
 * fields populated) via react-dom/server's renderToString to catch import
 * errors, undefined access, and broken JSX after the folder decomposition.
 *
 * Behavioral correctness (Stripe Elements mount, SetupIntent flow, set-default
 * flow, delete-confirm flow with billing-last branch) is preserved
 * byte-identically from the original flat file — this test only verifies the
 * component tree renders without throwing in SSR.
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
import PaymentMethodsTab from "../index";

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

type PMTabUser = React.ComponentProps<typeof PaymentMethodsTab>["user"];

const baseUser: PMTabUser = {
  _id: "user-1",
  firstName: "Casey",
  lastName: "Tester",
  email: "casey@example.com",
};

const activeSubscriptionUser: PMTabUser = {
  ...baseUser,
  _id: "user-active-sub",
  subscription: {
    isActive: true,
    status: "active",
  },
};

const stripeSubscriptionUser: PMTabUser = {
  ...baseUser,
  _id: "user-stripe-sub",
  stripeSubscriptionId: "sub_test_12345",
  subscription: {
    isActive: true,
    status: "active",
  },
};

const allFieldsUser: PMTabUser = {
  _id: "user-all-fields",
  firstName: "Casey",
  lastName: "Tester",
  email: "casey@example.com",
  mobile: "+61400000000",
  stripeSubscriptionId: "sub_test_67890",
  subscription: {
    isActive: true,
    status: "past_due",
  },
};

interface Combo {
  name: string;
  props: React.ComponentProps<typeof PaymentMethodsTab>;
}

const combos: Combo[] = [
  {
    name: "default user (no subscription)",
    props: { user: baseUser },
  },
  {
    name: "user with active subscription (no stripeSubscriptionId)",
    props: { user: activeSubscriptionUser },
  },
  {
    name: "user with stripeSubscriptionId set (hasActiveSubscription truthy)",
    props: { user: stripeSubscriptionUser },
  },
  {
    name: "user with all optional fields populated (mobile, past_due status)",
    props: { user: allFieldsUser },
  },
];

console.log("\nPaymentMethodsTab smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const tabEl = React.createElement(PaymentMethodsTab, combo.props);
    const toastEl = React.createElement(ToastProvider, { children: tabEl });
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
