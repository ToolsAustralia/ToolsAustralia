"use client";

import { useSyncExternalStore } from "react";

const LG_QUERY = "(min-width: 1024px)";

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(LG_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * True when viewport is Tailwind `lg` and up (≥1024px). Use for desktop-only layout/behavior.
 */
export function useIsLgUp(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
