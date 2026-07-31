"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PortalConsent from "./PortalConsent";
import PortalTransit, { type PortalTransitPhase } from "./PortalTransit";
import {
  usePartnerDiscountSso,
  usePartnerDiscountConsent,
} from "@/hooks/queries/usePartnerDiscountSso";
import type { PartnerSsoSharedField } from "@/utils/partner-discounts/partner-consent";

export interface PortalHandoffState {
  /** Start the hand-off. Wire this to the "Open partner portal" CTA. */
  start: () => void;
  /** True from the first click until the takeover unmounts — for the CTA's own pending state. */
  busy: boolean;
  /** Failure copy for surfaces that render an inline error next to the CTA. */
  error: string | null;
  /** Render this. It is `null` when idle, so it costs nothing on a page nobody clicks. */
  overlay: React.ReactNode;
}

export interface UsePortalHandoffOptions {
  memberName?: string | null;
  tierLabel?: string | null;
  accessPct?: number | null;
}

type Flow =
  | { kind: "idle" }
  | { kind: "consent"; fields: PartnerSsoSharedField[] }
  | { kind: "transit"; phase: PortalTransitPhase; consent: boolean; error?: string | null };

/**
 * usePortalHandoff — owns the whole MyRewards SSO hand-off: consent branch, transit
 * takeover, redirect, cancel and retry. All four "Open partner portal" CTAs share it, so
 * the flow behaves identically wherever it is triggered.
 *
 * FLOW
 *   click → POST /sso
 *     ├─ 409 consentRequired → consent sheet → POST /consent → POST /sso again
 *     └─ 200                 → transit takeover → success state → window.location.assign
 *
 * WHY THE TAKEOVER MOUNTS ON THE *RESPONSE*, NOT THE CLICK: the click's first round trip
 * decides which variant we are in (consent vs direct). Mounting the takeover first would
 * mean tearing it back down to show the consent sheet — the handoff spec is explicit that
 * in variant B the transit screen is not mounted yet. The first request only touches our
 * own DB (auth + reconcile + consent gate), so this is a short wait, not the vendor's.
 *
 * WHY THE SUCCESS STATE IS HELD FOR 1100ms: `window.location.assign` is instant, so
 * without the hold the "You're in" frame would never be seen and the ring would snap from
 * two-thirds to gone. The hold is the payoff for the wait.
 *
 * TIMERS ARE CLEARED ON UNMOUNT AND ON CANCEL — a cancelled hand-off must never fire a
 * late redirect into the portal.
 */
export function usePortalHandoff(options: UsePortalHandoffOptions = {}): PortalHandoffState {
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [mounted, setMounted] = useState(false);
  const sso = usePartnerDiscountSso();
  const consent = usePartnerDiscountConsent();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelled = useRef(false);

  useEffect(() => setMounted(true), []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const runSso = useCallback(
    (viaConsent: boolean) => {
      cancelled.current = false;
      sso.mutate(undefined, {
        onSuccess: (outcome) => {
          if (cancelled.current) return;
          if (outcome.kind === "consent") {
            setFlow({ kind: "consent", fields: outcome.fields });
            return;
          }
          setFlow({ kind: "transit", phase: "done", consent: viaConsent });
          timers.current.push(
            setTimeout(() => {
              if (!cancelled.current) window.location.assign(outcome.redirectUrl);
            }, 1100)
          );
        },
        onError: (err) => {
          if (cancelled.current) return;
          // Keep the member inside the takeover with a way out, rather than dumping
          // them back to the page with a small red line they may not notice.
          setFlow({ kind: "transit", phase: "error", consent: viaConsent, error: err.message });
        },
      });
      // Show the working takeover as soon as we know we are past the consent branch.
      if (viaConsent) setFlow({ kind: "transit", phase: "working", consent: true });
    },
    [sso]
  );

  // Direct (variant A): the first response either opens the sheet or starts the takeover.
  // While that first request is in flight the CTA shows its own pending state via `busy`.
  const start = useCallback(() => {
    if (sso.isPending || consent.isPending) return;
    setFlow({ kind: "idle" });
    cancelled.current = false;
    sso.mutate(undefined, {
      onSuccess: (outcome) => {
        if (cancelled.current) return;
        if (outcome.kind === "consent") {
          setFlow({ kind: "consent", fields: outcome.fields });
          return;
        }
        setFlow({ kind: "transit", phase: "working", consent: false });
        timers.current.push(
          setTimeout(() => {
            if (cancelled.current) return;
            setFlow({ kind: "transit", phase: "done", consent: false });
            timers.current.push(
              setTimeout(() => {
                if (!cancelled.current) window.location.assign(outcome.redirectUrl);
              }, 1100)
            );
          }, 1650)
        );
      },
      onError: (err) => {
        if (cancelled.current) return;
        setFlow({ kind: "transit", phase: "error", consent: false, error: err.message });
      },
    });
  }, [sso, consent.isPending]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    clearTimers();
    sso.reset();
    consent.reset();
    setFlow({ kind: "idle" });
  }, [clearTimers, sso, consent]);

  const agree = useCallback(() => {
    consent.mutate(undefined, {
      onSuccess: () => runSso(true),
      // Stay on the sheet — consent was not recorded, so nothing may be sent.
      onError: () => undefined,
    });
  }, [consent, runSso]);

  const retry = useCallback(() => {
    clearTimers();
    sso.reset();
    setFlow({ kind: "transit", phase: "working", consent: false });
    runSso(false);
  }, [clearTimers, sso, runSso]);

  let overlay: React.ReactNode = null;
  if (mounted && flow.kind === "consent") {
    overlay = createPortal(
      <PortalConsent
        fields={flow.fields}
        submitting={consent.isPending || sso.isPending}
        errorMessage={consent.error?.message ?? null}
        onAgree={agree}
        onCancel={cancel}
      />,
      document.body
    );
  } else if (mounted && flow.kind === "transit") {
    overlay = createPortal(
      <PortalTransit
        consent={flow.consent}
        phase={flow.phase}
        memberName={options.memberName}
        tierLabel={options.tierLabel}
        accessPct={options.accessPct}
        errorMessage={flow.error}
        onCancel={cancel}
        onRetry={retry}
      />,
      document.body
    );
  }

  return {
    start,
    busy: sso.isPending || flow.kind !== "idle",
    // The takeover owns error display once it is up; only the pre-takeover leg reports inline.
    error: flow.kind === "idle" && sso.error ? sso.error.message : null,
    overlay,
  };
}
