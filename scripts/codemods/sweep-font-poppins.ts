import { runCodemod, type FileChange } from "./lib/codemod-runner";

/**
 * sweep-font-poppins — replace the arbitrary `font-['Poppins']` Tailwind class
 * with the real `font-poppins` utility.
 *
 * WHY: `font-['Poppins']` compiles to `font-family: Poppins` — a bare family
 * name that next/font never registers globally (next/font exposes Poppins only
 * through the hashed `var(--font-poppins)` face). So every `font-['Poppins']`
 * element currently renders a FALLBACK font. The `font-poppins` utility
 * (tailwind.config `fontFamily.poppins → [var(--font-poppins), "Poppins", …]`)
 * resolves to the actual loaded Poppins.
 *
 * This is a mechanical class rename — it makes ~300 elements across ~95 files
 * start rendering REAL Poppins (an intended, enumerated visual change; see the
 * Tier-2 Task-5 report). It touches the arbitrary `font-['Poppins']` class in
 * both its bare and fallback-suffixed forms (`font-['Poppins',sans-serif]`);
 * every other class is left byte-identical. Idempotent (a second run is a no-op).
 *
 * Follows the sweep-brand-red conventions: dry-run by default, `--apply` to
 * write, per-file replacement summary. Note the `.css` file that also carries
 * this literal (globals.css `.form-input` @apply, and the h1-h6 family) is fixed
 * by hand — this codemod only walks .ts/.tsx/.jsx/.js.
 */
const TO = "font-poppins";
// Matches the bare `font-['Poppins']` AND the fallback-suffixed forms
// `font-['Poppins',sans-serif]` / `font-['Poppins',_sans-serif]` (any fallback list).
// A leading variant chain (`sm:`, `dark:hover:`) sits BEFORE `font-` and is left intact.
// `font-poppins` already includes the sans-serif fallback, so the suffix is redundant.
// Idempotent: the output `font-poppins` never re-matches.
const RE = /font-\['Poppins'(?:\s*,[^\]]*)?\]/g;

function rewriteFontPoppins(content: string): { content: string; replacements: FileChange["replacements"] } {
  const replacements: FileChange["replacements"] = [];
  const lines = content.split("\n");
  const newLines = lines.map((line, i) => {
    RE.lastIndex = 0;
    return line.replace(RE, (match) => {
      replacements.push({ before: match, after: TO, line: i + 1 });
      return TO;
    });
  });
  return { content: newLines.join("\n"), replacements };
}

async function main() {
  await runCodemod({
    name: "sweep-font-poppins (font-['Poppins'] → font-poppins)",
    roots: ["src"],
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    exclude: [
      // Email templates — mail clients can't parse Tailwind
      "/components/email-preview/",
      "/lib/email/",
      "/components/invoice/InvoiceEmailTemplate",
      // Test fixtures + the codemods themselves
      "/__tests__/",
      "/codemods/",
    ],
    transform: (content) => rewriteFontPoppins(content),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
