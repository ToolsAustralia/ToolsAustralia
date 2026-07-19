"use strict";

/**
 * Ban eager Stripe boot. `loadStripe()` from the default "@stripe/stripe-js" entry
 * injects js.stripe.com on import, and any module-scope `getStripePromise()` call
 * boots Stripe for every visitor who downloads that chunk (this shipped Stripe to
 * 100% of guests via MembershipModal — 2026-07 perf audit).
 * Allowed: src/lib/stripe-client.ts (the singleton, using the /pure entry).
 */
module.exports = {
  meta: {
    type: "problem",
    docs: { description: "loadStripe/getStripePromise must not run at module scope; import loadStripe only in stripe-client.ts" },
    schema: [],
    messages: {
      eagerCall: "{{name}}() at module scope boots Stripe for every visitor — call it inside the component/handler that needs it.",
      wrongImport: 'Import loadStripe only in src/lib/stripe-client.ts (which uses "@stripe/stripe-js/pure"); use getStripePromise() elsewhere.',
    },
  },
  create(context) {
    const filename = context.getFilename().replace(/\\/g, "/");
    const isSingleton = filename.endsWith("src/lib/stripe-client.ts");
    return {
      ImportDeclaration(node) {
        if (isSingleton) return;
        if (!/^@stripe\/stripe-js(\/pure)?$/.test(node.source.value)) return;
        const bindsLoadStripe = node.specifiers.some(
          (s) => s.type === "ImportSpecifier" && s.imported.name === "loadStripe"
        );
        if (bindsLoadStripe) context.report({ node, messageId: "wrongImport" });
      },
      CallExpression(node) {
        const name = node.callee.type === "Identifier" ? node.callee.name : null;
        if (name !== "loadStripe" && name !== "getStripePromise") return;
        if (isSingleton) return;
        let p = node.parent, inFunction = false;
        while (p) {
          if (/FunctionDeclaration|FunctionExpression|ArrowFunctionExpression/.test(p.type)) { inFunction = true; break; }
          p = p.parent;
        }
        if (!inFunction) context.report({ node, messageId: "eagerCall", data: { name } });
      },
    };
  },
};
