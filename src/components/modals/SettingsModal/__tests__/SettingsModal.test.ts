/**
 * Smoke test for SettingsModal. Renders meaningful prop combos via
 * react-dom/server's renderToString to catch import errors, undefined access,
 * and broken JSX after the folder decomposition.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import SettingsModal from "../index";

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

const userStub: React.ComponentProps<typeof SettingsModal>["user"] = {
  _id: "user-1",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  isEmailVerified: true,
  mobile: "0400000000",
  state: "NSW",
  profession: "Carpenter",
};

const membershipModalStub: React.ComponentProps<typeof SettingsModal>["membershipModal"] = {
  isModalOpen: false,
  selectedPlan: null,
  openModal: noop,
  openModalWithPackageSelectionFirst: noop,
  closeModal: noop,
  selectPlan: noop,
  setSelectedPlan: noop,
  openWithPackageSelectionFirst: false,
};

interface Combo {
  name: string;
  props: React.ComponentProps<typeof SettingsModal>;
}

const baseProps: React.ComponentProps<typeof SettingsModal> = {
  isOpen: true,
  onClose: noop,
  user: userStub,
  membershipModal: membershipModalStub,
};

const combos: Combo[] = [
  {
    name: "open — initialTab=profile",
    props: { ...baseProps, initialTab: "profile" },
  },
  {
    name: "open — initialTab=subscription",
    props: { ...baseProps, initialTab: "subscription" },
  },
  {
    name: "open — initialTab=password",
    props: { ...baseProps, initialTab: "password" },
  },
  {
    name: "open — initialTab=payment",
    props: { ...baseProps, initialTab: "payment" },
  },
  {
    name: "closed — renders without throwing",
    props: { ...baseProps, isOpen: false },
  },
];

console.log("\nSettingsModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(SettingsModal, combo.props);
    const queryEl = React.createElement(QueryClientProvider, { client: queryClient, children: modalEl });
    const tree = React.createElement(SessionProvider, { session: null, children: queryEl });
    const html = renderToString(tree);
    assert.ok(typeof html === "string", "renderToString must return a string");
  });
}

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
