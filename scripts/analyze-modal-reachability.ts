/**
 * Static reachability: which modal/overlay modules are imported (transitively)
 * from Next.js app entry files (layouts, pages, route handlers, middleware).
 *
 * If a modal is only imported from files never pulled in from those seeds,
 * it is "unreachable" (dead for the shipped app graph — same idea as Knip/unimported).
 *
 * Run: npx tsx scripts/analyze-modal-reachability.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(REPO_ROOT, "src");

const PRIMITIVE_UI = new Set(["ModalContainer", "ModalHeader", "ModalContent", "ModalFooter"]);

const ENTRY_BASENAMES = new Set([
  "page",
  "layout",
  "route",
  "loading",
  "error",
  "template",
  "default",
  "not-found",
  "global-error",
  "opengraph-image",
  "twitter-image",
  "icon",
  "apple-icon",
]);

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function walkDir(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkDir(full, acc);
    else acc.push(full);
  }
  return acc;
}

function collectEntrySeeds(): string[] {
  const seeds: string[] = [];
  const appDir = path.join(SRC_ROOT, "app");
  for (const file of walkDir(appDir)) {
    const posix = toPosix(path.relative(REPO_ROOT, file));
    // Dev-only routes (e.g. /dev/modals) import many modals for preview — exclude so they do not mark everything "reachable".
    if (posix.includes("/src/app/dev/")) continue;
    const ext = path.extname(file);
    if (![".tsx", ".ts", ".jsx", ".js"].includes(ext)) continue;
    const base = path.basename(file, ext);
    if (ENTRY_BASENAMES.has(base)) seeds.push(path.resolve(file));
  }
  for (const extra of ["middleware.ts", "instrumentation.ts"]) {
    const p = path.join(SRC_ROOT, extra);
    if (fs.existsSync(p)) seeds.push(path.resolve(p));
  }
  return [...new Set(seeds)];
}

function tryResolveFile(basePath: string): string | null {
  const exts = ["", ".tsx", ".ts", ".jsx", ".js"];
  const candidates = [
    ...exts.map((e) => basePath + e),
    ...exts.map((e) => path.join(basePath, "index" + e)),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.resolve(c);
  }
  return null;
}

function resolveImport(importerAbs: string, spec: string): string | null {
  const trimmed = spec.trim();
  if (!trimmed.startsWith(".") && !trimmed.startsWith("@/")) return null;

  let target: string;
  if (trimmed.startsWith("@/")) {
    target = path.join(SRC_ROOT, trimmed.slice(2));
  } else {
    target = path.resolve(path.dirname(importerAbs), trimmed);
  }

  const resolved = tryResolveFile(target);
  if (!resolved || !resolved.startsWith(SRC_ROOT)) return null;
  return resolved;
}

function extractImportSpecifiers(source: string, importerAbs: string): string[] {
  const specs: string[] = [];
  const lines = source.split("\n");

  const addSpec = (spec: string) => {
    const t = spec.trim();
    if (t.startsWith(".") || t.startsWith("@/")) specs.push(t);
  };

  for (const raw of lines) {
    const noLineComment = raw.split("//")[0] ?? "";
    const line = noLineComment.trim();
    if (!line || line.startsWith("*")) continue;

    if (/^import\s+type\b/.test(line)) continue;

    const side = line.match(/^import\s+['"]([^'"]+)['"]\s*;/);
    if (side) {
      addSpec(side[1]);
      continue;
    }

    const fromM = line.match(/\bfrom\s+['"]([^'"]+)['"]/);
    if (fromM) addSpec(fromM[1]);
  }

  const dyn = source.matchAll(/import\s*\(\s*['"]([\.\/@][^'"]*)['"]\s*\)/g);
  for (const m of dyn) addSpec(m[1]);

  const req = source.matchAll(/require\s*\(\s*['"]([\.\/@][^'"]*)['"]\s*\)/g);
  for (const m of req) addSpec(m[1]);

  const exportStar = source.matchAll(/export\s+\*\s+from\s+['"]([\.\/@][^'"]+)['"]/g);
  for (const m of exportStar) addSpec(m[1]);

  const exportNamed = source.matchAll(/export\s+\{[^}]+\}\s+from\s+['"]([\.\/@][^'"]+)['"]/g);
  for (const m of exportNamed) addSpec(m[1]);

  /** Multiline `import { … } from 'x'` — any `from` for local aliases */
  const fromRe = /\bfrom\s+['"]([\.\/@][^'"]+)['"]/g;
  let fm: RegExpExecArray | null;
  while ((fm = fromRe.exec(source)) !== null) {
    const lb = source.slice(Math.max(0, fm.index - 120), fm.index);
    if (/\bimport\s+type\b/.test(lb)) continue;
    addSpec(fm[1]);
  }

  const resolvedPaths: string[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    const r = resolveImport(importerAbs, spec);
    if (r && !seen.has(r)) {
      seen.add(r);
      resolvedPaths.push(r);
    }
  }
  return resolvedPaths;
}

