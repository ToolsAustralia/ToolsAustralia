"use client";

import { useCallback, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";

const HOLD_MS = 550;

/** Tap = manual toggle; hold = re-enable Sydney time-based theme and apply current slot. */
export function useThemeToggleWithHold() {
  const { toggleTheme, restoreAutoTheme } = useTheme();
  const longPressFired = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoldTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(() => {
    longPressFired.current = false;
    clearHoldTimer();
    timerRef.current = setTimeout(() => {
      longPressFired.current = true;
      restoreAutoTheme();
    }, HOLD_MS);
  }, [clearHoldTimer, restoreAutoTheme]);

  const onPointerUp = useCallback(() => {
    clearHoldTimer();
  }, [clearHoldTimer]);

  const onClick = useCallback(() => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    toggleTheme();
  }, [toggleTheme]);

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onPointerLeave: onPointerUp,
    onClick,
  };
}
