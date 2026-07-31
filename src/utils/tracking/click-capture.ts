// src/utils/tracking/click-capture.ts
// One entry point for capturing all click IDs on mount, and one for reading them
// server-side into the resolver's PaidClickSignal[] shape.
import type { PaidClickSignal } from "@/types/attribution";
import { captureTikTokClickId, extractTikTokContext, extractTikTokCapturedAt } from "@/utils/tracking/tiktok-helpers";
import { captureSnapClickId, extractSnapContext } from "@/utils/tracking/snapchat-helpers";
import { persistSyntheticFbcFromUrl, parseFbcCapturedAt, extractFBCFromRequest } from "@/utils/tracking/facebook-helpers";

/** CLIENT: capture every platform's click id on mount. No-op when no param present. */
export function captureClickIds(): void {
  persistSyntheticFbcFromUrl(); // Meta: synthesize _fbc so it survives without the SDK
  captureTikTokClickId();       // TikTok: ta_ttclid + ta_ttclid_ts (middleware writes these too)
  captureSnapClickId();         // Snapchat: ScCid -> _sc_click + _sc_click_ts
}

/** SERVER: read all paid click signals from a NextRequest-like object. */
export function extractClickIdsFromRequest(request: {
  url?: string;
  headers?: Headers;
  cookies?: { get: (name: string) => { value: string } | undefined };
}): PaidClickSignal[] {
  const signals: PaidClickSignal[] = [];

  // Only trust a capture timestamp that came from a real `_fbc` cookie (set by Meta's SDK
  // or persisted at landing). A fbc synthesized from a bare `?fbclid=` at request time
  // carries Date.now(), not a real click time — pass capturedAt:null so the resolver
  // degrades it to utm_only instead of letting a stale click win as a fresh "click". (spec §3.3)
  const fbcCookie = request.cookies?.get("_fbc")?.value;
  const fbc = extractFBCFromRequest(request);
  if (fbc) {
    const capturedAt = fbcCookie ? parseFbcCapturedAt(fbcCookie) : null;
    signals.push({ platform: "meta", clickId: fbc, capturedAt });
  }

  const tt = extractTikTokContext(request);
  if (tt.ttclid) signals.push({ platform: "tiktok", clickId: tt.ttclid, capturedAt: extractTikTokCapturedAt(request) });

  const sc = extractSnapContext(request);
  if (sc.scClickId) signals.push({ platform: "snapchat", clickId: sc.scClickId, capturedAt: sc.capturedAt });

  return signals;
}
