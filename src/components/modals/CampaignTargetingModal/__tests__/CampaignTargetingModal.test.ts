/**
 * Smoke test for CampaignTargetingModal. Renders meaningful prop combos via
 * react-dom/server's renderToString to catch import errors, undefined access,
 * and broken JSX after the folder decomposition.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import CampaignTargetingModal, {
  type CampaignTargetingConfirmPayload,
  type CampaignTargetingSegmentPersisted,
} from "../index";

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
const noopConfirm = (_payload: CampaignTargetingConfirmPayload) => {};

interface Combo {
  name: string;
  props: React.ComponentProps<typeof CampaignTargetingModal>;
}

const allTiersSegment: Partial<CampaignTargetingSegmentPersisted> = {
  membershipTiers: ["tradie-subscription", "foreman-subscription", "boss-subscription"],
  requiresEmailVerified: true,
};

const singleTierSegment: Partial<CampaignTargetingSegmentPersisted> = {
  membershipTiers: ["foreman-subscription"],
  requiresEmailVerified: false,
  states: ["NSW", "VIC"],
  topEntriesPercent: 25,
};

const combos: Combo[] = [
  {
    name: "open — all tiers selected",
    props: {
      isOpen: true,
      onClose: noop,
      onConfirm: noopConfirm,
      initialPersistedSegment: allTiersSegment,
    },
  },
  {
    name: "open — single tier (Foreman) with states + topEntriesPercent",
    props: {
      isOpen: true,
      onClose: noop,
      onConfirm: noopConfirm,
      initialPersistedSegment: singleTierSegment,
    },
  },
  {
    name: "open — no tiers (default empty)",
    props: {
      isOpen: true,
      onClose: noop,
      onConfirm: noopConfirm,
    },
  },
  {
    name: "open — with parentSegmentDefaults (inactive-day fields)",
    props: {
      isOpen: true,
      onClose: noop,
      onConfirm: noopConfirm,
      parentSegmentDefaults: {
        requiresEmailVerified: false,
        minInactiveDays: 7,
        maxInactiveDays: 60,
      },
    },
  },
  {
    name: "open — with initialIncludeUserIds (pre-pinned users)",
    props: {
      isOpen: true,
      onClose: noop,
      onConfirm: noopConfirm,
      initialIncludeUserIds: ["user-id-1", "user-id-2", "user-id-3"],
    },
  },
  {
    name: "closed — renders without throwing",
    props: {
      isOpen: false,
      onClose: noop,
      onConfirm: noopConfirm,
    },
  },
];

console.log("\nCampaignTargetingModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(CampaignTargetingModal, combo.props);
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
