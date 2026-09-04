#!/usr/bin/env node
/**
 * check-norm-parity — every Norm route file must have a registry entry, and vice versa.
 *
 * WHY THIS CANNOT BE CAUGHT ANY OTHER WAY
 * The internal-norm gateway wraps every route in withNorm(), which looks the request
 * up in the registry (src/lib/internal-norm/classification.ts) to find its permission,
 * rate limit and responseSchema. A route with no registry entry is a RUNTIME failure —
 * `tsc` cannot see it, `next build` cannot see it, and regenerate-and-diff cannot see
 * it either, because build-norm-manifest.ts generates the manifest FROM the registry.
 * Add a route, forget the registry, and the manifest still matches itself perfectly.
 *
 * CLAUDE.md rule 10 requires the two to move in lockstep. This is the statically
 * checkable half. The other half — responseSchema matching what the handler actually
 * returns — is a runtime 500 and still needs `npm run norm:smoke` against a live
 * server, which CI cannot do.
 *
 * READ-ONLY.
 *
 * Usage:  npm run check:norm-parity
 * Docs:   docs/internal-norm/, docs/dev-tooling/ci.md
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const V1 = "src/app/api/internal/norm/v1";

// A registry entry is only WIRED once it has a responseSchema. build-norm-manifest.ts
// filters on exactly that — its own comment reads "unwired entries are roadmap-only" —
// so an entry without one is a deliberately-declared future endpoint with no route
// file and no manifest presence. Demanding a route for those would make this check
// cry wolf on 35 entries that are working as designed.
//
// The two meta routes are wired but carry no responseSchema because they are the
// gateway's own health/manifest endpoints rather than data reads.
const META_ROUTES = new Set(["/v1/health", "/v1/manifest"]);

/** "src/app/api/internal/norm/v1/pending-actions/[id]/status/route.ts" -> "/v1/pending-actions/:id/status" */
function routeFileToPath(file) {
  const rel = file.slice(V1.length).replace(/\/route\.ts$/, "");
  const segments = rel.split("/").filter(Boolean).map((s) => (/^\[.+\]$/.test(s) ? ":" + s.slice(1, -1) : s));
  return "/v1" + (segments.length ? "/" + segments.join("/") : "");
}

const routeFiles = execSync(`git ls-files "${V1}"`, { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .map((f) => f.trim())
  .filter((f) => f.endsWith("/route.ts"));

const routePaths = new Set(routeFiles.map(routeFileToPath));

// Registry entries, read from the SOURCE rather than the manifest — the manifest is
// generated from the registry, so comparing the two would be circular.
// Entries are `"key": { … },` at two-space indent; split on that so each chunk can be
// asked whether it declares a responseSchema.
// NOTE ON COUNTS: there are more registry ENTRIES than unique PATHS — 34 paths carry
// two or more HTTP methods (e.g. /v1/ab-testing/experiments/:id is GET + PATCH +
// DELETE), and each method is its own entry. A route file serves all methods for its
// path, so comparing at path granularity is the correct question here: "is there a
// route file for this path". Do not read a path count as an entry count.
const registrySrc = readFileSync(join(root, "src/lib/internal-norm/classification.ts"), "utf8");
let entryCount = 0;
const registryAll = new Set();
const registryWired = new Set();
// Split BEFORE each entry so every chunk holds exactly one.
// Keys are UNQUOTED when they are valid identifiers (`health: {`, `manifest: {`) and
// quoted only when they contain a dot (`"pending-actions.status": {`) — matching only
// the quoted form merged health+manifest into one chunk, and since only the first
// `path:` in a chunk is read, /v1/manifest vanished and was reported as an
// unregistered route. Match both forms.
for (const chunk of registrySrc.split(/(?=\n {2}(?:"[A-Za-z][\w.\-]*"|[A-Za-z][\w$]*)\s*:\s*\{)/)) {
  const m = /^\s*path:\s*"([^"]+)"/m.exec(chunk);
  if (!m) continue;
  entryCount++;
  registryAll.add(m[1]);
  if (/\bresponseSchema\s*:/.test(chunk)) registryWired.add(m[1]);
}

const manifest = JSON.parse(readFileSync(join(root, "src/generated/normToolsManifest.json"), "utf8"));
const manifestPaths = new Set((manifest.endpoints ?? []).map((e) => e.path));

const routesWithoutRegistry = [...routePaths].filter((p) => !registryAll.has(p)).sort();
// Only WIRED entries are expected to have a route or appear in the manifest.
const wiredWithoutRoute = [...registryWired].filter((p) => !routePaths.has(p)).sort();
const wiredWithoutManifest = [...registryWired].filter((p) => !manifestPaths.has(p) && !META_ROUTES.has(p)).sort();
const roadmapOnly = [...registryAll].filter((p) => !registryWired.has(p) && !META_ROUTES.has(p));

console.log(
  `${routeFiles.length} route files · ${entryCount} registry entries over ${registryAll.size} unique paths ` +
    `(${registryWired.size} wired, ${roadmapOnly.length} roadmap-only) · ${manifestPaths.size} manifest endpoints`
);

let failed = false;

if (routesWithoutRegistry.length) {
  failed = true;
  console.log(`\nXX ${routesWithoutRegistry.length} route(s) with NO registry entry:`);
  for (const p of routesWithoutRegistry) console.log(`     ${p}`);
  console.log(`   withNorm() cannot resolve a permission or responseSchema for these — a runtime failure`);
  console.log(`   invisible to tsc and to next build. Add each to src/lib/internal-norm/classification.ts.`);
}

if (wiredWithoutRoute.length) {
  failed = true;
  console.log(`\nXX ${wiredWithoutRoute.length} WIRED registry entr(ies) with NO route file:`);
  for (const p of wiredWithoutRoute) console.log(`     ${p}`);
  console.log(`   These carry a responseSchema, so the manifest advertises them to Norm and`);
  console.log(`   calling one 404s. Either build the route, or drop the responseSchema to`);
  console.log(`   move the entry back to roadmap-only.`);
}

if (wiredWithoutManifest.length) {
  failed = true;
  console.log(`\nXX ${wiredWithoutManifest.length} wired entr(ies) missing from the generated manifest:`);
  for (const p of wiredWithoutManifest) console.log(`     ${p}`);
  console.log(`   Run \`npm run build:norm-manifest\` and commit the result.`);
}

if (!failed) {
  console.log(`OK — routes, registry and manifest are in lockstep (${roadmapOnly.length} roadmap-only entries ignored).`);
  console.log("NOTE: this proves the paths line up, NOT that each responseSchema matches what");
  console.log("      its handler returns. That mismatch is a runtime 500 and needs `npm run norm:smoke`.");
}

process.exit(failed ? 1 : 0);
