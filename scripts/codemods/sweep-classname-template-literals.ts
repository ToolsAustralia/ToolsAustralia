/**
 * sweep-classname-template-literals — converts simple template-literal classNames
 * to cn() calls.
 *
 * BEFORE: className={`base ${active ? "bg-red-600" : "bg-gray-100"} ${className}`}
 * AFTER:  className={cn("base", active ? "bg-red-600" : "bg-gray-100", className)}
 *
 * Conservative: only touches the simple shape (string literal segments + ternary
 * or variable interpolations). Skips multi-line, nested templates, and function
 * calls inside ${...}.
 *
 * Usage:
 *   npm run sweep:classname-templates:dry   # preview
 *   npm run sweep:classname-templates       # apply
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { walk } from "./lib/walk-tsx";

interface FileChange {
  file: string;
  replacements: Array<{ before: string; after: string; line: number }>;
}

const ROOTS = ["src/components", "src/app", "src/utils", "src/hooks", "src/features"] as const;
const EXTENSIONS = [".tsx", ".jsx"] as const;
const EXCLUDES = [
  "/__tests__/",
  "/codemods/",
  "/email-preview/",
  "/lib/email/",
  "/components/invoice/InvoiceEmailTemplate",
  "node_modules",
] as const;

/**
 * Match a className={`...`} attribute on a single line.
 * Captures the template literal content (without backticks).
 *
 * Limitations:
 *   - Single-line only (no `\n` in the template literal)
 *   - Doesn't handle nested template literals (rare in className)
 */
const CLASSNAME_RE = /className=\{`([^`\n]*)`\}/g;

/** Split a template literal body into segments. Returns an array where each
 * segment is { kind: "string", value: "..." } or { kind: "expr", value: "..." }.
 * The expr value is the inner expression (inside ${...}). */
function splitTemplate(
  body: string
): Array<{ kind: "string"; value: string } | { kind: "expr"; value: string }> {
  const segments: Array<
    { kind: "string"; value: string } | { kind: "expr"; value: string }
  > = [];
  let i = 0;
  let buf = "";
  while (i < body.length) {
    if (body[i] === "$" && body[i + 1] === "{") {
      if (buf.length > 0) {
        segments.push({ kind: "string", value: buf });
        buf = "";
      }
      // Find the matching } accounting for balanced braces inside
      let depth = 1;
      let j = i + 2;
      while (j < body.length && depth > 0) {
        if (body[j] === "{") depth++;
        else if (body[j] === "}") depth--;
        if (depth === 0) break;
        j++;
      }
      if (depth !== 0) {
        // Unbalanced — bail (return non-segmented to signal skip)
        return [];
      }
      const exprBody = body.slice(i + 2, j);
      segments.push({ kind: "expr", value: exprBody });
      i = j + 1;
    } else {
      buf += body[i];
      i++;
    }
  }
  if (buf.length > 0) {
    segments.push({ kind: "string", value: buf });
  }
  return segments;
}

/** Determine if an expression is "simple" enough to inline as a cn() argument.
 * Allowed: identifier, ident.field, ternary with simple branches, string literal,
 * !ident, ident && "string", ident || ident.
 * Disallowed: function calls (paren after identifier without preceding operator),
 * nested template literals (`backtick`), object/array literals.
 */
function isSimpleExpression(expr: string): boolean {
  const trimmed = expr.trim();
  if (trimmed.length === 0) return false;
  // Reject nested template literals
  if (trimmed.includes("`")) return false;
  // Reject object literals (top-level { ... })
  if (/^\s*\{/.test(trimmed)) return false;
  // Reject array literals (top-level [...])
  if (/^\s*\[/.test(trimmed)) return false;
  // Reject function calls. Heuristic: identifier followed by ( anywhere outside string literal contexts.
  // Conservative test: any "(" preceded by an identifier-character (alphanumeric or _ or .).
  // This rejects fn() and obj.fn() but allows ternaries with parens like (a ? b : c).
  // But ternaries can have parens too — we need to allow them.
  // Strategy: strip out string literals + balanced parens that aren't preceded by an identifier-char.
  //
  // Simpler heuristic: reject if the expression contains a "(" that's preceded by [a-zA-Z0-9_$\].]
  // outside of string literals.
  let inString: false | "'" | '"' = false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (inString === false) {
      if (c === "'" || c === '"') {
        inString = c;
      } else if (c === "(") {
        const prev = trimmed[i - 1];
        if (prev && /[a-zA-Z0-9_$\].]/.test(prev)) {
          // Function call — reject
          return false;
        }
      }
    } else {
      if (c === inString && trimmed[i - 1] !== "\\") {
        inString = false;
      }
    }
  }
  return true;
}

