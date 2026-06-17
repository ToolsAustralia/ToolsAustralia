module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Disallow importing server-only Mongoose models / the mongoose package / the Mongo connection helper from a client component (a file with a "use client" directive).',
    },
    schema: [],
    messages: {
      serverOnly:
        'Client component ("use client") must not import {{what}}. Mongoose models are server-only ("mongoose" is a serverExternalPackage); importing them into client code crashes at runtime or bundles the data layer. Fetch the data in a server component / route handler / service and pass plain serializable data down.',
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
    if (!isClient) return {};

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

    function check(node, spec) {
      const what = classify(spec);
      if (what) context.report({ node, messageId: "serverOnly", data: { what } });
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source && node.source.value);
      },
      // Dynamic import("@/models/..."): this is exactly the "runtime import" class of bug.
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") check(node, node.source.value);
      },
      // Re-exports: export { X } from "@/models/..." / export * from "@/models/...".
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
    };
  },
};
