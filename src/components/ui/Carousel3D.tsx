"use client";

/**
 * Carousel3D — a content-agnostic 3D "turntable" carousel.
 *
 * Items sit on a rotating elliptical ring in real perspective space. One item is
 * focused (front-centre); the rest rotate steeply away, recede in Z, dim, shrink
 * and melt into depth-of-field blur. A single shared rotation MotionValue (in
 * continuous "item units") is the ONE source of truth — drag, velocity-fling,
 * keyboard, autoplay and snap all feed it. No per-card timers.
 *
 * Performance model (the important bit): each card binds its transform / opacity
 * / blur / zIndex to the rotation value through per-card `useTransform`, so when
 * the ring spins only style strings update on the compositor — React does NOT
 * re-render the tree every frame. A single lightweight `activeIndex` state and a
 * per-card "live state" subscription (bucketed by depth) are the only React
 * updates, so depth-keyed lighting in `renderItem` stays in sync without a
 * per-frame forceTick.
 *
 * Drag model: a hand-rolled pointer drag (not framer's drag gesture, which
 * fights child onClick) writes rotation 1:1 with the finger and keeps a short
 * velocity-sample buffer. On release we project that velocity forward, snap to
 * the nearest item, and `animate()` a spring seeded with the throw's velocity →
 * real momentum + a touch of overshoot. The unwrapped target means the ring
 * always takes the short way round (no 7→0 backflip).
 *
 * The component owns: ring math, spring physics, velocity drag + snap, keyboard,
 * autoplay (pause on hover / focus-within / drag), full a11y, reduced-motion
 * fallback, and a grounding contact shadow + gentle whole-stage pointer
 * parallax. It knows nothing about any specific content — callers pass `items`,
 * a `renderItem` (handed live per-item state so a card can light itself by its
 * position on the ring), and tuning options. Works for any item count >= 3.
 *
 * Reduced-motion: drag still works but snaps are instant; autoplay, parallax,
 * blur and the spring are all dropped — calm, but fully usable.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { cn } from "@/utils/cn";

/** Live per-item state handed to `renderItem`. Updates as the ring settles. */
export interface Carousel3DItemState<T> {
  item: T;
  /** Absolute index in the source array. */
  index: number;
  /** Signed ring offset from focus, in [-N/2, N/2]; 0 = focused. */
  offset: number;
  /** Nearest integer offset (-1 = one slot left of focus, etc.). */
  relIndex: number;
  /** cos(angle): 1 = dead front, -1 = dead back. The primary depth cue. */
  depth: number;
  /** True when this is the focused (front-centre) item. */
  isActive: boolean;
  /** True for items behind the stage (depth < 0) — usually decorative. */
  isBehind: boolean;
}

export interface Carousel3DControls {
  activeIndex: number;
  count: number;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  getLabel: (index: number) => string;
}

export interface Carousel3DProps<T> {
  items: T[];
  /** Render one card. Keep it presentational — the ring transform is applied by the wrapper. */
  renderItem: (state: Carousel3DItemState<T>) => ReactNode;
  /** Stable key per item. Defaults to index. */
  getKey?: (item: T, index: number) => string | number;
  /** Accessible label for an item (used in aria-live + tab-list buttons). */
  getLabel?: (item: T, index: number) => string;

  /** Controlled focus index. Omit for uncontrolled. */
  activeIndex?: number;
  defaultActiveIndex?: number;
  onActiveIndexChange?: (index: number) => void;

