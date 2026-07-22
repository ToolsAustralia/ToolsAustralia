/**
 * Preload script for the prize-builder render smoke test.
 *
 * Usage: tsx --require ./asset-stubs.cjs <test-file>
 *
 * Mirrors the modal smoke-test stubs (e.g. PastDrawsModal/__tests__/asset-stubs.cjs):
 * static asset imports and CSS modules are not resolvable outside the Next build,
 * so they are stubbed at the require boundary.
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
