# Klaviyo Events Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to walk this task-by-task, or execute manually. Steps use `- [ ]` checkboxes for tracking.

**Goal:** Ship the three ads-team-requested Klaviyo capabilities (`membership_status` profile feed, `Viewed Giveaway` event, `Started Checkout` event) on a canonical property schema that all future events extend. Existing legacy events stay byte-for-byte intact — no broken flows, no template regressions, no migration cost for the ads team.

**Architecture:** Klaviyo events are independent rows with free-form properties. Existing flows reference exact `(event name, property name)` pairs and are wired against the legacy schema in [klaviyo-events.ts](../../../src/utils/integrations/klaviyo/klaviyo-events.ts). New events use a canonical schema (number prices, ISO timestamps, snake_case, no sentinels) enforced by a dedicated helper + snapshot test. Both schemas coexist forever on the same profile and never collide because no flow references both. See *Canonical property names — new events only (drift containment)* in [docs/tracking/KLAVIYO_INTEGRATION.md](../../../docs/tracking/KLAVIYO_INTEGRATION.md).

**Tech Stack:** Next.js 15 App Router, TypeScript strict, MongoDB/Mongoose, Klaviyo Events API v2025-10-15. Tests are standalone `tsx` scripts wired to `package.json` `test:*` scripts (no jest/vitest). Date math via `date-fns`.

**Spec:** [docs/superpowers/specs/2026-05-27-klaviyo-events-expansion-design.md](../specs/2026-05-27-klaviyo-events-expansion-design.md)

**Pre-flight decisions** (locked 2026-05-28):
1. **`membership_status` is additive.** Written alongside legacy `subscription_status`. Both populated forever. The doc's no-refactor policy enforces freeze on legacy.
2. **Started Checkout fires server-side** from `/api/auth/register` for the guest (step=registered) path — avoids the Klaviyo-cookie race. **Client-side ride-along** at the two existing Facebook `trackInitiateCheckout` callsites in `MembershipModal` for the authed path. **Drops** the spec's original "modal-open + 3s dwell debounce" invention.
3. **Viewed Giveaway** uses `src/app/promotions/_components/PromoViewTracking.tsx` mirroring [MiniDrawViewTracking.tsx](../../../src/app/(site)/mini-draws/[id]/components/MiniDrawViewTracking.tsx) shape exactly. Not a new top-level tracking component.

**Commit policy:** **ASK BEFORE EVERY COMMIT.** User has not pre-authorized commits this session. Per CLAUDE.md rule 1, every commit needs a fresh "yes" from the user. Do not commit unprompted.

