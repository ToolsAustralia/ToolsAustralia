"use strict";

/**
 * Ban hand-rolled page scroll locks. Use `useScrollLock` from `@/hooks/useModalBlocking`.
 *
 * Writing `document.body.style.overflow = "hidden"` (or pinning the body `fixed`) inline
 * looks like a two-line fix and is not, for two reasons a single component cannot solve:
 *
 * 1. RELEASE ORDER. Every copy restores unconditionally on cleanup, so with two overlays
 *    open the first to close unlocks the page while the second is still up. Only a
 *    module-level reference count knows it is the last one out. Before this rule the repo
 *    had ~20 such copies, each subtly different, and the /discount filter sheet had one that
 *    did nothing at all.
 * 2. iOS. `overflow: hidden` on <body> does not stop touch-scrolling in iOS Safari; the
 *    working recipe (save scrollY, `position: fixed; top: -Ypx`, restore on release) is
 *    fiddly enough that copies drift from it.
 *
 * Allowed: the hook itself. `getScrollbarWidth.ts` is untouched — it only measures.
 *
 * Scope note: this deliberately fires on `document.body.style.<prop>` writes only. Setting
 * overflow on a component's OWN scroll container is normal and unaffected.
 */
const LOCK_PROPS = new Set(["overflow", "overflowY", "position"]);

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "page scroll locking must go through useScrollLock (src/hooks/useModalBlocking.ts)",
    },
    schema: [],
    messages: {
      adhocLock:
        "Don't set document.body.style.{{prop}} directly — use useScrollLock(active) from '@/hooks/useModalBlocking'. Hand-rolled locks unlock the page when the FIRST of two overlays closes, and don't hold on iOS Safari.",
    },
  },
  create(context) {
    const filename = context.getFilename().replace(/\\/g, "/");
    if (filename.endsWith("src/hooks/useModalBlocking.ts")) return {};

    /** Matches `document.body.style` — the only receiver this rule cares about. */
    const isBodyStyle = (node) =>
      node.type === "MemberExpression" &&
      node.property.type === "Identifier" &&
      node.property.name === "style" &&
      node.object.type === "MemberExpression" &&
      node.object.property.type === "Identifier" &&
      node.object.property.name === "body" &&
      node.object.object.type === "Identifier" &&
      node.object.object.name === "document";

    return {
      AssignmentExpression(node) {
        const target = node.left;
        if (target.type !== "MemberExpression") return;
        if (!isBodyStyle(target.object)) return;
        const prop =
          target.property.type === "Identifier"
            ? target.property.name
            : target.property.type === "Literal"
              ? String(target.property.value)
              : null;
        if (!prop || !LOCK_PROPS.has(prop)) return;
        context.report({ node, messageId: "adhocLock", data: { prop } });
      },
    };
  },
};
