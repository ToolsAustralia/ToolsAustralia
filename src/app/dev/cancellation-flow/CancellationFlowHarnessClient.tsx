"use client";

/**
 * CancellationFlowHarnessClient — dev-only preview harness.
 *
 * Mounts the REAL restyled cancellation-flow components (Step1Reason,
 * Step2Offer for all 5 offer types, Step4Confirm normal + past-due, and
 * StepSaveSuccess for 4 offer outcomes) with mock no-network handlers so
 * design/colour/motion can be tuned and QA'd on one page.
 *
 * Controls:
 *   - Light / Dark toggle  (adds `dark` class to the wrapper div)
 *   - Viewport width       (320 / 360 / 600 px – narrows the panel container)
 *
 * Reduced-motion is intentionally NOT toggled here — use the OS preference or
 * Chrome DevTools > Rendering > "Emulate CSS prefers-reduced-motion" instead.
 *
 * NO network calls are made. All mutations are no-op mocks cast as `never`.
 */

import React, { useState } from "react";
import type { OfferType } from "@/models/CancellationFlowEvent";
import type {
  CancellationEntrySnapshot,
  FlowState,
} from "@/components/modals/CancellationFlowModal/types";
import Step1Reason from "@/components/modals/CancellationFlowModal/Step1Reason";
import Step2Offer from "@/components/modals/CancellationFlowModal/Step2Offer";
import Step4Confirm from "@/components/modals/CancellationFlowModal/Step4Confirm";
import StepSaveSuccess from "@/components/modals/CancellationFlowModal/StepSaveSuccess";
import { useCancellationFlow } from "@/components/modals/CancellationFlowModal/useCancellationFlow";

// ---------------------------------------------------------------------------
// Mock mutation factory
// ---------------------------------------------------------------------------

/**
 * Returns a TanStack-Query-shaped mutation object that does nothing.
 * Cast `as never` so it satisfies the production prop types without weakening
 * them. If TypeScript rejects `as never` at a call site, cast via
 * `as ReturnType<typeof useXxx>` locally instead — do NOT change the
 * production component prop types.
 */
function mockMutation(resolved: unknown = { ok: true }) {
  return {
    mutate: () => {},
    mutateAsync: async () => resolved,
    isPending: false,
    isError: false,
    error: null,
    reset: () => {},
    data: undefined,
    variables: undefined,
    isIdle: true,
    isSuccess: false,
    status: "idle" as const,
    context: undefined,
    failureCount: 0,
    failureReason: null,
    submittedAt: 0,
    isPaused: false,
  } as never;
}

// ---------------------------------------------------------------------------
// baseState helper — ALL FlowState fields required
// ---------------------------------------------------------------------------