**Per-task doc rule:** Every task editing `src/` or `scripts/` must update the matching `docs/<domain>/` files in the same commit, or the `Stop` doc-sync hook will block. Domains touched by this plan:
- `tracking` — klaviyo-helpers.ts, klaviyo-events.ts, useKlaviyoTracking.ts, KlaviyoPageTracker, KlaviyoUserIdentifier, types/klaviyo.ts
- `auth` — `/api/auth/register/route.ts`
- `subscription` — `User.ts` (read-only; we don't mutate the schema, only the derived properties)
- `shared-ui` — `MembershipModal/index.tsx`
- `promo` — `src/app/promotions/_components/PromoViewTracking.tsx`, `src/app/promotions/**`
- `infrastructure` — `package.json`, `scripts/backfill-*.ts`

---

## Phase 1: Foundation (no user-visible change, unblocks everything)

Sets the canonical convention in code and documentation so Phases 2–4 have a foundation to build against.

### Task 1.1: Rewrite spec sections 3–5, 7, 8 to canonical schema + audit fixes

**Files:**
- Modify: `docs/superpowers/specs/2026-05-27-klaviyo-events-expansion-design.md`

**Steps:**

- [ ] **Step 1: Rewrite §3 (`membership_status` profile feed)**
  - Replace the 5-value enum with explicit Stripe-coercion table covering `unpaid`, `incomplete`, `trialing`. Drop `"paused"` (verified not in codebase).
  - Replace `Math.floor((Date.now() - startDate) / (1000 * 60 * 60 * 24 * 30.4375))` with `differenceInMonths(new Date(), startDate)` from `date-fns`.
  - Replace `TicketEntry.distinct(...).length + TicketEntry.distinct(...).length` with a single `$facet` aggregation pulling both counts in one round-trip.
  - Drop the "Klaviyo Custom Objects still Beta" rationale — incorrect as of late 2025 (Custom Objects is GA). Keep the "paid add-on confirmation + flat properties cover stated use cases" rationale.
  - Document `subscription_status` continues to be written (legacy frozen, per doc policy).

- [ ] **Step 2: Rewrite §4 (`Viewed Giveaway`)**
  - Replace the new top-level `src/components/tracking/KlaviyoViewedGiveawayTracker.tsx` with `src/app/promotions/_components/PromoViewTracking.tsx` mirroring `MiniDrawViewTracking.tsx`.
  - Reference the canonical event-property table (uses `viewed_at` ISO, `is_authenticated`, the canonical promo context fields).
  - Note that this fires alongside the existing `Viewed Page` (with `PageType: "promotion"`) — does not replace it.
  - Mark `/major-draw` and `/mini-draws/[id]` as open question for the ads team (out of scope for this spec but worth flagging in §10).

- [ ] **Step 3: Rewrite §5 (`Started Checkout`)**
  - Drop the "modal-open + 3s dwell" invention entirely.
  - Document the new strategy: **server-side fire** in `/api/auth/register` (guest, `step="registered"`) immediately after `ensureUserProfileSynced` returns; **client-side ride-along** at `MembershipModal:1317` (guest path, post-registration success) and `MembershipModal:2658` (authed payment-submit). Both client-side fires sit next to the existing `trackInitiateCheckout` calls and share the `initiateCheckoutFiredRef` guard.
  - Add the dedupe note: server-side fire and client-side fire CAN both fire for the same guest. Use a response flag (`{ klaviyoStartedCheckoutFired: true }`) from `/api/auth/register` to skip the client fire when the server already fired. **Cleaner**: server-side only for guest (step=registered), client-side only for authed (step=viewed). Two clean paths, no overlap, no dedupe needed.
  - Replace `package_price` → `price` (number), `package_tier` → `tier`. Add `$value` alongside `price` for Klaviyo revenue-template compatibility.
  - Add `checkout_url` (Yuval requirement — deep link to preselected package with UTM).
  - Add `num_entries` for one-time packages (Yuval nice-to-have).
  - Replace `timestamp` → `started_at` ISO.
  - Lowercase `currency`.

- [ ] **Step 4: Rewrite §7 (Files that will change)**
  - Remove `src/components/tracking/KlaviyoViewedGiveawayTracker.tsx`.
  - Add `src/app/promotions/_components/PromoViewTracking.tsx`.
  - Add `formatCanonicalPackageData` helper in `klaviyo-helpers.ts`.
  - Add `buildCheckoutResumeUrl` helper.
  - Add `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts`.
  - Add `scripts/backfill-klaviyo-membership-properties.ts` + `backfill:klaviyo-membership-properties` / `:dry` npm scripts.

- [ ] **Step 5: Rewrite §8 (Acceptance criteria)**
  - Add criterion for backfill: ≥99% of active members get the 5 new properties within 24h of running the backfill.
  - Add dedupe criterion: server-side + client-side fires combined produce exactly one `Started Checkout` event per user per modal lifecycle.
  - Add CSP criterion: no CSP violations in dev console on `/promotions/*` and modal open.

- [ ] **Step 6: Add a §10 question for the ads team** about whether `/major-draw` and `/mini-draws/[id]` should also fire `Viewed Giveaway` (currently scoped to `/promotions/*` per their literal ask).

**Verification:** Spec reads coherent end-to-end. All citations resolve. Domain-manifest paths under §7 match real file locations. `docs/tracking/KLAVIYO_INTEGRATION.md` canonical table is referenced in §3–§5 where applicable.

---

### Task 1.2: Add `formatCanonicalPackageData` helper

**Files:**
- Modify: `src/utils/integrations/klaviyo/klaviyo-helpers.ts`
- Modify: `src/types/klaviyo.ts` (add `CanonicalPackageData` type if needed)
- Modify: `docs/tracking/api.md` or appropriate domain doc (add helper to the public surface section)

**Steps:**

- [ ] **Step 1: Add the helper** next to (not replacing) the legacy `formatPackageDataForKlaviyo`:

  ```ts
  /**
   * Canonical package-data shape for events created after 2026-05-27.
   * See "Canonical property names" in docs/tracking/KLAVIYO_INTEGRATION.md.
   * Do NOT use for legacy events — use formatPackageDataForKlaviyo for those.
   */
  export function formatCanonicalPackageData(p: {
    packageId: string;
    packageName: string;
    packageType: "membership" | "one-time" | "mini-draw" | "upsell";
    tier?: string;
    price: number;
    numEntries?: number;
  }) {
    const out: Record<string, unknown> = {
      package_id: p.packageId,
      package_name: p.packageName.trim(),
      package_type: p.packageType,
      price: p.price, // number, NOT string
    };
    const trimmedTier = p.tier?.trim();
    if (trimmedTier) out.tier = trimmedTier; // omit when absent — no "" sentinel
    if (p.numEntries !== undefined) out.num_entries = p.numEntries;
    return out;
  }
  ```

- [ ] **Step 2: JSDoc comment** explicitly cross-references the canonical schema section in `KLAVIYO_INTEGRATION.md` so the next engineer finds the convention from the helper, not just the doc.

- [ ] **Step 3: Update the tracking domain doc** to mention the helper exists and what it's for.

**Verification:** `npm run lint`, `npm run type-check` green. Helper not yet called by anything — that's expected (Phase 3/4 wire it up).

---

### Task 1.3: Snapshot test scaffolding

**Files:**
- Create: `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts`
- Modify: `package.json` (add `test:klaviyo-canonical`)
- Modify: `docs/infrastructure/testing.md` (note the new test entry in the test inventory)

**Steps:**

- [ ] **Step 1: Create the test file** with an exported `CANONICAL_KEYS` constant matching the canonical schema's column 2 (the property-name column from `KLAVIYO_INTEGRATION.md`):

  ```ts
  // src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts
  import assert from "node:assert/strict";

  // Mirror of the canonical schema in docs/tracking/KLAVIYO_INTEGRATION.md.
  // Update both this and the doc when a new canonical key is approved.
  const CANONICAL_KEYS = new Set([
    "price", "$value", "currency",
    "package_id", "package_name", "tier", "package_type",
    "entries_granted", "entries_purchased",
    "user_id", "payment_intent_id",
    "is_authenticated",
    "promo_slug", "promo_id", "promo_title", "prize_name", "prize_image_url", "promo_url",
    "checkout_url", "resume_url",
    "num_entries", "step",
    // ISO timestamps — accept any *_at suffix
  ]);

  function assertCanonicalShape(eventName: string, properties: Record<string, unknown>) {
    const extras: string[] = [];
    for (const key of Object.keys(properties)) {
      if (key.endsWith("_at")) continue; // ISO timestamp convention
      if (CANONICAL_KEYS.has(key)) continue;
      extras.push(key);
    }
    assert.deepEqual(extras, [], `Event "${eventName}" emits non-canonical properties: ${extras.join(", ")}`);
  }

  // Phase 1 ships with NO event builders to test. Phases 3 and 4 add assertions here.
  async function main() {
    console.log("✓ canonical-events-shape scaffold loaded (no event builders to check yet)");
  }

  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });

  export { assertCanonicalShape, CANONICAL_KEYS };
  ```

- [ ] **Step 2: Add the npm script** to `package.json`:

  ```json
  "test:klaviyo-canonical": "tsx src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts"
  ```

- [ ] **Step 3: Update infrastructure testing doc** to list the new test entry (per the test:* inventory convention).

**Verification:** `npm run test:klaviyo-canonical` exits 0. Type-check passes (the exported `CANONICAL_KEYS` and `assertCanonicalShape` are importable from later phase tests).

---

### Task 1.4: Cross-link gotchas to canonical schema

**Files:**
- Modify: `docs/tracking/gotchas.md`

**Steps:**

- [ ] **Step 1: Add a one-paragraph entry** at the top of the tracking gotchas:
  > **Adding a new Klaviyo event?** Use the **canonical schema** in `KLAVIYO_INTEGRATION.md` — not the legacy `formatPackageDataForKlaviyo` helper. New events use `price` as a number, `tier` (not `package_tier`), ISO `*_at` timestamps, omit-rather-than-empty-sentinel for missing values. The `canonical-events-shape.test.ts` snapshot test will fail CI if you drift. The "Canonical property names — new events only" section in `KLAVIYO_INTEGRATION.md` is the authoritative reference.

**Verification:** Doc-sync hook reports `tracking` domain still in sync. Phase 1 complete.

---

## Phase 2: `membership_status` profile feed (Yuval ask #1)

**Ships:** ads team can immediately segment "purchased entries but never subscribed" (and four other useful segments) after the backfill runs.

### Task 2.1: Add 5 new profile properties + helpers

**Files:**
- Modify: `src/utils/integrations/klaviyo/klaviyo-helpers.ts`
- Modify: `src/types/klaviyo.ts`
- Modify: `docs/tracking/KLAVIYO_INTEGRATION.md`
- Modify: `docs/tracking/api.md`
- Modify: `docs/tracking/patterns.md`

**Steps:**

- [ ] **Step 1: Add `deriveMembershipStatus`** helper coercing all observed Stripe states:
  ```ts
  type MembershipStatus = "active" | "past_due" | "canceled" | "never_subscribed";

  export function deriveMembershipStatus(user: IUser): MembershipStatus {
    const s = user.subscription?.status;
    if (!s || !user.subscription) return "never_subscribed";
    if (s === "active" || s === "trialing") return "active";
    if (s === "past_due" || s === "unpaid") return "past_due";
    if (s === "canceled") return "canceled";
    if (s === "incomplete" || s === "incomplete_expired") return "never_subscribed";
    // Fallback: any other Stripe state we haven't seen → treat as never_subscribed (safest for ads team segments)
    return "never_subscribed";
  }
  ```
  Note the deliberate decision: `unpaid` rolls into `past_due` (both are dunning states), `trialing` rolls into `active`. Document this in `patterns.md`.

- [ ] **Step 2: Add `computeActiveDurationMonths`** using `date-fns`:
  ```ts
  import { differenceInMonths } from "date-fns";

  export function computeActiveDurationMonths(startDate: Date | undefined): number | null {
    if (!startDate) return null;
    return Math.max(0, differenceInMonths(new Date(), new Date(startDate)));
  }
  ```

- [ ] **Step 3: Add `countDistinctDrawsEntered`** using two parallel queries (Major Draw entries live as embedded subdocs on `MajorDraw.entries[]`, Mini Draw entries live in the flat `TicketEntry` collection — they cannot be combined in one `$facet`):
  ```ts
  import MajorDraw from "@/models/MajorDraw";
  import TicketEntry from "@/models/TicketEntry";

  export async function countDistinctDrawsEntered(userId: mongoose.Types.ObjectId | string): Promise<number> {
    const [majorCount, miniDrawIds] = await Promise.all([
      // Major Draw entries are embedded subdocs — indexed at MajorDraw.ts:269 ("entries.userId": 1)
      MajorDraw.countDocuments({ "entries.userId": userId }),
      // Mini Draw entries are a flat collection — indexed at TicketEntry.ts:58 ({ userId: 1, miniDrawId: 1 })
      TicketEntry.distinct("miniDrawId", { userId }),
    ]);
    return majorCount + miniDrawIds.length;
  }
  ```
  Both queries are indexed and run in parallel. Total round-trip is one (parallel) Mongo wait per profile sync.

- [ ] **Step 4: Add 5 properties** to the `properties: { ... }` block in `userToKlaviyoProfile` (the function called by `ensureUserProfileSynced`):
  ```ts
  // New canonical properties (added 2026-05-28 — see canonical schema in KLAVIYO_INTEGRATION.md)
  membership_status: deriveMembershipStatus(user),
  entries_purchased: entryBreakdown.memberEntries + entryBreakdown.oneTimeEntries + entryBreakdown.upsellEntries + entryBreakdown.miniDrawEntries,
  giveaways_entered: await countDistinctDrawsEntered(user._id.toString()),
  membership_active_duration_months: computeActiveDurationMonths(user.subscription?.startDate),
  next_renewal_date:
    user.subscription?.isActive && user.subscription?.autoRenew
      ? safeDateToISO(user.subscription.endDate) ?? null
      : null,
  ```
  Place this directly above the closing `},` of the `properties` block. **Legacy `subscription_status` stays where it is.**

- [ ] **Step 5: Extend `KlaviyoProfileProperties`** type in `src/types/klaviyo.ts` (or wherever it lives) with the 5 new fields.

- [ ] **Step 6: Update `docs/tracking/KLAVIYO_INTEGRATION.md`** — add a "Profile properties added 2026-05-28" subsection under the canonical schema, listing the 5 fields with computed-how notes.

- [ ] **Step 7: Update `docs/tracking/patterns.md`** — add the `deriveMembershipStatus` coercion table so the next engineer knows why `unpaid` → `past_due` etc.

- [ ] **Step 8: Update `docs/tracking/api.md`** — add the three new helpers to the public surface.

**Verification:**
- `npm run lint` + `npm run type-check` green
- Quick local probe: call `ensureUserProfileSynced(testUser)` with a known user, inspect the payload it sends → 5 new fields present with sane values
- Existing webhook paths (cancellation, renewal, etc.) still fire `ensureUserProfileSynced` and now include the new fields automatically

---

### Task 2.2: Backfill script for existing users

**Files:**
- Create: `scripts/backfill-klaviyo-membership-properties.ts`
- Modify: `package.json` (add `backfill:klaviyo-membership-properties` + `:dry`)
- Modify: `docs/infrastructure/api.md` or `docs/tracking/patterns.md` (document the script + when to run)

**Steps:**

- [ ] **Step 1: Write the script** following the established backfill convention (see `scripts/backfill-blocked-transactions.ts` for the pattern). Required behaviour:
  - Accept `--dry-run` flag (prints what would change without writing)
  - Iterate `User.find({ isActive: true })` in batches of 100
  - For each user, call `ensureUserProfileSynced(user)` — which is non-blocking; the script must `await` each call sequentially to avoid Klaviyo rate-limit spikes
  - Add `--limit N` flag for sampling
  - Add a 100ms inter-call sleep to stay under Klaviyo's 700 req/sec sustained limit (we want to be well under, this isn't a race)
  - Log progress every 1,000 users
  - Use `console.error` (not `console.log`) for any output that needs to survive production-build console stripping
  - Open the Mongo connection via `src/lib/mongodb.ts` (per CLAUDE.md — no ad hoc connections)
  - Close cleanly on SIGINT

