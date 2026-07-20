"use client";

import Image from "next/image";
import { Z_INDEX } from "@/constants/z-index";
import { useDodgeFloatingObstacles } from "./useDodgeFloatingObstacles";
import { useCobberAccentVars, COBBER_AVATAR, COBBER_ALT } from "./cobberAccent";

/**
 * ChatBubbleButton — the always-loaded Cobber launcher.
 *
 * Split out of SupportChatWidget (perf Tier-2) so the heavy panel chunk
 * (react-markdown + AI SDK + hCaptcha) only downloads on the FIRST click. This button
 * is deliberately dumb: it holds no chat state and imports no chat machinery — only the
 * accent theme + the floating-obstacle dodge, both leaf modules.
 *
 * It is VISUALLY IDENTICAL to the widget's former inline launcher: same corner dock,
 * w-14/h-14 accent-gradient disc, cobber avatar, and the lift-above-floating-obstacle
 * behaviour on /promotions. Shows the close (✕) glyph while the panel is open.
 */
interface ChatBubbleButtonProps {
  /** Which corner to dock to. "left" on /promotions (bottom-right is taken there). */
  side: "left" | "right";
  /** Whether the panel is currently open (drives the ✕ glyph + aria-label). */
  open: boolean;
  /** Toggle the panel open/closed. */
  onToggle: () => void;
}

export default function ChatBubbleButton({ side, open, onToggle }: ChatBubbleButtonProps) {
  // Horizontal dock — same inset on either side so the bubble/panel line up.
  const sideClass = side === "left" ? "left-5" : "right-5";
  const accentVars = useCobberAccentVars();

  // Collision-aware placement: lift above any bottom-anchored floating element
  // (draw countdown banner, "get entries" bar, upsell gift) that would overlap the
  // launcher's corner. Only while CLOSED — an open panel (z-9000) already covers those
  // obstacles (z ≤ 50). This launcher renders only OFF /my-account (the mount suppresses
  // it on the dashboard), so the old `!onDashboard` guard is implicit.
  const dodgeBottom = useDodgeFloatingObstacles(side, !open);

  return (
    <button
      onClick={onToggle}
      aria-label={open ? "Close chat" : "Open AI support chat"}
      className={`fixed bottom-5 ${sideClass} w-14 h-14 rounded-full text-[var(--cob-acc-ink)] shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[var(--cob-acc)] focus:ring-offset-2`}
      style={{
        zIndex: Z_INDEX.MODAL_BASE - 1000,
        background: "linear-gradient(180deg, var(--cob-acc), var(--cob-acc-deep))",
        ...accentVars,
        // Lift above a colliding bottom floater (0 = keep the default bottom-5).
        // `transition-all` animates the move, so it slides rather than jumps.
        ...(dodgeBottom > 0 ? { bottom: `${dodgeBottom}px` } : {}),
      }}
    >
      {open ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      ) : (
        <div className="w-full h-full rounded-full overflow-hidden ring-2 ring-white/30">
          <Image
            src={COBBER_AVATAR}
            alt={COBBER_ALT}
            width={56}
            height={56}
            className="w-full h-full object-cover"
          />
        </div>
      )}
    </button>
  );
}
