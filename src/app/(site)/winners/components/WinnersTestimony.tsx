"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Award, ChevronLeft, ChevronRight, Play, Star, User, X } from "lucide-react";
import type { WinnerSummary } from "@/types/winner";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { hasWinnerTestimony, stripRichTextHtml } from "@/utils/winners";
import { auDateParts } from "../../draw-results/components/format";

// Tools Australia red accent + the theme-INVARIANT "speech bubble" card. Only the
// section chrome + modal switch on `.dark` (via the `--wt-*` / `--wtm-*` tokens in
// globals.css); the card bubble itself is the same dark navy in light and dark.
const RED = "#ee0000";
const CARD_BG = "#1c1f28";

const NAV_STYLE: CSSProperties = {
  flex: "0 0 auto",
  width: 44,
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  cursor: "pointer",
  padding: 0,
  background: "var(--wt-nav-bg)",
  border: "1px solid var(--wt-nav-border)",
  color: "var(--wt-nav-fg)",
};

/**
 * Compact draw-month label, e.g. "JUL '26" (from wonOnDate, falling back to
 * selectedDate). Uses the shared UTC-deterministic `auDateParts` so SSR and client
 * render identical text (no hydration mismatch, no locale/ICU dependence).
 */
function formatDrawMonth(winner: WinnerSummary): string {
  const { mon, yr } = auDateParts(winner.wonOnDate ?? winner.selectedDate);
  if (!mon) return "";
  return `${mon.toUpperCase()} '${yr.slice(-2)}`;
}

/** Five filled stars — decorative brand styling (there is no per-winner rating field). */
function Stars({ size, color, gap }: { size: number; color: string; gap: number }) {
  return (
    <span aria-hidden style={{ display: "inline-flex", gap, flex: "0 0 auto" }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={size} style={{ color, fill: color }} />
      ))}
    </span>
  );
}

/** Round winner avatar with the red ring — real photo (next/image) or a person glyph. */
function WinnerAvatar({
  src,
  name,
  size,
  glyph,
  style,
}: {
  src?: string;
  name: string;
  size: number;
  glyph: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--wt-avatar-bg)",
        border: `3px solid ${RED}`,
        color: "rgba(255,255,255,.55)",
        flex: "0 0 auto",
        ...style,
      }}
    >
      {src ? (
        <Image src={src} alt={name} fill className="object-cover" sizes={`${size}px`} />
      ) : (
        <User size={glyph} strokeWidth={1.5} aria-hidden />
      )}
    </div>
  );
}

