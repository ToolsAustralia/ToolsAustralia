"use client";

import PortalTransit from "@/components/sections/rewards/PortalTransit";

/**
 * Renders the real hand-off takeover, parked on `working`.
 *
 * It never advances to `done` on its own: the tab is re-pointed at the offer by the opener
 * once the session is warm, so "done" here would be a claim this page cannot verify. Parking
 * on `working` is the same honesty rule PortalTransit already applies to its own step timer.
 *
 * NO MEMBER DETAILS. PortalTransit renders its footer without them, and putting a name or
 * tier in a URL to reach this tab would leak PII into history and the referrer for a screen
 * that lives ~2 seconds. The identity proof belongs on the in-page hand-off, which has the
 * member context already.
 */
export default function PortalTransitStandalone() {
  return (
    <PortalTransit
      phase="working"
      // The member opened this from a tab we control; closing it returns them to the
      // catalogue exactly where they left it. `window.close()` is permitted here because
      // this window was script-opened.
      onCancel={() => window.close()}
    />
  );
}
