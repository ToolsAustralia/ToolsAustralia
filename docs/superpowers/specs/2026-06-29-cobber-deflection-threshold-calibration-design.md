# Cobber deflection threshold calibration — design

> **Status:** approved design (2026-06-29). Phase-3 follow-up to the 2026-06-27 answer-quality overhaul.
> **Owner-facing summary:** make Cobber's "answer from the FAQ vs. ask the AI" decision provably accurate by tuning it against a labelled test set — at **$0 calibration cost** (the tuning runs offline) — and lock it so the quality can never silently regress.

## 1. Problem

The support chatbot answers in layers: **Layer-1** high-precision intent rules → **Layer-2** TF-IDF cosine FAQ search → **LLM** (grounded) → human escalation. Layer-2 has two gate constants in `src/services/support-chat/deflection/faqSearch.ts`:

- `MIN_CONFIDENCE = 0.18` — accept the top FAQ only if its score clears this.
- `MIN_MARGIN = 0.05` — if the runner-up also clears the floor and is within this margin, abstain (ambiguous → let the grounded LLM answer).

These two values were **set by hand against the 19-route regression test** in the 2026-06-27 fix, not calibrated against data. They are almost certainly *good enough*, but "almost certainly" is exactly what this Phase-3 step replaces with a measured number. The risk of a mis-tuned Layer-2 gate is the failure mode that started this whole thread: a **confidently-wrong canned answer** (the audit measured 45% mis-routing before the fix).

The existing `scripts/eval-chat-goldenset.ts` (`eval:chat`) does **not** solve this: it grades *answer quality* (facts present, no hallucination, escalates when expected) via an LLM batch grader, and every `shouldDeflect` item in its golden set is an obvious **Layer-1** hit — so it never exercises the Layer-2 threshold boundary, and it costs money + is non-deterministic.

## 2. Goal

Empirically calibrate `(MIN_CONFIDENCE, MIN_MARGIN)` to the values that **minimise confidently-wrong mis-routes (target: 0) while maximising correct deflections**, using a deterministic offline sweep over a labelled routing dataset; lock the result with a regression test; validate end-to-end answer quality with one cheap `eval:chat` run.

**Objective function (precision-first):** among all `(threshold, margin)` grid cells, choose the cell with **0 mis-routes**, and among those, the one with the **most correct deflections** (fewest missed deflections). Rationale: a missed deflection costs one cheap grounded-LLM call; a wrong deflection is a confidently-wrong answer with no model in the loop. Precision over recall.

## 3. Non-goals

- **Not** changing the layered architecture, the TF-IDF scorer, or the intent-rule set (except fixing any *Layer-1* mis-route the sweep happens to surface — see §6).
- **Not** introducing dense/vector embeddings (the `$vectorSearch` seam stays for when the corpus outgrows lexical matching).
- **Not** building CI/cron automation (the regression test is CI-safe and free, but wiring it into a pipeline is out of scope here).
- **Not** re-grading answer quality beyond a single confirmatory `eval:chat` run.

## 4. Key insight (cost)

The **routing calibration is 100% offline and $0**: `matchIntent` and `searchFaqs` are pure in-memory functions — no network, no Mongo, no LLM. We can therefore sweep a fine grid over a *large* labelled set and compute full precision/recall for free, in seconds. The **only** paid step is the single confirmatory `eval:chat` run (Anthropic Batch grader, **< $0.01**). This is what makes "max-accuracy methodology at near-zero cost" achievable.

## 5. Design

### 5.1 Labelled routing dataset — `routingGoldenSet.ts`

A curated fixture (NOT bulk-generated — label quality is the whole point), shared by the sweep harness and the regression test so there is a single source of truth.

```ts
export type RoutingExpectation =
  | { kind: "deflect"; faqId: string } // must deflect to this exact FAQ id
  | { kind: "abstain" }                // must fall through to the grounded LLM
  | { kind: "escalate" };              // must reach the LLM/escalation (treated as "must NOT deflect")

export interface RoutingCase {
  question: string;
  expect: RoutingExpectation;
  /** Why this case exists / its source — e.g. "audit mis-route", "L2 paraphrase", "near-miss". */
  note: string;
}
```