/** One testimonial "speech bubble" card — identical in the grid and the carousel. */
function TestimonyCard({ winner, onOpen }: { winner: WinnerSummary; onOpen: (id: string) => void }) {
  const name = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
  const month = formatDrawMonth(winner);
  const prize = winner.selectedPrize || winner.prize.name;
  const quote = stripRichTextHtml(winner.testimony);

  return (
    <div
      className="wt-card"
      style={{
        position: "relative",
        marginTop: 44,
        display: "flex",
        flexDirection: "column",
        gap: 11,
        background: CARD_BG,
        borderRadius: 18,
        padding: "46px 22px 18px",
        boxShadow: "0 22px 46px -26px #000",
      }}
    >
      {/* speech-bubble tail (points down-left) */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 34,
          bottom: -9,
          width: 18,
          height: 18,
          background: CARD_BG,
          transform: "rotate(45deg)",
          borderRadius: "0 0 4px 0",
        }}
      />
      {/* avatar straddling the top edge (card's marginTop:44 reserves the room) */}
      <WinnerAvatar
        src={winner.imageUrl}
        name={name}
        size={68}
        glyph={34}
        style={{
          position: "absolute",
          top: -34,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2,
          boxShadow: "0 10px 22px -10px rgba(0,0,0,.6)",
        }}
      />

      <div
        style={{
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: "#fff",
        }}
      >
        {name}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span
          style={{
            minWidth: 0,
            fontWeight: 600,
            fontSize: 9,
            lineHeight: 1.2,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,.5)",
          }}
        >
          {winner.winnerState ? `${winner.winnerState} · ` : ""}
          <span style={{ color: "#ff6a6a" }}>{month}</span>
        </span>
        <Stars size={12} color="#ff5a5a" gap={2} />
      </div>

      <p
        style={{
          margin: "2px 0 0",
          fontStyle: "italic",
          fontWeight: 400,
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "rgba(255,255,255,.85)",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 3,
          overflow: "hidden",
        }}
      >
        {quote}
      </p>

      {/* column-reverse → Read full story on top, prize below */}
      <div
        style={{
          display: "flex",
          flexDirection: "column-reverse",
          alignItems: "flex-start",
          gap: 9,
          marginTop: "auto",
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,.08)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <Award size={14} strokeWidth={1.8} aria-hidden style={{ color: "var(--wt-green)", flex: "0 0 auto" }} />
          <span style={{ fontWeight: 700, fontSize: 11, lineHeight: 1.35, color: "var(--wt-green)" }}>{prize}</span>
        </span>
        <button
          type="button"
          onClick={() => onOpen(winner.id)}
          aria-haspopup="dialog"
          className="wt-readmore"
          style={{
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 44,
            padding: "0 2px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: ".03em",
            textTransform: "uppercase",
            color: "#ff8a8a",
          }}
        >
          Read full story
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
            →
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * The "Read full story" modal — portalled to <body> so `position:fixed` is
 * viewport-correct even under the promo stage's transforms. Theme-aware via the
 * `.winner-testimonies-modal` token scope (keyed off `.dark` on <html>). Adds Esc,
 * a Tab focus-trap, and return-focus on close (ModalContainer has none of these).
 */
function WinnerStoryModal({ winner, onClose }: { winner: WinnerSummary | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!winner) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 30);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [winner, onClose]);

  if (!winner || !mounted) return null;

  const name = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
  const month = formatDrawMonth(winner);
  const prize = winner.selectedPrize || winner.prize.name;
  const paragraphs = stripRichTextHtml(winner.testimony)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return createPortal(
    <div
      className="winner-testimonies-modal wt-overlay"
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--wtm-overlay)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        animation: "wt-overlay .2s ease",
      }}
    >
      <div
        ref={panelRef}
        className="wt-panel font-poppins"
        role="dialog"
        aria-modal="true"
        aria-label={`${name}'s winning story`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: 520,
          maxHeight: "82vh",
          background: "var(--wtm-card)",
          color: "var(--wtm-text)",
          border: "1px solid var(--wtm-border)",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "var(--wtm-shadow)",
          animation: "wt-panel .28s cubic-bezier(.2,.7,.2,1)",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            zIndex: 2,
            background: `linear-gradient(90deg, ${RED}, transparent 72%)`,
          }}
        />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close story"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 3,
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            cursor: "pointer",
            background: "var(--wtm-chip)",
            border: "1px solid var(--wtm-border)",
            color: "var(--wtm-text)",
          }}
        >
          <X size={18} strokeWidth={2.2} aria-hidden />
        </button>

        <div
          style={{
            flex: "1 1 auto",
            overflowY: "auto",
            padding: "34px 30px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 15,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <WinnerAvatar
              src={winner.imageUrl}
              name={name}
              size={50}
              glyph={26}
              style={{ border: `2px solid ${RED}`, background: "var(--wtm-chip)", color: "var(--wtm-sub)" }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "var(--wtm-text)" }}>{name}</div>
              {winner.winnerState ? (
                <div style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.2, color: "var(--wtm-sub)", marginTop: 2 }}>
                  {winner.winnerState}
                </div>
              ) : null}
              <div
                className="font-mono"
                style={{
                  fontSize: 9,
                  lineHeight: 1,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--wtm-sub)",
                  opacity: 0.7,
                  marginTop: 4,
                }}
              >
                {`${winner.drawName} · `}
                {winner.drawResultUrl ? (
                  <a
                    href={winner.drawResultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "inherit", textDecoration: "underline" }}
                  >
                    certified
                  </a>
                ) : (
                  "certified"
                )}
              </div>
            </div>
            <span
              style={{
                marginLeft: "auto",
                flex: "0 0 auto",
                alignSelf: "flex-start",
                fontWeight: 800,
                fontSize: 9,
                lineHeight: 1,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                padding: "6px 10px",
                borderRadius: 100,
                background: "rgba(238,0,0,.12)",
                color: "var(--wtm-badge-fg)",
              }}
            >
              {month}
            </span>
          </div>

          <Stars size={15} color={RED} gap={3} />

          <div style={{ fontStyle: "italic", fontWeight: 500, fontSize: 16, lineHeight: 1.6, color: "var(--wtm-text)" }}>
            {paragraphs.map((p, i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : "0.75em 0 0" }}>
                {paragraphs.length === 1
                  ? `“${p}”`
                  : i === 0
                    ? `“${p}`
                    : i === paragraphs.length - 1
                      ? `${p}”`
                      : p}
              </p>
            ))}
          </div>
        </div>

        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            gap: 9,
            flexWrap: "wrap",
            padding: "15px 30px",
            borderTop: "1px solid var(--wtm-border)",
            background: "var(--wtm-panel)",
          }}
        >
          <Award size={16} strokeWidth={1.8} aria-hidden style={{ color: "var(--wtm-green)", flex: "0 0 auto" }} />
          <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.35, color: "var(--wtm-green)" }}>{prize}</span>
          {/* Preserve the existing "Watch the draw" affordance (Facebook live-draw link,
              major draws only) that the prior modal carried — not in the handoff mock, but
              real, trust-building functionality tied to WinnerSummary.watchUrl. */}
          {winner.watchUrl ? (
            <a
              href={winner.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: ".04em",
                textTransform: "uppercase",
                color: "var(--wtm-sub)",
                textDecoration: "none",
              }}
            >
              <Play size={13} aria-hidden style={{ fill: "currentColor" }} />
              Watch the draw
            </a>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Winner testimonies — the "speech bubble" testimonial section.
 *
 * Desktop: an auto-fitting grid (as many cards per row as the width allows).
 * Mobile: a one-at-a-time carousel (prev/next + dots). Both read the SAME
 * winners and share one "Read full story" modal. Self-contained (`.winner-testimonies`
 * token scope + `font-poppins`) so it renders identically on any host page —
 * homepage, /winners, the /promotions gallery + brand pages.
 *
 * Only winners with a written testimony are shown; the whole section returns
 * null when there are none (matching the shared feed's existing behaviour).
 */
export default function WinnersTestimony({ winners }: { winners: WinnerSummary[] }) {
  const stories = winners.filter(hasWinnerTestimony);
  const n = stories.length;
  const [idx, setIdx] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const go = useCallback((delta: number) => setIdx((i) => (n === 0 ? 0 : (i + delta + n) % n)), [n]);

  // Keep the carousel index in range if the feed changes under us.
  useEffect(() => {
    if (idx > n - 1) setIdx(0);
  }, [idx, n]);

  if (n === 0) return null;

  const current = stories[Math.min(idx, n - 1)];
  const openWinner = stories.find((w) => w.id === openId) ?? null;
  const multi = n > 1;

  return (
    <section
      className="winner-testimonies font-poppins overflow-x-clip"
      aria-label="Real winner testimonies"
      style={{ background: "var(--wt-base)" }}
    >
      <div className="mx-auto max-w-[1240px] px-4 py-8 lg:px-10 lg:py-12">
        {/* Centred "Winners / testimonial" header framed by red quote marks. */}
        <div className="wt-header">
          <span className="wt-quote wt-quote-open" aria-hidden>
            &ldquo;
          </span>
          <p className="wt-kicker">Winners</p>
          <h2 className="wt-title">testimonial</h2>
          <span className="wt-quote wt-quote-close" aria-hidden>
            &rdquo;
          </span>
        </div>

        {/* Desktop — auto-fitting grid. Card width is CAPPED (not the handoff's raw
            1fr) and the set is centred so a handful of real winners don't stretch into
            giant cards; still reflows by width, adding a winner never changes layout. */}
        <div
          className="hidden md:grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 360px))",
            justifyContent: "center",
            columnGap: 18,
            rowGap: 8,
          }}
        >
          {stories.map((w) => (
            <TestimonyCard key={w.id} winner={w} onOpen={setOpenId} />
          ))}
        </div>

        {/* Mobile — one-at-a-time carousel (card re-keyed by id so it "swaps" in) */}
        <div className="md:hidden">
          <TestimonyCard key={`m-${current.id}`} winner={current} onOpen={setOpenId} />
          {multi ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 20 }}>
              <button type="button" aria-label="Previous winner" onClick={() => go(-1)} className="wt-nav" style={NAV_STYLE}>
                <ChevronLeft size={16} strokeWidth={2.4} aria-hidden />
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                {stories.map((w, i) => (
                  <button
                    key={w.id}
                    type="button"
                    aria-label={`Go to winner ${i + 1}`}
                    aria-current={i === idx ? "true" : undefined}
                    onClick={() => setIdx(i)}
                    style={{
                      width: i === idx ? 22 : 7,
                      height: 7,
                      borderRadius: 100,
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      transition: "width .25s ease, background .25s ease",
                      background: i === idx ? RED : "var(--wt-dot-off)",
                    }}
                  />
                ))}
              </div>
              <button type="button" aria-label="Next winner" onClick={() => go(1)} className="wt-nav" style={NAV_STYLE}>
                <ChevronRight size={16} strokeWidth={2.4} aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <WinnerStoryModal winner={openWinner} onClose={() => setOpenId(null)} />
    </section>
  );
}
