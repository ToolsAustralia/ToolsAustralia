/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * FullscreenImageViewer stub for MembershipModal smoke test. The real viewer
 * imports Swiper components and uses bare JSX without `import React`, which
 * crashes under tsx's esbuild classic-JSX transform during SSR. The carousel
 * is only opened on user click, so a no-op default export is safe here.
 */

const FullscreenImageViewerStub = function () {
  return null;
};

module.exports = FullscreenImageViewerStub;
module.exports.default = FullscreenImageViewerStub;
