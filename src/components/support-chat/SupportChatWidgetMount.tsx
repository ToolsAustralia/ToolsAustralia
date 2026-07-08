"use client";

import nextDynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * Client-side mount wrapper for the support chat widget.
 *
 * `next/dynamic(..., { ssr: false })` is only allowed inside a Client Component
 * (Next.js App Router forbids it in Server Components). The site layout is a
 * Server Component, so it imports THIS wrapper (a normal import) instead of
 * calling `nextDynamic` directly. The widget is browser-only (uses localStorage,
 * hCaptcha, the AI SDK `useChat`), so `ssr: false` keeps it out of SSR.
 */
const SupportChatWidget = nextDynamic(
  () => import("@/components/support-chat/SupportChatWidget"),
  { ssr: false }
);

/**
 * @param side which corner the bubble docks to. Default "right" (the site-wide
 *   placement). Pass "left" where the bottom-right corner is already occupied —
 *   e.g. the promotions layout (guest theme toggle + account FAB live there).
 */
export default function SupportChatWidgetMount({
  side = "right",
}: {
  side?: "left" | "right";
}) {
  // Availability gate: when Cobber is paused (admin toggle or CHAT_KILL_SWITCH
  // env override), GET /api/chat/config returns { enabled: false } and the whole
  // widget stays unmounted — no bubble anywhere. `null` = not yet known: render
  // nothing until we do, so a paused bot never flashes a bubble. Fail-open: a
  // config-fetch error keeps the bubble (a transient blip shouldn't hide Cobber;
  // the paid path is still blocked server-side).
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setEnabled(json?.data?.enabled !== false);
      })
      .catch(() => {
        if (!cancelled) setEnabled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (enabled !== true) return null;
  return <SupportChatWidget side={side} />;
}
