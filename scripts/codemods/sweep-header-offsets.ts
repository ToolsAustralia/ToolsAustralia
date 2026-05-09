import { runCodemod } from "./lib/codemod-runner";
import { rewriteExactArbitrary } from "./lib/replace-classname";

async function main() {
  await runCodemod({
    name: "sweep-header-offsets — Phase 1c (pt-[86px]/pt-[106px] → CSS vars)",
    roots: ["src"],
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    exclude: [
      "/components/email-preview/",
      "/lib/email/",
      "/components/invoice/InvoiceEmailTemplate",
      "/__tests__/",
      "/codemods/",
    ],
    transform: (content) => {
      // Two passes: 86px → mobile, 106px → desktop
      const pass1 = rewriteExactArbitrary(content, "pt", "86px", "var(--app-header-h)");
      const pass2 = rewriteExactArbitrary(pass1.content, "pt", "106px", "var(--app-header-h-lg)");
      const replacements = [...pass1.replacements, ...pass2.replacements];
      return { content: pass2.content, replacements };
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
