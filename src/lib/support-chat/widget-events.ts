/**
 * widget-events.ts
 *
 * Cross-component contract for opening the Cobber support-chat panel.
 *
 * The floating widget (SupportChatWidget) owns the panel's open state and listens
 * for this `window` CustomEvent; any surface can open the panel by calling
 * `openSupportChat()` without importing the widget. Mirrors the site's
 * `openMembershipModal` CustomEvent convention (see useOpenMembershipModalListener).
 *
 * Used by the dashboard "Ask Cobber" card (SupportSheet), which is the dashboard's
 * canonical entry point — the floating bubble is suppressed on `/my-account` so the
 * card is the single Cobber affordance there.
 */

/** The window event name the support-chat widget listens for to open its panel. */
export const OPEN_SUPPORT_CHAT_EVENT = "openSupportChat";

/** Open the Cobber support-chat panel from anywhere. No-op on the server. */
export function openSupportChat(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_SUPPORT_CHAT_EVENT));
}
