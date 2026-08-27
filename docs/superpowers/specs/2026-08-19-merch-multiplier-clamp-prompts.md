# Handoff prompts — merch multiplier clamp

Paste one at a time into a fresh session, in order. Each is self-contained: it names the spec, the
files it may touch, the files it may **not**, and how it must verify itself before reporting done.

Spec: `docs/superpowers/specs/2026-08-19-merch-multiplier-clamp-design.md`

**Do not start Phase 1 until dependency D1 is answered** (is the 2026-08-17 "merch inherits"
decision being reversed?). If it is, this whole plan is the wrong design — stop and re-spec.

---

## Prompt 0 — Preflight (run first, in its own session)

```
Read docs/superpowers/specs/2026-08-19-merch-multiplier-clamp-design.md in full.

Then verify its §3 "Starting state" table has not drifted. For each row, open the cited file
and confirm the line still says what the spec claims. Report a table: claim | still true? |
current file:line | actual line content.

Pay particular attention to:
  - src/services/shop/printProviderSync.ts:229  (includedEntries: 0)
  - src/services/stripe-webhook-handlers/index.ts:866  (getActivePromoMultiplier("one-time"))
  - src/app/(site)/shop/[slug]/components/ProductInteractions.tsx:235
  - src/utils/payment/__tests__/shop-entry-grant.test.ts:228-241
  - BUSINESS.md:80-82  (permit gating)

READ ONLY. Do not modify a single file. If any row has drifted, say so and stop — the spec
needs amending before any code is written.
```

## Prompt 1 — Phase 1: model, helper, and fix the dead test

```
Implement Phase 1 of docs/superpowers/specs/2026-08-19-merch-multiplier-clamp-design.md.

MAY CREATE:
  src/models/ShopEntryMultiplierConfig.ts
  src/services/shop/resolveShopEntryMultiplier.ts
MAY EDIT:
  src/utils/payment/__tests__/shop-entry-grant.test.ts
  package.json            (only to add a test:* entry, if a new test file is added)
  CLAUDE.md               (only the Domain Manifest, to cover the two new files)
  docs/cart-shop-products/
MUST NOT TOUCH:
  src/services/stripe-webhook-handlers/**   (that is Phase 2)
  src/app/(site)/shop/**                    (that is Phase 2)
  src/app/api/**                            (that is Phase 3)
  Any product, order or payment model

Follow the spec's §4 data model exactly. Mirror the getOrCreate singleton shape of
src/models/UpsellMultiplierConfig.ts:48-53. The schema block and the TS interface must both
declare `cap` — Mongoose strict mode drops any path present only on the interface, and tsc
will not catch it (spec §5 row 1, failureMode silent).

The ladder test at shop-entry-grant.test.ts:228 is currently DEAD: it divides both sides by the
same `m`, so all four loop iterations are algebraically identical and it asserts nothing about
multipliers. Rewrite it to take TWO independent multipliers (mPack, mMerch) and assert the
invariant across the full 1..10 x 1..10 matrix.

VERIFY BEFORE REPORTING DONE — paste the actual output of each:
  npm run type-check
  npm run lint
  the shop-entry-grant test (needs E2E_MONGODB_URI; if unset, say so rather than skipping silently)
Add a test that proves `cap: 3` survives a save and re-read from Mongo.

Do not commit.
```

## Prompt 2 — Phase 2: wire both call sites and snapshot the applied value

```
Implement Phase 2 of docs/superpowers/specs/2026-08-19-merch-multiplier-clamp-design.md.
Phase 1 must already be merged into the working tree.

MAY EDIT:
  src/services/stripe-webhook-handlers/index.ts     (the shop branch near line 866, ONLY)
  src/app/(site)/shop/[slug]/components/ProductInteractions.tsx
  src/models/Order.ts
  src/services/shop/finalizeShopOrder.ts
  src/utils/payment/__tests__/shop-entry-grant.test.ts
  docs/cart-shop-products/ , CUSTOMER.md
MUST NOT TOUCH:
  Any other branch of the webhook handler — the membership, one-time, mini-draw and upsell
  branches are out of scope and share this file. Change only the shop branch.
  src/app/api/**  (Phase 3)

Both call sites must read the SAME helper. Spec §5 rows 3 and 4 are both silent failures: if only
the grant changes, the page advertises a number the buyer does not receive; if only the page
changes, the reverse. Add an assertion that page-resolved === grant-resolved for a given config.

Add `entryMultiplierApplied` to BOTH the Order interface and the Order schema, and persist it in
the same save as entriesGranted (finalizeShopOrder.ts:121). Without it, a Stripe redelivery
re-resolves fresh at finalizeShopOrder.ts:193-196 and two buyers at the same instant can receive
different counts across a promo boundary.

Preserve the zero short-circuit at finalizeShopOrder.ts:92-98 exactly. It is the kill switch that
keeps this feature dark while the permit is pending.

VERIFY BEFORE REPORTING DONE — paste actual output:
  npm run type-check
  npm run lint
  the shop-entry-grant test, including a new assertion reading entryMultiplierApplied back from Mongo
Also confirm in writing that with cap=null the resolved value is identical to today's.

Do not commit.
```

