"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Horizontal scroll container with click-and-drag (mouse) support — the rail
 * advertises "drag to see more", but a plain overflow-x container only responds
 * to the scrollbar/wheel on desktop. We hijack the pointer ONLY for the mouse;
 * touch keeps its native momentum scrolling (and the page's vertical scroll).
 */
export default function WinnerRail({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startLeft: 0 });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return; // let touch/pen scroll natively
    const el = ref.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault(); // stop text/image selection while dragging
    el.scrollLeft = drag.current.startLeft - (e.clientX - drag.current.startX);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    ref.current?.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style, cursor: "grab", userSelect: "none", WebkitUserSelect: "none" }}
      role="group"
      aria-label="Recent winners — drag or swipe to see more"
      tabIndex={0}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
    >
      {children}
    </div>
  );
}
