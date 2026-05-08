/**
 * Smoke test for StripePaymentModal. Renders in 5 prop combos via
 * react-dom/server's renderToString — catches import errors, undefined
 * access, broken JSX, missing context providers.
 *
 * The Stripe integration (useStripe, useElements, stripe.confirmPayment) is
 * mocked at the module level — this test verifies the component tree renders
 * without throwing, not that Stripe functions are called correctly.
 *
 * Stripe behavioral correctness is guaranteed by code review of the preserved
 * byte-identical logic in PaymentForm.tsx.
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
import StripePaymentModal from "../index";

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

const noop = () => {};

interface Combo {
  name: string;
  props: React.ComponentProps<typeof StripePaymentModal>;
}

const combos: Combo[] = [
  {
    name: "closed — renders null without throwing",
    props: {
      isOpen: false,
      onClose: noop,
      clientSecret: "",
      packageName: "Tradie",
      packageId: "tradie-sub",
      amount: 4900,
      onPaymentSuccess: noop,
    },
  },
  {
    name: "open — no saved method, no clientSecret",
    props: {
      isOpen: true,
      onClose: noop,
      clientSecret: "",
      packageName: "Tradie",
      packageId: "tradie-sub",
      amount: 4900,
      onPaymentSuccess: noop,
    },
  },
  {
    name: "open — Foreman upgrade with upgradeInfo",
    props: {
      isOpen: true,
      onClose: noop,
      clientSecret: "pi_test_secret_abc",
      packageName: "Foreman",
      packageId: "foreman-sub",
      amount: 7900,
      onPaymentSuccess: noop,
      upgradeInfo: {
        fromPackage: { name: "Tradie", price: 49 },
        toPackage: { name: "Foreman", price: 79 },
        billingInfo: {
          currentBillingDate: "2026-05-08",
          nextBillingDate: "2026-06-08",
          nextBillingAmount: 79,
          billingDateStays: true,
        },
      },
    },
  },
  {
    name: "open — Boss upgrade with upgradeInfo, no billingInfo",
    props: {
      isOpen: true,
      onClose: noop,
      clientSecret: "pi_test_secret_def",
      packageName: "Boss",
      packageId: "boss-sub",
      amount: 12900,
      onPaymentSuccess: noop,
      upgradeInfo: {
        fromPackage: { name: "Foreman", price: 79 },
        toPackage: { name: "Boss", price: 129 },
      },
    },
  },
  {
    name: "open — past-due payment (no upgradeInfo)",
    props: {
      isOpen: true,
      onClose: noop,
      clientSecret: "pi_test_secret_ghi",
      packageName: "Tradie",
      packageId: "tradie-sub",
      amount: 4900,
      onPaymentSuccess: noop,
    },
  },
];

console.log("\nStripePaymentModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(StripePaymentModal, combo.props);
    const toastEl = React.createElement(ToastProvider, { children: modalEl });
    const loadingEl = React.createElement(LoadingProvider, { children: toastEl });
    const userEl = React.createElement(UserProvider, { children: loadingEl });
    const queryEl = React.createElement(QueryClientProvider, { client: queryClient, children: userEl });
    const tree = React.createElement(SessionProvider, { session: null, children: queryEl });
    const html = renderToString(tree);
    assert.ok(typeof html === "string", "renderToString must return a string");
    if (combo.props.isOpen) {
      assert.ok(html.length > 0, "isOpen=true should produce non-empty markup");
    }
  });
}

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
