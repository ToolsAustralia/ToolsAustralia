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

const THRESHOLDS = Array.from({ length: 21 }, (_, i) => +(0.12 + i * 0.02).toFixed(2)); // 0.12..0.52
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

  console.log(`\n── Baseline (current ${DEFAULT_MIN_CONFIDENCE} / ${DEFAULT_MIN_MARGIN}) ──`);
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
