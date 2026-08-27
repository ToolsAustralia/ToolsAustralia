"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { X } from "lucide-react";

import ModalContainer from "../ui/ModalContainer";
import PrizeImageViewer from "@/components/ui/PrizeImageViewer";
import { Z_INDEX } from "@/constants/z-index";
import FeaturePanel from "./FeaturePanel";
import SpecCard from "./SpecCard";
import TabBar from "./TabBar";
import type { PrizeCatalogEntry, PrizeSpecSection } from "@/config/prizes";
// Leaf imports (not the prize-selection barrel): these two modules are pure data +
// pure derivations, so the sheet shares the builder's vocabulary without pulling the
// card's component tree into this click-gated chunk.
import {
  CASH_OPTION,
  TOOLBOXES,
  TOOLSETS,
  getToolbox,
  getToolset,
} from "@/components/sections/promo/prize-selection/constants";
import {
  darken,
  fromPrizeSlug,
  getContentsChips,
} from "@/components/sections/promo/prize-selection/prize-builder-model";
import { NTP_NUMBER } from "@/constants/legal";

/**
 * Id of the cash tab. Draw 10 removed the $5,000 combo bonus, so this sheet no longer
 * APPENDS a cash tab to tool prizes — but the cash-only prize is still a real catalog
 * entry whose own section carries this id, and `SpecCard` keys its green treatment off it.
 */
const CASH_SECTION_ID = "cash-prize";

interface PrizeSpecificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  prize?: PrizeCatalogEntry | null;
  /**
   * Accent of the combination the visitor configured — tints tabs, bullets and
   * the confirm button. Defaults to Tools Australia red for callers (e.g. the
   * dev modal gallery) that open the sheet outside the prize builder.
   */
  accent?: string;
  /** Composite render of the configured combination; falls back to the prize's own hero shot. */
  comboImage?: string;
  /**
   * The combination the visitor configured, supplied by the owner.
   *
   * The deep catalog entry arrives one chunk-load AFTER the sheet opens, so deriving the
   * feature rail from `prize` alone would show the wrong headline for that first frame.
   * When omitted (e.g. the dev modal gallery), it is derived from `prize.slug` instead.
   */
  feature?: { title: string; stats: { tools: string; storage: string } };
  /** "27 JUL · 8PM AEST"; the permit line omits the draw stamp when null. */
  drawLabel?: string | null;
}

/**
 * The full spec sheet behind "View full details".
 *
 * Left rail (desktop) / scroll-away block (mobile) frames WHAT the visitor
 * would win; the right pane itemises it section by section under a sticky tab
 * row. Everything is driven off the catalog's `specSections`, so a prize with
 * five sections needs no code change — and off `--pbc-accent`, so the sheet
 * matches whatever the builder card is currently showing.
 */
