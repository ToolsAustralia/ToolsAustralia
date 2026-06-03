# Advertising card — True ROAS from payment attribution

**Date:** 2026-06-02
**Branch:** feature/admin-dashboard-revamp
**Status:** Design — awaiting review
**Scope:** Frontend-only. One file: `src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx`. Domain: `admin` (docs update required in `docs/admin/`).

## Problem

The Overview "Advertising" card shows **Meta's pixel-reported** numbers: it reads
`stats.facebookAds.{spend,roas}` and *fabricates* revenue as `spend × pixelRoas`
([AdvertisingPlatformCard.tsx:57-60](../../../src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx#L57-L60)).
TikTok, Snapchat, Klaviyo Email, and Klaviyo SMS are hardcoded "Coming soon" rows.

We already tag every `PaymentEvent` with the channel it came from (`convertingPlatform`:
`meta | tiktok | snapchat | klaviyo_email | klaviyo_sms | google | direct | other`),
derived from fbclid / ttclid / Klaviyo email+SMS tracking. We want the card to show
**true ROAS** — our server-side attributed revenue ÷ ad spend — not Meta's self-reported figure.

## Key constraint (verified)

- **Attributed revenue exists for every channel** (from tagged payments).
- **Ad spend exists only for Meta** today. TikTok/Snapchat insight models exist but nothing
  syncs into them yet ([adChannelProviders.ts:70](../../../src/services/admin/dashboard-stats/adChannelProviders.ts#L70)).
- **Klaviyo is an owned channel** — a flat monthly subscription, not per-send spend — so ROAS
  does not apply to it. Revenue only.

## The backend already does the join

No backend work is needed. `src/app/api/admin/dashboard/stats/route.ts` already computes and ships
`attributedRevenue[platform]` ([route.ts:239-265](../../../src/app/api/admin/dashboard/stats/route.ts#L239-L265)),
typed at [useAdminQueries.ts:131-140](../../../src/hooks/queries/useAdminQueries.ts#L131-L140):

```ts
attributedRevenue?: Record<string, {
  revenue: number;            // acquisition (new-customer) revenue — the ROAS numerator; renewals excluded
  renewalRevenue: number;     // excluded from ROAS
  conversions: number;        // count of new (non-renewal) attributed purchases
  byConfidence: { click: number; utm_only: number; inferred_backfill: number }; // partitions `revenue`
  adSpend?: number;           // present ONLY when ad-channel spend > 0 (Meta today)
  trueRoas?: number;          // present ONLY when adSpend present  (= revenue / adSpend)
  revenueTrend?: TrendData;
  trueRoasTrend?: TrendData;
}>;
```

- `PLATFORM_TO_AD_CHANNEL_KEY` maps `klaviyo_email`/`klaviyo_sms` → `null` = "revenue only, no ROAS"
  ([snapshotSchema.ts:34-43](../../../src/services/admin/dashboard-stats/snapshotSchema.ts#L34-L43)).
- A platform key is **absent** from the map when it had zero revenue/conversions/renewals in the
  period ([route.ts:251](../../../src/app/api/admin/dashboard/stats/route.ts#L251)). The card must
  default a missing key to zero.

**Out of scope (do not touch):** the dedicated Facebook Ads / TikTok / Snapchat management tabs and
the `facebook-ads-health/**` views. Those display Meta's own data and stay exactly as-is. This change
is only the Overview "Advertising" card.

## Design

The card stops reading `stats.facebookAds` for revenue/ROAS and instead renders one row per channel
from `stats.attributedRevenue`. Spend still comes from the ads API (surfaced as `adSpend` in the payload).

### Row model

Replace the hardcoded `rows` array with a static per-row config that carries platform identity, then
read live values from `attributedRevenue[key]`:

```ts
const ROWS = [
  { key: "meta",          label: "Facebook Ads", logo: "facebook", kind: "paid"  },
  { key: "tiktok",        label: "TikTok Ads",   logo: "tiktok",   kind: "paid"  },
  { key: "snapchat",      label: "Snapchat Ads", logo: "snapchat", kind: "paid"  },
  { key: "klaviyo_email", label: "Klaviyo Email",logo: "klaviyo",  kind: "owned" },
  { key: "klaviyo_sms",   label: "Klaviyo SMS",  logo: "klaviyo",  kind: "owned" },
] as const;
```

(Row labels are kept as today to minimize churn.)

### Three presentation classes

The class is decided by `kind` plus whether `adSpend` is present in the payload — **not** by hardcoded
flags. This means a channel auto-promotes from "Needs spend" to a real ROAS the day its spend starts
syncing, with no code change.

| Class | When | Spend cell | Revenue cell | ROAS cell |
|-------|------|-----------|--------------|-----------|
| **1. Paid + spend** | `kind==="paid"` and `adSpend != null` | `fmtCompact(adSpend)` | revenue + conversions + tooltip | `trueRoas.toFixed(2)+"x"` (green ≥3, else amber) |
| **2. Paid, spend pending** | `kind==="paid"` and `adSpend == null` | "Awaiting sync" (muted amber) | revenue + conversions + tooltip | "Needs spend" (muted) |
| **3. Owned** | `kind==="owned"` | "—" (muted) | revenue + conversions + tooltip | "—" (muted) |

Today: Meta → class 1; TikTok/Snapchat → class 2; Klaviyo Email/SMS → class 3.

### Revenue cell (all classes)

- **Primary:** `fmtCompact(revenue)`.
- **Secondary (subtle):** `{conversions} new` beneath the figure (e.g. `142 new`).
- **Confidence tooltip (hover):** native `title` attribute, multi-line, computed from `byConfidence`
  as a share of `revenue`:
  `"88% click-verified · 9% UTM-only · 3% backfilled"`.
  Guard divide-by-zero: when `revenue === 0`, omit the tooltip (or `"No attributed revenue"`).
  Implementation: native `title` (no new component). May be upgraded to a styled hover-popover later.

### Header

- **Blended ROAS** = `Σ revenue ÷ Σ adSpend` over rows where `kind==="paid" && adSpend != null && adSpend > 0`.
  Today that is Meta only; when TikTok/Snapchat spend syncs they fold in automatically. If no paid
  channel has spend, render "—" (not `0.00x`).
- **Total attributed revenue** = `Σ revenue` over all displayed rows — shown as a secondary stat
  beside/under Blended ROAS.

### States

- **Loading (no data yet):** keep the existing skeleton (`showSkeleton = loading && !stats`).
- **Background refetch:** keep prior rows (existing behavior).
- **Zero activity in period:** a channel shows `$0` / `0 new`, with spend + ROAS per its class. No
  "Coming soon" string remains anywhere in the card.

## Files

| File | Change |
|------|--------|
| `src/app/admin/component/overview/sections/AdvertisingPlatformCard.tsx` | Rewire data source to `stats.attributedRevenue`; row config + 3 presentation classes; conversions secondary; confidence `title` tooltip; corrected blended ROAS + total-attributed-revenue header. |
| `docs/admin/*` | Update the relevant admin doc (advertising/overview section) to describe the true-ROAS card and the three presentation classes. Required by the doc-sync Stop hook for `src/app/admin/**`. |

No backend, hook, model, or API changes. No new dependencies. No new files (besides this spec + the doc update).

## Verification

- `npm run type-check` and `npm run lint` clean.
- Manual: load Overview with live stats — Meta shows true ROAS (not pixel `spend×roas`); TikTok/Snapchat
  show real revenue with "Awaiting sync"/"Needs spend"; Klaviyo Email/SMS show revenue only with "—"
  for spend/ROAS; blended ROAS = Meta revenue ÷ Meta spend; hover on a revenue figure shows the
  confidence split.
- Edge: a period with zero Klaviyo revenue shows `$0 / 0 new`, not "Coming soon".

## Non-goals / future

- Building TikTok/Snapchat ad-spend sync (would light up their true ROAS — separate effort).
- Campaign-level ROAS (join is platform-level today).
- Revenue/ROAS trend arrows on the card (payload carries `revenueTrend`/`trueRoasTrend`; deferred).
- Styled hover-popover for the confidence breakdown (native `title` is the v1).
