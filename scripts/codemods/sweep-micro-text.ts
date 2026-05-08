import { runCodemod } from "./lib/codemod-runner";
import { rewriteArbitrarySizes } from "./lib/replace-classname";

/**
 * Micro-text rounding map. text-[9px] and text-[11px] round to the nearest
 * scale step per spec D8 — 1px in dense UI rarely matters and the rounding
 * is documented in docs/shared-ui/tailwind-conventions.md.
 *
 *   8px  → text-3xs (exact)
 *   9px  → text-3xs (rounded down 1px)
 *   10px → text-2xs (exact)
 *   11px → text-2xs (rounded down 1px)
 */
const TEXT_MAP = {
  utility: "text",
  values: {
    "8px": "3xs",
    "9px": "3xs",
    "10px": "2xs",
    "11px": "2xs",
  },
};

async function main() {
  const unmapped = new Set<string>();

  await runCodemod({
    name: "sweep-micro-text — Phase 1b (text-[Npx] → text-2xs/text-3xs)",
    roots: ["src"],
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    exclude: [
      "/components/email-preview/",
      "/lib/email/",
      "/components/invoice/InvoiceEmailTemplate",
      "/__tests__/",
      "/codemods/",
    ],
    transform: (content) => rewriteArbitrarySizes(content, TEXT_MAP, unmapped),
  });

  if (unmapped.size > 0) {
    console.log("\n--- Unmapped sizes (left untouched) ---");
    for (const v of [...unmapped].sort()) {
      console.log(`  text-[${v}]`);
    }
    console.log("\n  (Sizes ≥12px stay as Tailwind defaults — text-xs, text-sm, etc.)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