**Size & composition (~80–120 cases), weighted to the Layer-2 boundary** (the only thing the thresholds affect):

| Bucket | ~count | Purpose |
|---|---|---|
| Known audit mis-routes (the 9) → correct target | 9 | The regressions this whole effort fixed |
| The existing 19 regression routes | (folded in) | Keep Layer-1 coverage |
| **L2 paraphrases that SHOULD deflect** | ~20 | Recall: phrasings with no Layer-1 signal that still clearly map to one FAQ |
| **L2 near-misses that SHOULD abstain** | ~20 | Precision: questions that share words with an FAQ but aren't really answered by it |
| Account-aware "my X" | ~10 | Must deflect to the account-aware nav entries (29/30/37) |
| Off-topic / out-of-scope | ~10 | Must abstain (→ LLM declines/escalates) |
| Escalation-worthy (refund/dispute/human) | ~10 | Must not deflect to a topic FAQ |

For routing purposes `escalate` and `abstain` are equivalent ("must NOT deflect" — the LLM layer owns them); they are distinguished only for dataset readability.

### 5.2 Enabling refactor — injectable thresholds (single code path)

So the sweep exercises the **exact production logic** (no duplicated gate), thread optional thresholds through the deflection entry points, defaulting to the current module constants:

- `faqSearch.ts`: export `DEFAULT_MIN_CONFIDENCE` / `DEFAULT_MIN_MARGIN`; `searchFaqLayer(query, opts?: { minConfidence?: number; minMargin?: number })` uses `opts.* ?? DEFAULT_*`.
- `deflection/index.ts`: `tryDeflect(question, opts?: { minConfidence?: number; minMargin?: number })` passes `opts` to `searchFaqLayer`. Layer-1 (`matchIntent`) is threshold-independent and unchanged.

With defaults equal to today's constants, **production behaviour is byte-identical** until §6 updates the constants; existing tests stay green.

### 5.3 Sweep harness — `scripts/calibrate-chat-deflection.ts`

A manual `tsx` script (offline, deterministic, no LLM/Mongo). For each `(threshold, margin)` in a grid (e.g. threshold ∈ {0.12…0.30 step 0.02}, margin ∈ {0.00…0.10 step 0.01}):

1. For each `RoutingCase`, call `tryDeflect(question, { minConfidence, minMargin })`. The deflected FAQ id is read from the result's `sources[0].id` (`answered: false` ⇒ abstained).
2. Compare the outcome to `expect`, tallying:
   - **correct-deflect** — deflected to the expected `faqId`.
   - **mis-route** — deflected to a *wrong* `faqId`, or deflected when `expect` was abstain/escalate. *(The damaging case.)*
   - **correct-abstain** — did not deflect when `expect` was abstain/escalate.
   - **missed-deflect** — abstained when `expect` was deflect.
3. Print a grid (mis-route + correct-deflect per cell), a confusion summary for the recommended cell, and the **recommended `(threshold, margin)`** per the §2 objective. The current production cell `(0.18, 0.05)` is marked as **baseline** in the output so the §9.2 "no recall regression" comparison is read directly from the same run. The grid step sizes are chosen so the baseline cell is an exact grid point.

It must emit, per the ops-script convention, an up-front total, progress, and a final summary. **Layer-1 mis-routes are flagged separately** — they are threshold-independent and signal an intent-rule fix (§6), not a tuning change.

### 5.4 Apply + lock

- Update `MIN_CONFIDENCE` / `MIN_MARGIN` in `faqSearch.ts` to the recommended values (with a comment citing the calibration date + dataset).
- New `src/services/support-chat/__tests__/routing.test.ts` (`test:chat-routing`): runs the full `routingGoldenSet` through `tryDeflect` at the committed (default) thresholds and asserts **mis-routes === 0** and **correct-deflect ≥ the recorded baseline**. This is the permanent, free, CI-safe guardrail.

### 5.5 Validate

Run `eval:chat` once (< $0.01) after re-tuning to confirm end-to-end answer quality is still ≥ 80% (no recall loss pushed good questions into bad LLM answers).

