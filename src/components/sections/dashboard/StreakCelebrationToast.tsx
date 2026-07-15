"use client";

import { useEffect, useState } from "react";
import { Flame, X } from "lucide-react";

interface StreakCelebrationToastProps {
  entries: number;
  /** Absolute streak level the reward fired at. */
  level: number;
  /** The draw that received the free entries. */
  drawName: string;
}

/**
 * Membership Streak celebration toast — a toast, NOT a modal (decided, spec
 * §7b M2: the dashboard already stacks modals at load). Non-blocking, silent,
 * auto-hides; the in-card banner carries the same message for the session.
 * Visibility is SELF-managed (auto-hide + the X only hide the toast) so
 * dismissing it never clears the shared `justHit` state that keeps the in-card
 * banner alive — and the run-once timer can't be restarted by parent re-renders.
 * Design: Build Kit §06 (surface card, streak-gold border, flame icon).
 */
export default function StreakCelebrationToast({ entries, level, drawName }: StreakCelebrationToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-4 z-[70] mx-auto flex max-w-[420px] items-start gap-2 rounded-[10px] border border-[#d97706] bg-surface px-3.5 py-3 text-[12.5px] leading-[1.5] text-primary-token shadow-[0_8px_24px_-8px_rgba(217,119,6,.4)] motion-safe:animate-[ta-streak-toast_.5s_cubic-bezier(.3,1.15,.35,1)_both] dark:text-white"
    >
      <Flame className="mt-[1px] h-4 w-4 shrink-0 text-[#d97706]" />
      <div className="min-w-0 flex-1">
        <b className="text-[#b45309] dark:text-amber-400">+{entries.toLocaleString()} free entries</b> — Lv.{level} milestone. Added to the {drawName}.{" "}
        <span className="opacity-70">No claiming — they&rsquo;re in.</span>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 text-muted-token transition-colors hover:text-primary-token focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