  /** Horizontal ring radius (px). Falls to radiusXMobile under `mobileMaxWidth`. */
  radiusX?: number;
  radiusXMobile?: number;
  /** Vertical ring radius (px) — the elliptical "tilt" of the turntable. */
  radiusY?: number;
  radiusYMobile?: number;
  /** Z push-back of the rear card (px). The front card sits at z 0. */
  depthZ?: number;
  /** Peak side rotateY magnitude (deg). */
  rotate?: number;
  /** Smallest scale a fully-back card reaches (front = 1). */
  minScale?: number;
  /** Smallest opacity a fully-back card reaches (front = 1). */
  minOpacity?: number;
  /** Max depth-of-field blur on far cards (px). 0 disables. */
  maxBlur?: number;
  /** CSS perspective on the stage (px). */
  perspective?: number;
  /**
   * Layout model.
   * - `"ring"` (default) — full 360° turntable; great for "infinite" sets, but
   *   the rear item hides behind the front. `radiusX`/`radiusY` are the ellipse.
   * - `"coverflow"` — horizontal filmstrip; the focus front-centre, others step
   *   out to the side so all stay visible. `radiusX` = per-step gap, `depthZ` =
   *   per-step recession.
   * - `"cylinder"` — cards sit as flat FACETS on a cylinder, folding back to the
   *   sides edge-to-edge (a faceted 3D "wall"). `rotate` = fold angle per card
   *   (deg), `radiusX` = cylinder radius. The most dimensional look; best with a
   *   small set where the front item is the focus.
   * - `"wheel"` — a ring tilted back toward the viewer (look down onto a round
   *   table of cards): focus front-near-bottom, the rest curve UP and back so the
   *   rear cards show above the focus. `radiusX`/`radiusY` = ellipse half-axes
   *   (`radiusY` drives how far the rear lifts), `depthZ` = near↔far separation.
   */
  layout?: "ring" | "coverflow" | "cylinder" | "wheel";

  autoRotate?: boolean;
  intervalMs?: number;
  /** Whole-stage pointer parallax strength (deg). 0 disables. */
  parallax?: number;
  /** Show the grounding contact shadow under the stage. */
  contactShadow?: boolean;

  /** Stage height. Number → px; string passes through (e.g. a clamp()). */
  stageHeight?: number | string;
  /** Card slot width. Number → px; string passes through. A numeric width is capped on mobile. */
  cardWidth?: number | string;
  /** Mobile cap (px) applied to a numeric `cardWidth`. */
  cardWidthMobileMax?: number;
  mobileMaxWidth?: number;

  /** Accessible name for the whole carousel region. */
  label?: string;

  className?: string;
  stageClassName?: string;
  /** Render your own controls; receives the live API. Omit to use the built-in bar. */
  renderControls?: (api: Carousel3DControls) => ReactNode;
  /** Hide the default controls without supplying your own. */
  hideControls?: boolean;
}

const TWO_PI = Math.PI * 2;

/** Shortest signed delta from `a` to `b` on a ring of size `n` (result in (-n/2, n/2]). */
function ringDelta(a: number, b: number, n: number): number {
  let d = (b - a) % n;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  return d;
}

interface RingGeometry {
  n: number;
  rx: number;
  ry: number;
  depthZ: number;
  rotate: number;
  minScale: number;
  minOpacity: number;
  maxBlur: number;
  layout: "ring" | "coverflow" | "cylinder" | "wheel";
}

interface RingPlacement {
  x: number;
  y: number;
  z: number;
  ry: number;
  scale: number;
  opacity: number;
  blur: number;
  depth: number;
  offset: number;
  zIndex: number;
}

/** Pure placement for card `i` at a given continuous `rotation`. */
function placeOnRing(i: number, rotation: number, g: RingGeometry): RingPlacement {
  const { n } = g;
  const offset = ringDelta(((rotation % n) + n) % n, i, n);
  const phi = offset * (TWO_PI / n);
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const half = (cos + 1) / 2; // 0 (back) → 1 (front)
  const x = g.rx * sin;
  const y = g.ry * (1 - cos); // front card sits lowest → grounded
  const z = g.depthZ * (cos - 1); // front at 0, sides recede behind it
  const ry = -g.rotate * sin;
  const scale = g.minScale + (1 - g.minScale) * half;
  const opacity = g.minOpacity + (1 - g.minOpacity) * Math.pow(half, 1.25);
  const blur = g.maxBlur * (1 - half);
  const zIndex = Math.round(half * 100) + 1;
  return { x, y, z, ry, scale, opacity, blur, depth: cos, offset, zIndex };
}

/**
 * Coverflow placement: instead of a full 360° turntable (where the rear card
 * hides behind the front), cards fan out left↔right into depth and ALL stay
 * visible — the focused card front-centre, neighbours stepping back, turned
 * toward the viewer, shrinking and dimming. `rx` is the gap to the immediate
 * neighbour; cards beyond the first stack tighter. Reads continuous `offset`
 * so it animates smoothly + loops with the same rotation MotionValue.
 */
