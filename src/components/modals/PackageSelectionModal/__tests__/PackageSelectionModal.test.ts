/**
 * Smoke test for PackageSelectionModal. Renders meaningful prop combos via
 * react-dom/server's renderToString to catch import errors, undefined access,
 * and broken JSX after the folder decomposition.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import PackageSelectionModal from "../index";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";

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

const tradiePlan: LocalMembershipPlan = {
  id: "tradie",
  name: "Tradie",
  subtitle: "Tradie",
  price: 20,
  period: "mo",
  features: [
    { text: "50% Access to Partner Discounts" },
    { text: "15 free accumulated entries" },
  ],
  buttonText: "Get Started",
  buttonStyle: "secondary",
  isAdditional: false,
};

const foremanPlan: LocalMembershipPlan = {
  id: "foreman",
  name: "Foreman",
  subtitle: "Powerpass",
  price: 40,
  period: "mo",
  features: [
    { text: "75% Access to Partner Discounts" },
    { text: "40 free accumulated entries" },
  ],
  isPopular: true,
  buttonText: "Go Pro",
  buttonStyle: "primary",
  isAdditional: false,
};

const bossPlan: LocalMembershipPlan = {
  id: "boss",
  name: "Boss",
  subtitle: "Hard Yakka",
  price: 80,
  period: "mo",
  features: [
    { text: "100% Access to Partner Discounts" },
    { text: "100 free accumulated entries" },
  ],
  buttonText: "Become Boss",
  buttonStyle: "secondary",
  isAdditional: false,
};

const oneTimePlan: LocalMembershipPlan = {
  id: "tradie-pack",
  name: "Tradie Pack",
  price: 50,
  period: "one-time",
  features: [
    { text: "40% of Partner Discounts Available" },
    { text: "2 Days Access to Partner Discounts" },
    { text: "15 free entries" },
  ],
  isPopular: true,
  buttonText: "Get Tradie",
  buttonStyle: "primary",
  isAdditional: false,
  metadata: { entriesCount: 15 },
};

type SessionShape = React.ComponentProps<typeof SessionProvider>["session"];

interface Combo {
  name: string;
  props: React.ComponentProps<typeof PackageSelectionModal>;
  session: SessionShape;
}

const futureExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

const combos: Combo[] = [
  {
    name: "open — authenticated, currentPlan = Tradie",
    props: { isOpen: true, onClose: noop, currentPlan: tradiePlan, onPlanSelect: noop },
    session: { user: { id: "user-1", email: "tradie@example.com" }, expires: futureExpires } as SessionShape,
  },
  {
    name: "open — authenticated, currentPlan = Foreman",
    props: { isOpen: true, onClose: noop, currentPlan: foremanPlan, onPlanSelect: noop },
    session: { user: { id: "user-2", email: "foreman@example.com" }, expires: futureExpires } as SessionShape,
  },
  {
    name: "open — authenticated, currentPlan = Boss",
    props: { isOpen: true, onClose: noop, currentPlan: bossPlan, onPlanSelect: noop },
    session: { user: { id: "user-3", email: "boss@example.com" }, expires: futureExpires } as SessionShape,
  },
  {
    name: "open — anonymous (no session), currentPlan = one-time",
    props: { isOpen: true, onClose: noop, currentPlan: oneTimePlan, onPlanSelect: noop },
    session: null,
  },
  {
    name: "closed — renders without throwing",
    props: { isOpen: false, onClose: noop, currentPlan: tradiePlan, onPlanSelect: noop },
    session: { user: { id: "user-4", email: "closed@example.com" }, expires: futureExpires } as SessionShape,
  },
];

console.log("\nPackageSelectionModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(PackageSelectionModal, combo.props);
    const queryEl = React.createElement(QueryClientProvider, { client: queryClient, children: modalEl });
    const tree = React.createElement(SessionProvider, { session: combo.session, children: queryEl });
    const html = renderToString(tree);
    assert.ok(typeof html === "string", "renderToString must return a string");
  });
}

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
