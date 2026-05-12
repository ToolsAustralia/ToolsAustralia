/**
 * Smoke test for UpsellModal. Renders meaningful prop combos via
 * react-dom/server's renderToString to catch import errors, undefined access,
 * and broken JSX after the folder decomposition.
 *
 * Stripe behavioral correctness (confirmPayment, SetupIntent flow) is
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
import type { UpsellOffer, UpsellUserContext, UpsellModalProps } from "@/types/upsell";
import UpsellModal from "../index";

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

const baseUserContext: UpsellUserContext = {
  isAuthenticated: true,
  hasDefaultPayment: false,
  recentPurchase: "membership-purchase",
  userType: "new-user",
  totalSpent: 0,
  upsellsShown: 0,
};

const sampleOffer: UpsellOffer = {
  id: "major-draw-special",
  title: "Double Your Value - Major Draw Special!",
  description: "You just got entries! Want twice the entries at this special rate?",
  category: "major-draw",
  originalPrice: 100,
  discountedPrice: 50,
  discountPercentage: 50,
  entriesCount: 300,
  buttonText: "Double My Entries - $50",
  conditions: [
    "300 Major Draw Entries",
    "4 Days Partner Discount Access",
    "One-time purchase",
  ],
  priority: 10,
  isActive: true,
  targetAudience: ["all-users"],
  userSegments: ["new-user"],
  maxShowsPerUser: 3,
  cooldownHours: 24,
};

const miniDrawOffer: UpsellOffer = {
  ...sampleOffer,
  id: "mini-draw-bonus",
  title: "Mini Draw Bonus Pack",
  category: "mini-draw",
  discountedPrice: 45,
  conditions: ["150 Mini Draw Entries", "Instant activation"],
};

interface Combo {
  name: string;
  props: UpsellModalProps;
}

const combos: Combo[] = [
  {
    name: "open — default offer, no userContext extras",
    props: {
      isOpen: true,
      onClose: noop,
      offer: sampleOffer,
      userContext: baseUserContext,
      onAccept: noop,
      onDecline: noop,
    },
  },
  {
    name: "open — with userContext.userId + originalPurchaseContext",
    props: {
      isOpen: true,
      onClose: noop,
      offer: sampleOffer,
      userContext: { ...baseUserContext, userId: "user_abc" },
      originalPurchaseContext: {
        paymentIntentId: "pi_test_abc",
        packageId: "membership-tradie",
        packageName: "Tradie",
        packageType: "membership",
        price: 49,
        entries: 15,
        baseEntries: 15,
        promoMultiplier: 1,
      },
      onAccept: noop,
      onDecline: noop,
    },
  },
  {
    name: "closed — renders without throwing",
    props: {
      isOpen: false,
      onClose: noop,
      offer: sampleOffer,
      userContext: baseUserContext,
      onAccept: noop,
      onDecline: noop,
    },
  },
  {
    name: "open — different offer (mini-draw variant)",
    props: {
      isOpen: true,
      onClose: noop,
      offer: miniDrawOffer,
      userContext: baseUserContext,
      originalPurchaseContext: {
        paymentIntentId: "pi_test_def",
        packageId: "mini-pack-1",
        packageName: "Mini Pack 1",
        packageType: "mini-draw",
        price: 25,
        entries: 50,
      },
      onAccept: noop,
      onDecline: noop,
    },
  },
];

console.log("\nUpsellModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(UpsellModal, combo.props);
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
