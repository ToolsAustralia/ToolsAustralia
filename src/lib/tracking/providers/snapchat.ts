// src/lib/tracking/providers/snapchat.ts
// Isomorphic — see the matching comment in ./facebook.ts. NO "use client".

import type { CanonicalEvent, ConversionProvider } from "../types";
import { hashPII } from "../canonical-event";
import { getAllowedHostnames } from "../hostname-gate";
import { shouldTrackRoute } from "@/utils/tracking/should-track-route";

interface SnapchatGlobal {
  (command: string, eventNameOrParams?: string | Record<string, unknown>, params?: Record<string, unknown>): void;
  queue?: unknown[];
  /** Installed by scevent.min.js on load; absent while the stub is queueing. */
  handleRequest?: (...args: unknown[]) => void;
}

/** Pre-SDK stub with the queue guaranteed present (assigned right after creation). */
type SnaptrStub = SnapchatGlobal & { queue: IArguments[] };

declare global {
  interface Window {
    snaptr?: SnapchatGlobal;
    _snaptrInit?: boolean;
  }
}

function envEnabled(): { pixel: boolean; capi: boolean } {
  return {
    pixel: !!process.env.NEXT_PUBLIC_SNAPCHAT_PIXEL_ID,
    capi: !!process.env.SNAPCHAT_ACCESS_TOKEN,
  };
}

function loadPixel(): void {
  if (typeof window === "undefined") return;
  if (window._snaptrInit) return;
  const pixelId = process.env.NEXT_PUBLIC_SNAPCHAT_PIXEL_ID;
  if (!pixelId) return;
  if (!getAllowedHostnames().includes(window.location.hostname)) return;

  // Skip initial PAGE_VIEW on excluded routes (admin / my-account / affiliate / etc.)
  const firePageView = shouldTrackRoute(window.location.pathname);

  // Imperative transcription of Snapchat's standard inline pixel init (see
  // snap.com/business/snap-pixel docs). Written as real TS so the provider
  // injects ZERO inline script text — inline pixel bootstraps are unhashable
  // (env interpolation) and would require a CSP nonce, which would keep the
  // root layout dynamic. See docs/tracking/gotchas.md.
  // Same as the original stub: if window.snaptr already exists, skip stub
  // creation + SDK injection — the original IIFE returned early too, while the
  // init/PAGE_VIEW calls below still ran.
  if (!window.snaptr) {
    const stub = function (this: unknown) {
      if (stub.handleRequest) {
        // Method-call spread keeps `this === stub`, same as the stub's .apply(a, arguments).
        // eslint-disable-next-line prefer-rest-params
        stub.handleRequest(...(Array.prototype.slice.call(arguments) as unknown[]));
      } else {
        // eslint-disable-next-line prefer-rest-params
        stub.queue.push(arguments);
      }
    } as unknown as SnaptrStub;
    window.snaptr = stub;
    stub.queue = [];
    // SDK loader is a src-script (scevent.min.js), matching the original stub's
    // injected tag — inserted before the first <script>, exactly like the stub.
    const sdk = document.createElement("script");
    sdk.async = true;
    sdk.src = "https://sc-static.net/scevent.min.js";
    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(sdk, firstScript);
    } else {
      document.head.appendChild(sdk);
    }
  }
  window.snaptr("init", pixelId);
  if (firePageView) window.snaptr("track", "PAGE_VIEW");
  window._snaptrInit = true;
}

function pixelTrack(event: CanonicalEvent): void {
  if (typeof window === "undefined" || !window.snaptr) return;
  if (!getAllowedHostnames().includes(window.location.hostname)) return;
  if (!process.env.NEXT_PUBLIC_SNAPCHAT_PIXEL_ID) return;

  const params: Record<string, unknown> = {};
  if (event.value !== undefined) params.price = event.value;
  if (event.currency) params.currency = event.currency;
  if (event.customData?.contentIds) params.item_ids = event.customData.contentIds;
  if (event.customData?.contentCategory) params.item_category = event.customData.contentCategory;
  if (event.customData?.numItems !== undefined) params.number_items = event.customData.numItems;
  if (event.customData?.orderId) params.transaction_id = event.customData.orderId;
  if (event.userData?.email) params.user_email = hashPII(event.userData.email);
  if (event.providerData?.snapchat) Object.assign(params, event.providerData.snapchat);
  // Snapchat dedup: client_dedup_id matches CAPI's client_dedup_id (spec §3 invariant #1).
  params.client_dedup_id = event.eventId;

  // Snap event names use SCREAMING_SNAKE_CASE: "Purchase" → "PURCHASE", "ViewContent" → "VIEW_CONTENT".
  // Apply the camelCase→snake_case regex BEFORE uppercasing, otherwise we'd insert underscores
  // between every letter of an already-uppercased word (e.g. "PURCHASE" → "P_U_R_C_H_A_S_E").
  const snapEventName = event.eventName
    .replace(/([A-Z])/g, (_m, c, i) => (i === 0 ? c : `_${c}`))
    .toUpperCase();
  window.snaptr("track", snapEventName, params);
}

async function capiSend(_event: CanonicalEvent): Promise<boolean> {
  // STUB. Real Snapchat Conversions API integration lands in follow-up spec.
  return false;
}

export const snapchatProvider: ConversionProvider = {
  id: "snapchat",
  enabled: envEnabled,
  productionHostnames: getAllowedHostnames,
  loadPixel,
  pixelTrack,
  capiSend,
};
