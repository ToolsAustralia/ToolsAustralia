"use client";

/**
 * PartnerBrandWall — the partner-network conveyor section.
 *
 * One hero number (a mechanical odometer that rolls up on scroll-in) over three
 * horizontally-scrolling belts of partner tiles. Hovering the belt stack stops all
 * motion; hovering or keyboard-focusing a tile lifts it and reveals that partner's
 * discount.
 *
 * COUNT (CLAUDE.md §11 + the handoff's own rule — only claim a number you can back):
 * the odometer counts partner **OFFERS**, defaulting to `PARTNER_CATALOG_TOTAL`, the
 * generated size of the iGoDirect/MyRewards catalogue reached through the partner
 * portal. It is deliberately NOT labelled "partner brands": `PARTNER_BRAND_OFFERS` —
 * the list behind the CTA — holds 7 direct brands. Reading the generated constant also
 * means the number tracks the catalogue instead of rotting inside a copy string.
 *
 * SKIN is CSS, not JS. Both skins live in `globals.css` under `.ta-brand-wall` /
 * `.dark .ta-brand-wall`. Deriving `isDark` in JS does not work here: reading the theme
 * class during render is not reactive (the class lands after the render that read it and
 * nothing schedules a second one), so a JS-skinned wall stays light inside a dark page.
 * CSS variables also avoid a hydration mismatch and re-render nothing on theme change.
 *
 * MOTION: belts are pure CSS on `--ta-marquee-state`, so Save-Data and
 * prefers-reduced-motion users get a static wall; the odometer lands instantly for them.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { PARTNER_BRAND_OFFERS, type PartnerBrandOffer } from "@/data/partnerBrandOffers";
import { PARTNER_CATALOG_TOTAL } from "@/generated/partnerCatalogPreview";
import { PARTNER_WALL_TILES } from "@/generated/partnerWallTiles";
import { buildPartnerPortalOfferImageUrl } from "@/utils/partner-discounts/portal-offer-url";
import { cn } from "@/utils/cn";

/**
 * Belt tuning — direction and texture speed. The tile-track duration is NOT here: see
 * SECONDS_PER_TILE.
 *
 * Belts 2 and 3 are deliberately identical apart from direction, so the two portal belts
 * read as one calm system rather than a race.
 */
const BELTS = [
  { reverse: false, tread: 3.2, roller: 1.7 },
  { reverse: true, tread: 3.6, roller: 1.9 },
  { reverse: false, tread: 3.6, roller: 1.9 },
] as const;

/**
 * How many times each belt's list is repeated across the track.
 *
 * `translateX(-50%)` only loops seamlessly if the track is rendered as an EVEN number of
 * identical copies AND half the track is at least as wide as the belt — otherwise the tail
 * of the list runs past the right edge and leaves a dead gap before it wraps. Belt 1 holds
 * only 7 partners, so a plain double (the handoff's assumption, written for ~48 tiles) is
 * far too short on a desktop viewport: that is exactly the gap this repeat count fixes.
 *
 * Kept deliberately generous — repeating a few more tiles costs nothing (the images are
 * already in cache) whereas a visible gap reads as broken.
 */
const MIN_HALF_TRACK_PX = 2800;
const APPROX_TILE_PX = 300;

function trackCopies(tileCount: number): number {
  const onePassPx = Math.max(1, tileCount) * APPROX_TILE_PX;
  // Always even, so -50% lands exactly on a copy boundary.
  return Math.max(2, Math.ceil(MIN_HALF_TRACK_PX / onePassPx) * 2);
}

const DRUM_COUNT = 4; // supports 1–9999

/** A portal-catalogue tile. Logo-only: see PARTNER_WALL_TILES on why `name` is not shown. */
interface PortalTile {
  name: string;
  logo: string;
  highlight: string;
}

type BeltRow =
  | { kind: "direct"; items: PartnerBrandOffer[] }
  | { kind: "portal"; items: PortalTile[] };

export interface PartnerBrandWallProps {
  /** Primary CTA. On /membership this opens the membership modal. */
  onCtaClick: () => void;
  ctaLabel?: string;
  /** Offers shown on the odometer. Defaults to the generated catalogue total. */
  count?: number;
  /** Tiles. Defaults to the 7 real direct partners. */
  partners?: PartnerBrandOffer[];
  /** Pin a skin. Omit to follow the site theme (both skins are implemented). */
  skin?: "light" | "dark";
  className?: string;
}

