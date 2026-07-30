"use client";

import React from "react";
import { cn } from "@/utils/cn";

/**
 * The frame every admin draws page mounts inside.
 *
 * Thin by design, but load-bearing: this is the element that carries the
 * `.admin-draws` class, which is the SCOPE BOUNDARY for the design tokens in
 * tokens.css. Render a draws page outside this and every `var(--panel)` /
 * `var(--m-btn-h)` resolves to nothing.
 *
 * It does not own the outer chrome — the 280px sidebar, mobile drawer, top bar
 * and scroll container already live in AdminPage.tsx and are shared with 25
 * other tabs. This only owns the padding/gap rhythm inside the content area.
 */
export default function DrawsPageShell({
  notice,
  children,
  className,
}: {
  /** Optional strip above the content (e.g. the Mini Draws at-capacity warning). */
  notice?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // -m-4 draws:-m-6 cancels AdminPage's own p-4/lg:p-6 so --m-pad is the
        // single source of padding truth for these pages, per the design's
        // 20px/14px spec. Without this the two paddings stack.
        "admin-draws -m-4 lg:-m-6 flex flex-col bg-[var(--bg)] text-[var(--text)]",
        "p-[var(--m-pad)] gap-[var(--m-gap)] min-h-full",
        className
      )}
    >
      {notice}
      {children}
    </div>
  );
}
