import { runCodemod } from "./lib/codemod-runner";
import { rewriteHexArbitraries } from "./lib/replace-classname";

/**
 * Snap map: every brand-red hex literal currently in the codebase → its token.
 * Hexes NOT in this map are intentionally left untouched (e.g. #dc2626 and #ef4444
 * are Tailwind-default reds — the audit identified them as needing per-file visual
 * review in Phase 5; they're not safe to auto-convert).
 */
const HEX_TO_TOKEN: Record<string, string> = {
  "#ee0000": "red-600",   // brand primary (existing override)
  "#cc0000": "red-675",   // hover/darker pair (between 650 and 700 in lightness)
  "#ff4444": "red-400",   // gradient companion
  "#ec0000": "red-500",   // slightly darker
  "#e60000": "red-650",   // reset-password gradient
  "#b91c1c": "red-700",   // Tailwind default red-700 (restored)
  "#991b1b": "red-800",   // Tailwind default red-800
  "#7f1d1d": "red-900",   // Tailwind default red-900
  "#fef2f2": "red-50",
  "#fee2e2": "red-100",
  "#fecaca": "red-200",
  // Audit hits NOT mapped (intentional — Phase 5 visual review):
  //   #dc2626 (Tailwind-default red-600 — 48 sites — could be intentional)
  //   #ef4444 (Tailwind-default red-500 — 12 sites)
  //   #f30000 #ce2b05 #dd5358 #9a0c24 #c8102e #e02d42 (brand-theme.ts only — dynamic)
  //   #c20e0e (1 site, in globals.css gradient — not a className)
  //   #b30000 #990000 #7f0000 (LatestWinnersBadge inline style only)
};

async function main() {
  const unmapped = new Set<string>();

  await runCodemod({
    name: "sweep-brand-red — Phase 1a (hex→token)",
    roots: ["src"],
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    exclude: [
      // Email templates — mail clients can't parse Tailwind
      "/components/email-preview/",
      "/lib/email/",
      "/components/invoice/InvoiceEmailTemplate",
      // Test files — fixtures may include literal hexes intentionally
      "/__tests__/",
      "/codemods/",
    ],
    transform: (content) => rewriteHexArbitraries(content, HEX_TO_TOKEN, unmapped),
  });

  if (unmapped.size > 0) {
    console.log("\n--- Unmapped hexes (left untouched) ---");
    for (const hex of [...unmapped].sort()) {
      console.log(`  ${hex}`);
    }
    console.log("\n  (These are NOT in the snap map. Either add them to HEX_TO_TOKEN");
    console.log("  in this script, or leave alone — they need human review.)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
