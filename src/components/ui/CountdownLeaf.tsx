"use client";
import { type ReactNode } from "react";
import { useLeafTimer } from "@/hooks/useLeafTimer";

export interface CountdownLeafProps {
  targetMs: number;
  intervalMs?: number;
  children: (msRemaining: number) => ReactNode;
}

export function CountdownLeaf({
  targetMs,
  intervalMs = 1000,
  children,
}: CountdownLeafProps) {
  const now = useLeafTimer(intervalMs);
  return <>{children(targetMs - now)}</>;
}
