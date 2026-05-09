/**
 * Smoke test for RenewalFailedModal. Renders in 2 prop combos via
 * react-dom/server's renderToString — catches import errors, undefined
 * access, broken JSX, missing context providers.
 *
 * RenewalFailedModal has only 2 public props (isOpen, onClose); internal
 * state drives the rendering branches. The smoke test covers what's
 * reachable from the public surface: open and closed.
 *
 * Visual parity is verified manually via /dev/modals (see Plan 3 Task 1.6).
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
import RenewalFailedModal from "../index";

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
  props: React.ComponentProps<typeof RenewalFailedModal>;
}

const combos: Combo[] = [
  {
    name: "open — initial state (renders without throwing)",
    props: { isOpen: true, onClose: noop },
  },
  {
    name: "closed — renders null without throwing",
    props: { isOpen: false, onClose: noop },
  },
];

console.log("\nRenewalFailedModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    // Build the provider tree using `children` prop chain (TS types want
    // children in props; ESLint disabled at file level).
    // Order: SessionProvider > QueryClientProvider > UserProvider (uses RQ hooks) >
    //        LoadingProvider > ToastProvider > modal
    const modalEl = React.createElement(RenewalFailedModal, combo.props);
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
