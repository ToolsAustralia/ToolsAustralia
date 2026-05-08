/**
 * Smoke test for ReferFriendModal. Renders 3 prop combos via
 * react-dom/server's renderToString — catches import errors, undefined
 * access, broken JSX, missing context providers.
 *
 * The test exercises: open (loading state), open with userFirstName, and closed.
 * Profile data (useReferralProfile) is not loaded in this test environment —
 * the loading state branch is exercised, which is sufficient to verify the
 * import graph, Shell, UpsellHero, InfoGrid, UrgencyBanner, and TrustBar all
 * assemble without throwing.
 *
 * Visual parity is verified manually via /dev/modals.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import ReferFriendModal from "../index";

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
  props: React.ComponentProps<typeof ReferFriendModal>;
}

const combos: Combo[] = [
  {
    name: "open — tradie tier (default), no firstName",
    props: {
      isOpen: true,
      onCloseAction: noop,
      userId: "user-123",
      userTier: "tradie",
    },
  },
  {
    name: "open — boss tier with firstName",
    props: {
      isOpen: true,
      onCloseAction: noop,
      userId: "user-456",
      userFirstName: "Jake",
      userTier: "boss",
    },
  },
  {
    name: "open — foreman tier with firstName",
    props: {
      isOpen: true,
      onCloseAction: noop,
      userId: "user-789",
      userFirstName: "Sam",
      userTier: "foreman",
    },
  },
  {
    name: "closed — renders null without throwing",
    props: {
      isOpen: false,
      onCloseAction: noop,
      userId: "user-123",
    },
  },
];

console.log("\nReferFriendModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(ReferFriendModal, combo.props);
    const queryEl = React.createElement(QueryClientProvider, {
      client: queryClient,
      children: modalEl,
    });
    const tree = React.createElement(SessionProvider, {
      session: null,
      children: queryEl,
    });
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
