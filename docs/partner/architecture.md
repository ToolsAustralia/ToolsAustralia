# Partner — Architecture

## Discount queue

Active subscribers are enqueued for partner-discount eligibility. The queue tracks:
- Member's eligibility window (subscription period)
- Partner offers they qualify for
- Catalog visibility (which discounts to surface to which members)

When a subscription ends (cancel-immediately or period-end), `handleSubscriptionQueueUpdate(user, "end")` removes from the queue.

## Portal hand-off (SSO) — consent → transit → redirect

```
CTA click
  └─ POST /api/partner-discount/sso
       ├─ 409 consentRequired + fields[]  → PortalConsent sheet
       │     └─ POST /api/partner-discount/consent   (writes User.partnerDiscountConsent)
       │          └─ POST /sso again ──┐
       └─ 200 { redirectUrl } ─────────┴─→ PortalTransit takeover
                                              └─ success state (1100ms)
                                                   └─ window.location.assign(redirectUrl)
```

Route-side order is deliberate: **access gate → consent gate → mint**. Consent sits after
access (no point disclosing to someone who can't go through) and before `generatePortalSso`
(the call that actually transmits PII).

`usePortalHandoff` owns the client half for all four CTAs. The takeover mounts on the
**response**, not the click, because the first round trip is what decides which variant we
are in — mounting first would mean tearing it down again to show the consent sheet. That
first request touches only our own DB (auth + reconcile + consent), not the vendor.

**Known limitation — the three steps are paced, not milestoned.** `POST /sso` is a single
request, so there is nothing per-step to subscribe to. The step index advances on a timer
only up to the last step and parks there; only the real response completes the screen. To
make the labels literally true the route would have to be split into observable milestones
(or stream). Documented rather than faked.

## Helpers

[src/utils/partner-discounts/](../../src/utils/partner-discounts/):
- `partner-discount-queue.ts` — queue management
- `partner-catalog-visibility.ts` — visibility resolution
- `partner-consent.ts` — **single source of truth** for what the SSO hand-off discloses
  (`buildPartnerSsoSharedFields`), the scope version, and the gate (`hasValidPartnerConsent`).
  Disclosure + consent live in one module on purpose: split them and the consent screen
  drifts out of sync with the payload it describes. See [rules R4](rules.md).

## Cross-domain integration

- **[subscription](../subscription/)** — `CancelSubscriptionService` calls `handleSubscriptionQueueUpdate(user, "end")` on immediate cancel ([architecture](../subscription/architecture.md#cancellation-flow), step 2 of side effects).

## Models

| Model | Path |
|---|---|
| `PartnerApplication` | [src/models/PartnerApplication.ts](../../src/models/PartnerApplication.ts) — partner brand applications |
| `PartnerDiscount` | [src/models/PartnerDiscount.ts](../../src/models/PartnerDiscount.ts) — discount offers |

> _TODO: pull schemas._
