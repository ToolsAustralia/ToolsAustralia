# Tools Australia

Membership-driven giveaway and rewards platform for Australian tradies. Members buy entries into monthly tool giveaways, unlock tiered partner discounts, and earn bonus entries through upsells and referrals.

> **For AI agents and onboarding:** see [BUSINESS.md](BUSINESS.md) for the full domain model — packages, draw mechanics, payment lifecycle, partner-access tiers, and the rules the platform actually enforces.

---

## Status at a glance

### Live in production

- **Memberships** — three subscription tiers (Tradie / Foreman / Boss) plus one-time tool packs (Apprentice → VIP) and discounted "Additional" packs for users with an active subscription **or** entries in the current major draw.
- **Major Draw** — runs on the **27th of every month** at **8:30 PM AEST/AEDT**, broadcast **live on Facebook**. Entries freeze at **8:00 PM** on the same evening, and new-entry purchases are blocked across the full **8:00 PM (27th) → 12:00 AM (28th)** window — a 30-min freeze (8:00–8:30 PM, draw `frozen`) followed by a ~3h 30min gap (8:30 PM–midnight, previous draw `completed`, next still `queued`) until the next cycle activates at midnight. Purchase APIs return `GATES_CLOSED`; subscription renewals processed anywhere in that 4-hour window route into the next cycle's pool. The winner itself is picked by **[randomdraws.com.au](https://randomdraws.com.au)** (a govt-certified third-party random-draw service) — we export the locked entry list and store the verification URL per winner. One Grand Winner per cycle today.
- **Mini Draws** — per-product draws with no fixed schedule; they trigger once the configured entry threshold is reached.
- **Upsells** — post-purchase offers at 50–60% off, granting 2× the base pack's entries; tracked across membership, one-time, additional, and mini-draw categories.
- **Partner Discounts** — static catalog of **7 partner brands**, gated by membership tier. Higher tiers see more of the catalog (Tradie 50% / Foreman 75% / Boss 100%). A **public `/discount` page** browses the whole 1,833-offer partner catalogue — every offer readable signed out, stacked into bands by the access level each one needs, with the two cheapest routes past the member's limit.
- **Stripe Billing** — Payment Intents for one-time purchases, Subscriptions with **anchor-day-24 billing** so renewals settle before each major draw. New joiners on the 25th/26th/27th are anchored to the 24th; recovered past-due members are reanchored to their recovery-payment date (clamped 25/26/27 → 24).
- **Refund + Past-Due Recovery** — full-refund ledger reversal, collection-pause-on-failure, past-due reanchor on recovery, admin past-due charge tool with strict guardrails (a global 30-minute mutex + 6-hour per-user attempt window). Members can **self-recover a "stranded" (retry-exhausted) renewal invoice** — the pay flow voids the dead invoice and finalizes the held cycle draft instead of dead-ending at a support screen.
- **Affiliate Program** — commissions and recurring backfills, dedicated portal.
- **Referrals** — refer-a-friend flow with `ReferralEvent` tracking.
- **Cancellation / Retention Flow** — pause and discount offers before churn, with analytics.
- **A/B Testing** — first-party framework with metrics and dedup.
- **Tracking** — Meta Pixel + Facebook CAPI server-side, **TikTok Pixel + Events API CAPI server-side**, Snapchat Pixel (client-only), Google Tag Manager, Klaviyo (page tracker + script loader + lifecycle profile feed + abandoned-checkout recovery), UTM persistence. A unified provider registry fans one canonical event to every platform's pixel and CAPI.
- **Email** — SendGrid for transactional (incl. staff invites), Klaviyo for marketing, SMS via Twilio.
- **Admin dashboard** — user management, payments, draws, promos, error reports, partner applications, Stripe webhook queue, daily stats snapshots, an analytics suite (All-Platforms / Facebook / TikTok / Snapchat / Klaviyo, true-ROAS), and **Facebook Ads Health** — a per-adset SCALE/HOLD/INVESTIGATE/CUT verdict engine.
- **Staff roles & permissions (RBAC)** — granular staff access: a 47-permission / 17-area catalog bundled into named roles, `requirePermission()`-gated routes, email-based staff invites (`/staff-setup`), and a `StaffActivity` audit log (180-day TTL). See [docs/auth/roles.md](docs/auth/roles.md).
- **Internal Norm API** — secure HTTP namespace at `/api/internal/norm/v1/*` exposing read-only business analytics to an external AI assistant (Norm) running on the Mac mini server. See [docs/internal-norm/](docs/internal-norm/).
- **Shop** — merchandise catalogue, cart, checkout and Stripe payment at `/shop`. Member tier discount (Tradie 10% / Foreman 15% / Boss 25%) applied at checkout; shipping free on orders of $100 or more, $10 flat below that; GST is inside the total, never added. An account is required to check out. See [docs/cart-shop-products/](docs/cart-shop-products/).

### Coming soon

