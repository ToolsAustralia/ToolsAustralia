/**
 * Smoke test for MembershipModal. Renders meaningful prop combos via
 * react-dom/server's renderToString to catch import errors, undefined access,
 * and broken JSX after the folder decomposition.
 *
 * Stripe behavioral correctness (confirmStripeIntent flows, SetupIntent +
 * PaymentIntent recovery, invoice finalization, 3DS redirect) is preserved
 * byte-identically from the original flat file — this test only verifies the
 * component tree renders without throwing in SSR.
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
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import MembershipModal from "../index";

// Mock app-router instance — every method is a noop.
const mockRouter: AppRouterInstance = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
};

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
    if (err instanceof Error) {
      console.error(err.stack || err.message);
    } else {
      console.error(String(err));
    }
  }
}

// Stub global fetch so any in-flight queries never resolve at SSR boot.
if (typeof globalThis.fetch !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = () => new Promise(() => {});
}

const noop = () => {};

const sampleMembershipPlan: LocalMembershipPlan = {
  id: "tradie-pack",
  name: "Tradie",
  price: 29,
  period: "mo",
  features: [
    { text: "10 free entries every month" },
    { text: "Partner discount access" },
  ],
  subtitle: "Best value membership",
  isMemberOnly: false,
  buttonText: "Join now",
  buttonStyle: "primary",
  metadata: {
    entriesCount: 10,
  },
};

const sampleOneTimePlan: LocalMembershipPlan = {
  id: "power-pack",
  name: "Power Pack",
  price: 49,
  period: "one-time",
  features: [{ text: "20 entries" }],
  subtitle: "One-time pack",
  isMemberOnly: false,
  buttonText: "Buy now",
  buttonStyle: "primary",
  metadata: {
    entriesCount: 20,
  },
};

interface Combo {
  name: string;
  props: React.ComponentProps<typeof MembershipModal>;
}

const combos: Combo[] = [
  {
    name: "open — no selectedPlan (default placeholder)",
    props: {
      isOpen: true,
      onClose: noop,
      selectedPlan: null,
    },
  },
  {
    name: "open — with membership selectedPlan (subscription)",
    props: {
      isOpen: true,
      onClose: noop,
      selectedPlan: sampleMembershipPlan,
      onPlanChange: noop,
    },
  },
  {
    name: "open — with one-time selectedPlan",
    props: {
      isOpen: true,
      onClose: noop,
      selectedPlan: sampleOneTimePlan,
      onPlanChange: noop,
    },
  },
  {
    name: "open — showPackageSelectionFirst variant config",
    props: {
      isOpen: true,
      onClose: noop,
      selectedPlan: null,
      onPlanChange: noop,
      membershipModalConfig: { showPackageSelectionFirst: true },
    },
  },
  {
    name: "closed — renders without throwing",
    props: {
      isOpen: false,
      onClose: noop,
      selectedPlan: sampleMembershipPlan,
    },
  },
];

console.log("\nMembershipModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(MembershipModal, combo.props);
    const toastEl = React.createElement(ToastProvider, { children: modalEl });
    const loadingEl = React.createElement(LoadingProvider, { children: toastEl });
    const userEl = React.createElement(UserProvider, { children: loadingEl });
    const queryEl = React.createElement(QueryClientProvider, { client: queryClient, children: userEl });
    const sessionEl = React.createElement(SessionProvider, { session: null, children: queryEl });
    const pathnameEl = React.createElement(PathnameContext.Provider, { value: "/", children: sessionEl });
    const tree = React.createElement(AppRouterContext.Provider, { value: mockRouter, children: pathnameEl });
    const html = renderToString(tree);
    assert.ok(typeof html === "string", "renderToString must return a string");
  });
}

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
