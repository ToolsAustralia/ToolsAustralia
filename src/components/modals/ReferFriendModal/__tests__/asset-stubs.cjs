/**
 * Preload script for ReferFriendModal smoke test.
 *
 * tsx/Node.js cannot natively load binary image files (.webp, .png, etc.) or
 * CSS modules (.module.css). This preload registers no-op require extensions
 * before the test module's static imports are resolved so they get the stubs
 * instead of crashing with "SyntaxError: Invalid or unexpected token".
 *
 * Usage: tsx --require ./asset-stubs.cjs <test-file>
 */

// Stub image imports (Next.js StaticImageData shape)
[".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg"].forEach(function (ext) {
  require.extensions[ext] = function (module) {
    module.exports = { src: "/stub" + ext, width: 100, height: 100, blurDataURL: "" };
  };
});

// Stub CSS module imports — returns a proxy that yields the class name for any
// property access.
//
// esbuild/tsx compiles `import styles from "./x.css"` to:
//   var _x = __toESM(require("./x.css"));
//   ... _x.default.scrollFrame ...
//
// __toESM: if mod.__esModule is falsy, it does `Object.assign({default: mod}, mod)`.
// So we must NOT set __esModule to true — that would trigger the "copy own keys"
// path which fails because our Proxy has no enumerable own keys. Instead, let
// __toESM wrap the proxy as { default: cssProxy }, and accessing cssProxy.scrollFrame
// via the Proxy's get trap returns the class-name string.
require.extensions[".css"] = function (module) {
  // esbuild's __toESM helper checks mod.__esModule.  If that check is truthy it
  // skips setting { default: mod } and instead tries to copy own keys — but a
  // Proxy over {} has no own keys, so import_hero ends up as {} and
  // import_hero.default is undefined.
  //
  // Solution: return undefined/false for __esModule so __toESM takes the
  // "wrap this module as the default" path, yielding { default: cssProxy }.
  // Then import_hero.default.scrollFrame → cssProxy.scrollFrame → "scrollFrame".
  const cssProxy = new Proxy(
    {},
    {
      get: function (_target, prop) {
        // Must be falsy so __toESM wraps cssProxy as the default export.
        if (prop === "__esModule") return false;
        // Symbols (e.g. Symbol.toStringTag) should return undefined.
        if (typeof prop === "symbol") return undefined;
        // Everything else is a CSS class name — return it as-is.
        return String(prop);
      },
    }
  );
  module.exports = cssProxy;
};