- [ ] **Step 2: Add npm scripts**:
  ```json
  "backfill:klaviyo-membership-properties": "tsx scripts/backfill-klaviyo-membership-properties.ts",
  "backfill:klaviyo-membership-properties:dry": "tsx scripts/backfill-klaviyo-membership-properties.ts --dry-run"
  ```

- [ ] **Step 3: Document** the script in the appropriate domain doc with:
  - When to run (after Phase 2 deploys to production)
  - Expected duration estimate (e.g., 10k active users × 100ms = ~17 min)
  - Rerun safety (idempotent — each call upserts the profile, no duplicates created)
  - Acceptance: ≥99% of active members have the 5 new properties visible in Klaviyo within 24h of script completion

**Verification:**
- `npm run backfill:klaviyo-membership-properties:dry -- --limit 5` — reports 5 users without writing to Klaviyo
- `npm run backfill:klaviyo-membership-properties -- --limit 1` against a known test user — inspect Klaviyo profile → 5 new properties present
- Lint + type-check

---

## Phase 3: `Viewed Giveaway` event (Yuval ask #3)

**Ships:** ads team can build a "viewed promo page but didn't enter" flow same day.

### Task 3.1: `createViewedGiveawayEvent` builder + `useKlaviyoTracking` extension

**Files:**
- Modify: `src/utils/integrations/klaviyo/klaviyo-events.ts`
- Modify: `src/hooks/useKlaviyoTracking.ts`
- Modify: `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts`
- Modify: `docs/tracking/KLAVIYO_INTEGRATION.md` (event inventory table)
- Modify: `docs/tracking/api.md`

