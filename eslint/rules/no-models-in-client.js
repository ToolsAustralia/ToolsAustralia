module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Disallow importing server-only modules — Mongoose models / the mongoose package / the Mongo connection helper / the generated partner-catalog offers map — from a client component (a file with a "use client" directive).',
    },
    schema: [],
    messages: {
      serverOnly:
        'Client component ("use client") must not import {{what}}. Mongoose models are server-only ("mongoose" is a serverExternalPackage); importing them into client code crashes at runtime or bundles the data layer. Fetch the data in a server component / route handler / service and pass plain serializable data down.',
      serverOnlyData:
        'Client component ("use client") must not import {{what}}. It would ship the whole 1,833-row catalogue in the client bundle. Resolve offers SERVER-side (see src/app/(site)/membership/page.tsx, which injects the map into resolvePortalReturn) and pass the resolved values down, or import the client-safe aggregates from @/generated/partnerCatalogPreview.',
    },
  },
  create(context) {
    const source = context.sourceCode || context.getSourceCode();
    const program = source.ast;

    // A file is a Next.js client component if its directive prologue contains "use client".
    let isClient = false;
    for (const stmt of program.body) {
      const isDirective =
        stmt.type === "ExpressionStatement" &&
        stmt.expression &&
        stmt.expression.type === "Literal" &&
        typeof stmt.expression.value === "string";
      if (!isDirective) break; // prologue ends at the first non-string-literal statement
      if (stmt.expression.value === "use client") isClient = true;
    }
    // Client-SHARED utils carry no "use client" of their own but ARE imported by client
    // components, so a server-only import here lands in the client bundle just the same.
    // That is precisely the case the rule was added for (panel F-038): the whole
    // dependency-injection design in portal-return.ts exists because it is imported by
    // MembershipPortalReturnBanner, and without this the guard could only catch the
    // mistake nobody would make.
    const CLIENT_SHARED =
      /[\\/]src[\\/]utils[\\/]partner-discounts[\\/](portal-return|unlock-packages|partner-catalog-visibility)\.ts$/;
    const filename = context.filename ?? context.getFilename?.() ?? "";
    if (!isClient && !CLIENT_SHARED.test(filename)) return {};

    function classify(spec) {
      if (typeof spec !== "string") return null;
      if (spec === "mongoose" || spec.startsWith("mongoose/")) return "the mongoose package";
      if (spec === "@/lib/mongodb" || spec.startsWith("@/lib/mongodb/"))
        return "the Mongo connection helper (@/lib/mongodb)";
      if (spec.startsWith("@/models/")) return "a Mongoose model (@/models/**)";
      // Relative import that resolves into a /models/ directory (e.g. ../../models/User).
      if (/^[./]/.test(spec) && /(^|\/)models\/[^/]+$/.test(spec))
        return "a Mongoose model (relative ../models/**)";
      return null;
    }

    /** Server-only GENERATED data whose only sin is bundle size (panel F-021) — a
     *  different message, since the fix is "resolve it server-side", not "it crashes". */
    function classifyServerOnlyData(spec) {
      if (typeof spec !== "string") return null;
      if (spec === "@/generated/partnerCatalogOffers" || /(^|\/)generated\/partnerCatalogOffers$/.test(spec))
        return "the server-only partner-catalog offers map (@/generated/partnerCatalogOffers)";
      return null;
    }

    function check(node, spec) {
      const what = classify(spec);
      if (what) {
        context.report({ node, messageId: "serverOnly", data: { what } });
        return;
      }
      const data = classifyServerOnlyData(spec);
      if (data) context.report({ node, messageId: "serverOnlyData", data: { what: data } });
    }

    // Type-only imports/exports are ERASED at build — they never bundle the data layer, so they are
    // safe in client code and must NOT be flagged. Covers `import type { X }` (declaration-level) and
    // `import { type X }` (every named specifier inline-typed). A bare side-effect import (`import "x"`,
    // no specifiers) is NOT type-only — it runs the module — so it stays flagged.
    function isTypeOnlyImport(node) {
      if (node.importKind === "type") return true;
      return (
        Array.isArray(node.specifiers) &&
        node.specifiers.length > 0 &&
        node.specifiers.every((s) => s.type === "ImportSpecifier" && s.importKind === "type")
      );
    }
    function isTypeOnlyExport(node) {
      if (node.exportKind === "type") return true;
      return (
        Array.isArray(node.specifiers) &&
        node.specifiers.length > 0 &&
        node.specifiers.every((s) => s.type === "ExportSpecifier" && s.exportKind === "type")
      );
    }

    return {
      ImportDeclaration(node) {
        if (isTypeOnlyImport(node)) return; // `import type {…}` / all-inline-`type` → erased, safe
        check(node, node.source && node.source.value);
      },
      // Dynamic import("@/models/..."): a real RUNTIME import (cannot be type-only) — always flag.
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") check(node, node.source.value);
      },
      // Re-exports: export { X } from "@/models/..." / export * from "@/models/..." — skip `export type`.
      ExportNamedDeclaration(node) {
        if (node.source && !isTypeOnlyExport(node)) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (node.source && node.exportKind !== "type") check(node, node.source.value);
      },
    };
  },
};