function placeCoverflow(i: number, rotation: number, g: RingGeometry): RingPlacement {
  const { n } = g;
  const offset = ringDelta(((rotation % n) + n) % n, i, n);
  const ao = Math.abs(offset);
  const half = n / 2;
  // A horizontal coverflow filmstrip: the focus front-and-centre, every other
  // card stepping out to the side, turned toward the viewer, receding + dimming
  // — so ALL items stay visible (no card hidden behind the front). Reads the
  // continuous `offset` so it animates smoothly and loops with the rotation MV.
  const clamped = Math.max(-1, Math.min(1, offset));
  const x = offset * g.rx; // even horizontal spacing — every card stays on show
  const ry = -g.rotate * clamped; // turn toward the viewer; side cards share one angle
  const z = -g.depthZ * ao; // recede with distance from focus
  const y = g.ry * ao; // gentle downward step so the fan curves, not a flat row
  const scale = Math.max(g.minScale, 1 - ao * 0.15);
  const opacity = Math.max(g.minOpacity, 1 - ao * 0.24);
  const blur = g.maxBlur <= 0 ? 0 : Math.min(g.maxBlur, ao * g.maxBlur * 0.55);
  const depth = 1 - ao; // 1 dead-front, 0 at the first neighbour, <0 further out
  const zIndex = Math.round((half - ao) * 100) + 1;
  return { x, y, z, ry, scale, opacity, blur, depth, offset, zIndex };
}

/**
 * Cylinder placement: cards sit as flat FACETS on a cylinder — the focus dead-on
 * at front, neighbours folding back to the sides edge-to-edge (a faceted "wall"),
 * the way a true 3D photo carousel curves away. `rotate` is the fold angle per
 * card (deg) and `rx` the cylinder radius; the per-card rotateY equals its angular
 * position, so the panels read as a continuous folded surface rather than flat
 * cards. Perspective does the shrinking, so cards stay near full size.
 */
function placeCylinder(i: number, rotation: number, g: RingGeometry): RingPlacement {
  const { n } = g;
  const offset = ringDelta(((rotation % n) + n) % n, i, n);
  const ao = Math.abs(offset);
  const stepRad = (g.rotate * Math.PI) / 180;
  const theta = offset * stepRad;
  const R = g.rx;
  const cos = Math.cos(theta);
  const x = R * Math.sin(theta);
  const z = R * (cos - 1); // front facet at z 0; the rest curve back around the axis
  const ry = -offset * g.rotate; // each card tangent to the cylinder → folded wall
  const y = 0;
  const scale = Math.max(g.minScale, 1 - ao * 0.05); // mostly perspective-driven
  const opacity = Math.max(g.minOpacity, 1 - ao * 0.16);
  const blur = g.maxBlur <= 0 ? 0 : Math.min(g.maxBlur, ao * g.maxBlur * 0.5);
  const zIndex = Math.round((cos + 1) * 100) + 1;
  return { x, y, z, ry, scale, opacity, blur, depth: cos, offset, zIndex };
}

/**
 * Wheel placement: a ring tilted back toward the viewer — like looking down onto
 * a round table of upright cards. The focus is front-near-bottom (biggest), the
 * others curve UP and back around an ellipse so the rear cards show above the
 * focus rather than hiding behind it. `rx`/`ry` are the ellipse half-axes (ry
 * drives how far the rear lifts) and `depthZ` the near↔far separation. Every
 * item stays visible — ideal for small sets you want fully on show in real 3D.
 */
