/**
 * Preload script for PastDrawsModal smoke test.
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
