import fs from "node:fs";
import path from "node:path";
import { NORM_ENDPOINTS, type NormEndpointSpec } from "../src/lib/internal-norm/classification";

const out = {
  version: 1 as const,
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
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`✓ wrote ${out.endpoints.length} endpoints → ${outPath}`);
