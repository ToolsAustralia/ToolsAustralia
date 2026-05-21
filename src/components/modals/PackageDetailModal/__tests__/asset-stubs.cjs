/**
 * Preload script for PackageDetailModal smoke test. See StripePaymentModal/__tests__/asset-stubs.cjs
 * for the explanation of why __esModule must be falsy on the CSS proxy.
 *
 * Why globalThis.React: VerticalAccumulationChart (legacy, predates the refactor)
 * uses JSX without an explicit `import React from "react"`. In Next.js this works
 * because the build pipeline uses the automatic JSX runtime. Under tsx + esbuild
 * the fallback is the classic runtime which compiles `<div/>` to `React.createElement(...)`,
 * so `React` must be in scope. Injecting it as a global keeps the chart unchanged.
 *
 * Usage: tsx --require ./asset-stubs.cjs <test-file>
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
globalThis.React = require("react");

[".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg"].forEach(function (ext) {
  require.extensions[ext] = function (module) {
    module.exports = { src: "/stub" + ext, width: 100, height: 100, blurDataURL: "" };
  };
});

require.extensions[".css"] = function (module) {
  const cssProxy = new Proxy(
    {},
    {
      get: function (_target, prop) {
        if (prop === "__esModule") return false;
        if (typeof prop === "symbol") return undefined;
        return String(prop);
      },
    }
  );
  module.exports = cssProxy;
};
