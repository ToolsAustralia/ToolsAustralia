/**
 * Hook for managing view mode state
 */

import { useState, useCallback } from "react";

export type ViewMode = "table" | "chart" | "side-by-side";

export function useViewMode(initialMode: ViewMode = "table") {
  const [viewMode, setViewMode] = useState<ViewMode>(initialMode);

  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  return {
    viewMode,
    changeViewMode,
  };
}