function placeWheel(i: number, rotation: number, g: RingGeometry): RingPlacement {
  const { n } = g;
  const offset = ringDelta(((rotation % n) + n) % n, i, n);
  const phi = offset * (TWO_PI / n);
  const cos = Math.cos(phi); // 1 front, -1 rear
  const sin = Math.sin(phi);
  const h = (cos + 1) / 2; // 1 front → 0 rear
  const x = g.rx * sin; // 0 front/rear, ±rx at the sides
  // +ry front (low/near), -ry rear (high/far). Bias the whole oval UP by ~0.4·ry
  // because the near focus is perspective-enlarged and would otherwise sit low,
  // leaving dead space above the cards.
  const y = g.ry * cos - g.ry * 0.4;
  const z = g.depthZ * cos; // +depthZ front (near), -depthZ rear (far)
  const ry = -g.rotate * sin; // a slight tangent turn so the sides read dimensional
  const scale = g.minScale + (1 - g.minScale) * h;
  const opacity = g.minOpacity + (1 - g.minOpacity) * Math.pow(h, 0.7);
  const blur = g.maxBlur <= 0 ? 0 : g.maxBlur * (1 - h);
  const zIndex = Math.round(h * 100) + 1;
  return { x, y, z, ry, scale, opacity, blur, depth: cos, offset, zIndex };
}

/** Dispatch to the active layout. */
function place(i: number, rotation: number, g: RingGeometry): RingPlacement {
  if (g.layout === "coverflow") return placeCoverflow(i, rotation, g);
  if (g.layout === "cylinder") return placeCylinder(i, rotation, g);
  if (g.layout === "wheel") return placeWheel(i, rotation, g);
  return placeOnRing(i, rotation, g);
}

/* ------------------------------------------------------------------------- */
/* One card: transform/opacity/filter/zIndex bound to the shared rotation via  */
/* useTransform (no per-frame React render). A depth-bucketed subscription      */
/* refreshes the live state passed to renderItem so depth-keyed lighting tracks */
/* the ring without re-rendering every frame.                                   */
/* ------------------------------------------------------------------------- */
interface RingCardProps<T> {
  item: T;
  index: number;
  rotation: MotionValue<number>;
  geometry: RingGeometry;
  reduceMotion: boolean;
  isActive: boolean;
  cardWidthCss: string;
  onSelect: () => void;
  label: string;
  renderItem: (state: Carousel3DItemState<T>) => ReactNode;
}

function RingCard<T>({
  item,
  index,
  rotation,
  geometry,
  reduceMotion,
  isActive,
  cardWidthCss,
  onSelect,
  label,
  renderItem,
}: RingCardProps<T>) {
  const transform = useTransform(rotation, (r) => {
    const p = place(index, r, geometry);
    return `translate(-50%,-50%) translate3d(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px,${p.z.toFixed(2)}px) rotateY(${p.ry.toFixed(2)}deg) scale(${p.scale.toFixed(4)})`;
  });
  const opacity = useTransform(rotation, (r) => place(index, r, geometry).opacity);
  const filter = useTransform(rotation, (r) => {
    if (reduceMotion || geometry.maxBlur <= 0) return "none";
    const b = place(index, r, geometry).blur;
    return b < 0.25 ? "none" : `blur(${b.toFixed(2)}px)`;
  });
  const zIndex = useTransform(rotation, (r) => place(index, r, geometry).zIndex);

  // Live state for renderItem. Snapshot on mount, then re-snapshot only when the
  // bucketed depth changes — keeps depth-keyed lighting in sync without a
  // per-frame React render.
  const buildState = useCallback(
    (r: number): Carousel3DItemState<T> => {
      const p = place(index, r, geometry);
      return {
        item,
        index,
        offset: p.offset,
        relIndex: Math.round(p.offset),
        depth: p.depth,
        isActive: Math.abs(p.offset) < 0.5,
        isBehind: p.depth < 0,
      };
    },
    [index, geometry, item],
  );

  const [live, setLive] = useState<Carousel3DItemState<T>>(() => buildState(rotation.get()));
  const lastBucket = useRef(Math.round(place(index, rotation.get(), geometry).depth * 12));
  useMotionValueEvent(rotation, "change", (r) => {
    const bucket = Math.round(place(index, r, geometry).depth * 12);
    if (bucket === lastBucket.current) return;
    lastBucket.current = bucket;
    setLive(buildState(r));
  });

  return (
    <motion.div
      role="group"
      aria-roledescription="slide"
      aria-label={label}
      aria-hidden={!isActive}
      onClick={isActive ? undefined : onSelect}
      style={{
        transform,
        opacity,
        filter,
        zIndex,
        transformStyle: "preserve-3d",
        backfaceVisibility: "hidden",
        willChange: "transform, opacity, filter",
      }}
      className={cn("absolute left-1/2 top-1/2", isActive ? "cursor-default" : "cursor-pointer")}
    >
      <div style={{ width: cardWidthCss }}>{renderItem(live)}</div>
    </motion.div>
  );
}