**Steps:**

- [ ] **Step 1: Add `createViewedGiveawayEvent`** to `klaviyo-events.ts` (after the existing event builders, in a new "POST-2026-05 CANONICAL EVENTS" section):
  ```ts
  // ============================================================
  // POST-2026-05 CANONICAL EVENTS
  // (use formatCanonicalPackageData + ISO *_at timestamps)
  // ============================================================

  export function createViewedGiveawayEvent(
    user: IUser | { email: string }, // accepts either a User or a minimal email-only shape for anonymous-then-cookied
    promoData: {
      promoSlug: string;
      promoId?: string;
      promoTitle: string;
      prizeName: string;
      prizeImageUrl?: string;
      promoUrl: string;
      isAuthenticated: boolean;
    }
  ): KlaviyoEvent {
    return {
      event: "Viewed Giveaway",
      customer_properties: "_id" in user ? getCustomerProperties(user) : { email: user.email },
      properties: {
        promo_slug: promoData.promoSlug,
        ...(promoData.promoId ? { promo_id: promoData.promoId } : {}),
        promo_title: promoData.promoTitle,
        prize_name: promoData.prizeName,
        ...(promoData.prizeImageUrl ? { prize_image_url: promoData.prizeImageUrl } : {}),
        promo_url: promoData.promoUrl,
        is_authenticated: promoData.isAuthenticated,
        viewed_at: new Date().toISOString(),
      },
    };
  }
  ```

- [ ] **Step 2: Add `trackViewedGiveaway`** method to `useKlaviyoTracking` hook mirroring `trackViewContent`'s shape — fires `klaviyo.track("Viewed Giveaway", { ... })` client-side via the existing helper chain. Accepts the same property shape as the server-side builder.

- [ ] **Step 3: Add the snapshot assertion** to `canonical-events-shape.test.ts`:
  ```ts
  import { createViewedGiveawayEvent } from "../klaviyo-events";
  const sampleUser = { email: "test@example.com" };
  const sample = createViewedGiveawayEvent(sampleUser, {
    promoSlug: "milwaukee-march",
    promoTitle: "Win a Milwaukee",
    prizeName: "Milwaukee Pack",
    promoUrl: "https://example.com",
    isAuthenticated: false,
  });
  assertCanonicalShape("Viewed Giveaway", sample.properties);
  ```

