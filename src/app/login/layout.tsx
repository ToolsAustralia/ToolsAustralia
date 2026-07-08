import type { ReactNode } from "react";
import SupportChatWidgetMount from "@/components/support-chat/SupportChatWidgetMount";

/**
 * Login route layout.
 *
 * `/login` lives OUTSIDE the `(site)` route group, so it doesn't inherit
 * `(site)/layout.tsx`'s Cobber support-chat mount. Auth pages are exactly where a
 * stuck (signed-out) user needs help — "how do I log in", "I forgot my password" —
 * so we mount the widget here. The visitor is anonymous, so Cobber answers from the
 * free FAQ deflection (login/forgot-password = FAQ id 32) and, when guest generative
 * is enabled, the LLM. Mounted via the client wrapper (it handles `ssr: false`), so a
 * server-component layout is fine — same pattern as `(site)/layout.tsx`.
 */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SupportChatWidgetMount />
    </>
  );
}