/** Build the cn() argument list from segments.
 * String segments become "string-literal" args (split on whitespace, quoted as one
 * "merged" string per segment to preserve spacing).
 * Expression segments become unquoted args.
 *
 * Returns the args as a single string ready to be embedded inside cn(...).
 * Returns null if the segments aren't safely transformable.
 */
function buildCnArgs(
  segments: ReturnType<typeof splitTemplate>
): string | null {
  if (segments.length === 0) return null;

  // Collapse adjacent strings, drop empty segments after collapsing
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.kind === "string") {
      const trimmed = seg.value
        .replace(/^\s+/, "")
        .replace(/\s+$/, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (trimmed.length > 0) {
        // Wrap in double quotes; escape any embedded double quotes
        const escaped = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        parts.push(`"${escaped}"`);
      }
    } else {
      // expr
      if (!isSimpleExpression(seg.value)) {
        return null;
      }
      parts.push(seg.value.trim());
    }
  }

  if (parts.length === 0) return null;
  return parts.join(", ");
}

/** Ensure the `import { cn } from "@/utils/cn";` exists in the file content.
 * If not, inject after the last existing import (preserving existing imports).
 * Returns the (possibly modified) content + a flag indicating whether an import was added.
 *
 * If a different `cn` symbol is already imported from another path, we BAIL on the file
 * (return null) — don't risk a name clash.
 */
function ensureCnImport(
  content: string
): { content: string; added: boolean } | null {
  // Look for existing import of cn
  const importCnRe =
    /^import\s+(?:\{[^}]*\bcn\b[^}]*\}|cn)\s+from\s+["']([^"']+)["']/m;
  const existing = content.match(importCnRe);
  if (existing) {
    if (existing[1] === "@/utils/cn") {
      // Already correctly imported — no change
      return { content, added: false };
    }
    // Different cn imported — bail
    return null;
  }

  // No cn import. Inject after the entire import block at the top of the file.
  // We need to handle multi-line imports like:
  //   import {
  //     foo,
  //     bar,
  //   } from "module";
  // Strategy: scan char-by-char tracking whether we're inside an import statement.
  // Track the last character position of the last import statement (including its closing ;).
  const lines = content.split("\n");
  let lastImportLine = -1; // last line index that is part of an import statement
  let inMultilineImport = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inMultilineImport) {
      // Count braces to find end of import
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        else if (ch === "}") braceDepth--;
      }
      lastImportLine = i;
      if (braceDepth <= 0) {
        // This line closes the multi-line import (e.g. `} from "...";`)
        inMultilineImport = false;
        braceDepth = 0;
      }
    } else if (/^\s*import\s/.test(line)) {
      lastImportLine = i;
      // Check if this import is multi-line (opens a brace without closing it)
      let openBraces = 0;
      for (const ch of line) {
        if (ch === "{") openBraces++;
        else if (ch === "}") openBraces--;
      }
      if (openBraces > 0) {
        inMultilineImport = true;
        braceDepth = openBraces;
      }
    } else if (lastImportLine >= 0 && line.trim() !== "" && !/^\s*\/\//.test(line)) {
      // Non-import, non-blank, non-comment line after we've seen imports — stop scanning
      break;
    }
  }

  if (lastImportLine < 0) {
    // No import block — check for "use client" directive at top
    const useClientRe = /^("use client";?\s*\n)/;
    const useClientMatch = content.match(useClientRe);
    if (useClientMatch) {
      return {
        content:
          useClientMatch[0] +
          `\nimport { cn } from "@/utils/cn";\n` +
          content.slice(useClientMatch[0].length),
        added: true,
      };
    }
    return {
      content: `import { cn } from "@/utils/cn";\n` + content,
      added: true,
    };
  }

  // Insert after lastImportLine
  lines.splice(lastImportLine + 1, 0, `import { cn } from "@/utils/cn";`);
  return {
    content: lines.join("\n"),
    added: true,
  };
}

