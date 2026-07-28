import fs from "node:fs";
import path from "node:path";
import { NORM_ENDPOINTS, type NormEndpointSpec } from "../src/lib/internal-norm/classification";

const out = {
  version: 1 as const,
  // Stamped only when the endpoint set actually changes — see the write guard below.
  generatedAt: new Date().toISOString(),
  endpoints: Object.entries(NORM_ENDPOINTS)
    // forbidden is no longer a tier; unwired entries are roadmap-only
    .filter(([, spec]) => !!(spec as NormEndpointSpec).responseSchema)
    .map(([key, specRaw]) => {
      const spec = specRaw as NormEndpointSpec;
      return {
        registryKey: key,
        tier: spec.tier,
        path: spec.path,
        method: spec.method,
        summary: spec.summary,
      };
    }),
};

const outPath = path.resolve(process.cwd(), "src/generated/normToolsManifest.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });

/**
 * Timestamp-only churn guard (panel F-010). This script runs in `prebuild`/`predev`,
 * so a bare write re-stamped `generatedAt` on every dev boot and every branch picked
 * up a one-line diff of a committed generated file — merge-conflict noise that also
 * implies a Norm-surface change that never happened. Only write when the ENDPOINT
 * SET differs; otherwise keep the existing file (and its original timestamp) byte
 * for byte, so `generatedAt` now means "when the manifest last actually changed".
 */
const next = JSON.stringify(out, null, 2);
let unchanged = false;
if (fs.existsSync(outPath)) {
  try {
    const prev = JSON.parse(fs.readFileSync(outPath, "utf8")) as typeof out;
    // Compare EVERYTHING except the timestamp (panel F-045). Naming the fields
    // individually was correct only while the file had exactly two of them — any field
    // added to `out` later would have been computed and then silently discarded on every
    // unchanged run. Excluding `generatedAt` keeps the guard right by construction.
    const { generatedAt: _prevStamp, ...prevRest } = prev;
    const { generatedAt: _nextStamp, ...nextRest } = out;
    unchanged = JSON.stringify(prevRest) === JSON.stringify(nextRest);
  } catch {
    unchanged = false; // unreadable/corrupt → rewrite
  }
}

if (unchanged) {
  console.log(`✓ ${out.endpoints.length} endpoints unchanged → kept ${outPath} (no timestamp churn)`);
} else {
  fs.writeFileSync(outPath, next);
  console.log(`✓ wrote ${out.endpoints.length} endpoints → ${outPath}`);
}
