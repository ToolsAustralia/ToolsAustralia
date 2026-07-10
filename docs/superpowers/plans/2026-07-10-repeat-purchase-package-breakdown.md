# Repeat-Purchase per-package breakdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a rates-led, low-n-guarded "By one-time package" breakdown to the admin Repeat Purchase Analytics tab, computed inside the existing summary.

**Architecture:** Extend the pure shaper `summarizeRepeatPurchases` to emit a `packages[]` rollup on `RepeatPurchaseSummary` (derived, no new I/O). Mirror the new field to Norm. Render one new read-only card that reads the summary the tab already loads.

**Tech Stack:** TypeScript, Next.js 15 App Router, Zod, React 19 + Tailwind, tsx test scripts.

## Global Constraints (verbatim)

- **No auto-commit** (hard rule #1): make **no** `git commit`/`push`/PR without DJ's explicit keyword. All "commit" steps are deferred.
- **Doc-sync** (hard rule #2): editing `src/**` requires updating the mapped `docs/<domain>/` — here `docs/admin/`.
- **Norm lockstep** (hard rule #10): `classification.ts`/`schemas/*`/norm routes changing → update `docs/internal-norm/norm-context.md`, `npm run build:norm-manifest`, `npm run norm:smoke`.
- **Legal copy** (hard rule #11): no "odds/chance/lottery/raffle/gamble"; entries are a free inclusion, never sold. "Conversion" = repeat purchase / membership signup, framed plainly.
- **No overengineering** (hard rule #4): derived-only; no stored field; no new endpoint/hook; `LOW_N` is a UI constant, not config.
- **PII boundary:** Norm projection = package name + counts + AUD + rates only — no user identifiers.

---

### Task 1: Data model + shaper rollup (test-first)

**Files:**
- Modify: `src/types/admin/repeatPurchase.ts` (add `RepeatPackageBreakdown`, add `packages` to `RepeatPurchaseSummary`)
- Modify: `src/services/admin/repeatPurchaseAnalytics.ts` (compute `packages` in `summarizeRepeatPurchases`)
- Test: `src/services/admin/__tests__/repeatPurchaseAnalytics.test.ts` (run: `npm run test:repeat-purchase`)

**Interfaces — Produces:**
```ts
interface RepeatPackageBreakdown {
  packageId: string; packageName: string;
  startedBuyers: number; startedReturned: number; startedRepeatRate: number;
  startedBecameMembers: number; startedMemberRate: number; startedRevenue: number;
  purchases: number; grossRevenue: number;
}
// RepeatPurchaseSummary gains: packages: RepeatPackageBreakdown[]
```

- [ ] **Step 1 — Failing test.** Add to the test file (before the final `console.log`):

```ts
// --- per-package breakdown: anchor grouping vs per-purchase, + invariants ---
check("package breakdown splits anchor vs per-purchase, honours members + low counts", () => {
  const { summary } = run(
    [
      // a: starts Apprentice, returns buying Tradie (member later)
      ev("a", "2026-01-01", "apprentice", 25), ev("a", "2026-01-10", "tradie", 50),
      // b: starts Apprentice, single purchase
      ev("b", "2026-01-02", "apprentice", 25),
      // c: starts Tradie, returns buying Tradie
      ev("c", "2026-01-03", "tradie", 50), ev("c", "2026-02-03", "tradie", 50),
    ],
    [["a", [{ t: Date.UTC(2026, 0, 5), isNew: true }]]] // a signs up after their anchor
  );
  const byId = Object.fromEntries(summary.packages.map((p) => [p.packageId, p]));

  // Apprentice: 2 buyers started here (a,b); a returned; a became member.
  assert.equal(byId["apprentice"].startedBuyers, 2);
  assert.equal(byId["apprentice"].startedReturned, 1);
  assert.equal(byId["apprentice"].startedRepeatRate, 0.5);
  assert.equal(byId["apprentice"].startedBecameMembers, 1);
  assert.equal(byId["apprentice"].startedMemberRate, 0.5);
  assert.equal(byId["apprentice"].startedRevenue, 100); // a: 25+50, b: 25
  // Per-purchase: apprentice bought 3 times (a,b anchors + ... no) → a(25)+b(25) = 2 purchases, $50
  assert.equal(byId["apprentice"].purchases, 2);
  assert.equal(byId["apprentice"].grossRevenue, 50);

  // Tradie: 1 buyer started here (c); c returned. a's 2nd purchase was a Tradie too.
  assert.equal(byId["tradie"].startedBuyers, 1);
  assert.equal(byId["tradie"].startedReturned, 1);
  assert.equal(byId["tradie"].startedRevenue, 100); // c: 50+50
  assert.equal(byId["tradie"].purchases, 3);         // a's 2nd (50) + c's two (50+50)
  assert.equal(byId["tradie"].grossRevenue, 150);

  // Invariants: each attribution counts every purchase exactly once.
  const sumStarted = summary.packages.reduce((s, p) => s + p.startedRevenue, 0);
  const sumGross = summary.packages.reduce((s, p) => s + p.grossRevenue, 0);
  assert.equal(sumStarted, sumGross);
  assert.equal(sumGross, 225); // 25+50+25+50+50
  assert.equal(summary.packages.reduce((s, p) => s + p.purchases, 0), summary.totalPurchases);
  assert.equal(summary.packages.reduce((s, p) => s + p.startedBuyers, 0), summary.oneTimeBuyers);
  assert.equal(summary.packages.reduce((s, p) => s + p.startedReturned, 0), summary.repeatBuyers);
  // Sorted by startedBuyers desc → apprentice (2) before tradie (1).
  assert.equal(summary.packages[0].packageId, "apprentice");
});
```

- [ ] **Step 2 — Run, verify FAIL.** `npm run test:repeat-purchase` → fails (`summary.packages` undefined).

- [ ] **Step 3 — Add the type.** In `src/types/admin/repeatPurchase.ts`, above `RepeatPurchaseSummary`, add the `RepeatPackageBreakdown` interface (fields as in Interfaces above, with doc comments), and add `packages: RepeatPackageBreakdown[];` at the end of `RepeatPurchaseSummary`.

- [ ] **Step 4 — Compute in the shaper.** In `summarizeRepeatPurchases`, alongside the existing per-cohort loop, accumulate two maps keyed by package, then emit sorted `packages`. Anchor accumulation goes inside the existing `for (const acc of cohort)` loop (it already computes `becameMember` and has `acc.purchases`/`acc.totalSpent`); per-purchase accumulation iterates `acc.purchases`. Key = `p.packageId || p.packageName || "unknown"`; name = `p.packageName || p.packageId || "Unknown"`. Build `packages` after the loop:

```ts
// (declare before the cohort loop)
interface PkgAccum { packageId: string; packageName: string; startedBuyers: number; startedReturned: number; startedBecameMembers: number; startedRevenue: number; purchases: number; grossRevenue: number; }
const pkg = new Map<string, PkgAccum>();
const pkgKey = (id: string, name?: string) => id || name || "unknown";
const ensurePkg = (id: string, name?: string): PkgAccum => {
  const key = pkgKey(id, name);
  let a = pkg.get(key);
  if (!a) { a = { packageId: key, packageName: name || id || "Unknown", startedBuyers: 0, startedReturned: 0, startedBecameMembers: 0, startedRevenue: 0, purchases: 0, grossRevenue: 0 }; pkg.set(key, a); }
  return a;
};
```
Inside `for (const acc of cohort)` (after `becameMember` is known):
```ts
const anchorPkg = ensurePkg(anchor.packageId, anchor.packageName);
anchorPkg.startedBuyers++;
anchorPkg.startedRevenue += acc.totalSpent;
if (second) anchorPkg.startedReturned++;
if (becameMember) anchorPkg.startedBecameMembers++;
for (const p of acc.purchases) {
  const pp = ensurePkg(p.packageId, p.packageName);
  pp.purchases++;
  pp.grossRevenue += p.price;
}
```
After the loop, build the sorted array:
```ts
const packages = [...pkg.values()]
  .map((a) => ({
    packageId: a.packageId,
    packageName: a.packageName,
    startedBuyers: a.startedBuyers,
    startedReturned: a.startedReturned,
    startedRepeatRate: a.startedBuyers ? a.startedReturned / a.startedBuyers : 0,
    startedBecameMembers: a.startedBecameMembers,
    startedMemberRate: a.startedBuyers ? a.startedBecameMembers / a.startedBuyers : 0,
    startedRevenue: Math.round(a.startedRevenue * 100) / 100,
    purchases: a.purchases,
    grossRevenue: Math.round(a.grossRevenue * 100) / 100,
  }))
  .sort((x, y) => y.startedBuyers - x.startedBuyers || y.startedRevenue - x.startedRevenue);
```
Add `packages` to the returned `summary` object.

- [ ] **Step 5 — Run, verify PASS.** `npm run test:repeat-purchase` → all checks pass.
- [ ] **Step 6 — `npm run type-check`** → clean.

---

### Task 2: Norm lockstep

**Files:**
- Modify: `src/lib/internal-norm/schemas/repeat-purchases.ts`
- Modify: `docs/internal-norm/norm-context.md` (Returns block ~L2633)
- Run: `npm run build:norm-manifest`, `npm run norm:smoke`

- [ ] **Step 1 — Extend the schema.** Add to `NormRepeatPurchaseSummarySchema` (after `windows`):
```ts
  packages: z.array(
    z.object({
      packageId: z.string(), packageName: z.string(),
      startedBuyers: z.number(), startedReturned: z.number(), startedRepeatRate: z.number(),
      startedBecameMembers: z.number(), startedMemberRate: z.number(), startedRevenue: z.number(),
      purchases: z.number(), grossRevenue: z.number(),
    })
  ),
```
- [ ] **Step 2 — Update norm-context.md.** In the `GET /v1/analytics/repeat-purchases` Returns block, add before the closing `}`:
```ts
  packages: Array<{ packageId: string, packageName: string, startedBuyers: number, startedReturned: number, startedRepeatRate: number, startedBecameMembers: number, startedMemberRate: number, startedRevenue: number, purchases: number, grossRevenue: number }>  // per one-time package. "started*" = buyers whose FIRST pack was this (anchor-grouped: repeat/member rate + downstream $). purchases/grossRevenue = per-purchase gross. Σ startedRevenue = Σ grossRevenue = total cohort one-time revenue. Aggregate-only, no PII.
```
- [ ] **Step 3 — Rebuild + smoke.** `npm run build:norm-manifest` then `npm run norm:smoke` → repeat-purchases endpoint validates.

---

### Task 3: UI card

**Files:**
- Modify: `src/components/admin/RepeatPurchaseAnalytics.tsx`

- [ ] **Step 1 — Card.** After the `grid ... lg:grid-cols-2` block that holds the two side-by-side cards, and before the `usersRef` wrapper, add a new `Card` "By one-time package". Custom table (mirror the "windows" card markup) wrapped in `overflow-x-auto`, grouped header ("Started with this pack" spanning Buyers/Repeat rate/Became member/Downstream $; "All purchases" spanning Purchases/Gross $). Add `const LOW_N = 15;` near the other module consts. Format: rates via `(r*100).toFixed(1)%` with `(returned of buyers)` subtext; money via existing `money()`. Rows with `startedBuyers < LOW_N` get `opacity-60` + a `title`/badge "small sample". Empty state when `summary.packages` empty: "No one-time package activity in this range yet." Reuse the loading skeleton pattern from the buckets card.
- [ ] **Step 2 — Verify render.** `npm run type-check` clean; drive the tab (see Task 4 verify) and confirm the card renders, rates read plainly, low-n rows muted, no gambling copy.

---

### Task 4: Docs + full verification

**Files:**
- Modify: `docs/admin/backend.md` (+ `frontend.md` if the component section enumerates cards)

- [ ] **Step 1 — Doc-sync.** Add a short subsection to `docs/admin/backend.md` documenting the `packages` rollup on `RepeatPurchaseSummary` (anchor vs per-purchase attribution, invariant, low-n UI guard). If `docs/admin/frontend.md` lists the tab's cards, add the "By one-time package" card there.
- [ ] **Step 2 — Verify suite:**
  - `npm run test:repeat-purchase` → pass
  - `npm run type-check` → clean
  - `npm run lint` (scoped to touched files acceptable) → clean
  - `npm run norm:smoke` → pass
  - Drive the app: open the admin Repeat Purchases tab, confirm the new card + date-filter reactivity.
- [ ] **Step 3 — Report done.** Summarize; do **not** commit (await DJ's keyword).

## Self-Review

- **Spec coverage:** §3 data model → Task 1; §4 Norm → Task 2; §5 UI → Task 3; §6 testing → Task 1 Step 1; §7 docs → Task 4. ✓
- **Placeholder scan:** all code shown inline; no TBD. ✓
- **Type consistency:** `RepeatPackageBreakdown` field names identical across type, shaper, Norm schema, norm-context, and test. Sort key `startedBuyers` desc consistent. ✓
- **Invariant:** test asserts `Σ startedRevenue === Σ grossRevenue`, `Σ purchases === totalPurchases`, `Σ startedBuyers === oneTimeBuyers`, `Σ startedReturned === repeatBuyers`. ✓