interface Replacement {
  before: string;
  after: string;
  line: number;
}

function rewriteFile(
  content: string
): { content: string; replacements: Replacement[]; importAdded: boolean } | null {
  const replacements: Replacement[] = [];

  const newContent = content.replace(CLASSNAME_RE, (match, body, offset) => {
    const segments = splitTemplate(body);
    if (segments.length === 0) return match; // bail on this match

    // Skip if there are NO expressions (it's just a static string template)
    const hasExpr = segments.some((s) => s.kind === "expr");
    if (!hasExpr) return match;

    const args = buildCnArgs(segments);
    if (args === null) return match; // unsafe to transform

    const newAttr = `className={cn(${args})}`;

    // Compute line number
    const lineNum = content.slice(0, offset).split("\n").length;
    replacements.push({ before: match, after: newAttr, line: lineNum });

    return newAttr;
  });

  if (replacements.length === 0) {
    return null;
  }

  // Ensure cn() is imported
  const importResult = ensureCnImport(newContent);
  if (importResult === null) {
    // Some other `cn` is already imported — bail entirely on this file
    return null;
  }

  return {
    content: importResult.content,
    replacements,
    importAdded: importResult.added,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const repoRoot = process.cwd();

  console.log(`\n=== sweep-classname-template-literals ===`);
  console.log(
    `Mode: ${apply ? "APPLY (will modify files)" : "DRY-RUN (no files modified)"}`
  );
  console.log(`Roots: ${ROOTS.join(", ")}`);
  console.log(`Excludes: ${EXCLUDES.join(", ")}\n`);

  const changes: FileChange[] = [];
  let scanned = 0;
  let importsAddedCount = 0;

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
      // Quick gate: skip files without any className={`...`}
      if (!CLASSNAME_RE.test(content)) {
        // RE has /g, reset lastIndex
        CLASSNAME_RE.lastIndex = 0;
        continue;
      }
      CLASSNAME_RE.lastIndex = 0;

      const result = rewriteFile(content);
      if (result === null) {
        continue;
      }
      const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
      changes.push({ file: rel, replacements: result.replacements });
      if (result.importAdded) importsAddedCount++;
      if (apply) {
        await fs.writeFile(file, result.content, "utf8");
      }
    }
  }

  const totalReplacements = changes.reduce(
    (sum, c) => sum + c.replacements.length,
    0
  );
  console.log(`Scanned: ${scanned} files`);
  console.log(`Files affected: ${changes.length}`);
  console.log(`Total replacements: ${totalReplacements}`);
  console.log(`Imports added: ${importsAddedCount} files`);

  if (!apply) {
    // Print up to 30 sample replacements
    console.log(`\n--- Sample replacements (first 30) ---`);
    let shown = 0;
    for (const c of changes) {
      if (shown >= 30) break;
      for (const r of c.replacements) {
        if (shown >= 30) break;
        const beforeShort =
          r.before.length > 90 ? r.before.slice(0, 87) + "..." : r.before;
        const afterShort =
          r.after.length > 90 ? r.after.slice(0, 87) + "..." : r.after;
        console.log(`  ${c.file}:${r.line}`);
        console.log(`    BEFORE: ${beforeShort}`);
        console.log(`    AFTER:  ${afterShort}`);
        shown++;
      }
    }
    console.log(`\n(dry-run — re-run with --apply to write changes)`);
  } else {
    console.log(
      `\nApplied. Run \`npm run lint && npm run type-check && npm run build\` next.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
