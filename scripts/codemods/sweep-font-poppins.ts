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
 * This is a mechanical class rename — it makes ~297 elements across ~95 files
 * start rendering REAL Poppins (an intended, enumerated visual change; see the
 * Tier-2 Task-5 report). It touches only the exact token `font-['Poppins']`;
 * every other class is left byte-identical. Idempotent (a second run is a no-op).
 *
 * Follows the sweep-brand-red conventions: dry-run by default, `--apply` to
 * write, per-file replacement summary. Note the `.css` file that also carries
 * this literal (globals.css `.form-input` @apply, and the h1-h6 family) is fixed
 * by hand — this codemod only walks .ts/.tsx/.jsx/.js.
 */
const FROM = "font-['Poppins']";
const TO = "font-poppins";

function rewriteFontPoppins(content: string): { content: string; replacements: FileChange["replacements"] } {
  const replacements: FileChange["replacements"] = [];
  const lines = content.split("\n");
  const newLines = lines.map((line, i) => {
    if (!line.includes(FROM)) return line;
    const count = line.split(FROM).length - 1;
    for (let k = 0; k < count; k++) {
      replacements.push({ before: FROM, after: TO, line: i + 1 });
    }
    return line.split(FROM).join(TO);
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
