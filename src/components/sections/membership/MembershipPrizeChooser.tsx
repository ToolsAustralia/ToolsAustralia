"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Trophy, Check, ShieldCheck, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Seg from "@/components/ui/Seg";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import MetallicButton from "@/components/ui/MetallicButton";
import { SectionContainer } from "@/components/ui/SectionContainer";
import { usePrizeCatalog } from "@/hooks/usePrizeCatalog";
import { fromPrizeSlug } from "@/components/sections/promo/prize-selection/prize-builder-model";
import { getToolbox, getToolset } from "@/components/sections/promo/prize-selection/constants";

type PrizePick = "setup" | "cash";

const ITEMS: Record<PrizePick, string[]> = {
  setup: [
    "Your pick of brand — Milwaukee, DeWalt, Makita & more",
    "Toolbox + power-tool kit + storage system",
    "One winner every month, drawn live",
  ],
  cash: ["$10,000 cash, tax-free", "Paid straight to your bank", "Spend it however you like"],
};

export default function MembershipPrizeChooser() {
  const { prizes, activePrize, resolvePrize } = usePrizeCatalog();
  const cashPrize = resolvePrize("cash-prize");
  const [pick, setPick] = useState<PrizePick>("setup");
  const isCash = pick === "cash";
  const pickOptions = [
    { value: "setup" as const, label: "The setup" },
    { value: "cash" as const, label: "The cash" },
  ];

  /**
   * Every buildable combination, cash excluded — the winner picks a toolbox AND a power-tool
   * kit, so "the prize" is 20 real pairings rather than one bundle. Filtered on the presence
   * of a hero image: a combo with no artwork cannot be browsed to, and an empty frame in the
   * middle of a carousel reads as a broken page.
   */
  const combos = useMemo(
    () => prizes.filter((p) => p.slug !== "cash-prize" && Boolean(p.gallery?.[0]?.src)),
    [prizes]
  );
  const comboCount = combos.length;

  // Open on whatever the catalogue says is current, so the section still leads with the
  // featured build rather than whichever combo happens to sort first.
  const defaultComboIndex = Math.max(
    0,
    combos.findIndex((p) => p.slug === activePrize?.slug)
  );
  const [comboIndex, setComboIndex] = useState(defaultComboIndex);

  // Wraps in both directions — a carousel that dead-ends at either edge makes the user
  // discover the boundary by pressing a button that does nothing.
  const stepCombo = (delta: number) =>
    setComboIndex((i) => (comboCount === 0 ? 0 : (i + delta + comboCount) % comboCount));

  /**
   * The keyboard half of the `listbox` role. The markup claimed the ARIA listbox pattern while
   * implementing none of it: arrow keys did nothing (the role promises they move the
   * selection), and because every option was a native tab stop, reaching the "Get free
   * entries" CTA past the rail took 22 Tab presses — during which the browser scrolled the
   * rail through all 1,432px of itself, one focus at a time.
   *
   * Paired with the roving `tabIndex` on each option below, this makes the rail ONE tab stop
   * and makes the role honest. Both halves are required: the roving tabIndex alone would trap
   * a keyboard user on a single thumbnail with no way to move.
   */
  const onRailKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => stepCombo(1),
      ArrowLeft: () => stepCombo(-1),
      Home: () => setComboIndex(0),
      End: () => setComboIndex(comboCount - 1),
    };
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  };

  // Keep the selected thumbnail in view. Stepping with the arrows moved the selection but
  // never the rail, so from combo 7 on the user was looking at a rail with no highlight in
  // it while the counter insisted something was selected.
  //
  // Two deliberate choices: scroll the RAIL, not `scrollIntoView` (which would also move the
  // PAGE vertically), and jump instantly rather than `behavior:"smooth"`. Smooth loses the
  // race against the hero <Image> remount that the same click triggers (`key={image}`) —
  // measured stalling ~145px short of a 573px target — so the rail would settle on the wrong
  // thumbnail. Instant also matches the image swap, which is itself instant, and sidesteps
  // reduced-motion entirely.
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = railRef.current;
    const thumb = rail?.children[comboIndex] as HTMLElement | undefined;
    if (!rail || !thumb) return;
    rail.scrollLeft = Math.max(0, thumb.offsetLeft - (rail.clientWidth - thumb.offsetWidth) / 2);

    // Carry focus with the roving tabIndex, but ONLY if focus is already inside the rail.
    // Without the guard, clicking the ‹ › arrows would yank focus off the arrow the user is
    // clicking and onto a thumbnail, so the next click would land on nothing.
    if (rail.contains(document.activeElement)) thumb.focus();
  }, [comboIndex, isCash]);

  const activeCombo = combos[comboIndex] ?? activePrize;
  const entry = isCash ? cashPrize : activeCombo;
  const image = entry?.gallery?.[0]?.src ?? activePrize?.gallery?.[0]?.src ?? "";
  const imageAlt = entry?.gallery?.[0]?.alt ?? "This month's prize";

  /**
   * Name the combination the user is actually looking at. This pill used to read a fixed
   * "The Ultimate Tradie Setup" for all 20 builds, so browsing changed the photo but never
   * told a sighted user WHICH pairing they had landed on (the alt text did — screen readers
   * knew more than the screen). `<toolset> × <toolbox>` is the established house form for a
   * combination name, so this matches ComboRail / gallery-spotlight rather than coining one.
   */
  const comboName = useMemo(() => {
    const lanes = fromPrizeSlug(activeCombo?.slug);
    if (!lanes) return null;
    const toolset = getToolset(lanes.toolset);
    const toolbox = getToolbox(lanes.toolbox);
    return toolset && toolbox ? `${toolset.name} × ${toolbox.brandName}` : null;
  }, [activeCombo?.slug]);

  const tagLabel = isCash ? "$10,000 cash" : (comboName ?? "The Ultimate Tradie Setup");
  const amount = isCash ? 10000 : 5000;
  const amountCap = isCash ? "paid straight to your bank account" : "cash on top of the gear";

  return (
    // `scroll-mt` because the site header is `position: fixed` (86px, 106px at lg) and so
    // contributes nothing to layout: an anchor jump puts the section's true top under it.
    // The section's own `py-16` (64px) is less than the header, so the gold eyebrow badge
    // landed behind it — the first thing a #prize CTA is meant to show.
    <section
      id="prize"
      className="relative scroll-mt-[var(--app-header-h)] overflow-hidden bg-neutral-950 py-16 text-white sm:py-20 lg:scroll-mt-[var(--app-header-h-lg)] lg:py-24"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 64% at 31% 42%, rgba(255,234,196,.16), transparent 60%), radial-gradient(60% 50% at 92% 8%, rgba(238,0,0,.18), transparent 60%)",
        }}
        aria-hidden
      />
      <SectionContainer as="div" className="relative">
        <div className="text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.16em]"
            style={{
              color: "#f1d99a",
              background: "linear-gradient(180deg,rgba(212,175,55,.18),rgba(212,175,55,.05))",
              borderColor: "rgba(212,175,55,.5)",
              boxShadow: "0 0 28px -12px rgba(212,175,55,.7)",
            }}
          >
            <Trophy className="h-3.5 w-3.5" style={{ color: "#d4af37" }} /> This month&apos;s prize
          </span>
          <h2 className="mt-5 font-poppins text-[26px] font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Win the Ultimate Tradie Setup.{" "}
            <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">Or take the $10,000 cash.</span>
          </h2>
          {/* Mobile: toggle sits above the image so switching reflects in the art */}
          <div className="mt-6 flex justify-center lg:hidden">
            <Seg value={pick} onChange={setPick} tone="dark" accentHex="#f0a500" options={pickOptions} />
          </div>
        </div>

        {/* `lg:items-start`, NOT `items-center`. The thumbnail rail only renders for "The
            setup", so switching to "The cash" shortens the left column by ~90px — and centring
            re-centres the (unchanged) right column by half that, sliding the Seg the user just
            clicked 45px up out from under their cursor. Toggling back then needs re-aiming.
            Aligning to the top makes the right column's position independent of the rail. */}
        <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:items-start">
          {/* `min-w-0` is load-bearing, not tidying. A grid item defaults to `min-width:auto`,
              so the 20-thumbnail rail below (max-content ≈ 1432px) sized the single-column
              MOBILE track to 1432px instead of scrolling inside it — blowing the image frame
              and the whole right-hand column out to 1432px on a 390px phone. The section's
              `overflow-hidden` clipped the damage, so it never showed as a page-level
              horizontal scrollbar; it just rendered a giant cropped sliver of the toolbox.
              (`lg:grid-cols-2` is unaffected — Tailwind's grid-cols-* already uses
              `minmax(0,1fr)`, which is why this only ever broke below `lg`.) */}
          <div className="relative min-w-0">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-white/15 bg-white/5">
              {image && (
                <Image
                  // Keyed on the combo so switching swaps the element rather than mutating one
                  // <img> src — without it the browser paints the old photo until the new one
                  // decodes, which reads as the arrow having done nothing.
                  key={image}
                  src={image}
                  alt={imageAlt}
                  fill
                  className="object-contain"
                  sizes="(max-width:1024px) 100vw, 560px"
                />
              )}

              {/* Combination browser. The setup is not one prize — the winner builds it, and
                  there are 20 real toolbox x power-tool-kit combinations. Showing only the
                  default made the whole thing look like a single Milwaukee bundle, which
                  undersells the actual offer AND contradicts the bullet directly beside it
                  ("Your pick of brand"). Cash has nothing to browse, so the control is
                  setup-only. */}
              {!isCash && comboCount > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => stepCombo(-1)}
                    aria-label="Previous prize combination"
                    className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:h-11 sm:w-11"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => stepCombo(1)}
                    aria-label="Next prize combination"
                    className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:h-11 sm:w-11"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums text-white/80 backdrop-blur">
                    {comboIndex + 1} / {comboCount}
                  </span>
                </>
              )}

              {/* Anchored INSIDE the image frame, not the outer column. It used to hang off the
                  column, which was the same box as the image — until the thumbnail rail was
                  added below and `bottom-3` started measuring from the bottom of the rail,
                  dropping the tag on top of the thumbnails. */}
              {/* Polite live region: now that this pill names the combination, stepping the
                  carousel announces the new pairing instead of changing the photo in silence. */}
              <span
                aria-live="polite"
                className="absolute bottom-3 left-3 max-w-[calc(100%-5.5rem)] truncate rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold backdrop-blur"
              >
                {tagLabel}
              </span>
            </div>

            {/* Every combination is directly selectable, not just reachable by stepping — 20
                presses to reach the last one is not a choice, it is a chore. The rail is the
                same hero images at thumbnail size, so what you tap is what you get.

                On the scrollbar classes: `.brand-scrollbar`'s dark palette is gated on a
                `.dark` ANCESTOR, but this section is `bg-neutral-950` in every theme — so a
                light-theme visitor got the near-white `#fef2f2` track on near-black. Pinned
                locally rather than theme-switched, because the surface itself never switches. */}
            {!isCash && comboCount > 1 && (
              <div
                ref={railRef}
                className="brand-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-color:#ee0000_#262626] [&::-webkit-scrollbar-track]:bg-neutral-800"
                role="listbox"
                aria-label="Prize combinations"
                onKeyDown={onRailKeyDown}
              >
                {combos.map((combo, i) => (
                  <button
                    key={combo.slug}
                    type="button"
                    role="option"
                    aria-selected={i === comboIndex}
                    // Roving tabIndex: the rail is ONE tab stop, and arrow keys move within it
                    // (see `onRailKeyDown`). Previously all 20 were tab stops.
                    tabIndex={i === comboIndex ? 0 : -1}
                    onClick={() => setComboIndex(i)}
                    title={combo.label}
                    className={`relative h-14 w-16 flex-none overflow-hidden rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:h-16 sm:w-20 ${
                      i === comboIndex
                        ? "border-amber-300 opacity-100 ring-1 ring-amber-300/60"
                        : "border-white/15 opacity-60 hover:opacity-100"
                    }`}
                  >
                    {combo.gallery?.[0]?.src && (
                      <Image
                        src={combo.gallery[0].src}
                        alt=""
                        fill
                        className="object-contain p-1"
                        sizes="80px"
                        loading="lazy"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="hidden lg:block">
              <Seg value={pick} onChange={setPick} tone="dark" accentHex="#f0a500" options={pickOptions} />
            </div>
            <div className="mt-5 font-poppins text-5xl font-extrabold text-amber-300">
              <AnimatedNumber value={amount} format={(n) => `$${Math.round(n).toLocaleString()}`} />
            </div>
            <div className="text-sm text-white/60">{amountCap}</div>
            <ul className="mt-5 flex flex-col gap-2.5">
              {ITEMS[pick].map((it) => (
                <li key={it} className="flex items-start gap-2 text-sm text-white/90">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" /> {it}
                </li>
              ))}
            </ul>
            <div className="mt-7">
              <MetallicButton
                href="#membership"
                variant="primary"
                size="md"
                borderRadius="full"
                className="whitespace-nowrap !rounded-xl !px-5 !text-sm sm:!rounded-full sm:!px-8 sm:!text-base"
                icon={<ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />}
              >
                Get free entries
              </MetallicButton>
            </div>
            <p className="mt-4 inline-flex items-center gap-2 text-xs text-white/55">
              <ShieldCheck className="h-3.5 w-3.5" /> Drawn live on Facebook, 27th · independently certified
            </p>
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
