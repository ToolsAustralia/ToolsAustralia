# Cobber Deflection Threshold Calibration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empirically calibrate the Layer-2 deflection gate (`MIN_CONFIDENCE`, `MIN_MARGIN`) against a labelled routing dataset via an offline zero-cost sweep, then lock the result with a regression test so confidently-wrong mis-routes can't return.

**Architecture:** Thread injectable thresholds through `tryDeflect` → `searchFaqLayer` (defaults = today's constants, so production is unchanged until we deliberately update them). A manual `tsx` sweep harness runs a curated labelled set through the real matcher across a `(threshold, margin)` grid — pure in-memory, no LLM, no Mongo — and recommends the cell with **0 mis-routes / max correct-deflect**. A new `test:chat-routing` locks that cell. One `eval:chat` run (< $0.01) confirms answer quality.

**Tech Stack:** TypeScript, `tsx` standalone test/script runner (repo has no jest/vitest), existing support-chat deflection modules.

**Spec:** `docs/superpowers/specs/2026-06-29-cobber-deflection-threshold-calibration-design.md`

## Global Constraints

- **No new runtime deps.** Sweep + tests are pure TS via `tsx`.
- **Behaviour-preserving refactor:** `opts` parameters MUST default to the current constants (`MIN_CONFIDENCE = 0.18`, `MIN_MARGIN = 0.05`); existing `test:chat-deflection` must stay green before any constant change.
- **Offline / $0:** the sweep + `test:chat-routing` make NO network and NO Mongo calls (use `matchIntent` + `searchFaqs`/`searchFaqLayer` only). Only `eval:chat` (Task 6) calls Anthropic.
- **Objective (precision-first):** choose the `(threshold, margin)` with **0 mis-routes**; among those, **max correct-deflect**. A mis-route (wrong-FAQ deflection, or deflecting when it should abstain) is the failure to eliminate.
- **Single source of truth:** the labelled dataset lives in ONE file, imported by both the sweep harness and the regression test.
- **Layering:** harness → `scripts/`; dataset + tests → `src/services/support-chat/__tests__/`; refactor stays in the deflection service layer. No route-handler, model, or Norm/admin changes.
- **Commits:** the repo enforces no-auto-commit; the executor commits per task only with the user's standing authorization.

**Task dependency graph:** `[Task 1 ∥ Task 2] → Task 3 → Task 4 → Task 5 → Task 6`. Tasks 1 and 2 are independent and may run in parallel; everything else is sequential.

---

### Task 1: Injectable thresholds (behaviour-preserving refactor)

**Files:**
- Modify: `src/services/support-chat/deflection/faqSearch.ts`
- Modify: `src/services/support-chat/deflection/index.ts`
- Test: `src/services/support-chat/__tests__/deflection.test.ts` (existing — must stay green; add 2 assertions)

**Forbidden / out of scope:** do NOT change `MIN_CONFIDENCE`/`MIN_MARGIN` *values* (only rename to defaults + add opts); do NOT touch `decisionTree.ts`, `retrieve.ts`, `faqs.ts`, or any route. No Mongo/LLM.

**Interfaces:**
- Produces: `searchFaqLayer(query: string, opts?: { minConfidence?: number; minMargin?: number }): FaqSearchResult`; exported `DEFAULT_MIN_CONFIDENCE = 0.18`, `DEFAULT_MIN_MARGIN = 0.05`. `tryDeflect(question: string, opts?: { minConfidence?: number; minMargin?: number }): Promise<DeflectionResult>`.
- Consumes: existing `searchFaqs(query)` (unchanged), `matchIntent(question)` (unchanged).

- [ ] **Step 1: Add the failing assertions to `deflection.test.ts`**

Add this test function and wire it into `run()` (after `testRegressionRoutes()`):

```ts
async function testInjectableThresholds() {
  console.log("\ninjectable thresholds (refactor)");

  // A query that deflects via Layer-2 today ("are membership fees returnable" → id12).
  const q = "are membership fees returnable to me";

  // With an impossibly high floor, Layer-2 must abstain (proves opts is threaded).
  const high = await tryDeflect(q, { minConfidence: 0.99 });
  if (high.answered !== false) {
    fail('"…returnable" abstains at minConfidence 0.99', `answered=${high.answered}`);
  } else {
    pass("high minConfidence forces Layer-2 abstain");
  }

  // Default call is unchanged (still deflects).
  const def = await tryDeflect(q);
  if (def.answered !== true) {
    fail('"…returnable" still deflects at defaults', `answered=${def.answered}`);
  } else {
    pass("default thresholds unchanged (still deflects)");
  }

  // A Layer-1 intent hit is threshold-independent (opts must NOT affect it).
  const l1 = await tryDeflect("when is the draw", { minConfidence: 0.99, minMargin: 0.99 });
  if (l1.answered !== true) {
    fail("Layer-1 intent ignores thresholds", `answered=${l1.answered}`);
  } else {
    pass("Layer-1 intent unaffected by thresholds");
  }
}
```

- [ ] **Step 2: Run it — verify it FAILS to compile/pass**

Run: `npm run test:chat-deflection`
Expected: FAIL — `tryDeflect` does not yet accept a second argument (TS error or assertion fail).

- [ ] **Step 3: Refactor `faqSearch.ts`**

Replace the two `const MIN_*` declarations and the `searchFaqLayer` body:

```ts
/** Default Layer-2 accept floor (TF-IDF cosine). Calibrated 2026-06-?? — see
 *  scripts/calibrate-chat-deflection.ts + routingGoldenSet.ts. */
export const DEFAULT_MIN_CONFIDENCE = 0.18;
/** Default top1-vs-top2 ambiguity margin. */
export const DEFAULT_MIN_MARGIN = 0.05;

export interface FaqSearchOpts {
  minConfidence?: number;
  minMargin?: number;
}

export function searchFaqLayer(query: string, opts: FaqSearchOpts = {}): FaqSearchResult {
  const minConfidence = opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const minMargin = opts.minMargin ?? DEFAULT_MIN_MARGIN;

  const ranked = searchFaqs(query);
  if (ranked.length === 0) return { answered: false };

  const best = ranked[0];
  if (best.score < minConfidence) return { answered: false };

  const second = ranked[1];
  if (second && second.score >= minConfidence && best.score - second.score < minMargin) {
    return { answered: false };
  }

  return {
    answered: true,
    answer: best.entry.answer,
    sources: [{ id: best.entry.id, title: best.entry.question }],
  };
}
```

Keep the existing module docstring; update any in-file reference to `MIN_CONFIDENCE`/`MIN_MARGIN` to the new `DEFAULT_*` names.

- [ ] **Step 4: Thread `opts` through `tryDeflect` in `index.ts`**

```ts
export interface DeflectOpts {
  minConfidence?: number;
  minMargin?: number;
}

export async function tryDeflect(
  question: string,
  opts: DeflectOpts = {}
): Promise<DeflectionResult> {
  const intentMatch = matchIntent(question);
  if (intentMatch.matched) {
    const resolved = resolveToFaqEntry(intentMatch.faqId);
    if (resolved) {
      return { answered: true, answer: resolved.answer, sources: [resolved.source] };
    }
  }

  const searchResult = searchFaqLayer(question, opts);
  if (searchResult.answered) {
    return { answered: true, answer: searchResult.answer, sources: searchResult.sources };
  }

  return { answered: false };
}
```

- [ ] **Step 5: Run the test — verify PASS**

Run: `npm run test:chat-deflection`
Expected: PASS — all existing routes + the 3 new injectable-threshold assertions green. (Confirms behaviour-preserving: defaults unchanged, Layer-1 unaffected.)

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: exit 0 (no `error TS`). `ChatService.tryDeflect(userText)` and `eval-chat-goldenset.ts` still compile because `opts` is optional.

- [ ] **Step 7: Commit**

```bash
git add src/services/support-chat/deflection/faqSearch.ts src/services/support-chat/deflection/index.ts src/services/support-chat/__tests__/deflection.test.ts
git commit -m "refactor(chat): injectable deflection thresholds (defaults unchanged)"
```

---

### Task 2: Labelled routing dataset (`routingGoldenSet.ts`)

**Files:**
- Create: `src/services/support-chat/__tests__/routingGoldenSet.ts`
- Test: `src/services/support-chat/__tests__/routing-goldenset-shape.test.ts` (well-formedness guard)
- Modify: `package.json` (add `test:chat-routing-shape`)

**Forbidden / out of scope:** do NOT touch matcher code, thresholds, or `faqs.ts`. Dataset only. No Mongo/LLM. This task can run in PARALLEL with Task 1.

**Interfaces:**
- Produces: `export type RoutingExpectation = { kind: "deflect"; faqId: string } | { kind: "abstain" } | { kind: "escalate" }`; `export interface RoutingCase { question: string; expect: RoutingExpectation; note: string }`; `export const ROUTING_GOLDEN_SET: RoutingCase[]`.
- Consumes (shape guard only): `getFaqEntries()` from `@/data/faqs` to verify every `deflect.faqId` exists.

- [ ] **Step 1: Create the dataset file with types + seed cases**

```ts
/**
 * routingGoldenSet.ts
 *
 * Labelled DEFLECTION-ROUTING dataset (not answer quality). Each case states what
 * the matcher SHOULD do. Shared by scripts/calibrate-chat-deflection.ts (the sweep)
 * and routing.test.ts (the lock). Curated by hand — label quality is the point.
 *
 * For routing, "escalate" and "abstain" both mean "must NOT deflect" (the grounded
 * LLM / escalation layer owns them); they are distinguished only for readability.
 *
 * Buckets (target ~80–120 total, weighted to the Layer-2 boundary):
 *   audit mis-routes · Layer-1 regression routes · L2-paraphrase-deflect ·
 *   L2-near-miss-abstain · account-aware · off-topic · escalation.
 */
import type { RoutingExpectation } from "./routingGoldenSet"; // self-ref removed below

export type RoutingExpectation =
  | { kind: "deflect"; faqId: string }
  | { kind: "abstain" }
  | { kind: "escalate" };

export interface RoutingCase {
  question: string;
  expect: RoutingExpectation;
  note: string;
}

export const ROUTING_GOLDEN_SET: RoutingCase[] = [
  // ── Audit mis-routes (the 9 the 2026-06-27 fix corrected) ──
  { question: "how to become a member", expect: { kind: "deflect", faqId: "28" }, note: "audit: was → partner id17" },
  { question: "how membership works", expect: { kind: "deflect", faqId: "28" }, note: "audit: was → refund id19" },
  { question: "where can i see my entries", expect: { kind: "deflect", faqId: "29" }, note: "audit: was → get-more id8" },
  { question: "how many entries do i have", expect: { kind: "deflect", faqId: "29" }, note: "audit: account-aware" },
  { question: "what tier am i on", expect: { kind: "deflect", faqId: "30" }, note: "audit: was → downgrade id23" },
  { question: "did i win", expect: { kind: "deflect", faqId: "31" }, note: "audit: was → prize catalog id3" },
  { question: "where is my prize", expect: { kind: "deflect", faqId: "38" }, note: "audit: fulfilment → human" },
  { question: "why was i charged twice", expect: { kind: "deflect", faqId: "38" }, note: "audit: dispute → human" },
  { question: "when is my renewal", expect: { kind: "deflect", faqId: "11" }, note: "audit: was → failed-payment id13" },

  // ── Layer-1 regression non-regressions (must NOT move) ──
  { question: "what can i win", expect: { kind: "deflect", faqId: "3" }, note: "prize catalog stays" },
  { question: "how do i get more entries", expect: { kind: "deflect", faqId: "8" }, note: "not account-aware id29" },
  { question: "how much to join", expect: { kind: "deflect", faqId: "4" }, note: "pricing, not join overview id28" },
  { question: "how do i sign up for a one-time pack", expect: { kind: "deflect", faqId: "5" }, note: "packs, not id28" },

  // ── L2 paraphrases that SHOULD deflect (no Layer-1 signal) ──
  { question: "are membership fees returnable to me", expect: { kind: "deflect", faqId: "12" }, note: "L2: refund-policy paraphrase" },
  { question: "is there a way to pay other than card", expect: { kind: "deflect", faqId: "10" }, note: "L2: payment-methods paraphrase" },
  // … add ~18 more L2-paraphrase cases (one per FAQ topic that has a natural paraphrase).

  // ── L2 near-misses that SHOULD abstain (share words, wrong topic) ──
  { question: "do you have a physical store i can visit", expect: { kind: "abstain" }, note: "L2: 'shop' word overlap, not the shop FAQ" },
  // … add ~18 more near-miss cases.

  // ── Account-aware (must deflect to nav-only entries) ──
  { question: "how do i update my card", expect: { kind: "deflect", faqId: "37" }, note: "account-aware nav" },
  // … add the rest.

  // ── Off-topic (must abstain) ──
  { question: "what's the weather in sydney", expect: { kind: "abstain" }, note: "off-topic" },
  { question: "do you ship overseas", expect: { kind: "abstain" }, note: "no shipping FAQ" },
  // … add ~8 more.

  // ── Escalation-worthy (must NOT deflect to a topic FAQ) ──
  { question: "i want a refund for last month", expect: { kind: "escalate" }, note: "specific dispute → human" },
  // … add the rest.
];
```

**NOTE for the implementer:** the `import type … from "./routingGoldenSet"` self-reference line in the skeleton above is a copy artifact — delete it; the types are declared in this same file. Fill each `// … add …` comment to reach **~80–120 total cases** following the bucket counts in the spec (§5.1). Every `deflect.faqId` MUST be a real id in `getFaqEntries()`. Draw paraphrases/near-misses from real phrasings a tradie would type; keep `note` on every case.

- [ ] **Step 2: Write the well-formedness guard test**

Create `routing-goldenset-shape.test.ts`:

```ts
import assert from "node:assert/strict";
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { ROUTING_GOLDEN_SET } from "./routingGoldenSet";
import { getFaqEntries } from "@/data/faqs";

function main() {
  const ids = new Set(getFaqEntries().map((e) => e.id));
  assert.ok(ROUTING_GOLDEN_SET.length >= 80, `expected >= 80 routing cases, got ${ROUTING_GOLDEN_SET.length}`);

  const seenQuestions = new Set<string>();
  for (const c of ROUTING_GOLDEN_SET) {
    assert.ok(c.question.trim().length > 0, "case has a non-empty question");
    assert.ok(!seenQuestions.has(c.question), `duplicate question: "${c.question}"`);
    seenQuestions.add(c.question);
    assert.ok(c.note.trim().length > 0, `case "${c.question}" must have a note`);
    if (c.expect.kind === "deflect") {
      assert.ok(ids.has(c.expect.faqId), `case "${c.question}" deflects to missing FAQ id ${c.expect.faqId}`);
    }
  }

  // Boundary coverage: enough abstain/escalate cases to actually test precision.
  const mustNotDeflect = ROUTING_GOLDEN_SET.filter((c) => c.expect.kind !== "deflect").length;
  assert.ok(mustNotDeflect >= 20, `expected >= 20 abstain/escalate cases for precision, got ${mustNotDeflect}`);

  console.log(`PASS — routing golden set: ${ROUTING_GOLDEN_SET.length} cases, all faqIds valid, ${mustNotDeflect} must-not-deflect`);
}
main();
```

- [ ] **Step 3: Add the npm script**

In `package.json`, after `test:chat-promo`:

```json
"test:chat-routing-shape": "tsx src/services/support-chat/__tests__/routing-goldenset-shape.test.ts",
```

- [ ] **Step 4: Run the guard**

Run: `npm run test:chat-routing-shape`
Expected: PASS — `>= 80 cases, all faqIds valid, >= 20 must-not-deflect`. (If it fails for count, add more cases.)

- [ ] **Step 5: Commit**

```bash
git add src/services/support-chat/__tests__/routingGoldenSet.ts src/services/support-chat/__tests__/routing-goldenset-shape.test.ts package.json
git commit -m "test(chat): labelled routing golden set + shape guard"
```

---

### Task 3: Offline sweep harness (`calibrate-chat-deflection.ts`)

**Depends on:** Task 1 (injectable `tryDeflect`) + Task 2 (dataset).

**Files:**
- Create: `scripts/calibrate-chat-deflection.ts`
- Modify: `package.json` (add `calibrate:chat-deflection`)
- Modify: `CLAUDE.md` (Domain Manifest — add the script to `support-chat` paths)

**Forbidden / out of scope:** do NOT change thresholds, the dataset, or matcher logic. The harness READS only. No Mongo/LLM (it must run with no `ANTHROPIC_API_KEY` and no DB).

**Interfaces:**
- Consumes: `tryDeflect(question, opts)` (Task 1), `ROUTING_GOLDEN_SET` (Task 2), `matchIntent` (to flag Layer-1 cases), `DEFAULT_MIN_CONFIDENCE`/`DEFAULT_MIN_MARGIN` (to mark the baseline cell).
- Produces: a console report (grid + confusion + recommendation). No exported API.

- [ ] **Step 1: Write the harness**

```ts
#!/usr/bin/env npx tsx
/**
 * calibrate-chat-deflection.ts
 *
 * OFFLINE, ZERO-COST sweep of the Layer-2 deflection gate (minConfidence, minMargin)
 * over the labelled ROUTING_GOLDEN_SET. No LLM, no Mongo. Picks the cell with the
 * fewest mis-routes (precision-first), then the most correct deflections.
 *
 * Run: npm run calibrate:chat-deflection
 */
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(process.cwd(), ".env.local") }); // only for data-file price IDs at import

import { tryDeflect } from "../src/services/support-chat/deflection";
import { matchIntent } from "../src/services/support-chat/deflection/decisionTree";
import {
  DEFAULT_MIN_CONFIDENCE,
  DEFAULT_MIN_MARGIN,
} from "../src/services/support-chat/deflection/faqSearch";
import {
  ROUTING_GOLDEN_SET,
  type RoutingCase,
} from "../src/services/support-chat/__tests__/routingGoldenSet";

const THRESHOLDS = Array.from({ length: 10 }, (_, i) => +(0.12 + i * 0.02).toFixed(2)); // 0.12..0.30
const MARGINS = Array.from({ length: 11 }, (_, i) => +(0.0 + i * 0.01).toFixed(2)); // 0.00..0.10

interface CellResult {
  threshold: number;
  margin: number;
  correctDeflect: number;
  misRoute: number;
  correctAbstain: number;
  missedDeflect: number;
}

async function scoreCell(threshold: number, margin: number): Promise<CellResult> {
  const r: CellResult = { threshold, margin, correctDeflect: 0, misRoute: 0, correctAbstain: 0, missedDeflect: 0 };
  for (const c of ROUTING_GOLDEN_SET) {
    const res = await tryDeflect(c.question, { minConfidence: threshold, minMargin: margin });
    const deflectedId = res.answered ? res.sources?.[0]?.id : undefined;
    if (c.expect.kind === "deflect") {
      if (deflectedId === c.expect.faqId) r.correctDeflect++;
      else if (deflectedId) r.misRoute++; // deflected to the WRONG faq
      else r.missedDeflect++; // abstained when it should have deflected
    } else {
      if (deflectedId) r.misRoute++; // deflected when it should have abstained/escalated
      else r.correctAbstain++;
    }
  }
  return r;
}

/** Layer-1 mis-routes are threshold-independent — flag them once for a rule fix. */
function layer1MisRoutes(): RoutingCase[] {
  const out: RoutingCase[] = [];
  for (const c of ROUTING_GOLDEN_SET) {
    const m = matchIntent(c.question);
    if (!m.matched) continue;
    if (c.expect.kind === "deflect" && m.faqId !== c.expect.faqId) out.push(c);
    if (c.expect.kind !== "deflect") out.push(c); // Layer-1 deflected something that should abstain
  }
  return out;
}

async function main() {
  console.log(`Calibrating over ${ROUTING_GOLDEN_SET.length} routing cases · ${THRESHOLDS.length}×${MARGINS.length} grid\n`);

  const l1Bad = layer1MisRoutes();
  if (l1Bad.length > 0) {
    console.log(`⚠ ${l1Bad.length} LAYER-1 mis-route(s) — fix the intent rule, NOT the threshold:`);
    for (const c of l1Bad) console.log(`   "${c.question}" expected ${JSON.stringify(c.expect)}`);
    console.log("");
  }

  const cells: CellResult[] = [];
  let done = 0;
  const total = THRESHOLDS.length * MARGINS.length;
  for (const t of THRESHOLDS) {
    for (const m of MARGINS) {
      cells.push(await scoreCell(t, m));
      if (++done % 20 === 0 || done === total) console.log(`  swept ${done}/${total} cells`);
    }
  }

  // Precision-first: min mis-route, then max correct-deflect.
  const ranked = [...cells].sort(
    (a, b) => a.misRoute - b.misRoute || b.correctDeflect - a.correctDeflect
  );
  const best = ranked[0];
  const baseline = cells.find(
    (c) => c.threshold === DEFAULT_MIN_CONFIDENCE && c.margin === DEFAULT_MIN_MARGIN
  );

  console.log("\n── Mis-route grid (rows=threshold, cols=margin) ──");
  console.log("        " + MARGINS.map((m) => m.toFixed(2)).join("  "));
  for (const t of THRESHOLDS) {
    const row = MARGINS.map((m) => {
      const cell = cells.find((c) => c.threshold === t && c.margin === m)!;
      return String(cell.misRoute).padStart(4);
    });
    console.log(`${t.toFixed(2)}  ${row.join("")}`);
  }

  console.log("\n── Baseline (current 0.18 / 0.05) ──");
  if (baseline) console.log(`  correctDeflect=${baseline.correctDeflect} misRoute=${baseline.misRoute} missedDeflect=${baseline.missedDeflect} correctAbstain=${baseline.correctAbstain}`);

  console.log("\n── RECOMMENDED ──");
  console.log(`  minConfidence=${best.threshold} minMargin=${best.margin}`);
  console.log(`  correctDeflect=${best.correctDeflect} misRoute=${best.misRoute} missedDeflect=${best.missedDeflect} correctAbstain=${best.correctAbstain}`);
  console.log("\n  (Prefer a STABLE cell: confirm neighbours have the same mis-route=0 before committing.)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json`, near the other `chat` scripts:

```json
"calibrate:chat-deflection": "tsx scripts/calibrate-chat-deflection.ts",
```

- [ ] **Step 3: Add the script to the Domain Manifest**

In `CLAUDE.md`, in the `support-chat` domain `paths` array (after `scripts/eval-chat-goldenset.ts`), add:

```json
        "scripts/calibrate-chat-deflection.ts",
```

- [ ] **Step 4: Run it — verify offline execution + a report**

Run: `npm run calibrate:chat-deflection`
Expected: prints the sweep progress, a mis-route grid, the baseline line, and a RECOMMENDED cell. Completes in seconds with **no** network/Mongo error. (Do not act on the numbers yet — that's Task 4.)

- [ ] **Step 5: Commit**

```bash
git add scripts/calibrate-chat-deflection.ts package.json CLAUDE.md
git commit -m "feat(chat): offline deflection-threshold calibration harness"
```

---

### Task 4: Run calibration, apply chosen thresholds, fix any Layer-1 mis-route

**Depends on:** Task 3.

**Files:**
- Modify: `src/services/support-chat/deflection/faqSearch.ts` (`DEFAULT_MIN_CONFIDENCE` / `DEFAULT_MIN_MARGIN` values)
- Modify (ONLY if the harness flags Layer-1 mis-routes): `src/services/support-chat/deflection/decisionTree.ts`

**Forbidden / out of scope:** do NOT edit the harness or dataset to make numbers look better; if a label is genuinely wrong, fix the *label* in Task 2's file and note it. No threshold value chosen without a 0-mis-route cell.

**Interfaces:** consumes the harness report; produces updated default constants.

- [ ] **Step 1: Run the harness and record the result**

Run: `npm run calibrate:chat-deflection`
Read: the RECOMMENDED `(minConfidence, minMargin)` and the baseline line.

- [ ] **Step 2: If Layer-1 mis-routes were flagged, fix the intent rule(s)**

Edit `decisionTree.ts` (add a signal/exclude or reorder), re-run Step 1 until the `⚠ LAYER-1 mis-route` block is empty. (Same technique as the 2026-06-27 fix. If none were flagged, skip.)

- [ ] **Step 3: Choose a STABLE cell and apply it**

Pick the recommended cell **only if** `misRoute === 0` AND `correctDeflect >= baseline.correctDeflect` AND its grid neighbours also have `misRoute === 0` (a plateau, not a spike). Update the defaults in `faqSearch.ts`, e.g.:

```ts
export const DEFAULT_MIN_CONFIDENCE = 0.16; // calibrated 2026-06-29 (0 mis-routes, +N deflects vs 0.18) — see calibrate:chat-deflection
export const DEFAULT_MIN_MARGIN = 0.04;
```

(Use the actual chosen numbers; keep the comment citing the date + harness.)

- [ ] **Step 4: Re-run the harness — confirm the committed cell is 0 mis-routes**

Run: `npm run calibrate:chat-deflection`
Expected: the baseline line now equals the chosen cell and shows `misRoute=0`.

- [ ] **Step 5: Existing deflection suite still green**

Run: `npm run test:chat-deflection`
Expected: PASS (the 19 routes + injectable assertions hold at the new defaults).

- [ ] **Step 6: Commit**

```bash
git add src/services/support-chat/deflection/faqSearch.ts src/services/support-chat/deflection/decisionTree.ts
git commit -m "feat(chat): apply calibrated deflection thresholds (0 mis-routes on golden set)"
```

---

### Task 5: Lock with `test:chat-routing`

**Depends on:** Task 4 (chosen thresholds) + Task 2 (dataset).

**Files:**
- Create: `src/services/support-chat/__tests__/routing.test.ts`
- Modify: `package.json` (add `test:chat-routing`)

**Forbidden / out of scope:** the test uses DEFAULT thresholds (no opts) — it locks production behaviour. No Mongo/LLM. Do NOT loosen assertions to pass; if it fails, the thresholds/labels are wrong, not the test.

**Interfaces:** consumes `tryDeflect` (defaults) + `ROUTING_GOLDEN_SET`.

- [ ] **Step 1: Write the lock test**

```ts
/**
 * routing.test.ts — locks the calibrated deflection routing.
 * Runs the labelled set through tryDeflect at PRODUCTION (default) thresholds.
 * Asserts ZERO mis-routes (the failure that triggered the 2026-06-27 fix) and that
 * correct deflections meet the calibrated baseline. Offline; no LLM/Mongo.
 * Run: npm run test:chat-routing
 */
import assert from "node:assert/strict";
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { tryDeflect } from "../deflection";
import { ROUTING_GOLDEN_SET } from "./routingGoldenSet";

// Calibrated floor: correct deflections must meet/exceed this (set from Task 4 output).
const MIN_CORRECT_DEFLECT = 0; // ← replace with the calibrated baseline integer from Task 4.

async function main() {
  let correctDeflect = 0;
  const misRoutes: string[] = [];

  for (const c of ROUTING_GOLDEN_SET) {
    const res = await tryDeflect(c.question);
    const deflectedId = res.answered ? res.sources?.[0]?.id : undefined;
    if (c.expect.kind === "deflect") {
      if (deflectedId === c.expect.faqId) correctDeflect++;
      else if (deflectedId) misRoutes.push(`"${c.question}" → id${deflectedId}, expected id${c.expect.faqId}`);
      // abstaining on a should-deflect is a missed deflection (allowed; not a mis-route).
    } else if (deflectedId) {
      misRoutes.push(`"${c.question}" → id${deflectedId}, expected ${c.expect.kind}`);
    }
  }

  for (const m of misRoutes) console.error(`  MIS-ROUTE  ${m}`);
  assert.strictEqual(misRoutes.length, 0, `${misRoutes.length} mis-route(s) — see above`);
  assert.ok(
    correctDeflect >= MIN_CORRECT_DEFLECT,
    `correctDeflect ${correctDeflect} < calibrated baseline ${MIN_CORRECT_DEFLECT}`
  );

  console.log(`PASS — routing lock: 0 mis-routes, ${correctDeflect} correct deflections (>= ${MIN_CORRECT_DEFLECT})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Set `MIN_CORRECT_DEFLECT`**

Replace the `0` with the calibrated `correctDeflect` integer from Task 4 Step 4 (the chosen cell's value). This makes the test fail if a future change silently reduces correct deflections.

- [ ] **Step 3: Add the npm script**

```json
"test:chat-routing": "tsx src/services/support-chat/__tests__/routing.test.ts",
```

- [ ] **Step 4: Run it — verify PASS**

Run: `npm run test:chat-routing`
Expected: `PASS — routing lock: 0 mis-routes, N correct deflections`.

- [ ] **Step 5: Commit**

```bash
git add src/services/support-chat/__tests__/routing.test.ts package.json
git commit -m "test(chat): lock calibrated routing (0 mis-routes regression guard)"
```

---

### Task 6: Validate, document, build-verify

**Depends on:** Tasks 1–5.

**Files:**
- Modify: `docs/ai-chatbot/gotchas.md` (calibration method + chosen values + re-run trigger)
- Modify: `docs/infrastructure/README.md` (new `calibrate:chat-deflection` + `test:chat-routing` / `test:chat-routing-shape` scripts)
- (Manifest already updated in Task 3.)

**Forbidden / out of scope:** no code changes here — docs + validation only.

- [ ] **Step 1: Answer-quality validation (the one paid step, < $0.01)**

Run: `npm run eval:chat`
Expected: `eval:chat PASSED` (pass rate ≥ 80%). If it dropped below 80%, a calibrated threshold pushed a good question into a bad LLM answer — revisit Task 4 (likely too aggressive a floor). Record the pass rate.

- [ ] **Step 2: Full chat suite + type-check + build**

Run each; all must be green:
```bash
npm run test:chat-deflection && npm run test:chat-routing && npm run test:chat-routing-shape && npm run test:chat-faqs && npm run type-check
npm run build   # expect BUILD_EXIT=0, "Compiled successfully", no PageNotFoundError
```

- [ ] **Step 3: Document in `docs/ai-chatbot/gotchas.md`**

Add a section "Deflection thresholds are calibrated, not eyeballed (2026-06-29)" covering: the chosen `(minConfidence, minMargin)` + measured mis-route=0 / correct-deflect=N; that `routingGoldenSet.ts` + `calibrate:chat-deflection` produced them; `test:chat-routing` locks them; and the **re-run trigger** — "regenerate the FAQ corpus or change the scorer ⇒ re-run `calibrate:chat-deflection` (TF-IDF scores shift) and update the defaults + `MIN_CORRECT_DEFLECT`."

- [ ] **Step 4: Document scripts in `docs/infrastructure/README.md`**

Add `calibrate:chat-deflection` (offline sweep, $0), `test:chat-routing` (the lock), and `test:chat-routing-shape` (dataset guard) to the support-chat npm-scripts list.

- [ ] **Step 5: Commit**

```bash
git add docs/ai-chatbot/gotchas.md docs/infrastructure/README.md
git commit -m "docs(chat): calibrated deflection thresholds + re-run trigger"
```

---

## Self-review

**Spec coverage:** §5.1 dataset → Task 2; §5.2 refactor → Task 1; §5.3 harness → Task 3; §5.4 apply+lock → Tasks 4+5; §5.5 validate → Task 6; §6 files → all tasks; §8 risks (Layer-1 mis-route, behaviour-preserving, plateau cell, corpus-drift trigger) → Tasks 1/4/6; §9 success criteria → Tasks 4–6 checks. No gaps.

**Placeholder scan:** the only intentional fill-ins are the dataset cases (Task 2, by design — counts + buckets + seed given) and the two calibrated numbers (Task 4/5, produced by the harness, with exact steps to obtain + insert them). No vague "add error handling" steps.

**Type consistency:** `tryDeflect(question, opts?)`, `searchFaqLayer(query, opts?)`, `RoutingCase`/`RoutingExpectation`/`ROUTING_GOLDEN_SET`, `DEFAULT_MIN_CONFIDENCE`/`DEFAULT_MIN_MARGIN`, and `res.sources?.[0]?.id` are used identically across Tasks 1, 3, 5. Consistent.

**Known seams to watch during execution:** (a) the self-reference `import type` line in the Task 2 skeleton is explicitly flagged for deletion; (b) the Task 2 file declares the types it also "consumes" — implementer declares once, no circular import.
