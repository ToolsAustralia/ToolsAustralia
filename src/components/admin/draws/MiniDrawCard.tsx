"use client";

import React from "react";
import Image from "next/image";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trophy, FileText, Trash2, Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/utils/cn";
import { getBrandMeta, defaultBrandLogo } from "@/utils/brand-utils";
import BrandLogoCard from "@/components/ui/BrandLogoCard";

/**
 * One mini-draw card. Extracted from MiniDrawManagement (which was 935 lines and
 * carried this as a private component) so the page reads as a page.
 *
 * ACTION SET — deliberately four, not the design's two. The design's footer
 * shows only `Winner` + delete, but `CSV` export and `Edit winner & testimony`
 * both exist today and are used on draw night. A visual target is not a licence
 * to delete working tools, so all four ship (plan decision 5).
 */
export interface MiniDrawCardDraw {
  _id: string;
  name: string;
  status: string;
  brandId?: string;
  totalEntries: number;
  minimumEntries: number;
  prize: { name: string; images?: string[] };
  latestWinner?: { _id: string } | null;
}

export default function MiniDrawCard({
  draw,
  reorderMode,
  onEdit,
  onDelete,
  onSelectWinner,
  onExportCsv,
  onEditLatestWinner,
  isSelectingWinner,
  isExporting,
  isDeleting,
}: {
  draw: MiniDrawCardDraw;
  reorderMode: boolean;
  /** Undefined hides the corresponding action (callers gate by permission). */
  onEdit?: () => void;
  onDelete?: () => void;
  onSelectWinner?: () => void;
  onExportCsv: () => void;
  onEditLatestWinner?: () => void;
  isSelectingWinner: boolean;
  isExporting: boolean;
  isDeleting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: draw._id,
    disabled: !reorderMode,
  });

  const brandMeta = getBrandMeta(draw.brandId) ?? null;
  const overlayBrand = brandMeta ?? defaultBrandLogo;
  const overlayScale = brandMeta?.overlayScale ?? brandMeta?.imageScale ?? defaultBrandLogo.overlayScale ?? 1;

  const totalEntries = draw.totalEntries || 0;
  const minimumEntries = draw.minimumEntries || 0;
  const capacityPercentage =
    minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;
  const previewImage = draw.prize.images?.[0] || "/images/placeholder.jpg";
  const isAtCapacity = capacityPercentage >= 100 || draw.status === "completed";

  const cardAction =
    "flex h-[var(--m-cardBtn)] min-w-0 flex-1 items-center justify-center gap-[5px] rounded-[7px] " +
    "text-[11px] font-semibold text-[var(--text2)] hover:bg-[var(--hover)] hover:text-[var(--text)] " +
    "disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "z-50 opacity-95" : undefined}
      {...(reorderMode ? { ...attributes, ...listeners } : {})}
    >
      <div
        role={reorderMode || !onEdit ? undefined : "button"}
        tabIndex={reorderMode || !onEdit ? undefined : 0}
        onClick={reorderMode || !onEdit ? undefined : onEdit}
        onKeyDown={reorderMode || !onEdit ? undefined : (e) => e.key === "Enter" && onEdit()}
        className={cn(
          "flex h-full flex-col overflow-hidden rounded-[11px] border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow)]",
          reorderMode
            ? "cursor-grab touch-none active:cursor-grabbing"
            : onEdit
              ? "cursor-pointer transition-colors hover:border-[var(--accent-line)]"
              : ""
        )}
      >
        {/* 4:3 image tile: status pill top-left, brand tag bottom-right. */}
        <div className="relative aspect-[4/3] w-full bg-[var(--panel2)]">
          <Image
            src={previewImage}
            alt={draw.prize.name}
            fill
            className="object-cover"
            sizes="(max-width: 900px) 50vw, 20vw"
            draggable={false}
          />
          <div className="absolute left-[6px] top-[6px] z-10">
            <span
              className={cn(
                "inline-flex h-[21px] items-center rounded-full border px-2 text-[10.5px] font-semibold leading-none",
                isAtCapacity
                  ? "border-[var(--warn-line)] bg-[var(--warn-bg)] text-[var(--warn)]"
                  : "border-[var(--ok-line)] bg-[var(--ok-bg)] text-[var(--ok)]"
              )}
            >
              {isAtCapacity ? "At capacity" : "Active"}
            </span>
          </div>
          <div className="absolute bottom-[6px] right-[6px] z-10">
            <BrandLogoCard
              brand={overlayBrand}
              className="px-1 py-0.5"
              widthClass="w-auto"
              heightClass="h-auto"
              overlayMode="overlay"
              gradientOverride={brandMeta ? undefined : "bg-transparent"}
              scaleOverride={overlayScale * 0.6}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[8px] p-[10px]">
          <h3 className="line-clamp-2 min-h-[2.7em] text-[13px] font-semibold leading-[1.35] text-[var(--text)]">
            {draw.name}
          </h3>

          <div className="shrink-0">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text2)]">
              <span data-figure className="truncate">
                {totalEntries.toLocaleString()}/{minimumEntries.toLocaleString()}
              </span>
              <span data-figure>{capacityPercentage}%</span>
            </div>
            <div className="mt-[4px] h-[5px] w-full overflow-hidden rounded-full bg-[var(--panel2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                style={{ width: `${capacityPercentage}%` }}
              />
            </div>
          </div>

          {!reorderMode && draw.latestWinner && onEditLatestWinner && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditLatestWinner();
              }}
              title="Edit winner photo, testimony, and draw result link"
              className="flex min-h-[var(--m-cardBtn)] w-full items-center justify-center gap-[5px] rounded-[7px] border border-[var(--warn-line)] bg-[var(--warn-bg)] px-[8px] text-[11px] font-semibold leading-tight text-[var(--warn)]"
            >
              <MessageSquare className="h-[13px] w-[13px] shrink-0" />
              <span className="truncate">Edit winner &amp; testimony</span>
            </button>
          )}

          {!reorderMode && (
            <div
              className="mt-auto flex items-center gap-[2px] border-t border-[var(--line2)] pt-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              {onSelectWinner && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectWinner();
                  }}
                  disabled={totalEntries === 0 || isSelectingWinner}
                  className={cardAction}
                  title={totalEntries === 0 ? "No entries" : "Record winner"}
                >
                  <Trophy className="h-[13px] w-[13px] shrink-0 text-[var(--accent)]" />
                  <span className="truncate">Winner</span>
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onExportCsv();
                }}
                disabled={isExporting}
                className={cardAction}
                title="Export CSV"
              >
                <FileText className="h-[13px] w-[13px] shrink-0 text-[var(--ok)]" />
                <span className="truncate">CSV</span>
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  disabled={isDeleting}
                  className={cardAction}
                  title="Delete mini draw"
                  aria-label={`Delete ${draw.name}`}
                >
                  {isDeleting ? (
                    <Loader2 className="h-[13px] w-[13px] shrink-0 animate-spin text-[var(--danger)]" />
                  ) : (
                    <Trash2 className="h-[13px] w-[13px] shrink-0 text-[var(--danger)]" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