export default function PartnerBrandWall({
  onCtaClick,
  ctaLabel = "Unlock partner discounts",
  count = PARTNER_CATALOG_TOTAL,
  partners = PARTNER_BRAND_OFFERS,
  skin,
  className,
}: PartnerBrandWallProps) {
  if (partners.length === 0) return null;

  // Belt 1 = OUR direct partners (contracted brands with a discount we can name).
  // Belts 2-3 = the trade-relevant portal slice, so the belts stop repeating the same
  // seven logos and the odometer's count finally has visible substance behind it.
  // No invented partner names, ever (see the handoff's Assets note) — every tile here is
  // a real business from one of the two live programmes.
  const portalTiles = PARTNER_WALL_TILES.map(([name, id, imageExt, highlight]) => ({
    name,
    logo: buildPartnerPortalOfferImageUrl(id, imageExt),
    highlight,
  })).filter((t): t is { name: string; logo: string; highlight: string } => Boolean(t.logo));

  const half = Math.ceil(portalTiles.length / 2);
  const rows: BeltRow[] = [
    { kind: "direct", items: partners },
    { kind: "portal", items: portalTiles.slice(0, half) },
    { kind: "portal", items: portalTiles.slice(half) },
  ];

  // If the portal slice is unavailable (env var unset ⇒ no image URLs), fall back to the
  // direct partners on every belt rather than rendering an empty conveyor.
  for (const row of rows) {
    if (row.items.length === 0) {
      row.kind = "direct";
      row.items = partners;
    }
  }

  return (
    <section
      data-skin={skin}
      className={cn("ta-brand-wall relative w-full overflow-hidden bg-[image:var(--bw-bg)]", className)}
    >
      {/* Hazard-tape edge */}
      <div
        aria-hidden
        className="h-2.5 w-full opacity-[var(--bw-tape-opacity)]"
        style={{ background: "repeating-linear-gradient(45deg,#ffd200 0 11px,#15181f 11px 22px)" }}
      />

      {/* Header */}
      <div className="mx-auto flex max-w-[820px] flex-col items-center gap-[18px] px-[26px] pb-10 pt-[46px] text-center">
        <span className="inline-flex items-center gap-[9px] font-sans text-[11px] font-extrabold uppercase leading-none tracking-[0.2em] text-[var(--bw-eyebrow)]">
          <span
            aria-hidden
            className="h-[7px] w-[7px] rounded-full bg-[var(--bw-pip)] motion-safe:animate-[ta-pulse-dot_2.1s_cubic-bezier(.22,1,.36,1)_infinite]"
          />
          Partner network · live
        </span>

        <Odometer count={count} />

        {/* Says what the number IS. The handoff read "PARTNER BRANDS · ONE CARD" — both
            halves were wrong for us: these are OFFERS not brands (the direct brand list is
            7), and we issue no card, the membership is the key. */}
        <span className="font-sans text-[11.5px] font-extrabold uppercase leading-none tracking-[0.3em] text-[var(--bw-sub)]">
          Partner offers · one membership
        </span>

        <h2
          className="max-w-[620px] font-poppins text-[26px] font-black leading-[1.1] tracking-[-0.025em] text-[var(--bw-h2)] sm:text-[34px]"
          style={{ textWrap: "pretty" }}
        >
          Become a member,{" "}
          <span className="text-[#ee0000] dark:text-[#ff3b3b]">unlock partner discounts</span>
        </h2>
      </div>

      {/* Belt stack. content-visibility skips paint + animation work while offscreen;
          the reserved height means no CLS. Hovering anywhere here pauses every belt. */}
      <div className="ta-brand-wall-stack mt-[38px] flex flex-col gap-4 [contain-intrinsic-size:auto_365px] [content-visibility:auto] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
        {BELTS.map((belt, i) => (
          <Belt key={i} belt={belt} row={rows[i]} onTileActivate={onCtaClick} />
        ))}
      </div>

      {/* CTA */}
      <div className="mt-[34px] flex flex-wrap items-center justify-center gap-4 px-5 pb-[46px]">
        <button
          type="button"
          onClick={onCtaClick}
          className="inline-flex min-h-[54px] items-center gap-2 rounded-full px-7 font-sans text-[15px] font-bold text-white shadow-[var(--bw-cta-shadow)] transition-[filter,transform] duration-200 hover:-translate-y-0.5 hover:brightness-110"
          style={{ background: "linear-gradient(180deg,#ff2a2a,#ee0000 60%,#c40d0d)" }}
        >
          {ctaLabel}
          <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2.6} />
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Belt({
  belt,
  row,
  onTileActivate,
}: {
  belt: (typeof BELTS)[number];
  row: BeltRow;
  onTileActivate: () => void;
}) {
  const count = row.items.length;
  const dir = belt.reverse ? "reverse" : "normal";
  const copies = trackCopies(count);
  // Tiles the animation actually travels past in one cycle (half the rendered track).
  const tilesPerCycle = (copies / 2) * count;
  // Duration = tiles × a per-tile time, so every belt moves at the same px/sec regardless
  // of how many tiles it holds. The handoff's fixed per-belt durations only worked when
  // all belts held the same count; ours hold 7 vs ~47, so a fixed duration made the portal
  // belts ~6× faster than the partner belt. `--bw-tile-sec` also drops on mobile, where
  // tiles are logo-only (~130px vs ~300px) and would otherwise crawl.
  const trackDuration = `calc(var(--bw-tile-sec) * ${tilesPerCycle})`;
  return (
    <div className="relative border-b border-t border-b-[var(--bw-deck-bottom)] border-t-[var(--bw-deck-top)] bg-[image:var(--bw-deck-bg)] shadow-[var(--bw-deck-shadow)]">
      {/* Moving tread */}
      <div
        aria-hidden
        data-belt-anim
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(90deg, var(--bw-tread) 0 2px, transparent 2px 26px)",
          animation: `ta-belt-tread ${belt.tread}s linear infinite ${dir}`,
        }}
      />

      {/* Tile track — rendered as `copies` identical passes (always even) so translateX(-50%)
          loops seamlessly with no gap. Do NOT add justify-center here: when the track is wider
          than the belt it starts at a negative offset, and the -50% travel then runs off the
          right end and exposes exactly the dead gap the copy count exists to prevent. */}
      <div
        data-belt-anim
        className="relative flex w-max gap-3.5 py-[13px] [will-change:transform]"
        style={{ animation: `ta-belt-track ${trackDuration} linear infinite ${dir}` }}
      >
        {row.kind === "direct"
          ? Array.from({ length: copies }).flatMap((_, c) =>
              row.items.map((p, i) => (
              <Tile
                key={`${p.id}-${c}-${i}`}
                logo={p.logo}
                alt={p.name}
                name={p.name}
                offer={p.discount}
                // Only the first pass is announced; the rest exist purely for the loop.
                duplicate={c > 0}
                onActivate={onTileActivate}
              />
              ))
            )
          : Array.from({ length: copies }).flatMap((_, c) =>
              row.items.map((t, i) => (
              <Tile
                key={`${t.name}-${c}-${i}`}
                logo={t.logo}
                alt={t.name}
                // Same layout as the direct-partner tiles. CAVEAT: the vendor's name field
                // can disagree with its own artwork (800575 is named "GUNNEDAH HYDRAULICS"
                // but its logo reads "AG-FIX HYDRAULICS") and nothing detects that
                // automatically, so a few tiles will show a name that differs from the
                // wordmark beside it. Accepted deliberately — most match, and a named tile
                // is far more legible than a bare logo.
                name={t.name}
                offer={t.highlight}
                duplicate={c > 0}
                onActivate={onTileActivate}
              />
              ))
            )}
      </div>

      {/* Roller strip */}
      <div aria-hidden className="h-[9px] overflow-hidden bg-[image:var(--bw-roller-bg)]">
        <div
          data-belt-anim
          className="h-full w-full"
          style={{
            background:
              "repeating-linear-gradient(90deg, var(--bw-roller-dash) 0 2px, transparent 2px 14px)",
            animation: `ta-belt-roller ${belt.roller}s linear infinite ${dir}`,
          }}
        />
      </div>
    </div>
  );
}

