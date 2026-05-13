"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";

// Client-Component wrapper for <SpeedInsights>.
//
// Why this file exists: Vercel's <SpeedInsights> is a Client Component (see
// node_modules/@vercel/speed-insights/dist/next/index.mjs line 1, "use client").
// The root layout at src/app/layout.tsx is a Server Component. React serializes
// props across the RSC boundary and rejects function values — so a beforeSend
// callback passed directly from the layout fails at RUNTIME with
// "Functions cannot be passed directly to Client Components".
// Keeping the beforeSend literal inside this file (which itself begins with
// "use client") keeps the function on the client side of the boundary.
//
// See docs/superpowers/plans/2026-05-13-speed-insights-best-practice.md
// Standing Rule R7 for the project-wide policy.

export function SpeedInsightsClient() {
  return (
    <SpeedInsights
      sampleRate={1}
      beforeSend={(data) => {
        try {
          const pathname = new URL(data.url).pathname;
          return pathname.startsWith("/admin") ? null : data;
        } catch {
          return data;
        }
      }}
    />
  );
}
