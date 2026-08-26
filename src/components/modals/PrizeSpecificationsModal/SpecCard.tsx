"use client";

import Image from "next/image";
import type { PrizeSpecItem } from "@/config/prizes";
import { cn } from "@/utils/cn";

interface SpecCardProps {
  item: PrizeSpecItem;
  /**
   * True only for the CASH-ONLY prize's own `cash-prize` section. Without it, the green
   * cash tile leaked onto every photo-less item — storage boxes, chargers, battery kits —
   * which read as "this box is worth cash". Everything else gets a neutral placeholder.
   *
   * Draw 10 note: this used to also cover a synthetic "$5,000 Cash" tab appended to every
   * tool prize. That tab is gone with the combo bonus, so the ONLY section that can set
   * this now is the $10,000 cash-only prize — hence the plate reads $10K, not $5K.
   */
  isCash?: boolean;
  /** Open the fullscreen viewer on this item's photo. Only ever called when it has one. */
  onOpenImage?: (src: string) => void;
}

/**
 * One itemised entry of the spec sheet: photo, name, model, description, then
 * "Specifications" and "In the Box" side by side (stacked on mobile).
 *
 * Every accent (model dot, column bars, bullets) reads `--pbc-accent`, so the
 * whole sheet re-tints with the selected power toolset without a single prop
 * being threaded down.
 */
export default function SpecCard({ item, isCash = false, onOpenImage }: SpecCardProps) {
  const specifications = item.specifications ?? [];
  const includes = item.includes ?? [];
  const hasColumns = specifications.length > 0 || includes.length > 0;
  const imageSrc = item.image?.src ?? null;
  const canZoom = Boolean(imageSrc && onOpenImage);
  const Tile = canZoom ? "button" : "div";

  return (
    <article className="rounded-[14px] border border-[var(--pbc-border)] bg-[var(--pbc-tile-bg)] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.04)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
      <div className="flex items-start gap-[13px]">
        {/* Three tile states: the product photo, the cash section's green "$10K" plate, and
            a neutral dashed placeholder for catalogue items that simply have no photo yet
            (plenty of storage boxes, chargers and battery kits don't). */}
        <Tile
          {...(canZoom
            ? {
                type: "button" as const,
                onClick: () => onOpenImage?.(imageSrc as string),
                "aria-label": `View ${item.image?.alt ?? item.name} full screen`,
              }
            : {})}
          className={cn(
            "flex h-[84px] w-[84px] flex-none items-center justify-center overflow-hidden rounded-xl border",
            item.image
              ? "border-[var(--pbc-tile-border)] bg-white"
              : isCash
                ? "border-[#18a94d]/30 bg-[#18a94d]/[0.12]"
                : "border-dashed border-[var(--pbc-border)] bg-[var(--pbc-chip-bg)]",
            canZoom &&
              "cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)]"
          )}
        >
          {item.image ? (
            <span className="relative block h-full w-full">
              <Image
                src={item.image.src}
                alt={item.image.alt}
                fill
                sizes="84px"
                className="object-contain p-1.5"
              />
            </span>
          ) : isCash ? (
            <span className="font-poppins text-[26px] font-black text-[#18a94d]">$10K</span>
          ) : (
            <NoPhotoPlaceholder />
          )}
        </Tile>

        <div className="min-w-0 flex-1">
          <h4 className="font-poppins text-sm font-bold leading-tight text-[var(--pbc-text)]">
            {item.name}
          </h4>
          {item.model && (
            <p className="mt-[5px] inline-flex items-center gap-[5px] font-poppins text-[10px] font-semibold leading-none text-[var(--pbc-sub)]">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--pbc-accent)" }}
              />
              Model: {item.model}
            </p>
          )}
          {item.description && (
            <p className="mt-[11px] text-[11.5px] leading-[1.5] text-[var(--pbc-body)]">
              {item.description}
            </p>
          )}
        </div>
      </div>

      {hasColumns && (
        <div className="mt-3 grid grid-cols-1 gap-[14px] sm:grid-cols-2">
          {specifications.length > 0 && <BulletColumn heading="Specifications" items={specifications} />}
          {includes.length > 0 && <BulletColumn heading="In the Box" items={includes} />}
        </div>
      )}
    </article>
  );
}

/**
 * Neutral "no photo for this item yet" tile: a muted crate glyph, no brand accent, so it
 * reads as a missing image rather than as a feature of the prize.
 */
function NoPhotoPlaceholder() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--pbc-sub)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Photo coming soon"
    >
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </svg>
  );
}

function BulletColumn({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <h5 className="mb-[9px] flex items-center gap-[7px] font-poppins text-[11px] font-bold leading-none text-[var(--pbc-text)]">
        <span
          aria-hidden
          className="inline-block h-3.5 w-[3px] rounded-full"
          style={{ background: "var(--pbc-accent)" }}
        />
        {heading}
      </h5>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map((entry, index) => (
          <li key={`${entry}-${index}`} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full"
              style={{ background: "var(--pbc-accent)" }}
            />
            <span className="text-[11.5px] leading-[1.4] text-[var(--pbc-body)]">{entry}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
