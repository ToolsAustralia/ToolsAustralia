"use client";

import { useEffect, useRef, useState } from "react";
import type { VariantConfig } from "@/models/ab-testing/Variant";

/** Must match the route + the experiment's slugTargets in the admin UI. */
const MEMBERSHIP_THEME_SLUG = "__membership-theme__";
const CACHE_KEY = "ab_membership_theme_v1";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface Resolved {
  forceLight: boolean;
}

interface CacheShape extends Resolved {
  timestamp: number;
}

function readCache(): Resolved | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return { forceLight: !!parsed.forceLight };
  } catch {
    return null;
  }
}

function writeCache(value: Resolved): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CacheShape = { ...value, timestamp: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / serialization errors
  }
}

/**
 * Resolves whether the membership section should be forced to light mode for
 * the current visitor under the site-wide membership dark-mode A/B test.
 * Returns { forceLight: false } unless the visitor is bucketed into a
 * treatment variant whose config has membershipTheme.forceLight === true.
 */
export function useMembershipThemeExperiment(): Resolved {
  const [forceLight, setForceLight] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const cached = readCache();
    if (cached) {
      setForceLight(cached.forceLight);
      return;
    }

    let aborted = false;
    const controller = new AbortController();

    (async () => {
      try {
        const discRes = await fetch(
          "/api/ab-testing/membership-theme-experiment",
          { signal: controller.signal },
        );
        if (!discRes.ok) return;
        const { experimentId } = (await discRes.json()) as {
          experimentId: string | null;
        };
        if (!experimentId) {
          writeCache({ forceLight: false });
          return;
        }

        const assignRes = await fetch("/api/ab-testing/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experimentId, slug: MEMBERSHIP_THEME_SLUG }),
          signal: controller.signal,
        });
        if (!assignRes.ok) return;
        const data = (await assignRes.json()) as {
          variantConfig: VariantConfig | null;
        };
        const resolved: Resolved = {
          forceLight: data.variantConfig?.membershipTheme?.forceLight === true,
        };
        writeCache(resolved);
        if (!aborted) setForceLight(resolved.forceLight);
      } catch {
        // Network/abort -> keep today's behavior (forceLight stays false).
      }
    })();

    return () => {
      aborted = true;
      controller.abort();
    };
  }, []);

  return { forceLight };
}