const MODALS_ROOT_EDGE_COMPONENTS = new Set(["AdminPromoToggle", "UpsellManager", "UnifiedModalManager"]);

function isModalInventoryFile(relPosix: string): boolean {
  if (!relPosix.endsWith(".tsx")) return false;
  if (relPosix.includes("/dev/")) return false;

  const base = path.basename(relPosix, ".tsx");
  if (PRIMITIVE_UI.has(base)) return false;

  if (relPosix === "src/components/ui/FullscreenImageViewer.tsx") return true;

  if (relPosix.startsWith("src/components/modals/") && !relPosix.startsWith("src/components/modals/ui/")) {
    if (base.endsWith("Modal") || MODALS_ROOT_EDGE_COMPONENTS.has(base)) return true;
    return false;
  }
  if (relPosix === "src/components/modals/ui/IconPickerModal.tsx") return true;

  if (relPosix.includes("/admin/") && base.includes("Modal")) return true;
  if (relPosix.startsWith("src/components/auth/") && base.includes("Modal")) return true;
  if (relPosix.includes("/ab-testing/") && base.includes("Modal")) return true;

  return false;
}

function collectModalInventory(absPaths: string[]): { rel: string; abs: string }[] {
  const all = new Map<string, string>();
  for (const abs of absPaths) {
    if (!abs.startsWith(SRC_ROOT)) continue;
    if (![".tsx", ".ts"].includes(path.extname(abs))) continue;
    const rel = toPosix(path.relative(REPO_ROOT, abs));
    if (isModalInventoryFile(rel)) all.set(rel, abs);
  }
  return [...all.entries()].map(([rel, abs]) => ({ rel, abs })).sort((a, b) => a.rel.localeCompare(b.rel));
}

function bfsReachable(seeds: string[]): Set<string> {
  const reachable = new Set<string>();
  const queue = [...seeds];

  while (queue.length) {
    const file = queue.shift()!;
    if (reachable.has(file)) continue;
    if (!fs.existsSync(file)) continue;
    reachable.add(file);

    let source: string;
    try {
      source = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    const ext = path.extname(file);
    if (![".tsx", ".ts", ".jsx", ".js"].includes(ext)) continue;

    for (const dep of extractImportSpecifiers(source, file)) {
      if (!reachable.has(dep)) queue.push(dep);
    }
  }

  return reachable;
}

function main() {
  const seeds = collectEntrySeeds();
  const reachableAbs = bfsReachable(seeds);
  const allSrcFiles = walkDir(SRC_ROOT);
  const modalInv = collectModalInventory(allSrcFiles.map((p) => path.resolve(p)));

  const modals = modalInv.map(({ rel, abs }) => ({
    path: rel,
    reachable: reachableAbs.has(abs),
  }));

  const reachableModals = modals.filter((m) => m.reachable).length;
  const out = {
    generatedAt: new Date().toISOString(),
    method:
      "Transitive imports from Next.js app entry files (page, layout, route, loading, error, template, default, not-found, global-error, middleware, instrumentation). Does not evaluate dynamic non-literal imports or runtime-only usage.",
    entrySeedCount: seeds.length,
    reachableSrcFileCount: [...reachableAbs].filter((p) => p.startsWith(SRC_ROOT)).length,
    modalInventoryCount: modals.length,
    reachableModalCount: reachableModals,
    unreachableModalCount: modals.length - reachableModals,
    modals,
  };

  const outDir = path.join(SRC_ROOT, "data", "dev");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "modal-reachability.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

  console.log(`Wrote ${toPosix(path.relative(REPO_ROOT, outPath))}`);
  console.log(`Entry seeds: ${seeds.length}, reachable src files: ${out.reachableSrcFileCount}`);
  console.log(`Modals tracked: ${modals.length}, reachable: ${reachableModals}, unreachable: ${out.unreachableModalCount}`);
  if (out.unreachableModalCount > 0) {
    console.log("\nUnreachable modal files:");
    for (const m of modals.filter((x) => !x.reachable)) console.log(`  - ${m.path}`);
  }
}

main();