- [ ] **Step 4: Update event inventory** table in `KLAVIYO_INTEGRATION.md` — add `Viewed Giveaway` to the browser-side events section with property notes.

- [ ] **Step 5: Update `docs/tracking/api.md`** with the new public exports.

**Verification:** `npm run test:klaviyo-canonical` green (no extras flagged). Lint + type-check.

---

### Task 3.2: `PromoViewTracking` component + mounts

**Files:**
- Create: `src/app/promotions/_components/PromoViewTracking.tsx`
- Modify: `src/app/promotions/[slug]/page.tsx` (mount the tracker)
- Modify: `src/app/promotions/_components/ToolsetLandingPage.tsx` (mount once for all brand pages — verify it's shared)
- Modify: `docs/promo/api.md` (or appropriate domain doc)

**Steps:**

- [ ] **Step 1: Create `PromoViewTracking.tsx`** mirroring `MiniDrawViewTracking.tsx` shape exactly:
  ```tsx
  "use client";

  import { useEffect } from "react";
  import { usePathname } from "next/navigation";
  import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
  import { useUserContext } from "@/contexts/UserContext";

  interface PromoViewTrackingProps {
    promo: {
      slug: string;
      id?: string;
      title: string;
      prizeName: string;
      prizeImageUrl?: string;
    };
  }

  export default function PromoViewTracking({ promo }: PromoViewTrackingProps) {
    const { trackViewedGiveaway } = useKlaviyoTracking();
    const { isAuthenticated } = useUserContext();
    const pathname = usePathname();

    useEffect(() => {
      const promoUrl = typeof window !== "undefined" ? window.location.href : "";
      trackViewedGiveaway({
        promo_slug: promo.slug,
        promo_id: promo.id,
        promo_title: promo.title,
        prize_name: promo.prizeName,
        prize_image_url: promo.prizeImageUrl,
        promo_url: promoUrl,
        is_authenticated: isAuthenticated,
      });
    }, [promo.id, promo.slug, pathname, isAuthenticated, trackViewedGiveaway]);

    return null;
  }
  ```

- [ ] **Step 2: Verify the brand-page mount path** — open `src/app/promotions/_components/ToolsetLandingPage.tsx` and confirm it's the shared root for `/promotions/dewalt`, `/makita`, `/milwaukee`, `/ryobi`. If yes, one mount in `ToolsetLandingPage` covers all four brand pages.

- [ ] **Step 3: Mount in `/promotions/[slug]/page.tsx`** — pass the resolved promo metadata as the `promo` prop.

- [ ] **Step 4: Mount in `ToolsetLandingPage.tsx`** — pass the brand-specific promo metadata.

- [ ] **Step 5: Update `docs/promo/api.md`** noting the new client component.

**Verification:**
- Run `npm run dev`, navigate to `/promotions/<any-slug>`, open browser devtools network tab → confirm `klaviyo.track("Viewed Giveaway", ...)` fires once
- Verify pixel consent off → no event fires
- Navigate away and back → fires again (new view, intentional)
- Re-render same page (e.g., state change) → does not double-fire (single useEffect with stable deps)
- Lint + type-check + `npm run test:klaviyo-canonical`

---

## Phase 4: `Started Checkout` event (Yuval ask #2)

**Ships:** ads team can build the abandoned-checkout flow with a working deep-link CTA same day.

### Task 4.1: `createStartedCheckoutEvent` builder + `buildCheckoutResumeUrl` helper

**Files:**
- Modify: `src/utils/integrations/klaviyo/klaviyo-events.ts`
- Create: `src/utils/integrations/klaviyo/checkout-resume-url.ts` (or extend `klaviyo-order-helpers.ts`)
- Modify: `src/hooks/useKlaviyoTracking.ts` (extend existing `trackInitiateCheckout`)
- Modify: `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts`
- Modify: `docs/tracking/api.md`
- Modify: `docs/tracking/KLAVIYO_INTEGRATION.md` (event inventory)

**Steps:**

- [ ] **Step 1: Add `buildCheckoutResumeUrl`** helper:
  ```ts
  export function buildCheckoutResumeUrl(params: {
    baseUrl: string;       // e.g., process.env.NEXT_PUBLIC_SITE_URL
    packageId: string;
    promoSlug?: string;
    campaign?: string;     // utm_campaign — defaults to "klaviyo_abandoned_checkout"
  }): string {
    const url = new URL(params.baseUrl);
    if (params.promoSlug) {
      url.pathname = `/promotions/${params.promoSlug}`;
    }
    url.searchParams.set("openMembership", "1");
    url.searchParams.set("packageId", params.packageId);
    url.searchParams.set("utm_source", "klaviyo");
    url.searchParams.set("utm_medium", "email");
    url.searchParams.set("utm_campaign", params.campaign ?? "klaviyo_abandoned_checkout");
    return url.toString();
  }
  ```
  Verify `MembershipModal` honours `?openMembership=1&packageId=...` query params (check existing implementation; if not, that becomes a follow-up task).

- [ ] **Step 2: Add `createStartedCheckoutEvent`** to `klaviyo-events.ts`:
  ```ts
  export function createStartedCheckoutEvent(
    user: IUser,
    checkoutData: {
      packageId: string;
      packageName: string;
      packageType: "membership" | "one-time" | "mini-draw" | "upsell";
      tier?: string;
      price: number;        // number, not string
      numEntries?: number;
      checkoutUrl: string;
      promoSlug?: string;
      step: "viewed" | "registered";  // "viewed" = authed user submits payment; "registered" = guest post-step-1
    }
  ): KlaviyoEvent {
    return {
      event: "Started Checkout",
      customer_properties: getCustomerProperties(user),
      properties: {
        ...formatCanonicalPackageData({
          packageId: checkoutData.packageId,
          packageName: checkoutData.packageName,
          packageType: checkoutData.packageType,
          tier: checkoutData.tier,
          price: checkoutData.price,
          numEntries: checkoutData.numEntries,
        }),
        $value: checkoutData.price,  // Klaviyo revenue-template compat
        currency: "aud",              // lowercase canonical
        checkout_url: checkoutData.checkoutUrl,
        ...(checkoutData.promoSlug ? { promo_slug: checkoutData.promoSlug } : {}),
        step: checkoutData.step,
        is_authenticated: checkoutData.step === "viewed",
        started_at: new Date().toISOString(),
      },
    };
  }
  ```

- [ ] **Step 3: Extend the client-side `trackInitiateCheckout`** in `useKlaviyoTracking.ts` to accept the canonical params (`price` number, `tier`, `checkout_url`, etc.) and pass them through. Keep `"Started Checkout"` as the event name (already there).

- [ ] **Step 4: Add the snapshot assertion** in `canonical-events-shape.test.ts`.

- [ ] **Step 5: Update event inventory + api docs.**

**Verification:** `npm run test:klaviyo-canonical` green. Lint + type-check.

---

### Task 4.2: Server-side fire from `/api/auth/register` (guest path)

**Files:**
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `docs/auth/api.md` (note the new event fire)
- Modify: `docs/auth/gotchas.md` (note: server-side fire bypasses client pixel-consent gate — see Step 4)

**Steps:**

- [ ] **Step 1: After `ensureUserProfileSynced(newUser, brandInterest)` at L681** (and after `createKlaviyoProfileAndSubscribe` at L687), add:
  ```ts
  // Started Checkout — server-side fire for guest path (step=registered).
  // Reliably attaches to the just-created Klaviyo profile without depending on the
  // client-side onsite cookie being set. See docs/tracking/KLAVIYO_INTEGRATION.md
  // "Canonical property names" section.
  try {
    const checkoutResume = buildCheckoutResumeUrl({
      baseUrl: process.env.NEXT_PUBLIC_SITE_URL!,
      packageId: validatedData.packageId, // assumes the modal passes this in registration payload — verify
      promoSlug: validatedData.promotionSlug,
    });
    klaviyo.trackEventBackground(
      createStartedCheckoutEvent(newUser, {
        packageId: validatedData.packageId,
        packageName: resolvedPackageName,
        packageType: "membership",        // registration path = membership today
        tier: resolvedPackageTier,
        price: resolvedPackagePrice,
        checkoutUrl: checkoutResume,
        promoSlug: validatedData.promotionSlug,
        step: "registered",
      })
    );
  } catch (err) {
    // Non-blocking — never fail registration on tracking error
    console.error("Failed to fire Started Checkout (server, guest):", err);
  }
  ```
  **CAUTION**: verify `validatedData.packageId` etc. are present in the register payload. If they aren't, two options: (a) extend the register Zod schema to include them, (b) defer the server-side fire until after the modal POSTs the package selection separately. Decide based on what the modal already sends. Prefer (a) — small extension to the register schema.

- [ ] **Step 2: Add package-resolution logic** — `resolvedPackageName` / `resolvedPackagePrice` / `resolvedPackageTier` come from `getPackageById(validatedData.packageId)` from `src/data/membershipPackages.ts`. Already imported by other paths in this file; verify.

- [ ] **Step 3: Update the register Zod schema** in `src/lib/zod/...` if needed so `packageId` is part of the validated payload. Keep it optional with a fallback (some registration paths — affiliate, Google OAuth — don't go through the modal).

- [ ] **Step 4: Document the consent caveat** in `docs/auth/gotchas.md`:
  > Server-side Klaviyo events (e.g. `Started Checkout`, `Subscription Started`) fire regardless of the client-side `hasPixelConsent()` gate. This is intentional — server-side events represent committed transactions or registrations, not browsing behaviour. The browser pixel-consent gate exists for `Viewed Page`, `Viewed Product`, `Viewed Giveaway` etc. The ads team treats consent compliance through Klaviyo's list-subscription model + GDPR profile deletion (`/api/admin/users/[id]/klaviyo-delete`), not per-event opt-out.

- [ ] **Step 5: Update `docs/auth/api.md`** noting the new event fire.

**Verification:**
- Test: guest registration path in dev → check Klaviyo Recent Activity → `Started Checkout` event with `step: "registered"` and `checkout_url` populated
- Click the resume URL → confirm modal opens with package preselected
- Affiliate/Google-OAuth paths (no modal) → confirm graceful no-op (no `packageId` → skip the fire)
- Lint + type-check

---

### Task 4.3: Client-side ride-along in `MembershipModal` (authed path)

**Files:**
- Modify: `src/components/modals/MembershipModal/index.tsx`
- Modify: `docs/shared-ui/api.md` or `docs/shared-ui/gotchas.md`

**Steps:**

- [ ] **Step 1: At [L2658](../../../src/components/modals/MembershipModal/index.tsx#L2658)** (inside `handleSubmit`, next to existing `trackInitiateCheckout` for Facebook), add Klaviyo fire **only for authenticated users**:
  ```ts
  if (!initiateCheckoutFiredRef.current) {
    initiateCheckoutFiredRef.current = true;
    const packagePrice = activePlan?.price || 0;
    const packageType = isSubscription ? "membership" : "one-time"; // verify mapping

    // Facebook + TikTok (existing)
    trackInitiateCheckout(
      { value: packagePrice, currency: "AUD", numItems: 1 },
      undefined,
      isAuthenticated ? undefined : { email: formData.email, /* ... */ },
    );

    // Klaviyo (new) — authed path only; guest path is handled server-side from /api/auth/register
    if (isAuthenticated) {
      try {
        const checkoutResume = buildCheckoutResumeUrl({
          baseUrl: window.location.origin,
          packageId: getPackageId(activePlan, [...subscriptionPackages, ...oneTimePackages]) ?? "",
          promoSlug,
        });
        trackKlaviyoStartedCheckout({
          packageId: activePlan?.packageId ?? "",
          packageName: promoEnhancedPlan?.name ?? activePlan?.name ?? "",
          packageType,
          tier: activePlan?.tier ?? "",
          price: packagePrice,
          checkoutUrl: checkoutResume,
          promoSlug,
          step: "viewed",
        });
      } catch {
        // Non-blocking
      }
    }
  }
  ```

- [ ] **Step 2: At [L1317](../../../src/components/modals/MembershipModal/index.tsx#L1317)** (inside `handleRegistration`, after the FB `trackInitiateCheckout` for the guest pre-fire): **do NOT add a Klaviyo fire here.** The server-side fire from `/api/auth/register` (Task 4.2) handles the guest path. Add a brief comment explaining the split:
  ```ts
  // Klaviyo "Started Checkout" for guest path is fired server-side from /api/auth/register
  // (see docs/tracking/KLAVIYO_INTEGRATION.md "Canonical property names"). This avoids the
  // client-side onsite-cookie race for never-cookied users.
  ```

- [ ] **Step 3: Import the new hook method** `trackKlaviyoStartedCheckout` from `useKlaviyoTracking` (renamed for clarity — both `trackInitiateCheckout` (FB/TikTok) and `trackKlaviyoStartedCheckout` callable from the modal without naming collision).

- [ ] **Step 4: Update `docs/shared-ui/gotchas.md`** noting that the modal fires Klaviyo's `Started Checkout` for authed users only — guest path is server-side.

**Verification:**
- Authed user opens modal + submits payment → exactly one `Started Checkout` fires with `step: "viewed"` and `is_authenticated: true`
- Modal opens twice in same lifecycle → exactly one fire (`initiateCheckoutFiredRef` guard)
- Open modal from `/promotions/<slug>` → `promo_slug` populated in the event
- Pixel consent off → does not fire (client-side gate)
- Lint + type-check + `npm run test:klaviyo-canonical`

---

## Phase 5: Verification + cleanup

**Ships:** spec closed out, manifest current, ads team has a single doc to reference.

### Task 5.1: Legacy-fields audit

**Files:** (read-only)

**Steps:**

- [ ] **Step 1:** `npm run find:klaviyo-legacy-fields` — confirm no new camelCase or pre-canonical drift was introduced in Phases 2–4.

- [ ] **Step 2:** If hits surface, fix in this task (don't defer).

---

### Task 5.2: Manual Klaviyo dashboard verification

**Steps:**

- [ ] **Step 1: Profile feed check** — pick 5 test users (active member, past-due member, canceled member, one-time-only buyer, never-purchased). Verify all 5 new profile properties present with sane values.

- [ ] **Step 2: Event check** — navigate `/promotions/<slug>` → `Viewed Giveaway` visible in Recent Activity with all properties. Register as new guest from modal → `Started Checkout` (step=registered) visible. Authed user submits payment → `Started Checkout` (step=viewed) visible.

- [ ] **Step 3: Resume URL check** — copy `checkout_url` from a recent `Started Checkout` event, paste into a new browser session → modal opens with package preselected.

- [ ] **Step 4: Existing-flow regression spot-check** — verify a recent legacy event (e.g., `Subscription Started` from a real test purchase) is unchanged — same property names, same shape as before.

---

### Task 5.3: Lint / type-check / tests / docs

**Steps:**

- [ ] **Step 1:** `npm run lint`
- [ ] **Step 2:** `npm run type-check`
- [ ] **Step 3:** `npm run test:klaviyo-canonical`
- [ ] **Step 4:** Confirm doc-sync hook reports all touched domains in sync.
- [ ] **Step 5:** Confirm no `console.log` / `console.info` / `console.debug` / `console.warn` introduced in production-deployed code paths (per CLAUDE.md). Only `console.error` for errors that must survive.

---

### Task 5.4: Close out the spec + plan

**Files:**
- Modify: `docs/superpowers/specs/2026-05-27-klaviyo-events-expansion-design.md` (Status: Implemented)
- Modify: `docs/superpowers/plans/2026-05-27-klaviyo-events-expansion.md` (this file — add an Implementation Summary section)
- Modify: `docs/tracking/KLAVIYO_INTEGRATION.md` (add "Recently added canonical events" section listing the 2 new event names + their property shapes — single reference for the ads team)

**Steps:**

- [ ] **Step 1:** Update spec status to "Implemented (2026-05-XX)" with the actual ship date.
- [ ] **Step 2:** Add an "Implementation Summary" section to this plan documenting what was actually built (may differ from plan if open questions resolved differently).
- [ ] **Step 3:** Add a "Recently added canonical events" subsection to `KLAVIYO_INTEGRATION.md` listing the 2 events + their property shapes so the ads team has a single reference page.

---

## Out-of-scope for this plan (deferred)

- **Klaviyo Custom Objects "Membership" object** — deferred until paid add-on confirmed and use case justifies the schema work.
- **Email-on-blur identify for pre-step-1 anonymous users** — narrow edge case, add later if data justifies.
- **Refactoring legacy events to canonical schema** — explicitly forbidden by the no-refactor policy in `KLAVIYO_INTEGRATION.md`.
- **`Viewed Giveaway` fires from `/major-draw` or `/mini-draws/[id]`** — pending ads-team confirmation in spec §10.
- **Backfill of `Started Checkout` for historical abandoners** — Klaviyo event records are immutable; no way to backfill past events.

---

## Implementation summary

Implemented 2026-05-28 across four phased commits on `feature/klaviyo-audit`. All four Yuval-side asks (`membership_status` feed, `Viewed Giveaway`, `Started Checkout` with deep-link CTA, `num_entries` for packages) shipped with canonical schema. Legacy events untouched.

### Commits

| Phase | Commit | Lines |
|---|---|---|
| Phase 1 — Foundation (spec rewrite + canonical helper + snapshot test scaffold + docs) | `18ae4a7a` | +1479 |
| Phase 2 — `membership_status` profile feed + 3 helpers + backfill script | `53a02556` | +376 / -17 |
| Phase 3 — `Viewed Giveaway` event + `PromoViewTracking` component + 2 mounts | `756d137e` | +298 / -5 |
| Phase 4 — `Started Checkout` event (server-side + client ride-along) + `buildCheckoutResumeUrl` helper | `9d753e95` | +373 / -4 |

### Files added

- `docs/superpowers/specs/2026-05-27-klaviyo-events-expansion-design.md` (rewritten in Phase 1)
- `docs/superpowers/plans/2026-05-27-klaviyo-events-expansion.md` (this file)
- `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts` (9 self-tests + snapshots)
- `src/app/promotions/_components/PromoViewTracking.tsx`
- `src/utils/integrations/klaviyo/checkout-resume-url.ts`
- `scripts/backfill-klaviyo-membership-properties.ts`

### Public-API additions in `src/utils/integrations/klaviyo/klaviyo-helpers.ts`

- `formatCanonicalPackageData(p)` — canonical helper for new events (sits next to legacy `formatPackageDataForKlaviyo`)
- `deriveMembershipStatus(user)` → `"active" | "past_due" | "canceled" | "never_subscribed"`
- `computeActiveDurationMonths(startDate)` — `date-fns` based, DST-safe
- `countDistinctDrawsEntered(userId)` — parallel queries on `MajorDraw` (embedded subdocs) + `TicketEntry` (flat collection)

### New event builders in `src/utils/integrations/klaviyo/klaviyo-events.ts`

- `createViewedGiveawayEvent(userOrEmail, promoData)` — supports anonymous-then-cookied via `{ email }`-only param overload
- `createStartedCheckoutEvent(user, checkoutData)` — uses `formatCanonicalPackageData`, emits both `price` (canonical) and `$value` (Klaviyo revenue compat)

### Hook extensions in `src/hooks/useKlaviyoTracking.ts`

- `trackViewedGiveaway(params)` — client-side wrapper, gated on consent
- `trackKlaviyoStartedCheckout(params)` — client-side wrapper for AUTHED path only

### Profile properties added to `userToKlaviyoProfile`

5 canonical fields written alongside the existing 30 legacy fields:
- `membership_status`
- `entries_purchased`
- `giveaways_entered`
- `membership_active_duration_months`
- `next_renewal_date`

### Variations from the planned design

1. **`giveaways_entered` architecture** — the plan originally specified a single `$facet` aggregation on `TicketEntry`. Discovered during Phase 2 that Major Draw entries live as **embedded subdocs on `MajorDraw.entries[]`**, not in `TicketEntry`. Updated implementation (and spec + plan in-flight) to use two parallel queries via `Promise.all`. Both fields are indexed.

2. **`KlaviyoEventProperties.user_id` made optional** — required for `Viewed Giveaway` to fire anonymously (never-cookied promo-page visitors). All legacy events continue to emit `user_id` — no behavior change for them. Documented inline.

3. **MembershipModal sends `packageId` in the registration POST** — needed so the server can fire `Started Checkout` server-side with proper package context. Registered Zod schema extended to accept optional `packageId`; non-modal registration paths (Google-OAuth, affiliate) omit it and the server-side fire is gracefully skipped.

4. **`Started Checkout` `checkout_url`** — the deep-link CTA currently lands the user on `/membership?packageId=X&utm_*` (or `/promotions/<slug>` when they originated from one). Auto-opening the `MembershipModal` from the `?openMembership=1` query param is documented as a follow-up enhancement — for now, landing on the right page with the right package highlighted is sufficient and is one click away from completing checkout.

### Operational follow-ups

- **Run the backfill** after this branch deploys: `npm run backfill:klaviyo-membership-properties:dry` first, then live. Idempotent. ~10 users/sec at default throttle.
- **`/major-draw` and `/mini-draws/[id]` `Viewed Giveaway` mounts** — open question for the ads team (spec §10 Q6). Currently scoped to `/promotions/*` only per Yuval's literal ask.
- **Auto-open `MembershipModal` from `?openMembership=1`** — small UX enhancement that delivers Yuval's "preselected ready for someone to complete the checkout" requirement fully. Not included in this scope; users currently see the right package on `/membership` and click once.
- **Run `npm run find:klaviyo-legacy-fields`** — operational audit script, needs Klaviyo creds. Run from a workstation with `.env.local` after deploy.

### Verification status

- `npm run type-check` — green
- `npm run lint` — 3 pre-existing errors in `scripts/codemod-dark-text.js` and `scripts/migrate-klaviyo-draw-properties.ts` (not introduced by this work; unchanged on this branch)
- `npm run test:klaviyo-canonical` — green (9 tests: 5 self-tests + 2 Viewed Giveaway snapshots + 2 Started Checkout snapshots)
- Doc-sync hook — green (all `src/` and `scripts/` changes paired with corresponding `docs/<domain>/` updates)