- **Free entries on merchandise** — the grant path, the product-page badge and the Terms wording are all built and merged, but every product ships at `includedEntries: 0` pending a **trade-promotion permit variation** for a fourth entry method. Nothing renders and nothing is granted at 0; switching it on is an admin edit, not a deploy.
- **Partner Discount API** — partner catalog is currently the curated list of 7 brands. The next milestone replaces this with a database-driven catalog targeting **1,000+ partner brands**, surfaced through a proper API and admin CRUD. The percentage-access tier model is already in place and will scale 1:1.
- **Partner Discount Portal (SSO)** — single sign-on into the external partner-discounts portal ("see every deal, signed in via SSO") is built but held behind the `PARTNER_DISCOUNT_SSO_ENABLED` go-live gate. The dashboard hero and Rewards page show a *Coming soon* partner-portal entry until it's cleared to launch; the in-app 7-brand catalog stays the live surface meanwhile. Its companion **member-status API** (`GET /api/partner-discount/member-status` — the portal vendor's live read of a member's access at sign-in / page load / redemption) is likewise built and held behind `IGODIRECT_MEMBER_STATUS_ENABLED`.
- **Snapchat ad-spend sync** — both TikTok and Snapchat admin tabs show server-side **attributed revenue** (hour-of-day). Meta and **TikTok** ad-spend are now wired — TikTok both hour-of-day (Marketing-API hourly client) **and per-ad daily** (`TikTokAdInsightsDaily`, nightly `/api/cron/sync-tiktok-ads` → the admin per-TikTok-ad spend/ROAS breakdown), awaiting live credentials/verification; **Snapchat** still has no Marketing-API spend client, so its spend + ROAS show "—" until that lands.
- **Mobile app** — native **Android** app on the **Google Play Store** is planned. iOS / App Store is **not** on the roadmap.
- **2nd- and 3rd-place winners per Major Draw** — multiple winner rows per draw are already storable (`Winner` keyed by `drawId + cycle`, no unique constraint); today each cycle has a single Grand Winner. Ordered placings would need a small `place`/`rank` field added to distinguish positions.
- **Second monthly Major Draw** — under consideration; current cadence stays at one draw per month on the 27th.

### Known not-yet-built

- Public partner-discount API endpoints (beyond partner applications, the partner-discount queue eligibility check, and the vendor-only iGoDirect member-status read).
- Shop checkout / fulfilment.
- Snapchat **ad-spend** sync (no Marketing-API client yet) and the daily-insights writer for `SnapchatAdInsightsDaily`. (TikTok's ad-spend is wired — hour-of-day + per-ad daily writer via `/api/cron/sync-tiktok-ads` — creds-gated/unverified against the live API.)

---

## Tech stack

- **Framework**: Next.js 15 (App Router, Turbopack), React 19, TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: MongoDB + Mongoose
- **Auth**: NextAuth (email + Google)
- **Payments**: Stripe (Payment Intents, Subscriptions, Webhooks)
- **State**: TanStack Query + SWR + Zustand
- **Validation**: Zod
- **Email / SMS**: SendGrid, Klaviyo, Twilio
- **Media**: Cloudinary, Sharp
- **Tracking**: Meta Pixel + CAPI, TikTok Pixel + Events API CAPI, Snapchat Pixel, GTM, Klaviyo
- **Deployment**: Vercel

---

## Project layout

```
src/
  app/                  Next.js App Router (pages + API routes)
  components/           UI components (no business logic, no DB access)
  hooks/                stateful logic + TanStack Query hooks
  services/             business logic (subscription, billing, draws, ab-testing…)
  repositories/         data access
  lib/                  cross-cutting infra (mongodb, auth, stripe, email, jobs)
  models/               Mongoose schemas
  utils/                pure utilities, organized by domain
  middleware.ts         auth gating + CSP nonce injection
docs/                   per-domain documentation (see Domain Manifest in CLAUDE.md)
scripts/                migrations, backfills, reconciliation, Stripe maintenance
```

Strict layering is enforced — `app → services → repositories/lib → models`. No DB access from components, no business logic in route handlers. See [CLAUDE.md](CLAUDE.md) for full rules and the Domain Manifest.

---

## Development

```bash
npm install
npm run dev          # next dev --turbopack
npm run build        # next build --turbopack
npm run lint
npm run type-check
```

Both `dev` and `build` run `prebuild`/`predev` first to regenerate the upsell and landing image manifests. If that script fails, the app will not start.

### Tests

There is no test runner. Tests are standalone `tsx` scripts under `src/**/__tests__/*.test.ts`, each wired to its own `package.json` script (`test:anchor-billing`, `test:redeemables`, `test:stripe-collection-pause`, etc.). To add a test, also add a matching `test:*` entry in `package.json`.

### Operational scripts

Migrations, backfills, reconciliation, and Stripe maintenance live in `scripts/` and run via npm (`migrate:*`, `backfill:*`, `sync:*`, `stripe:*`, `find:*`). Most accept `--dry-run` — prefer the `:dry` variant first.

---

## Environment

Required env vars are listed in `.env.example`. The core groups are MongoDB, NextAuth, Stripe (publishable + secret + webhook), SendGrid, Klaviyo, Twilio, Cloudinary, Meta Pixel + CAPI, GTM, and Google OAuth.

---

## Further reading

- [BUSINESS.md](BUSINESS.md) — domain model and business rules for AI agents and new joiners
- [CLAUDE.md](CLAUDE.md) — repository rules, layering, and the Domain Manifest
- [docs/](docs/) — per-domain documentation (one folder per domain, indexed by the manifest)