export function Carousel3D<T>({
  items,
  renderItem,
  getKey,
  getLabel,
  activeIndex: controlledIndex,
  defaultActiveIndex = 0,
  onActiveIndexChange,
  radiusX = 290,
  radiusXMobile = 168,
  radiusY = 54,
  radiusYMobile = 34,
  depthZ = 220,
  rotate = 52,
  minScale = 0.62,
  minOpacity = 0.18,
  maxBlur = 5,
  perspective = 1100,
  layout = "ring",
  autoRotate = true,
  intervalMs = 3600,
  parallax = 6,
  contactShadow = true,
  stageHeight = 360,
  cardWidth = 272,
  cardWidthMobileMax = 240,
  mobileMaxWidth = 600,
  label = "Carousel",
  className,
  stageClassName,
  renderControls,
  hideControls = false,
}: Carousel3DProps<T>) {
  const n = items.length;
  const reduceMotion = useReducedMotion() ?? false;
  const baseId = useId();
  const stageId = `${baseId}-stage`;
  const isControlled = controlledIndex != null;

  /* ---- responsive radii / card width (SSR-safe) -------------------------- */
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width:${mobileMaxWidth}px)`);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [mobileMaxWidth]);

  const geometry: RingGeometry = useMemo(
    () => ({
      n,
      rx: isMobile ? radiusXMobile : radiusX,
      ry: isMobile ? radiusYMobile : radiusY,
      depthZ: isMobile ? Math.round(depthZ * 0.82) : depthZ,
      rotate,
      minScale,
      minOpacity,
      maxBlur: reduceMotion ? 0 : maxBlur,
      layout,
    }),
    [n, isMobile, radiusX, radiusXMobile, radiusY, radiusYMobile, depthZ, rotate, minScale, minOpacity, maxBlur, reduceMotion, layout],
  );
  const Rx = geometry.rx;
  const Ry = geometry.ry;
  const cardW =
    isMobile && typeof cardWidth === "number" ? Math.min(cardWidth, cardWidthMobileMax) : cardWidth;
  const cardWidthCss = typeof cardW === "number" ? `${cardW}px` : cardW;

  /* ---- the one rotation value, in continuous "item units" ---------------- */
  const startIndex = (((isControlled ? (controlledIndex as number) : defaultActiveIndex) % n) + n) % n;
  const rotation = useMotionValue<number>(startIndex);
  const targetRef = useRef<number>(startIndex); // unwrapped continuous goal
  const runningAnim = useRef<ReturnType<typeof animate> | null>(null);
  const stopAnim = () => {
    runningAnim.current?.stop();
    runningAnim.current = null;
  };

  const [active, setActive] = useState(startIndex);
  const activeRef = useRef(active);
  activeRef.current = active;

  // Derive the committed index from the live rotation; fire onActiveIndexChange.
  useMotionValueEvent(rotation, "change", (r) => {
    const idx = ((Math.round(r) % n) + n) % n;
    if (idx !== activeRef.current) {
      activeRef.current = idx;
      setActive(idx);
      if (!isControlled) onActiveIndexChange?.(idx);
    }
  });

  /* ---- imperative settle (short way), seeded with velocity --------------- */
  const settle = useCallback(
    (rawIndex: number, velocity = 0) => {
      const idx = ((rawIndex % n) + n) % n;
      const from = targetRef.current;
      const nextTarget = from + ringDelta(((from % n) + n) % n, idx, n);
      targetRef.current = nextTarget;
      stopAnim();
      if (reduceMotion) {
        rotation.set(nextTarget);
      } else {
        runningAnim.current = animate(rotation, nextTarget, {
          type: "spring",
          stiffness: 150,
          damping: 26, // a touch over-damped → smooth glide, minimal overshoot
          mass: 1,
          velocity,
          restDelta: 0.001,
        });
      }
      if (isControlled) onActiveIndexChange?.(idx);
    },
    [n, reduceMotion, rotation, isControlled, onActiveIndexChange],
  );

  // Keep the ring in sync if a controlled parent jumps the index.
  useEffect(() => {
    if (!isControlled) return;
    const wrapped = ((targetRef.current % n) + n) % n;
    const want = (((controlledIndex as number) % n) + n) % n;
    if (wrapped !== want) settle(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledIndex, isControlled, n]);

  const next = useCallback(() => settle(Math.round(rotation.get()) + 1), [settle, rotation]);
  const prev = useCallback(() => settle(Math.round(rotation.get()) - 1), [settle, rotation]);
  const goTo = useCallback((i: number) => settle(i), [settle]);

  /* ---- autoplay: pause on hover / focus-within / drag / reduced-motion --- */
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const paused = hovered || focusWithin || dragActive;

  /* ---- hand-rolled velocity drag (1:1 finger-follow, fling on release) ---- */
  const pxPerStep = useMemo(() => Math.max(120, Rx * 0.9), [Rx]);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartRotation = useRef(0);
  const samples = useRef<{ t: number; x: number }[]>([]);
  // True once a press has moved far enough to count as a drag — used to swallow
  // the synthetic click that fires on release so a drag never also "taps" a card.
  const suppressClick = useRef(false);

  // Autoplay: a self-rescheduling timeout keyed on `active`, so the countdown
  // restarts after EVERY settle (auto or manual) — a tap/drag never collides with
  // a pending auto-advance. Paused while interacting (hover/focus/drag), and the
  // fire callback also hard-guards on the live `dragging` ref to close the tiny
  // window before React processes the pause, so it NEVER advances mid-gesture.
  useEffect(() => {
    if (!autoRotate || reduceMotion || paused || n < 2) return;
    const id = window.setTimeout(() => {
      if (!dragging.current) next();
    }, intervalMs);
    return () => window.clearTimeout(id);
  }, [autoRotate, reduceMotion, paused, n, intervalMs, next, active]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      stopAnim();
      rotation.stop();
      dragging.current = true;
      suppressClick.current = false; // fresh interaction
      setDragActive(true);
      dragStartX.current = e.clientX;
      dragStartRotation.current = rotation.get();
      samples.current = [{ t: performance.now(), x: e.clientX }];
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [rotation],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      // Drag left (negative dx) advances the ring forward; 1:1 with the finger.
      const dx = e.clientX - dragStartX.current;
      if (Math.abs(dx) > 6) suppressClick.current = true; // it's a drag, not a tap
      rotation.set(dragStartRotation.current - dx / pxPerStep);
      const now = performance.now();
      samples.current.push({ t: now, x: e.clientX });
      while (samples.current.length > 2 && now - samples.current[0].t > 90) {
        samples.current.shift();
      }
    },
    [pxPerStep, rotation],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      const s = samples.current;
      let vxPx = 0;
      if (s.length >= 2) {
        const a = s[0];
        const b = s[s.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0) vxPx = (b.x - a.x) / dt;
      }
      const vSteps = -vxPx / pxPerStep; // item-units / sec
      const current = rotation.get();
      const projected = current + vSteps * 0.18; // momentum projection window
      // After a FREE drag the live rotation is the source of truth — the pre-drag
      // `targetRef` is stale. Reconcile it so settle snaps the SHORT way from where
      // the finger stopped; otherwise a fast/far drag winds the long way backwards
      // to land on the card, looking like it "rotates back".
      targetRef.current = current;
      settle(Math.round(projected), vSteps);
      // Release the pause shortly after, so a flick coasts before autoplay resumes.
      window.setTimeout(() => {
        if (!dragging.current) setDragActive(false);
      }, 140);
    },
    [pxPerStep, rotation, settle],
  );

  /* ---- whole-stage pointer parallax (reduced-motion off) ------------------ */
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const onStagePointerMove = useCallback(
    (e: React.PointerEvent) => {
      onPointerMove(e);
      if (reduceMotion || parallax <= 0 || dragging.current) return;
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      animate(tiltY, px * parallax, { type: "spring", stiffness: 90, damping: 18 });
      animate(tiltX, -py * (parallax * 0.5), { type: "spring", stiffness: 90, damping: 18 });
    },
    [onPointerMove, reduceMotion, parallax, tiltX, tiltY],
  );
  const onStagePointerLeave = useCallback(() => {
    animate(tiltX, 0, { type: "spring", stiffness: 90, damping: 18 });
    animate(tiltY, 0, { type: "spring", stiffness: 90, damping: 18 });
    setHovered(false);
  }, [tiltX, tiltY]);

  /* ---- keyboard ----------------------------------------------------------- */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(n - 1);
      }
    },
    [prev, next, goTo, n],
  );

  const labelFor = useCallback(
    (i: number) => getLabel?.(items[i], i) ?? `Item ${i + 1}`,
    [getLabel, items],
  );

  const controls: Carousel3DControls = {
    activeIndex: active,
    count: n,
    next,
    prev,
    goTo,
    getLabel: labelFor,
  };

  const stageHeightCss = typeof stageHeight === "number" ? `${stageHeight}px` : stageHeight;

  return (
    <div
      className={cn("relative select-none", className)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusWithin(false);
      }}
    >
      {/* Live region announcing the focused item to screen readers. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {`${labelFor(active)} (${active + 1} of ${n})`}
      </p>

      <motion.div
        ref={stageRef}
        id={stageId}
        className={cn(
          "relative mx-auto touch-pan-y rounded-3xl outline-none",
          "focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
          stageClassName,
        )}
        style={{
          height: stageHeightCss,
          perspective: `${perspective}px`,
          perspectiveOrigin: "50% 42%",
        }}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${label}. Use the left and right arrow keys to rotate, or drag.`}
        onKeyDown={onKeyDown}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={onStagePointerLeave}
        onPointerDown={onPointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Tilting inner world: floor shadow + cards parallax as one stage. */}
        <motion.div
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d", rotateX: tiltX, rotateY: tiltY }}
        >
          {/* Floor plane: a soft contact shadow that grounds the stage. */}
          {contactShadow && (
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%,-50%) translateY(${Ry + 86}px) rotateX(76deg)`,
                width: `${Rx * 1.15}px`,
                height: `${Rx * 0.7}px`,
                transformStyle: "preserve-3d",
                background:
                  "radial-gradient(closest-side, rgba(8,10,16,0.28), rgba(8,10,16,0.10) 55%, transparent 72%)",
                filter: "blur(8px)",
                borderRadius: "50%",
              }}
            />
          )}

          {items.map((item, i) => (
            <RingCard
              key={getKey?.(item, i) ?? i}
              item={item}
              index={i}
              rotation={rotation}
              geometry={geometry}
              reduceMotion={reduceMotion}
              isActive={i === active}
              cardWidthCss={cardWidthCss}
              onSelect={() => {
                // Swallow the click that ends a drag so dragging never also taps.
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                goTo(i);
              }}
              label={labelFor(i)}
              renderItem={renderItem}
            />
          ))}
        </motion.div>
      </motion.div>

      {hideControls ? null : renderControls ? (
        renderControls(controls)
      ) : (
        <DefaultControls api={controls} stageId={stageId} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Default control bar: prev / dot tablist / next.                            */
/* ------------------------------------------------------------------------- */
function DefaultControls({ api, stageId }: { api: Carousel3DControls; stageId: string }) {
  const { activeIndex, count, next, prev, goTo, getLabel } = api;
  return (
    <div className="mt-6 flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={prev}
        aria-label="Previous"
        aria-controls={stageId}
        className="grid h-10 w-10 place-items-center rounded-full border border-token bg-surface text-primary-token shadow-sm transition-colors hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="flex gap-2" role="tablist" aria-label="Choose item">
        {Array.from({ length: count }, (_, i) => {
          const selected = i === activeIndex;
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={stageId}
              aria-label={getLabel(i)}
              onClick={() => goTo(i)}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                selected ? "w-6 bg-red-600" : "w-2 bg-black/20 hover:bg-black/40 dark:bg-white/20 dark:hover:bg-white/40",
              )}
            />
          );
        })}
      </div>
      <button
        type="button"
        onClick={next}
        aria-label="Next"
        aria-controls={stageId}
        className="grid h-10 w-10 place-items-center rounded-full border border-token bg-surface text-primary-token shadow-sm transition-colors hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

export default Carousel3D;
