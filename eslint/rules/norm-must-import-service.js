module.exports = {
  meta: {
    type: "problem",
    docs: { description: "Files under src/app/api/internal/norm/** must import from @/services/**" },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename().replace(/\\/g, "/");
    const isNormRoute =
      filename.includes("/src/app/api/internal/norm/") && filename.endsWith("/route.ts");
    // Allow framework endpoints to opt out (health, manifest, pending-actions status)
    const exempt = ["/v1/health/route.ts", "/v1/manifest/route.ts", "/v1/pending-actions/"].some((p) =>
      filename.includes(p)
    );
    if (!isNormRoute || exempt) return {};
    let hasServiceImport = false;
    return {
      ImportDeclaration(node) {
        if (typeof node.source.value === "string" && node.source.value.startsWith("@/services/")) {
          hasServiceImport = true;
        }
      },
      "Program:exit"() {
        if (!hasServiceImport) {
          context.report({
            loc: { line: 1, column: 0 },
            message:
              "Norm route handlers must import from @/services/** (business logic lives in services, not route files).",
          });
        }
      },
    };
  },
};
