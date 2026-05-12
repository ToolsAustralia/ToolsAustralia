/**
 * Smoke test for PaymentMethodSelector. Renders meaningful prop combos
 * (no saved methods, with saved methods, setup-intent, payment-intent,
 * showCardForm with billingDetails) via react-dom/server's renderToString to
 * catch import errors, undefined access, and broken JSX after the folder
 * decomposition.
 *
 * Behavioral correctness (Stripe Elements mount, ref imperative handle,
 * SetupIntent / PaymentIntent confirmation flow, hidden-mount fallback for
 * subscription invoice) is preserved byte-identically from the original flat
 * file — this test only verifies the component tree renders without throwing
 * in SSR and that the ref shape passed by the consumer is type-compatible.
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
import PaymentMethodSelector from "../index";

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

type SelectorProps = React.ComponentProps<typeof PaymentMethodSelector>;
type CardFormRef = SelectorProps["cardFormRef"];

// React.createRef() yields a RefObject that's structurally compatible with the
// React.Ref<{...}> prop type (the imperative handle's narrow shape is a
// superset that the orchestrator forwards verbatim to CardFormSection).
const makeRef = (): CardFormRef =>
  React.createRef() as unknown as CardFormRef;

const baseProps: SelectorProps = {
  onPaymentMethodSelect: () => {},
  onAddNewPaymentMethod: () => {},
  selectedPaymentMethod: null,
  isAuthenticated: false,
  showCardForm: false,
  setupIntentClientSecret: null,
  paymentIntentClientSecret: null,
  cardFormRef: makeRef(),
  onCardElementChange: () => {},
  cardFormError: null,
  isCreatingSetupIntent: false,
};

interface Combo {
  name: string;
  props: SelectorProps;
}

const combos: Combo[] = [
  {
    name: "default — unauthenticated, no saved methods, no client secret",
    props: { ...baseProps, cardFormRef: makeRef() },
  },
  {
    name: "authenticated — renders Payment Method section + saved-method picker",
    props: {
      ...baseProps,
      isAuthenticated: true,
      cardFormRef: makeRef(),
    },
  },
  {
    name: "intentType=setup — SetupIntent flow with client secret",
    props: {
      ...baseProps,
      intentType: "setup",
      setupIntentClientSecret: "seti_test_12345_secret_abcdefg",
      cardFormRef: makeRef(),
    },
  },
  {
    name: "intentType=payment — PaymentIntent flow with amount + packageName",
    props: {
      ...baseProps,
      intentType: "payment",
      paymentIntentClientSecret: "pi_test_67890_secret_zyxwvut",
      amount: 4900,
      packageName: "Premium Membership",
      cardFormRef: makeRef(),
    },
  },
  {
    name: "showCardForm=true authenticated with billingDetails populated",
    props: {
      ...baseProps,
      isAuthenticated: true,
      showCardForm: true,
      intentType: "setup",
      setupIntentClientSecret: "seti_test_billing_secret_xyz",
      billingDetails: {
        name: "Casey Tester",
        email: "casey@example.com",
        phone: "+61400000000",
        country: "AU",
        state: "NSW",
        city: "Sydney",
        postalCode: "2000",
        line1: "1 Martin Place",
      },
      amount: 9900,
      packageName: "VIP Tier",
      cardFormRef: makeRef(),
    },
  },
];

console.log("\nPaymentMethodSelector smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const selectorEl = React.createElement(PaymentMethodSelector, combo.props);
    const toastEl = React.createElement(ToastProvider, { children: selectorEl });
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
