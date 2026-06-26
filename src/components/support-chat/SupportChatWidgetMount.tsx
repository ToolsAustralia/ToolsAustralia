"use client";

import nextDynamic from "next/dynamic";

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
  return <SupportChatWidget side={side} />;
}
