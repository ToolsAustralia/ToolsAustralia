/**
 * audit-component-decomposition — scans src/components and src/app .tsx files,
 * scores each against the criteria in docs/shared-ui/component-decomposition-criteria.md,
 * and writes a ranked backlog to docs/shared-ui/decomposition-backlog.md.
 *
 * Usage:
 *   npm run audit:decomposition
 *
 * The output backlog is the work queue for future decomposition (Plan 7+).
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { walk } from "./lib/walk-tsx";

interface FileScore {
  path: string;
  loc: number;
  signals: Array<{ name: string; weight: number; detail?: string }>;
  totalScore: number;
}

const ROOTS = ["src/components", "src/app"] as const;
const EXTENSIONS = [".tsx"] as const;
const EXCLUDES = ["__tests__", "node_modules", "/dist/", "/build/", "/.next/"] as const;

function countMatches(content: string, pattern: RegExp): number {
  return (content.match(pattern) ?? []).length;
}

function findLongestClassName(content: string): number {
  const re = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g;
  let max = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    const value = m[1] ?? m[2] ?? m[3] ?? "";
    if (value.length > max) max = value.length;
  }
  return max;
}

function countTopLevelTernariesInReturn(content: string): number {
  // Cheap heuristic: count `?` in the file body excluding type narrowings
  // (which usually appear as `?:` in TS or `?.`/`??`). Better than nothing.
  // Specifically count JSX-conditional shape `{cond ? <X /> : <Y />}` or `{cond ? "a" : "b"}`.
  const jsxConditional = content.match(/\{[\s\S]{0,80}\?\s*[\s\S]{0,200}\s*:\s*[\s\S]{0,200}\}/g) ?? [];
  return jsxConditional.length;
}

function scoreFile(filePath: string, content: string): FileScore {
  const loc = content.split("\n").length;
  const signals: FileScore["signals"] = [];

  // ----- Strong signals (1 point) -----

  if (loc > 800) {
    signals.push({ name: "loc>800", weight: 1, detail: `${loc} LOC` });
  }

  if (/<style( jsx)?[ >]/.test(content)) {
    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    const styleLOC = styleMatch ? styleMatch[1].split("\n").length : 0;
    signals.push({ name: "styled-jsx-block", weight: 1, detail: `${styleLOC} LOC of styled-jsx` });
  }

  if (/:global\(/.test(content)) {
    const count = countMatches(content, /:global\(/g);
    signals.push({ name: ":global()-selectors", weight: 1, detail: `${count} :global() selectors` });
  }

  const iconFactoryCount = countMatches(content, /function\s+\w*Icon\s*\(/g);
  if (iconFactoryCount >= 3) {
    signals.push({ name: "inline-svg-icons", weight: 1, detail: `${iconFactoryCount} inline SVG factory functions` });
  }

  const ternaryCount = countTopLevelTernariesInReturn(content);
  if (ternaryCount >= 4) {
    signals.push({ name: "ternary-explosion", weight: 1, detail: `${ternaryCount} JSX ternaries` });
  }

  // Concern buckets — count distinct categories of imports
  const buckets = new Set<string>();
  if (/from ["']@\/hooks/.test(content) || /\buse[A-Z]\w+\(/.test(content)) buckets.add("hooks");
  if (/from ["']@\/(services|lib|utils)/.test(content)) buckets.add("services");
  if (/from ["']@\/models/.test(content)) buckets.add("models");
  if (/from ["']@\/components/.test(content)) buckets.add("components");
  if (/from ["']next-auth|@tanstack\/react-query|@stripe/.test(content)) buckets.add("integrations");
  if (buckets.size >= 3) {
    signals.push({ name: "multiple-concerns", weight: 1, detail: `${buckets.size} concern buckets: ${[...buckets].join(", ")}` });
  }

  // ----- Weaker signals (0.5 points) -----

  if (loc >= 500 && loc <= 800) {
    signals.push({ name: "loc-500-800", weight: 0.5, detail: `${loc} LOC` });
  }

  const arbitraryClassCount = countMatches(content, /-\[/g);
  if (arbitraryClassCount >= 20) {
    signals.push({ name: "many-arbitraries", weight: 0.5, detail: `${arbitraryClassCount} arbitrary-value classNames` });
  }

  const longestClass = findLongestClassName(content);
  if (longestClass > 300) {
    signals.push({ name: "long-className", weight: 0.5, detail: `longest className=${longestClass} chars` });
  }

  const useStateCount = countMatches(content, /\buseState\s*[<(]/g);
  if (useStateCount >= 5) {
    signals.push({ name: "many-useState", weight: 0.5, detail: `${useStateCount} useState slices` });
  }

  const totalScore = signals.reduce((sum, s) => sum + s.weight, 0);

  return {
    path: filePath,
    loc,
    signals,
    totalScore,
  };
}

async function main() {
  const repoRoot = process.cwd();
  const scores: FileScore[] = [];
  let scanned = 0;

  for (const root of ROOTS) {
    const absRoot = path.resolve(repoRoot, root);
    try {
      await fs.access(absRoot);
    } catch {
      console.warn(`  (skip: root not found: ${root})`);
      continue;
    }
    for await (const file of walk(absRoot, EXTENSIONS, EXCLUDES)) {
      scanned++;
      const content = await fs.readFile(file, "utf8");
      const score = scoreFile(path.relative(repoRoot, file).replace(/\\/g, "/"), content);
      if (score.totalScore > 0) {
        scores.push(score);
      }
    }
  }

  // Sort by score descending
  scores.sort((a, b) => b.totalScore - a.totalScore);

  // Bucket
  const high = scores.filter((s) => s.totalScore >= 5);
  const medium = scores.filter((s) => s.totalScore >= 3 && s.totalScore < 5);
  const low = scores.filter((s) => s.totalScore > 0 && s.totalScore < 3);

  const today = new Date().toISOString().split("T")[0];

  let md = `# Component Decomposition Backlog\n\n`;
  md += `Generated: ${today} by \`npm run audit:decomposition\`\n\n`;
  md += `Scanned: ${scanned} files. Candidates with score > 0: ${scores.length}.\n\n`;
  md += `Scoring criteria: see [component-decomposition-criteria.md](./component-decomposition-criteria.md).\n\n`;
  md += `**Workflow:** decompose top-of-list first. Apply the [Plan 2 pattern](../superpowers/plans/2026-05-08-ui-cleanup-plan-2-cancellation-modal-pilot.md): folder + sub-components + CSS module + smoke test.\n\n`;
  md += `---\n\n`;

  function formatBucket(label: string, items: FileScore[]): string {
    if (items.length === 0) return `## ${label}\n\n_(none)_\n\n`;
    let out = `## ${label}\n\n`;
    for (const item of items) {
      const signalsList = item.signals.map((s) => `${s.name}${s.detail ? ` (${s.detail})` : ""}`).join("; ");
      out += `- [${item.path}](../../${item.path}) — **score ${item.totalScore}** — ${item.loc} LOC\n`;
      out += `  - signals: ${signalsList}\n\n`;
    }
    return out;
  }

  md += formatBucket(`High priority (score ≥ 5) — ${high.length} files`, high);
  md += formatBucket(`Medium priority (score 3-4) — ${medium.length} files`, medium);
  md += formatBucket(`Low priority (score 1-2) — ${low.length} files`, low);

  const outPath = path.resolve(repoRoot, "docs/shared-ui/decomposition-backlog.md");
  await fs.writeFile(outPath, md, "utf8");

  console.log(`\n=== audit-component-decomposition ===`);
  console.log(`Scanned: ${scanned} files`);
  console.log(`Candidates: ${scores.length}`);
  console.log(`  High priority (≥5): ${high.length}`);
  console.log(`  Medium priority (3-4): ${medium.length}`);
  console.log(`  Low priority (1-2): ${low.length}`);
  console.log(`\nWrote backlog to docs/shared-ui/decomposition-backlog.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