## Prompt 3 — Phase 3: admin route and panel

```
Implement Phase 3 of docs/superpowers/specs/2026-08-19-merch-multiplier-clamp-design.md.

MAY CREATE:
  src/app/api/admin/shop/entry-multiplier/route.ts
  src/components/admin/ShopEntryMultiplierPanel.tsx
  src/hooks/queries/admin/ (a query + mutation hook, following the existing convention there)
MAY EDIT:
  src/app/admin/component/adminTabs.ts   (mount on the Products tab)
  CLAUDE.md (Domain Manifest), docs/admin/, docs/cart-shop-products/
MUST NOT TOUCH:
  src/services/**, src/models/**  (Phases 1-2 own those)
  src/app/api/admin/upsell-multipliers/**  — do NOT reuse that route. Its Zod schema lists three
  keys and strips anything else, returning 200 {ok:true} while persisting nothing, and the panel
  clears its dirty state on that fake success (spec §2, storage row).

Copy the structure of src/components/admin/UpsellMultiplierPanel.tsx. Gate the route with
`shop.edit` (src/lib/permissions.ts:39) — NOT promos.edit, NOT overview.edit. Middleware does not
protect /api/admin, so the handler must gate itself. Write a StaffActivity audit row recording
old value -> new value -> actor, so "who set merch to 1x" is answerable later.

The panel must show the RESULTING per-entry effect before save: inherited multiplier, the cap, and
the effective min(). This is an internal admin surface, so a per-entry figure is fine here — but it
must never appear in customer-facing copy (rule 11).

VERIFY BEFORE REPORTING DONE — paste actual output:
  npm run type-check
  npm run lint
Confirm the route returns 403 without shop.edit, and that a PUT of an out-of-range cap is rejected
by Zod rather than silently clamped.

Do not commit.
```

## Prompt 4 — Phase 4: Norm, business docs, and the rule sweep

```
Implement Phase 4 of docs/superpowers/specs/2026-08-19-merch-multiplier-clamp-design.md.

Decide dependency D2 first and record the decision in the spec: mirror the clamp to Norm, or
record a deliberate non-mirror. Rule 10 makes this lockstep (not flag-only) because Norm already
wraps PromoMultiplierResolverService at /v1/promo/effective, and already publishes a merch entry
count at src/lib/internal-norm/schemas/major-draw.ts:163.

If mirroring: update src/lib/internal-norm/classification.ts, the Zod schema, the route, then run
  npm run build:norm-manifest
  npm run norm:smoke
A schema/output mismatch is a RUNTIME 500 that tsc cannot catch. Note also that Zod v4 without
.strict() SILENTLY STRIPS an unknown key while withNorm returns the original unparsed data — so a
new field can leak to Norm undocumented. Check both directions.

Then update, in the same task:
  BUSINESS.md   — the merch table's "Promo multiplier" row currently says merch inherits one-time
                  and "both move together". Amend to describe the clamp.
  docs/internal-norm/norm-context.md — line 2303 claims entriesBySource.shop is "declared but
                  ALWAYS 0 today; nothing grants this source yet". The grant path DOES exist and
                  runs; it is zero only because includedEntries defaults to 0. Correct it.
  docs/cart-shop-products/ , docs/admin/
  src/data/supportChatFaqs.ts — rule 5c. Only if the clamp changes anything a customer can see.
                  It does not today (entries are off), so the likely correct action is NO FAQ
                  change plus a one-line note saying why.

VERIFY: npm run type-check, npm run lint, npm run norm:smoke (if mirrored), npm run test:chat-faqs
(if the corpus changed). Paste actual output. Do not commit.
```

---

## Not in these prompts, deliberately

Pre-existing debt found during recon, listed in spec §9 D3. Each needs its own decision and its own
prompt — do not let a phase quietly absorb one:

| Item | Evidence |
|---|---|
| A print-provider re-sync re-zeroes `includedEntries`, revoking promised entries | `printProviderSync.ts:229` |
| A full refund reverses draw entries but never clears `Order.entriesGranted` | `refund-ledger-reversal.ts:158-166` |
| Shop grants during a draw freeze throw `GATES_CLOSED`, the throw is swallowed, `entriesGranted` still written | `major-draw-helpers.ts:132-135`, `payment-processing.ts:2246, :2427` |
| `reconcile-major-draw-entries` cannot see or heal a shop grant; its zero-init omits the `shop` bucket | `scripts/reconcile-major-draw-entries.ts:87-99, :162-171` |
| `docs/cart-shop-products/frontend.md:184` claims `applyPromoToPackage` has zero callers; it has three, two of them live UI money math | `RewardsRedemption.tsx:58, :61` |
