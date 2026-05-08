import { promises as fs } from "node:fs";
import * as path from "node:path";
import { walk } from "./walk-tsx";

export interface FileChange {
  file: string;
  replacements: Array<{ before: string; after: string; line: number }>;
}

export interface CodemodConfig {
  /** Human name shown in CLI output */
  name: string;
  /** Roots to walk (relative to repo root) */
  roots: readonly string[];
  /** File extensions to consider (e.g. [".tsx", ".ts"]) */
  extensions: readonly string[];
  /** Path substrings to skip (cross-platform — / separators) */
  exclude: readonly string[];
  /** The transform: receives content, returns new content + replacements */
  transform: (content: string, file: string) => { content: string; replacements: FileChange["replacements"] };
}

/**
 * Run a codemod. Reads `--apply` / `--dry-run` from argv (default: dry-run).
 * Writes a summary to stdout.
 */
export async function runCodemod(config: CodemodConfig): Promise<void> {
  const apply = process.argv.includes("--apply");
  const verbose = process.argv.includes("--verbose");
  const repoRoot = process.cwd();

  console.log(`\n=== ${config.name} ===`);
  console.log(`Mode: ${apply ? "APPLY (will modify files)" : "DRY-RUN (no files modified)"}`);
  console.log(`Roots: ${config.roots.join(", ")}`);
  console.log(`Excludes: ${config.exclude.join(", ") || "(none)"}\n`);

  const changes: FileChange[] = [];
  let scanned = 0;

  for (const root of config.roots) {
    const absRoot = path.resolve(repoRoot, root);
    try {
      await fs.access(absRoot);
    } catch {
      console.warn(`  (skip: root not found: ${root})`);
      continue;
    }
    for await (const file of walk(absRoot, config.extensions, config.exclude)) {
      scanned++;
      const content = await fs.readFile(file, "utf8");
      const { content: newContent, replacements } = config.transform(content, file);
      if (replacements.length === 0) continue;
      const rel = path.relative(repoRoot, file);
      changes.push({ file: rel, replacements });
      if (apply) {
        await fs.writeFile(file, newContent, "utf8");
      }
    }
  }

  // Summary
  const totalReplacements = changes.reduce((sum, c) => sum + c.replacements.length, 0);
  console.log(`Scanned: ${scanned} files`);
  console.log(`Files affected: ${changes.length}`);
  console.log(`Total replacements: ${totalReplacements}`);

  if (verbose || !apply) {
    console.log("\n--- Replacements ---");
    for (const c of changes) {
      console.log(`\n${c.file}:`);
      // Group identical before→after pairs to keep output scannable
      const grouped = new Map<string, { line: number[]; count: number }>();
      for (const r of c.replacements) {
        const key = `${r.before}  →  ${r.after}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.line.push(r.line);
          existing.count++;
        } else {
          grouped.set(key, { line: [r.line], count: 1 });
        }
      }
      for (const [key, info] of grouped) {
        console.log(`  L${info.line.slice(0, 3).join(",")}${info.line.length > 3 ? `,…(${info.count} total)` : ""}: ${key}`);
      }
    }
  }

  if (!apply) {
    console.log(`\n(dry-run — re-run with --apply to write changes)`);
  } else {
    console.log(`\nApplied. Run \`npm run lint && npm run type-check && npm run build\` next.`);
  }
}
