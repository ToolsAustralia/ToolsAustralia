"use client";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export function Popover({
  open, onClose, anchorRef, children, align = "end", width = 280,
}: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode; align?: "start" | "end"; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      if (!a) return;
      let left = align === "end" ? a.right - width : a.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setPos({ top: a.bottom + 8, left });
    };
    place();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, align, width, anchorRef, onClose]);

  if (!open || !pos) return null;
  return createPortal(
    <div ref={ref} style={{ position: "fixed", top: pos.top, left: pos.left, width }}
      className="z-[80] rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 lift-lg fade-up overflow-hidden">
      {children}
    </div>,
    document.body,
  );
}
