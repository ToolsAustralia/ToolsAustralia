import { domMax } from "framer-motion";

/**
 * framer-motion feature bundle, isolated in its own module so the async
 * `import()` in providers.tsx (`<LazyMotion features={…}>`) code-splits it into
 * a SEPARATE chunk that loads AFTER hydration — instead of shipping eagerly in
 * the shared/critical bundle.
 *
 * `domMax` (not `domAnimation`) because live landing animations use framer
 * `layout`/`layoutId` (PowerToolsetCarousel FLIP, MiniDrawTabs indicator), which
 * need the max feature set. Importing ONLY `domMax` here (not `motion`) keeps the
 * async chunk to the feature implementations, tree-shaking out the full
 * `motion.*` renderer. See docs/shared-ui/lazymotion.md.
 */
export default domMax;