export default function PrizeSpecificationsModal({
  isOpen,
  onClose,
  prize,
  accent,
  comboImage,
  feature: featureProp,
  drawLabel = null,
}: PrizeSpecificationsModalProps) {
  /** Tools Australia red for callers outside the builder (e.g. the dev modal gallery). */
  const resolvedAccent = accent ?? "#ee0000";

  /**
   * The prize's own spec sections, memoised so the array identity stays stable.
   *
   * Draw 10 removed the $5,000 combo cash bonus, and with it the synthetic "$5,000 Cash"
   * tab this sheet used to APPEND to every non-cash prize. Tool prizes now show exactly the
   * sections the catalog defines; the cash-only prize still carries its own section from the
   * catalog, so nothing here special-cases it any more.
   */
  const sections = useMemo<PrizeSpecSection[]>(() => (prize?.specSections ?? []), [prize]);


  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  useEffect(() => {
    setActiveSectionId(sections.length > 0 ? sections[0].id : null);
  }, [sections, isOpen]);

  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

  /**
   * Feature-rail copy. The owner's `feature` prop wins because it describes what is on
   * screen RIGHT NOW; falling back to `prize` would render the wrong combination (and,
   * with `prize` still null, the cash headline) for the frame before the deep catalog
   * chunk resolves.
   */
  const feature = useMemo(() => {
    const image = comboImage ?? prize?.gallery[0]?.src ?? CASH_OPTION.image;
    if (featureProp) return { ...featureProp, image };

    const lanes = prize ? fromPrizeSlug(prize.slug) : null;
    if (!lanes) {
      return {
        title: prize?.heroHeading ?? "Prize details",
        stats: { tools: "—", storage: "—" },
        image,
      };
    }
    const toolbox = getToolbox(lanes.toolbox) ?? TOOLBOXES[0];
    const toolset = getToolset(lanes.toolset) ?? TOOLSETS[0];
    return {
      title: `${toolset.name} + ${toolbox.name}`,
      stats: getContentsChips(toolbox, toolset),
      image,
    };
  }, [featureProp, prize, comboImage]);

  /**
   * Everything the fullscreen viewer pages through, in the order the sheet presents it: the
   * combination, then each section's item photos. Deduped — the same render can appear in
   * more than one section, and a repeated frame reads as a broken carousel.
   */
  const viewerImages = useMemo(() => {
    const seen = new Set<string>([feature.image]);
    const out = [feature.image];
    for (const section of sections) {
      for (const item of section.items) {
        const src = item.image?.src;
        if (src && !seen.has(src)) {
          seen.add(src);
          out.push(src);
        }
      }
    }
    return out;
  }, [feature.image, sections]);

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const openViewerAt = (src: string) => {
    const at = viewerImages.indexOf(src);
    setViewerIndex(at >= 0 ? at : 0);
  };

  // A viewer left open behind a closed sheet would reopen with it.
  useEffect(() => {
    if (!isOpen) setViewerIndex(null);
  }, [isOpen]);

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="4xl"
      height="auto"
      closeOnBackdrop
      // The handoff's mobile sheet is a full-height RIGHT-EDGE drawer (its `pbcdrawer`
      // keyframe slides in from `translateX(100%)`), not a bottom sheet.
      presentation="drawer"
      // The handoff pins the desktop sheet at min(960px,97%) / radius 20 / 92% tall —
      // narrower and rounder than the shared `4xl` dialog, so it is overridden here
      // rather than adding a one-off size to ModalContainer.
      className="prize-builder font-poppins !border-[var(--pbc-border)] !bg-[var(--pbc-panel)] text-[var(--pbc-text)] lg:!max-h-[92svh] lg:!max-w-[min(960px,97%)] lg:!rounded-[20px]"
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ "--pbc-accent": resolvedAccent } as CSSProperties}
      >
        {/* Names the dialog for assistive tech (ModalContainer's wrapper points
            `aria-labelledby` at #modal-title). Visually redundant with the feature
            rail heading, which is rendered twice for the two layouts. */}
        <h2 id="modal-title" className="sr-only">
          {feature.title} — full prize details
        </h2>

        <button
          type="button"
          aria-label="Close prize details"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X size={15} strokeWidth={2.4} />
        </button>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Desktop feature rail */}
          <aside className="hidden shrink-0 flex-col border-r border-[var(--pbc-border)] p-6 lg:flex lg:w-[34%]" style={{ background: "var(--pbc-aside-bg)" }}>
            <FeaturePanel
              comboImage={feature.image}
              comboTitle={feature.title}
              stats={feature.stats}
              onOpenViewer={() => setViewerIndex(0)}
            />
          </aside>

          {/* Spec pane */}
          <div className="modal-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">
            {/* Mobile: the same feature block, scrolling away above the sticky tabs */}
            <div className="px-[18px] pb-0.5 pt-3.5 lg:hidden">
              <FeaturePanel
                comboImage={feature.image}
                comboTitle={feature.title}
                stats={feature.stats}
                onOpenViewer={() => setViewerIndex(0)}
              />
            </div>

            {!prize ? (
              <p className="px-[18px] py-10 text-center text-sm text-[var(--pbc-sub)]">
                Prize information is loading. Please try again in a moment.
              </p>
            ) : sections.length === 0 ? (
              <p className="px-[18px] py-10 text-center text-sm text-[var(--pbc-sub)]">
                Detailed specifications for this prize will be available soon.
              </p>
            ) : (
              <>
                <TabBar sections={sections} activeId={activeSection?.id ?? null} onSelect={setActiveSectionId} />

                <div
                  id="pbc-tabpanel"
                  role="tabpanel"
                  aria-labelledby={activeSection ? `pbc-tab-${activeSection.id}` : undefined}
                  tabIndex={0}
                  className="px-[18px] pb-[18px] pt-3.5 focus:outline-none"
                >
                  {activeSection?.summary && (
                    <p
                      className="mb-3 rounded-[10px] bg-[var(--pbc-panel2)] px-3.5 py-[11px] font-poppins text-xs font-medium leading-[1.5] text-[var(--pbc-body)]"
                      style={{ borderLeft: "3px solid var(--pbc-accent)" }}
                    >
                      {activeSection.summary}
                    </p>
                  )}

                  <div className="flex flex-col gap-2.5">
                    {activeSection?.items.map((item, index) => (
                      <SpecCard
                        key={`${item.name}-${index}`}
                        item={item}
                        isCash={activeSection?.id === CASH_SECTION_ID}
                        onOpenImage={openViewerAt}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <footer
          className="flex flex-none flex-col items-stretch justify-between gap-2.5 border-t border-[var(--pbc-border)] px-[18px] py-3 sm:flex-row sm:items-center"
          style={{ background: "var(--pbc-foot-bg)" }}
        >
          {/* Three short facts, not a sentence: permit · verifier · draw time.
              `flex-nowrap` + a fluid font size keeps it to ONE row down to 320px — wrapping
              to two lines pushed the "Got it" button down and looked broken. The clamp
              bottoms out at 8.5px (still legible for fine print) and settles at 10px once
              there is room. `min-w-0` on the children lets them shrink rather than force a
              wrap; nothing here is long enough to need truncation. */}
          <p className="flex min-w-0 flex-nowrap items-center gap-x-1.5 whitespace-nowrap leading-[1.5] text-[var(--pbc-sub)] [font-size:clamp(8.5px,2.4vw,10px)]">
            <ShieldIcon />
            <strong className="font-semibold text-[var(--pbc-text)]">{NTP_NUMBER}</strong>
            <span aria-hidden>·</span>
            <a
              href="https://randomdraws.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 text-[var(--pbc-text)] underline"
            >
              randomdraws.com.au
            </a>
            {drawLabel && (
              <>
                <span aria-hidden>·</span>
                <span className="min-w-0">Drawn {drawLabel}</span>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-[11px] px-[22px] py-3 text-center font-poppins text-[12.5px] font-extrabold uppercase tracking-[0.02em] text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)]"
            // Same gradient + glow treatment as the card's "Enter now" CTA, built from the
            // one accent value so the two never drift.
            style={{
              background: `linear-gradient(180deg, ${resolvedAccent}, ${darken(resolvedAccent)})`,
              boxShadow: `0 12px 30px -12px ${resolvedAccent}`,
            }}
          >
            Got it
          </button>
        </footer>
      </div>

      {/* Fullscreen inspection over the sheet — the same viewer the builder card and the
          mini-draw detail page use. `zIndex` MUST clear this modal: the viewer's default sits
          just under the modal layer (right when it opens from the page), which would paint it
          behind the sheet that opened it. */}
      {viewerIndex !== null && (
        <PrizeImageViewer
          open
          images={viewerImages}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          title={feature.title}
          zIndex={Z_INDEX.MODAL_NESTED}
        />
      )}
    </ModalContainer>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#18a94d"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
      aria-hidden
    >
      <path d="M12 2l7 3v6c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V5z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
