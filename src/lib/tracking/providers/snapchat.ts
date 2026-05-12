// src/lib/tracking/providers/snapchat.ts
// Isomorphic — see the matching comment in ./facebook.ts. NO "use client".

import type { CanonicalEvent, ConversionProvider } from "../types";
import { hashPII } from "../canonical-event";
import { getAllowedHostnames } from "../hostname-gate";

interface SnapchatGlobal {
  (command: string, eventNameOrParams?: string | Record<string, unknown>, params?: Record<string, unknown>): void;
  queue?: unknown[];
}

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

function loadPixel(opts: { nonce?: string; advancedMatching?: Record<string, string> }): void {
  if (typeof window === "undefined") return;
  if (window._snaptrInit) return;
  const pixelId = process.env.NEXT_PUBLIC_SNAPCHAT_PIXEL_ID;
  if (!pixelId) return;
  if (!getAllowedHostnames().includes(window.location.hostname)) return;

  // Snapchat's standard inline pixel init (see snap.com/business/snap-pixel docs).
  const script = document.createElement("script");
  if (opts.nonce) script.setAttribute("nonce", opts.nonce);
  script.innerHTML = `
    (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?
    a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';
    r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];
    u.parentNode.insertBefore(r,u);})(window,document,'https://sc-static.net/scevent.min.js');
    window.snaptr('init', '${pixelId}');
    window.snaptr('track', 'PAGE_VIEW');
  `;
  document.head.appendChild(script);
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