function baseState(over: Partial<FlowState> = {}): FlowState {
  return {
    step: 2,
    reason: "too_expensive",
    reasonText: "",
    eventId: "evt_demo",
    offersShown: ["discount_50_2mo", "bonus_entries_100"],
    offerCursor: 0,
    pastDue: false,
    saveSuccess: false,
    acceptedOffer: null,
    acceptResult: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Panel wrapper — labelled container for each scenario
// ---------------------------------------------------------------------------

interface PanelProps {
  label: string;
  children: React.ReactNode;
  width: number;
}

function Panel({ label, children, width }: PanelProps) {
  return (
    <section
      style={{
        margin: "0 auto 40px",
        maxWidth: width,
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "6px 14px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          background: "#f3f4f6",
          color: "#6b7280",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {label}
      </div>
      <div>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

type Viewport = 320 | 360 | 600;

interface ToolbarProps {
  dark: boolean;
  onToggleDark: () => void;
  viewport: Viewport;
  onViewport: (v: Viewport) => void;
}

function Toolbar({ dark, onToggleDark, viewport, onViewport }: ToolbarProps) {
  const btnBase: React.CSSProperties = {
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  };
  const btnActive: React.CSSProperties = {
    background: "#1d4ed8",
    color: "#fff",
    borderColor: "#1d4ed8",
  };
  const btnInactive: React.CSSProperties = {
    background: "#fff",
    color: "#374151",
  };

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        padding: "10px 20px",
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        boxShadow: "0 1px 4px rgba(0,0,0,.06)",
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 13, color: "#111827", marginRight: 8 }}>
        Cancellation-flow harness
      </span>
      <button
        type="button"
        style={{ ...btnBase, ...(dark ? btnActive : btnInactive) }}
        onClick={onToggleDark}
      >
        {dark ? "Dark ON" : "Dark OFF"}
      </button>
      <span style={{ fontSize: 12, color: "#6b7280" }}>Width:</span>
      {([320, 360, 600] as Viewport[]).map((w) => (
        <button
          key={w}
          type="button"
          style={{ ...btnBase, ...(viewport === w ? btnActive : btnInactive) }}
          onClick={() => onViewport(w)}
        >
          {w}px
        </button>
      ))}
      <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>
        Reduced-motion → OS pref or DevTools &gt; Rendering
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step1Reason panel — uses the REAL useCancellationFlow hook
// ---------------------------------------------------------------------------

function Step1Panel({ width }: { width: number }) {
  const flowHook = useCancellationFlow();
  return (
    <Panel label="Step 1 — Reason (default)" width={width}>
      <Step1Reason
        flowHook={flowHook}
        startMutation={mockMutation({ eventId: "evt_demo", offersShown: ["discount_50_2mo", "bonus_entries_100"], pastDue: false })}
        onClose={() => {}}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Main harness component
// ---------------------------------------------------------------------------

// Hardcoded (NOT imported from OFFER_TYPES): this is a "use client" component and
// @/models/CancellationFlowEvent is a Mongoose model module — runtime-importing it
// in client code crashes (mongoose is serverExternalPackages). Keep this list in
// sync with OfferType / OFFER_TYPES in src/models/CancellationFlowEvent.ts by hand.
const ALL_OFFERS: OfferType[] = [
  "discount_50_2mo",
  "tier_downgrade",
  "pause_30d",
  "unsubscribe_marketing",
  "bonus_entries_100",
];

const SAVE_SUCCESS_OFFERS: OfferType[] = [
  "discount_50_2mo",
  "pause_30d",
  "unsubscribe_marketing",
  "bonus_entries_100",
];

// Realistic REAL-data sample (Tradie: $20/mo → $10/mo discounted; 150 accumulated
// → 165 → 180 projection; +100 bonus → 250). Mirrors what the parent computes
// from subscriptionBenefits + membershipPackage.price.
const SAMPLE_ENTRY_SNAPSHOT: CancellationEntrySnapshot = {
  packageId: "tradie-subscription",
  packageName: "Tradie",
  baseEntriesPerMonth: 15,
  currentEntries: 150,
  lastMonthAccumulatedEntries: 150,
  currentPriceLabel: "$20/mo",
  currentPriceAmount: 20,
};

export default function CancellationFlowHarnessClient() {
  const [dark, setDark] = useState(false);
  const [viewport, setViewport] = useState<Viewport>(360);

  const noop = () => {};

  return (
    <div className={dark ? "dark" : undefined}>
      <div
        style={{
          minHeight: "100vh",
          background: dark ? "#0a0a0a" : "#f9fafb",
          color: dark ? "#f3f4f6" : "#111827",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <Toolbar
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
          viewport={viewport}
          onViewport={setViewport}
        />

        <div style={{ padding: "32px 20px" }}>

          {/* ── Step 1 ────────────────────────────────────────────── */}
          <Step1Panel width={viewport} />

          {/* ── Step 2 — each of the 5 offer types (WITH real entrySnapshot) ── */}
          {ALL_OFFERS.map((offer) => (
            <Panel
              key={offer}
              label={`Step 2 — Offer: ${offer} (cursor 0 of ${ALL_OFFERS.length}) · entrySnapshot PRESENT`}
              width={viewport}
            >
              <Step2Offer
                state={baseState({
                  offersShown: [offer, "bonus_entries_100"],
                  offerCursor: 0,
                })}
                outcomeMutation={mockMutation({ ok: true })}
                acceptOfferMutation={mockMutation({ ok: true })}
                onDecline={noop}
                onClose={noop}
                onAcceptedOffer={noop}
                onRequestTierDowngrade={noop}
                tierDowngradeAvailable={true}
                entrySnapshot={SAMPLE_ENTRY_SNAPSHOT}
              />
            </Panel>
          ))}

          {/* ── Step 2 — graceful-hide proof: entrySnapshot ABSENT ──── */}
          <Panel
            label="Step 2 — Offer: discount_50_2mo · entrySnapshot ABSENT (graceful — no accumulation section)"
            width={viewport}
          >
            <Step2Offer
              state={baseState({
                offersShown: ["discount_50_2mo", "bonus_entries_100"],
                offerCursor: 0,
              })}
              outcomeMutation={mockMutation({ ok: true })}
              acceptOfferMutation={mockMutation({ ok: true })}
              onDecline={noop}
              onClose={noop}
              onAcceptedOffer={noop}
              onRequestTierDowngrade={noop}
              tierDowngradeAvailable={true}
              entrySnapshot={null}
            />
          </Panel>
          <Panel
            label="Step 2 — Offer: bonus_entries_100 · entrySnapshot ABSENT (graceful — no breakdown)"
            width={viewport}
          >
            <Step2Offer
              state={baseState({
                offersShown: ["bonus_entries_100"],
                offerCursor: 0,
              })}
              outcomeMutation={mockMutation({ ok: true })}
              acceptOfferMutation={mockMutation({ ok: true })}
              onDecline={noop}
              onClose={noop}
              onAcceptedOffer={noop}
              onRequestTierDowngrade={noop}
              tierDowngradeAvailable={true}
              entrySnapshot={null}
            />
          </Panel>

          {/* ── Step 2 — tier_downgrade with tierDowngradeAvailable=false ── */}
          <Panel
            label="Step 2 — Offer: tier_downgrade (tierDowngradeAvailable=false → falls back to bonus_entries_100)"
            width={viewport}
          >
            <Step2Offer
              state={baseState({
                offersShown: ["tier_downgrade", "bonus_entries_100"],
                offerCursor: 0,
              })}
              outcomeMutation={mockMutation({ ok: true })}
              acceptOfferMutation={mockMutation({ ok: true })}
              onDecline={noop}
              onClose={noop}
              onAcceptedOffer={noop}
              onRequestTierDowngrade={noop}
              tierDowngradeAvailable={false}
            />
          </Panel>

          {/* ── StepSaveSuccess — 4 offer outcomes ───────────────── */}
          {SAVE_SUCCESS_OFFERS.map((offer) => (
            <Panel
              key={offer}
              label={`StepSaveSuccess — offer: ${offer}`}
              width={viewport}
            >
              <StepSaveSuccess
                offer={offer}
                result={
                  offer === "pause_30d"
                    ? { ok: true, resumesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }
                    : offer === "discount_50_2mo"
                    ? { ok: true, couponId: "DISC50_DEMO" }
                    : { ok: true }
                }
                firstName="Alex"
                onClose={noop}
                onDone={noop}
              />
            </Panel>
          ))}

          {/* ── Step 4 — normal ──────────────────────────────────── */}
          <Panel label="Step 4 — Confirm (normal)" width={viewport}>
            <Step4Confirm
              state={baseState({ step: 4 })}
              modalProps={{ onClose: noop, onCancelled: noop, onResolvePayment: noop }}
              outcomeMutation={mockMutation({ ok: true })}
              onClose={noop}
            />
          </Panel>

          {/* ── Step 4 — past-due ────────────────────────────────── */}
          <Panel label="Step 4 — Confirm (past-due)" width={viewport}>
            <Step4Confirm
              state={baseState({ step: 4, pastDue: true })}
              modalProps={{ onClose: noop, onCancelled: noop, onResolvePayment: noop }}
              outcomeMutation={mockMutation({ ok: true })}
              onClose={noop}
            />
          </Panel>

        </div>
      </div>
    </div>
  );
}
