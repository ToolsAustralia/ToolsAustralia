"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/utils/cn";
import { COMBINATION_COUNT, type SpotlightView } from "./gallery-spotlight-model";
import GalleryDrawStamp from "./GalleryDrawStamp";

interface SpotlightPreviewProps {
  view: SpotlightView;
  /** True while the opening combination is showing — its art is the LCP candidate. */
  isDefaultView: boolean;
}

/**
 * The live preview — the showroom's hero. Everything on it is derived from the
 * current selection (`SpotlightView`), so it holds no state of its own and no
 * brand knowledge.
 *
 * The case, its ring and the CTA all read `--pgs-accent` (set once on the
 * section root), which is what makes the whole column recolour in one .5s
 * transition when the visitor browses to another toolset.
 */
export default function SpotlightPreview({ view, isDefaultView }: SpotlightPreviewProps) {
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const [ctaOffscreen, setCtaOffscreen] = useState(false);

  // Below `lg` the rail sits UNDER the preview, so by the time a visitor picks a
  // combination the inline CTA has scrolled away and they have to scroll back up to
  // act on it. Mirror the [slug] pages' floating "Enter now": when the real CTA
  // leaves the viewport, a floating twin takes over.
  useEffect(() => {
    const node = ctaRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCtaOffscreen(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lg:sticky lg:top-5">
      <p className="m-0 inline-flex items-center gap-2 font-poppins text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--pgs-eyebrow)]">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#ee0000]" />
        The major draw · {COMBINATION_COUNT} combinations
      </p>

      {/* 28px under `sm`: at the handoff's 32px "YOU ACTUALLY WANT." needs ~370px and
          breaks to a third line inside a 375px viewport, losing the two-line rhythm. */}
      <h1 className="mb-[18px] mt-3 font-poppins text-[28px] font-black uppercase leading-[0.95] tracking-[-0.02em] text-[var(--pgs-text)] sm:text-[32px] lg:text-[46px]">
        Build the win
        <br />
        you actually want.
      </h1>

      {/* Case — white studio box in light, the panel surface in dark. The combo
          renders are transparent, so the plate is a free choice; keeping it white in
          dark mode punched a bright hole in an otherwise black page. */}
      <div
        className="relative overflow-hidden rounded-[20px] border border-[var(--pgs-case-border)] bg-white p-3 transition-shadow duration-500 motion-reduce:transition-none dark:bg-[var(--pgs-card)]"
        style={{
          boxShadow: `0 0 0 1px ${view.accent}3a, 0 34px 80px -34px ${view.accent}, var(--pgs-shadow)`,
        }}
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 z-[3] h-1"
          style={{ background: `linear-gradient(90deg, ${view.accent}, transparent 76%)` }}
        />
        {/* The case pill carries the draw stamp + countdown; it falls back to the
            selection's tag ("Live preview" / "Cash option") until the draw resolves. */}
        <GalleryDrawStamp fallback={view.tag} />

        {/* 4/3 is the handoff's phone framing; from `md` the single-column stage is wide
            enough that 4/3 would make the case taller than the viewport, so it takes the
            desktop 16/10 early — the layout only splits into two columns at `lg`. */}
        <div
          className="ta-product-stage relative aspect-[4/3] overflow-hidden rounded-[14px] md:aspect-[16/10]"
          style={{ ["--ta-stage-bloom" as string]: `${view.accent}30` } as CSSProperties}
        >
          <Image
            // Keyed on the combination so React remounts the node and the
            // cross-fade replays on every change (a src swap alone would not).
            key={view.key}
            src={view.image}
            alt={view.imageAlt}
            fill
            sizes="(min-width: 1024px) 640px, 100vw"
            priority={isDefaultView}
            className="pbc-fade object-contain p-3.5"
          />
        </div>

        <span className="absolute bottom-3.5 right-3.5 z-[2] rounded-full bg-[#18a94d] px-3 py-[7px] font-poppins text-[10px] font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_8px_20px_-8px_#18a94d]">
          {view.cashFlag}
        </span>
      </div>

      <div className="mx-0.5 mt-4 flex flex-wrap items-start justify-between gap-3.5">
        {/* The rail lives elsewhere in the DOM, so announce what the preview
            became — otherwise a screen-reader user only hears "checked". */}
        {/* `lg:flex-1`: on desktop, plain `justify-between` left the text block at its
            content width and the CTA at the far edge, so a wide gap sat between them
            while the longest description wrapped to two lines. Absorbing the free space
            fits it on one. NOT below `lg`, where the row is narrow enough that the CTA
            should wrap onto its own line instead of squeezing the title to three. */}
        <div className="min-w-0 lg:flex-1" aria-live="polite">
          <p className="font-poppins text-[22px] font-black uppercase leading-[1.05] tracking-[-0.015em] text-[var(--pgs-text)] lg:text-[27px]">
            {view.title}
          </p>
          <p className="mt-1.5 max-w-[420px] text-xs leading-[1.45] text-[var(--pgs-sub)] lg:max-w-none lg:text-[13.5px]">
            {view.description}
          </p>
        </div>
        <Link
          ref={ctaRef}
          href={view.href}
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-5 py-3.5 font-poppins text-[13px] font-extrabold uppercase tracking-[0.02em]",
            "transition-[background-color,color,box-shadow] duration-500 motion-reduce:transition-none",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pgs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pgs-page)]"
          )}
          style={{
            background: view.accent,
            color: view.accentInk,
            boxShadow: `0 14px 30px -14px ${view.accent}`,
          }}
        >
          Enter draw →
        </Link>
      </div>

      <dl className="mt-[18px] flex flex-wrap gap-2.5">
        {view.stats.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              // `px-3` under `sm`: three tiles share a 375px row, and at the handoff's
              // 14px padding "Power tools" wraps while the other two labels do not,
              // leaving the row visibly uneven.
              "flex min-w-[96px] flex-1 flex-col gap-[3px] rounded-[13px] border px-3 py-3 sm:px-3.5",
              stat.isCash
                ? "border-[#18a94d]/[.32] bg-[#18a94d]/10"
                : "border-[var(--pgs-border)] bg-[var(--pgs-card)]"
            )}
          >
            <dt className="whitespace-nowrap font-poppins text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--pgs-sub)]">
              {stat.label}
            </dt>
            <dd
              className={cn(
                "m-0 font-poppins text-base",
                stat.isCash ? "font-black text-[var(--pgs-cash-ink)]" : "font-extrabold text-[var(--pgs-text)]"
              )}
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Floating CTA — mobile/tablet only (desktop keeps the inline one beside the
          sticky preview). `data-floating-widget` is the contract the Cobber launcher
          reads to dodge bottom-anchored floaters (see shared-ui/frontend.md). Pure CSS
          transition rather than framer: this page ships no motion library otherwise.
          The attribute lives on the PILL below, not on this full-width centering wrapper
          (measuring the wrapper made the corner controls dodge a centered pill that never
          reaches them), and it is attached ONLY while the CTA is actually shown: this
          element stays mounted and parks at `opacity-0`, so its rect stays non-zero and
          the launcher's size check can't see through it. Toggling the attribute is what
          the dodge hook's MutationObserver watches, so it recomputes with no extra wiring. */}
      <div
        aria-hidden={!ctaOffscreen}
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50 flex justify-center px-4 lg:hidden",
          "transition-[opacity,transform] duration-300 motion-reduce:transition-none",
          ctaOffscreen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
        )}
      >
        <Link
          href={view.href}
          data-floating-widget={ctaOffscreen ? "true" : undefined}
          tabIndex={ctaOffscreen ? undefined : -1}
          className={cn(
            "pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-6 py-3 font-poppins text-sm font-extrabold uppercase tracking-[0.02em]",
            "border border-white/20 transition-colors duration-500 motion-reduce:transition-none",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pgs-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pgs-page)]"
          )}
          style={{
            background: view.accent,
            color: view.accentInk,
            boxShadow: `0 10px 34px -10px ${view.accent}`,
          }}
        >
          Enter draw →
        </Link>
      </div>
    </div>
  );
}
