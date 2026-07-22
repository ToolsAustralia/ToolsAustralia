"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";
import type {
  ToolboxBrand,
  ToolsetType,
} from "@/components/sections/promo/prize-selection/constants";
import type { PrizeSelection } from "@/components/sections/promo/prize-selection/prize-builder-model";
import { DEFAULT_SELECTION, getSpotlightView } from "./gallery-spotlight-model";
import SpotlightPreview from "./SpotlightPreview";
import ComboRail from "./ComboRail";

/**
 * The /promotions showroom stage — a cinematic configurator: one large LIVE
 * PREVIEW that updates instantly as the visitor browses a grouped rail of every
 * combination, plus the cash alternative.
 *
 * Owns the ONLY state on the page (`{toolset, toolbox, isCash}`), deliberately
 * not mirrored into the URL: every option deep-links to its own prize page, so a
 * shareable combination already has a real address and a `?combo=` param would
 * be a second, weaker one.
 *
 * `--pgs-accent` is set once here from the selection and inherited by both
 * columns, so the glow, case ring, CTA, active thumb border and check recolour
 * together from a single source.
 */
export default function PrizeGallerySpotlight() {
  const [selection, setSelection] = useState<PrizeSelection>(DEFAULT_SELECTION);

  const selectCombo = useCallback((toolsetId: string, toolboxId: string) => {
    setSelection({
      toolset: toolsetId as ToolsetType,
      toolbox: toolboxId as ToolboxBrand,
      isCash: false,
    });
  }, []);

  // Keep the last tool combination behind the cash view, so leaving cash mode by
  // picking a thumb never has to re-derive a combination that was already chosen.
  const selectCash = useCallback(() => {
    setSelection((current) => ({ ...current, isCash: true }));
  }, []);

  const view = useMemo(() => getSpotlightView(selection), [selection]);
  const isDefaultView =
    !selection.isCash &&
    selection.toolset === DEFAULT_SELECTION.toolset &&
    selection.toolbox === DEFAULT_SELECTION.toolbox;

  return (
    <section
      className="relative overflow-hidden px-4 pb-2 pt-6 lg:px-10 lg:pb-4 lg:pt-10"
      style={
        {
          ["--pgs-accent" as string]: view.accent,
          backgroundImage: "var(--pgs-stage)",
        } as CSSProperties
      }
    >
      <div
        aria-hidden
        className="pgs-glow pointer-events-none absolute -top-[30%] left-[-6%] h-[150%] w-[55%]"
      />

      {/* Preview FIRST on mobile so the result of a choice sits above the controls. */}
      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col gap-[22px] lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-x-11 lg:gap-y-0">
        <SpotlightPreview view={view} isDefaultView={isDefaultView} />
        <ComboRail selection={selection} onSelectCombo={selectCombo} onSelectCash={selectCash} />
      </div>
    </section>
  );
}
