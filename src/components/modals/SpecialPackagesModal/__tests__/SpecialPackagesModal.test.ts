/**
 * Smoke test for SpecialPackagesModal. Renders meaningful prop combos via
 * react-dom/server's renderToString to catch import errors, undefined access,
 * and broken JSX after the folder decomposition.
 *
 * Stripe behavioral correctness (SetupIntent + purchaseMembership flow) is
 * preserved byte-identically from the original flat file — this test only
 * verifies the component tree renders without throwing in SSR.
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
import type { StaticMembershipPackage } from "@/data/membershipPackages";
import SpecialPackagesModal, { type SpecialPackagesModalProps } from "../index";

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

const samplePackages: StaticMembershipPackage[] = [
  {
    _id: "additional-pack-1",
    name: "Additional Pack 1",
    type: "one-time",
    price: 25,
    description: "First additional pack",
    features: ["50 entries"],
    totalEntries: 50,
    partnerDiscountDays: 7,
    isActive: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
  {
    _id: "additional-pack-2",
    name: "Additional Pack 2",
    type: "one-time",
    price: 50,
    description: "Second additional pack",
    features: ["120 entries"],
    totalEntries: 120,
    partnerDiscountDays: 14,
    isActive: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  },
];

interface Combo {
  name: string;
  props: SpecialPackagesModalProps;
}

const combos: Combo[] = [
  {
    name: "open — default with sample packages",
    props: {
      isOpen: true,
      onClose: noop,
      packages: samplePackages,
      onPackageSelect: noop,
    },
  },
  {
    name: "open — with initialCouponCode",
    props: {
      isOpen: true,
      onClose: noop,
      packages: samplePackages,
      initialCouponCode: "PROMO50",
      onPackageSelect: noop,
    },
  },
  {
    name: "open — empty packages array",
    props: {
      isOpen: true,
      onClose: noop,
      packages: [],
      onPackageSelect: noop,
    },
  },
  {
    name: "closed — renders without throwing",
    props: {
      isOpen: false,
      onClose: noop,
      packages: samplePackages,
      onPackageSelect: noop,
    },
  },
];

console.log("\nSpecialPackagesModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(SpecialPackagesModal, combo.props);
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
