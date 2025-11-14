"use client";

import { useEffect, useState } from "react";

export default function DevTools() {
  const [DevTools, setDevTools] = useState<React.ComponentType<{ initialIsOpen: boolean }> | null>(null);

  useEffect(() => {
    // Only load DevTools in development
    if (process.env.NODE_ENV === "development") {
      import("@tanstack/react-query-devtools").then((module) => {
        setDevTools(() => module.ReactQueryDevtools);
      });
    }
  }, []);

  // Don't render anything if not in development or DevTools not loaded
  if (process.env.NODE_ENV !== "development" || !DevTools) {
    return null;
  }

  return <DevTools initialIsOpen={false} />;
}
