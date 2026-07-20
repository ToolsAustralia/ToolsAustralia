"use client";

import nextDynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ChatBubbleButton from "./ChatBubbleButton";
import { OPEN_SUPPORT_CHAT_EVENT } from "@/lib/support-chat/widget-events";

/**
 * Client-side mount for the Cobber support chat.
 *
 * First-click split (perf Tier-2):
 * - The LAUNCHER (ChatBubbleButton) is EAGER — a dumb button with no chat machinery, so
 *   every page keeps its bubble without downloading react-markdown / the AI SDK.
 * - The PANEL (SupportChatWidget: react-markdown + AI SDK + hCaptcha) is LAZY — it
 *   `next/dynamic`-imports on the FIRST open and stays mounted after, so chat state
 *   persists across close/reopen exactly like the always-mounted version did.
 *
 * Open paths — both must lazy-mount AND open (they funnel through `setOpen(true)`,
 * which trips the render-phase `hasOpened` latch that keeps the panel mounted):
 *   1. Clicking the bubble (onToggle).
 *   2. OPEN_SUPPORT_CHAT_EVENT — the dashboard "Ask Cobber" card (SupportSheet) and any
 *      future `openSupportChat()` caller. The bubble is suppressed on /my-account, so
 *      the event is the only entry point there.
 *
 * `next/dynamic(..., { ssr: false })` is only allowed inside a Client Component (Next.js
 * App Router forbids it in Server Components). The site layout is a Server Component, so
 * it imports THIS wrapper (a normal import). The panel is browser-only (localStorage,
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

  // Panel open state lives HERE (eager) so the launcher can toggle it without the
  // heavy panel chunk being present. `hasOpened` latches on the first open and keeps
  // the lazy panel mounted thereafter (so chat state survives close/reopen).
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  if (open && !hasOpened) setHasOpened(true); // render-phase latch (same-component setState is safe)

  const pathname = usePathname();
  // On /my-account the dashboard "Ask Cobber" card is the canonical Cobber entry point,
  // so the floating bubble is suppressed there (no duplicate affordance); the panel
  // still opens via OPEN_SUPPORT_CHAT_EVENT.
  const onDashboard = pathname?.startsWith("/my-account") ?? false;

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

  // Programmatic opens must ALSO trip the lazy mount — mirror the widget's old in-panel
  // listener here so it fires BEFORE the panel chunk exists (e.g. the dashboard card,
  // where the launcher is suppressed).
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_SUPPORT_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_SUPPORT_CHAT_EVENT, handler);
  }, []);

  if (enabled !== true) return null;

  return (
    <>
      {!onDashboard && (
        <ChatBubbleButton
          side={side}
          open={open}
          onToggle={() => setOpen((v) => !v)}
        />
      )}
      {hasOpened && (
        <SupportChatWidget side={side} open={open} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
