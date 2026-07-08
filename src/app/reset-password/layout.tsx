import type { ReactNode } from "react";
import SupportChatWidgetMount from "@/components/support-chat/SupportChatWidgetMount";

/**
 * Reset-password route layout.
 *
 * Like `/login`, `/reset-password` lives OUTSIDE the `(site)` route group, so it
 * doesn't inherit the Cobber support-chat mount. A user resetting their password is
 * signed out and mid-recovery — the same "how does this work / I'm stuck" moment as
 * `/login` — so Cobber is mounted here too (kept in lockstep with `login/layout.tsx`).
 * The visitor is anonymous → free FAQ deflection (forgot-password = id 32) + guest LLM
 * when enabled. Server-component layout is fine (the wrapper handles `ssr: false`).
 */
export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SupportChatWidgetMount />
    </>
  );
}