## 6. Files

| Action | Path | Notes |
|---|---|---|
| NEW | `src/services/support-chat/__tests__/routingGoldenSet.ts` | Labelled dataset + types (shared fixture) |
| NEW | `scripts/calibrate-chat-deflection.ts` | Offline sweep harness (`calibrate:chat-deflection`) |
| NEW | `src/services/support-chat/__tests__/routing.test.ts` | `test:chat-routing` regression lock |
| MODIFY | `src/services/support-chat/deflection/faqSearch.ts` | Injectable thresholds + apply calibrated values |
| MODIFY | `src/services/support-chat/deflection/index.ts` | `tryDeflect(question, opts?)` threads thresholds |
| MODIFY | `src/services/support-chat/deflection/decisionTree.ts` | ONLY if the sweep surfaces a Layer-1 mis-route |
| MODIFY | `package.json` | `calibrate:chat-deflection` + `test:chat-routing` scripts |
| MODIFY | `CLAUDE.md` (Domain Manifest) | add `scripts/calibrate-chat-deflection.ts` to `support-chat` paths |
| MODIFY | `docs/ai-chatbot/` + `docs/infrastructure/README.md` | method, chosen values, re-run trigger, new script/test |

**Layering:** harness = `scripts/`; dataset + tests = `__tests__/`; the refactor stays in the deflection service layer. No route-handler or model changes. No Norm/admin surface touched.

## 7. Test scope

- `test:chat-routing` (NEW) — the lock: mis-routes === 0, correct-deflect ≥ baseline.
- `test:chat-deflection` (existing) — must stay green (proves the refactor is behaviour-preserving + the 19 routes hold).
- `test:chat-faqs`, `test:chat-knowledge`, `test:chat-promo`, `test:chat-escalation`, `test:chat-service` — must stay green.
- `eval:chat` — one confirmatory run ≥ 80%.
- `npm run type-check` + `npm run build` — green.

## 8. Risks & mitigations

- **Label noise** — a wrong expected-route would calibrate toward the wrong target. *Mitigation:* curate from the audit findings + manual review; keep the set hand-written, not generated; `note` on every case.
- **Over-fitting to a small corpus (38 FAQs)** — *Mitigation:* the precision-first objective (mis-route = 0) is robust; the margin keeps ambiguous cases flowing to the LLM. The chosen cell should be a *plateau* (stable across neighbours), not a lone spike — the harness prints neighbours so we pick a stable cell.
- **Corpus drift** — adding/removing FAQs shifts TF-IDF scores, so the optimum can move. *Mitigation:* documented as an explicit "re-run `calibrate:chat-deflection` when the FAQ corpus changes" trigger; `test:chat-routing` fails loudly if a change reintroduces a mis-route.
- **Refactor changes prod behaviour** — *Mitigation:* `opts` default to today's constants; `test:chat-deflection` must pass *before* any constant change (behaviour-preserving checkpoint).
- **A Layer-1 mis-route surfaces** — the threshold sweep can't fix an intent-rule mis-route. *Mitigation:* the harness flags these separately; fix the rule/exclude (same technique as the 2026-06-27 work) and re-run.

## 9. Success criteria (definition of done)

1. `calibrate:chat-deflection` runs offline ($0) and recommends a `(threshold, margin)` cell with **0 mis-routes** on the labelled set.
2. The chosen cell's **correct-deflect ≥** the count under the current 0.18/0.05 (no recall regression; ideally a gain).
3. Constants updated; `test:chat-routing` green (mis-routes = 0) and all existing chat tests green.
4. `eval:chat` ≥ 80%.
5. `type-check` + `build` green; docs + manifest updated; doc-sync satisfied.
6. Any Layer-1 mis-route surfaced is fixed within this work.

## 10. Out-of-scope follow-ups (noted, not built)

- Wiring `test:chat-routing` / `eval:chat` into CI or a cron cadence.
- Dense/vector retrieval (`$vectorSearch`) when the corpus outgrows lexical matching.
- Auto-generating routing cases from real production chat logs (would need a PII-safe export).
