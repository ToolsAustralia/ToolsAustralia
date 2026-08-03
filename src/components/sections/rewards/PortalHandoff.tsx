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
import { markPartnerPortalHandoff } from "@/utils/partner-discounts/portal-offer-url";

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
  /**
   * Send the member to the portal in a NEW tab instead of navigating this one.
   *
   * Only the catalogue sets this, and only because of the two-click flow (rules.md R12): the
   * vendor's `/verifytoken/{token}` silently drops every return target we tested, so a
   * hand-off can sign a member in but never onto the offer they clicked. Keeping our tab
   * alive means the catalogue — their filters, scroll position and the offer itself — is
   * still there when they come back, and the second tap deep-links correctly.
   *
   * The other three CTAs ("open the portal") have no offer to preserve, so they keep the
   * simpler same-tab navigation.
   */
  openInNewTab?: boolean;
  /**
   * Fired once the member is actually in the portal. The catalogue uses it to flip its cards
   * from "sign in first" to real deep links without waiting for a remount.
   */
  onHandedOff?: () => void;
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
  /**
   * A tab opened SYNCHRONOUSLY on click, held until the token arrives.
   *
   * This cannot be deferred. The redirect fires ~2.75s after the click (two deliberate holds
   * for the transit animation), by which point the user gesture is long gone and every browser
   * blocks `window.open`. Opening a blank tab during the gesture and re-pointing it later is
   * the only reliable way. `noopener` is NOT passed, because it makes `window.open` return
   * null and we need the handle — so the opener link is severed by hand instead, immediately
   * after navigation.
   */
  const pendingTab = useRef<Window | null>(null);

  const closePendingTab = useCallback(() => {
    try {
      if (pendingTab.current && !pendingTab.current.closed) pendingTab.current.close();
    } catch {
      // Cross-origin or already gone — nothing to do.
    }
    pendingTab.current = null;
  }, []);

  useEffect(() => setMounted(true), []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  /**
   * The single place the member actually crosses into the portal.
   *
   * New-tab mode degrades to same-tab navigation whenever the blank tab is missing — popup
   * blocked, opened and then closed by the member, or the consent detour closed it. That
   * fallback matters: arriving in the wrong tab is a nuisance, not arriving at all is a bug.
   */
  const completeHandoff = useCallback(
    (redirectUrl: string) => {
      // Record the hand-off so the catalogue can safely deep-link offers afterwards. A cold
      // view_smart link does NOT trigger SSO — it dead-ends on a login page with the offer
      // lost (measured; see portal-offer-url.ts).
      markPartnerPortalHandoff();

      const tab = pendingTab.current;
      pendingTab.current = null;
      if (tab && !tab.closed) {
        try {
          tab.location.replace(redirectUrl);
          tab.opener = null;
          setFlow({ kind: "idle" });
          options.onHandedOff?.();
          return;
        } catch {
          // Fall through to same-tab navigation below.
        }
      }
      window.location.assign(redirectUrl);
    },
    // `onHandedOff` is read through the live `options` object, so it does not need to be a dep;
    // adding it would re-create this callback on every render of every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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
              if (!cancelled.current) completeHandoff(outcome.redirectUrl);
            }, 1100)
          );
        },
        onError: (err) => {
          if (cancelled.current) return;
          closePendingTab();
          // Keep the member inside the takeover with a way out, rather than dumping
          // them back to the page with a small red line they may not notice.
          setFlow({ kind: "transit", phase: "error", consent: viaConsent, error: err.message });
        },
      });
      // Show the working takeover as soon as we know we are past the consent branch.
      if (viaConsent) setFlow({ kind: "transit", phase: "working", consent: true });
    },
    [sso, closePendingTab, completeHandoff]
  );

  // Direct (variant A): the first response either opens the sheet or starts the takeover.
  // While that first request is in flight the CTA shows its own pending state via `busy`.
  const start = useCallback(() => {
    if (sso.isPending || consent.isPending) return;
    setFlow({ kind: "idle" });
    cancelled.current = false;

    // MUST happen here, inside the click gesture — see `pendingTab`.
    if (options.openInNewTab) {
      try {
        pendingTab.current = window.open("", "_blank");
      } catch {
        pendingTab.current = null;
      }
    }

    sso.mutate(undefined, {
      onSuccess: (outcome) => {
        if (cancelled.current) return;
        if (outcome.kind === "consent") {
          // First-ever hand-off. The consent sheet is a read-and-decide moment that can take
          // as long as it takes, and a blank tab parked behind it looks broken — so close it
          // and let the consent path finish with a normal same-tab navigation. This costs the
          // catalogue tab exactly once per member, and they are warm from then on.
          closePendingTab();
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
                if (!cancelled.current) completeHandoff(outcome.redirectUrl);
              }, 1100)
            );
          }, 1650)
        );
      },
      onError: (err) => {
        if (cancelled.current) return;
        closePendingTab();
        setFlow({ kind: "transit", phase: "error", consent: false, error: err.message });
      },
    });
    // `options` is read live for openInNewTab; including it would re-create `start` on every
    // render of every caller and defeat the memoisation the CTAs rely on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sso, consent.isPending, closePendingTab, completeHandoff]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    clearTimers();
    // A cancelled hand-off must not leave an orphaned blank tab behind, any more than it may
    // fire a late redirect.
    closePendingTab();
    sso.reset();
    consent.reset();
    setFlow({ kind: "idle" });
  }, [clearTimers, closePendingTab, sso, consent]);

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
