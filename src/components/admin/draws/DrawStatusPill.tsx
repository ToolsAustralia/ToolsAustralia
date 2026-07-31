"use client";

import React from "react";
import { cn } from "@/utils/cn";
import type { DrawStatus } from "./types";

/**
 * 21px status pill. Active = green, Queued = amber, Completed = neutral
 * (design spec), with Frozen mapped to info and Cancelled to danger so all five
 * MajorDraw statuses render — the design only names three because its sample
 * data only contains three.
 */
const TONE: Record<DrawStatus, string> = {
  active: "bg-[var(--ok-bg)] text-[var(--ok)] border-[var(--ok-line)]",
  queued: "bg-[var(--warn-bg)] text-[var(--warn)] border-[var(--warn-line)]",
  completed: "bg-[var(--panel2)] text-[var(--text2)] border-[var(--line)]",
  frozen: "bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-line)]",
  cancelled: "bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-line)]",
};

const LABEL: Record<DrawStatus, string> = {
  active: "Active",
  queued: "Queued",
  completed: "Completed",
  frozen: "Frozen",
  cancelled: "Cancelled",
};

export default function DrawStatusPill({
  status,
  className,
}: {
  status: DrawStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[21px] items-center rounded-full border px-2",
        "text-[10.5px] font-semibold leading-none tracking-[.02em] whitespace-nowrap",
        TONE[status],
        className
      )}
    >
      {LABEL[status]}
    </span>
  );
}
