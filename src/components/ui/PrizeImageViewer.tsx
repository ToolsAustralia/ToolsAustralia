"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { useScrollLock, useModalA11y } from "@/hooks/useModalBlocking";
import { cn } from "@/utils/cn";

interface PrizeImageViewerProps {
  open: boolean;
  images: string[];
  /** Lifted so the inline gallery and the viewer stay in sync both ways. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Shown under the PRIZE GALLERY eyebrow. */
  title: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.75;
/** Zoom level a tap jumps to. */
const TAP_ZOOM = 2.5;
/** Pointer travel under this counts as a tap, not a drag. */
const TAP_SLOP_PX = 7;
/** Horizontal release distance that commits to the next/previous image. */
const SWIPE_COMMIT_PX = 60;
/** Vertical release distance that dismisses. */
const DISMISS_COMMIT_PX = 110;

interface DragState {
  x: number;
  y: number;
  ox: number;
  oy: number;
  px: number;
  py: number;
  w: number;
  h: number;
  scale: number;
  moved: number;
}

/**
 * Fullscreen prize inspection viewer.
 *
 * Zoom is the point, not just a bigger image — a buyer is deciding whether to spend money on
 * a tool they can only see in a photo, so they need to get close to the finish, the display
 * and the fittings. That is why this exists rather than reusing the shared
 * `FullscreenImageViewer`, which is a plain swipe-through lightbox and is still the right
 * component for the winners strips that use it.
 *
 * Lives in `components/ui/` (moved out of the mini-draw route on 2026-08-13) because the
 * major-draw prize builder now opens the same viewer over its combination + gallery. Two
 * callers, one inspection experience — and a route-private folder was never an importable
 * home for shared UI.
 *
 * One pointer-event set drives every gesture; direction is resolved per drag by `|dy| > |dx|`
 * so a diagonal swipe commits cleanly to one axis:
 *   - tap (moved < 7px)      → zoom to 2.5× centred on the tapped point, or reset if zoomed
 *   - drag while zoomed      → pan, clamped so the image can never leave the frame
 *   - horizontal drag at 1×  → live-track, commit to prev/next past 60px
 *   - vertical drag at 1×    → drag-to-dismiss, backdrop fades with the finger, commits past 110px
 */
export default function PrizeImageViewer({
  open,
  images,
  index,
  onIndexChange,
  onClose,
  title,
}: PrizeImageViewerProps) {
  const prefersReduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const [zoom, setZoom] = useState(1);
  /** Committed pan offset. */
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  /** Live drag offset, folded into `offset` (pan) or discarded (swipe/dismiss) on release. */
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useScrollLock(open);
  // Owns Escape, the focus trap, initial focus and focus-restore-to-the-expand-button.
  useModalA11y(open, panelRef, onClose);

  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDrag({ x: 0, y: 0 });
  }, []);

  // A new image (or a fresh open) always starts at 1× — carrying a 4× pan onto a different
  // photo lands the viewer on an arbitrary crop of something the user has not seen yet.
  useEffect(() => {
    resetView();
  }, [index, open, resetView]);

  /** Keep the image inside the frame: at zoom z it can travel (z-1)/2 of the stage each way. */
  const clampPan = useCallback((z: number, x: number, y: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const w = dragRef.current?.w ?? (rect ? rect.width / (zoom || 1) : 0);
    const h = dragRef.current?.h ?? (rect ? rect.height / (zoom || 1) : 0);
    const maxX = Math.max(0, ((z - 1) * w) / 2);
    const maxY = Math.max(0, ((z - 1) * h) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, [zoom]);

  const applyZoom = useCallback(
    (z: number, x = offset.x, y = offset.y) => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
      setZoom(next);
      setOffset(next === 1 ? { x: 0, y: 0 } : clampPan(next, x, y));
    },
    [clampPan, offset.x, offset.y]
  );

  const step = useCallback((delta: number) => applyZoom(zoom + delta), [applyZoom, zoom]);

  const go = useCallback(
    (delta: number) => {
      if (images.length < 2) return;
      onIndexChange((index + delta + images.length) % images.length);
    },
    [images.length, index, onIndexChange]
  );

  /** Tap zooms to the tapped point; a second tap resets. */
  const tapZoom = useCallback(
    (px: number, py: number, w: number, h: number) => {
      if (zoom > 1) {
        applyZoom(1);
        return;
      }
      applyZoom(TAP_ZOOM, (w / 2 - px) * TAP_ZOOM, (h / 2 - py) * TAP_ZOOM);
    },
    [applyZoom, zoom]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    // An ancestor CSS transform makes the rect bigger than the layout box; without dividing
    // pointer deltas by that factor, panning drifts faster than the finger.
    const scale = rect.width / (stage.offsetWidth || rect.width) || 1;
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
      px: (e.clientX - rect.left) / scale,
      py: (e.clientY - rect.top) / scale,
      w: rect.width / scale,
      h: rect.height / scale,
      scale,
      moved: 0,
    };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Safari can refuse capture mid-gesture; the handlers still fire on the element. */
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / d.scale;
    const dy = (e.clientY - d.y) / d.scale;
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));

    if (zoom > 1) {
      setOffset(clampPan(zoom, d.ox + dx, d.oy + dy));
    } else if (Math.abs(dy) > Math.abs(dx) && dy > 0) {
      setDrag({ x: 0, y: dy });
    } else {
      setDrag({ x: dx, y: 0 });
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d) return;

    if (d.moved < TAP_SLOP_PX) {
      tapZoom(d.px, d.py, d.w, d.h);
      return;
    }
    if (zoom > 1) return; // pan already committed to `offset` on move

    const { x, y } = drag;
    setDrag({ x: 0, y: 0 });
    if (y > DISMISS_COMMIT_PX) {
      onClose();
      return;
    }
    if (x < -SWIPE_COMMIT_PX) go(1);
    else if (x > SWIPE_COMMIT_PX) go(-1);
  };

  // `←`/`→` only at 1× — while zoomed they would swap the photo out from under a pan.
  // Escape is owned by `useModalA11y`.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        step(ZOOM_STEP);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        step(-ZOOM_STEP);
      } else if (zoom === 1 && e.key === "ArrowRight") {
        go(1);
      } else if (zoom === 1 && e.key === "ArrowLeft") {
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, zoom, step, go]);

  if (!open || !mounted || images.length === 0) return null;

  const isZoomed = zoom > 1;
  const showArrows = !isZoomed && images.length > 1;
  const backdropAlpha = (0.97 - Math.min(0.45, Math.max(0, drag.y) / 420)).toFixed(3);
  const zoomLabel = `${Math.round(zoom * 10) / 10}×`;
  const hintMobile = isZoomed
    ? "Drag to pan · tap to reset"
    : "Tap to zoom · swipe to browse · drag down to close";
  const hintDesktop = isZoomed
    ? "Drag to pan · click to reset · Esc to close"
    : "Click image to zoom · ← → to browse · Esc to close";

  const controlChrome =
    "border border-white/[.18] bg-[rgba(20,22,28,.6)] text-white backdrop-blur-md transition-colors hover:bg-[rgba(30,33,40,.75)]";
  const pillChrome =
    "border border-white/[.14] bg-[rgba(20,22,28,.6)] backdrop-blur-md";

  const zoomPill = (size: "sm" | "lg") => (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-0.5 rounded-full",
        pillChrome,
        size === "sm" ? "p-[3px]" : "p-1"
      )}
    >
      <button
        type="button"
        onClick={() => step(-ZOOM_STEP)}
        disabled={zoom <= MIN_ZOOM}
        aria-label="Zoom out"
        className={cn(
          "flex items-center justify-center rounded-full text-white disabled:cursor-default disabled:text-white/30",
          size === "sm" ? "h-7 w-7" : "h-8 w-8"
        )}
      >
        <Minus className={size === "sm" ? "h-[15px] w-[15px]" : "h-4 w-4"} />
      </button>
      <button
        type="button"
        onClick={() => applyZoom(1)}
        aria-label={`Zoom level ${zoomLabel}. Reset to 1×`}
        className={cn(
          "font-bold text-white",
          size === "sm" ? "h-7 min-w-[44px] text-[11.5px]" : "h-8 min-w-[50px] text-[12.5px]"
        )}
      >
        {zoomLabel}
      </button>
      <button
        type="button"
        onClick={() => step(ZOOM_STEP)}
        disabled={zoom >= MAX_ZOOM}
        aria-label="Zoom in"
        className={cn(
          "flex items-center justify-center rounded-full text-white disabled:cursor-default disabled:text-white/30",
          size === "sm" ? "h-7 w-7" : "h-8 w-8"
        )}
      >
        <Plus className={size === "sm" ? "h-[15px] w-[15px]" : "h-4 w-4"} />
      </button>
    </div>
  );

  const thumbStrip = (
    <div className="pointer-events-auto flex max-w-full gap-2 overflow-x-auto p-0.5 scrollbar-hide lg:justify-center lg:gap-2.5">
      {images.map((src, i) => (
        <button
          key={`${src}-${i}`}
          type="button"
          onClick={() => onIndexChange(i)}
          aria-label={`Show image ${i + 1}`}
          aria-current={i === index}
          className={cn(
            "relative h-[54px] w-[54px] shrink-0 overflow-hidden rounded-[11px] border-[1.5px] p-1 lg:h-[76px] lg:w-[76px] lg:rounded-[13px] lg:border-2 lg:p-1.5",
            i === index ? "border-red-600 bg-white/[.14]" : "border-white/[.12] bg-white/[.05]"
          )}
        >
          <Image src={src} alt="" fill className="object-contain" sizes="76px" />
        </button>
      ))}
    </div>
  );

  const overlay = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Prize gallery"
      className="fixed inset-0 z-[9600] overflow-hidden motion-safe:animate-[fadeIn_.18s_ease]"
      style={{ background: `rgba(6,7,10,${backdropAlpha})` }}
    >
      {/* Gesture surface spans the whole viewport so a drag started on the chrome gradient
          still reaches it — the chrome itself is pointer-events:none apart from its controls. */}
      <div
        className="absolute inset-0 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Untransformed sizing box — measured for the pan clamp and the tap-zoom origin so
            the maths never has to divide the live `scale` back out. */}
        <div ref={stageRef} className="absolute inset-[58px_16px_96px] lg:inset-[92px_40px_168px]">
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${offset.x + drag.x}px, ${offset.y + drag.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: dragging || prefersReduced ? "none" : "transform .28s cubic-bezier(.22,1,.36,1)",
              cursor: isZoomed ? (dragging ? "grabbing" : "grab") : "zoom-in",
            }}
          >
            <Image
              src={images[index]}
              alt={`${title} — image ${index + 1} of ${images.length}`}
              fill
              priority
              draggable={false}
              className="select-none object-contain"
              sizes="100vw"
            />
          </div>
        </div>
      </div>

      {/* Header — gradient overlay, not a layout row, so the image keeps the whole frame. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2.5 bg-[linear-gradient(180deg,rgba(0,0,0,.78)_0%,transparent_100%)] px-3.5 pb-[26px] pt-[42px] transition-opacity duration-200",
          "lg:items-center lg:gap-4 lg:bg-[linear-gradient(180deg,rgba(0,0,0,.75)_0%,transparent_100%)] lg:px-[26px] lg:pb-10 lg:pt-5",
          isZoomed && "opacity-25 lg:opacity-100"
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.09em] text-white/50 lg:text-[11px]">
            Prize gallery
          </span>
          <span className="truncate text-[12.5px] font-bold leading-[1.3] text-white lg:text-[15px]">{title}</span>
        </span>
        <div className="flex shrink-0 items-center gap-3">
          {/* Desktop parks the zoom pill + counter up here; mobile keeps them in the footer. */}
          <div className="hidden lg:block">{zoomPill("lg")}</div>
          <span className="hidden text-[13px] font-semibold text-white/55 lg:inline">
            {index + 1} / {images.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close gallery"
            className={cn(
              "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full lg:h-[42px] lg:w-[42px]",
              controlChrome
            )}
          >
            <X className="h-[17px] w-[17px] lg:h-[19px] lg:w-[19px]" />
          </button>
        </div>
      </div>

      {/* Arrows are hidden while zoomed — they would fight with panning. */}
      {showArrows && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between px-2.5 lg:px-7">
          {([-1, 1] as const).map((delta) => {
            const Icon = delta === -1 ? ChevronLeft : ChevronRight;
            return (
              <button
                key={delta}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(delta);
                }}
                aria-label={delta === -1 ? "Previous image" : "Next image"}
                className={cn(
                  "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full lg:h-[52px] lg:w-[52px]",
                  controlChrome
                )}
              >
                <Icon className="h-[17px] w-[17px] lg:h-[22px] lg:w-[22px]" />
              </button>
            );
          })}
        </div>
      )}

      {/* Footer — zoom + counter (mobile), thumbs, hint. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2.5 bg-[linear-gradient(0deg,rgba(0,0,0,.8)_0%,transparent_100%)] px-3.5 pb-6 pt-[34px] transition-opacity duration-200",
          "lg:bg-[linear-gradient(0deg,rgba(0,0,0,.78)_0%,transparent_100%)] lg:px-[26px] lg:pb-6 lg:pt-11",
          isZoomed && "opacity-25 lg:opacity-100"
        )}
      >
        <div className="flex items-center justify-center gap-2.5 lg:hidden">
          {zoomPill("sm")}
          <span
            className={cn("rounded-full px-[11px] py-1.5 text-[11.5px] font-semibold text-white/75", pillChrome)}
          >
            {index + 1} / {images.length}
          </span>
        </div>

        {images.length > 1 && thumbStrip}

        <span className="text-[10.5px] font-medium text-white/40 lg:text-[12px]">
          <span className="lg:hidden">{hintMobile}</span>
          <span className="hidden lg:inline">{hintDesktop}</span>
        </span>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