function Tile({
  logo,
  alt,
  name,
  offer,
  duplicate,
  onActivate,
}: {
  logo: string;
  /** Accessible image label. Same as `name` — kept separate so a future logo-only mode
   *  cannot silently drop the alt text. */
  alt: string;
  name: string;
  offer: string;
  duplicate: boolean;
  onActivate: () => void;
}) {
  // Tiles are NOT outbound links to the partner. This section's job is to convert, so a
  // tile fires the same action as the CTA rather than sending the visitor off-site before
  // they have joined. It also sidesteps the catalogue's placeholder "#" links, which as
  // anchors would have been focusable routes to nowhere.
  return (
    <button
      type="button"
      onClick={onActivate}
      // The second copy exists only to make the CSS loop seamless — hide it from AT and
      // from the tab order so every partner is reachable exactly once.
      {...(duplicate ? { "aria-hidden": true, tabIndex: -1 } : {})}
      aria-label={`${alt} — ${offer}. Unlock partner discounts.`}
      // px-3: the handoff's px-6 was sized for a text-only tile. With a fixed logo box and
      // a fixed name column the tile already has internal breathing room, so the outer
      // padding was just dead width repeated ~100 times across the belts.
      className="ta-brand-tile relative flex h-[76px] flex-none items-center gap-2.5 rounded-[14px] border border-[var(--bw-tile-border)] bg-[image:var(--bw-tile-bg)] px-3 text-left no-underline shadow-[var(--bw-tile-shadow)] transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-2 focus-visible:-translate-y-2 focus-visible:outline-none"
    >
      {/* Plate is transparent in the light skin; in dark it restores the white ground the
          dark-ink partner wordmarks were drawn for. See globals.css `--bw-logo-plate`. */}
      {/* FIXED logo box, not a height cap. Portal artwork is squarish (typically 435×330),
          so a height cap alone let aspect ratio drive tile width — square logos rendered
          74px wide and wide ones 150px, giving belts 2–3 tiles of 132px and 208px. */}
      <span className="flex h-12 w-[104px] shrink-0 items-center justify-center rounded-lg bg-[var(--bw-logo-plate)] p-[var(--bw-logo-pad)] sm:w-[120px]">
        <Image
          src={logo}
          alt={alt}
          width={170}
          height={48}
          className="max-h-full max-w-full object-contain"
          sizes="170px"
          // Portal artwork is unoptimised and runs to several hundred KB — never eager.
          loading="lazy"
        />
      </span>

      {/* Logo-only on mobile. The name column is the widest part of the tile, and on a
          narrow screen fewer, wider tiles read as less of a network than more logos. The
          offer chip goes with it: it only reveals on hover/focus-visible, neither of which
          a touch user gets, so on mobile it was reserving width for something never shown.
          The name still reaches screen readers through the tile's aria-label. */}
      <span className="hidden w-[136px] shrink-0 flex-col gap-1 sm:flex">
        {/* Fixed width + 2-line clamp. Vendor names run long and verbose ("QUICK FIT TYRE
            SERVICE YEERONGPILLY"), and on one line they drove tile width from 198px to
            421px within a single belt. Wrapping to two rows makes every tile the same
            width, so the conveyor reads as one component. */}
        <span className="line-clamp-2 font-sans text-[13px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[var(--bw-tile-name)]">
          {name}
        </span>
        {/* Hidden at rest but kept in layout — see globals.css `.ta-brand-tile` */}
        <span
          data-offer-chip
          className="w-fit whitespace-nowrap rounded-md bg-[var(--bw-chip-bg)] px-2 py-[5px] font-sans text-[9.5px] font-extrabold uppercase leading-none tracking-[0.11em] text-[var(--bw-chip-fg)]"
        >
          {offer}
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Mechanical odometer. Four drums, each a column of 0–9 rendered twice; rolling to
 * `-(10 + digit) × cellHeight` buys a full extra revolution before it settles, and the
 * per-slot delay makes the digits land left-to-right.
 *
 * Rolls when the plate scrolls into view rather than on mount: this section sits well
 * below the fold on both hosts, so a mount-triggered roll would always finish unseen.
 */
function Odometer({ count }: { count: number }) {
  const plateRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [rolled, setRolled] = useState(false);

  const digits = String(Math.min(9999, Math.max(1, Math.trunc(count)))).split("").map(Number);
  const lead = DRUM_COUNT - digits.length;

  // Depends on `count`, not the derived `digits` array — a fresh array each render would
  // change this callback's identity every render and make the effect below tear down and
  // re-create its IntersectionObserver on a loop.
  const roll = useCallback(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const ds = String(Math.min(9999, Math.max(1, Math.trunc(count)))).split("").map(Number);
    const leadSlots = DRUM_COUNT - ds.length;

    ds.forEach((d, i) => {
      const column = columnRefs.current[leadSlots + i];
      if (!column) return;
      // Read the cell height from the DOM instead of hardcoding 92px — the plate scales
      // down under 640px and the roll maths depends on that height.
      const cell = column.firstElementChild as HTMLElement | null;
      const h = cell?.getBoundingClientRect().height || 92;

      if (reduce) {
        column.style.transition = "none";
        column.style.transform = `translateY(-${d * h}px)`;
        return;
      }

      column.style.transition = "none";
      column.style.transform = "translateY(0)";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          column.style.transition = `transform 1.6s cubic-bezier(.16,1,.3,1) ${i * 110}ms`;
          column.style.transform = `translateY(-${(10 + d) * h}px)`;
        });
      });
    });
  }, [count]);

  useEffect(() => {
    if (rolled) return;
    const el = plateRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setRolled(true);
      roll();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRolled(true);
          roll();
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [roll, rolled]);

  return (
    <div
      ref={plateRef}
      className="relative flex items-center gap-[9px] rounded-[20px] border border-[var(--bw-plate-border)] bg-[image:var(--bw-plate-bg)] px-5 py-[15px] shadow-[var(--bw-plate-shadow)]"
      role="img"
      aria-label={`${count.toLocaleString("en-AU")} partner offers`}
    >
      {/* Rivets */}
      {["left-[9px] top-[10px]", "right-[9px] top-[10px]", "left-[9px] bottom-[10px]", "right-[9px] bottom-[10px]"].map(
        (pos) => (
          <span
            key={pos}
            aria-hidden
            className={cn("absolute h-[5px] w-[5px] rounded-full bg-[image:var(--bw-rivet)]", pos)}
          />
        )
      )}

      {Array.from({ length: DRUM_COUNT }).map((_, slot) => (
        <React.Fragment key={slot}>
          <div
            aria-hidden
            className={cn(
              "relative overflow-hidden rounded-[10px] bg-[image:var(--bw-drum-bg)] shadow-[var(--bw-drum-shadow)]",
              slot < lead ? "hidden" : "block",
              "h-[70px] w-[44px] sm:h-[92px] sm:w-[58px]"
            )}
          >
            <div
              ref={(el) => {
                columnRefs.current[slot] = el;
              }}
              className="absolute top-0 flex flex-col"
            >
              {/* 0–9 twice, so a settle can always roll a full extra revolution */}
              {Array.from({ length: 20 }).map((__, n) => (
                <span
                  key={n}
                  className="grid h-[70px] w-[44px] place-items-center font-poppins text-[46px] font-black leading-none tracking-[-0.04em] text-[var(--bw-digit)] sm:h-[92px] sm:w-[58px] sm:text-[62px]"
                >
                  {n % 10}
                </span>
              ))}
            </div>
            {/* Glass */}
            <span aria-hidden className="pointer-events-none absolute inset-0 bg-[image:var(--bw-glass)]" />
          </div>

          {/* Thousands comma — only meaningful on a 4-digit count */}
          {slot === 0 && digits.length === 4 && (
            <span
              aria-hidden
              className="self-end pb-2 font-poppins text-[46px] font-black leading-none text-[var(--bw-comma)] sm:text-[62px]"
            >
              ,
            </span>
          )}
        </React.Fragment>
      ))}

      <span
        aria-hidden
        className="bg-[image:var(--bw-plus)] bg-clip-text font-poppins text-[46px] font-black leading-none tracking-[-0.03em] text-transparent sm:text-[62px]"
      >
        +
      </span>
    </div>
  );
}
