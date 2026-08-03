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
import {
  markPartnerPortalHandoff,
  warmPartnerPortalSession,
} from "@/utils/partner-discounts/portal-offer-url";

/**
 * Painted into the pre-opened tab while the session warms.
 *
 * The tab has to be opened during the click gesture (popup blockers), but the destination is
 * not known for another second or two. Without this the member stares at `about:blank`, which
 * reads as a broken pop-up. `about:blank` inherits our origin, so this is same-origin markup,
 * not the vendor's — and it is a fixed string with nothing interpolated into it.
 */
const OPENING_TAB_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening your offer…</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c0f;color:#fff;
       font:600 15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center}
  .w{max-width:22rem;padding:2rem}
  .r{width:38px;height:38px;margin:0 auto 1.1rem;border-radius:50%;
     border:3px solid rgba(255,255,255,.18);border-top-color:#ee0000;animation:s .9s linear infinite}
  p{margin:.35rem 0;opacity:.72;font-size:13px;font-weight:500}
  strong{font-size:16px;font-weight:800}
  @keyframes s{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.r{animation:none;border-top-color:#ee0000}}
</style></head><body><div class="w">
<div class="r"></div><strong>Opening your offer</strong>
<p>Signing you in to the partner portal…</p></div></body></html>`;

export interface PortalHandoffState {
  /** Start the hand-off. Wire this to the "Open partner portal" CTA. */
  start: () => void;
  /**
   * Open a SPECIFIC offer, warming the portal session invisibly first.
   *
   * One tap: the session is established in a hidden iframe (no visible portal page), then the
   * pre-opened tab goes straight to the offer. Falls back to landing on the portal home — the
   * two-tap shape — when the iframe cannot warm the session.
   */
  startForOffer: (offerUrl: string) => void;
  /** True while a `startForOffer` is warming, so the tapped card can show a pending state. */
  warming: boolean;
  /**
   * The iframe warm-up failed and the member was dropped on the portal home instead, so the
   * catalogue should tell them to tap again. False on the happy path — where there is nothing
   * to explain, because they simply landed on the offer.
   */
  fellBackToPortalHome: boolean;
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
  const [warming, setWarming] = useState(false);
  const [fellBack, setFellBack] = useState(false);
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
  /**
   * Latest options, read at call time. Callers pass an object literal, so depending on
   * `options` directly would rebuild every callback on every render of every CTA — and
   * depending on nothing would capture a stale `onHandedOff`. A ref is the honest middle.
   */
  const optionsRef = useRef(options);
  optionsRef.current = options;

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
          optionsRef.current.onHandedOff?.();
          return;
        } catch {
          // Fall through to same-tab navigation below.
        }
      }
      window.location.assign(redirectUrl);
    },
    // Reads `onHandedOff` through `optionsRef`, so it is genuinely dependency-free.
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
    if (optionsRef.current.openInNewTab) {
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
    // `openInNewTab` is read through `optionsRef` — see the ref's comment.
  }, [sso, consent.isPending, closePendingTab, completeHandoff]);

  /**
   * ONE-TAP OFFER OPEN.
   *
   *   click ─┬─ open a tab NOW (gesture) and paint "Opening your offer…" into it
   *          └─ POST /sso ─┬─ consent → close tab, show sheet (first-ever hand-off only)
   *                        └─ token → hidden iframe warms the session
   *                                     ├─ ok   → tab goes to the OFFER          (one tap)
   *                                     └─ fail → tab goes to the portal home    (two taps)
   *
   * The fallback is not a nicety. The iframe only works because the portal is a subdomain of
   * ours (same-site cookie); anything that breaks that — a browser blocking same-site frames,
   * the vendor moving domain, a CSP regression — must still leave the member able to reach
   * their offer, just with the extra tap.
   */
  const startForOffer = useCallback(
    (offerUrl: string) => {
      if (sso.isPending || consent.isPending || warming) return;
      cancelled.current = false;
      setFellBack(false);

      // MUST be inside the gesture. Paint immediately so the tab is never blank.
      try {
        const tab = window.open("", "_blank");
        if (tab) {
          try {
            tab.document.write(OPENING_TAB_HTML);
            tab.document.close();
          } catch {
            // Leaving it blank is survivable; failing the whole open is not.
          }
        }
        pendingTab.current = tab;
      } catch {
        pendingTab.current = null;
      }

      setWarming(true);
      sso.mutate(undefined, {
        onSuccess: async (outcome) => {
          if (cancelled.current) return setWarming(false);
          if (outcome.kind === "consent") {
            // First-ever hand-off. Consent is a read-and-decide moment; a tab parked behind it
            // looks broken, so close it and fall through to the normal (visible) flow.
            closePendingTab();
            setWarming(false);
            setFlow({ kind: "consent", fields: outcome.fields });
            return;
          }

          const warmed = await warmPartnerPortalSession(outcome.redirectUrl);
          if (cancelled.current) return setWarming(false);

          markPartnerPortalHandoff();
          const tab = pendingTab.current;
          pendingTab.current = null;
          const destination = warmed ? offerUrl : outcome.redirectUrl;
          if (!warmed) setFellBack(true);

          if (tab && !tab.closed) {
            try {
              tab.location.replace(destination);
              tab.opener = null;
            } catch {
              window.location.assign(destination);
            }
          } else {
            // Popup blocked or closed: same-tab navigation. On the warmed path this still
            // lands on the offer, so the member loses their place but not the offer.
            window.location.assign(destination);
          }
          setWarming(false);
          optionsRef.current.onHandedOff?.();
        },
        onError: (err) => {
          if (cancelled.current) return;
          closePendingTab();
          setWarming(false);
          setFlow({ kind: "transit", phase: "error", consent: false, error: err.message });
        },
      });
    },
    [sso, consent.isPending, warming, closePendingTab]
  );

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
    startForOffer,
    warming,
    fellBackToPortalHome: fellBack,
    busy: sso.isPending || warming || flow.kind !== "idle",
    // The takeover owns error display once it is up; only the pre-takeover leg reports inline.
    error: flow.kind === "idle" && sso.error ? sso.error.message : null,
    overlay,
  };
}
