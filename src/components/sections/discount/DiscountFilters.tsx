"use client";

/**
 * Search, sort, the "only what I can use" toggle and the category chips.
 *
 * Desktop puts all of it on the page — one control row over a wrapping chip row. Everything
 * below `lg` gets search plus a "Filter" button with a count badge, and the rest moves into a
 * bottom sheet, so the controls never push the offers below the fold on the viewports where
 * the offers are hardest to reach.
 *
 * THE SPLIT IS ONE BREAKPOINT, `lg`, ON PURPOSE. An earlier version cut the inline controls
 * at `sm` and the sheet at `sm` too, which left a dead band at 640–1023px: the sheet was
 * gone, but the "only what I can use" toggle had not appeared yet, so a signed-in member on
 * a tablet could reach it from neither. Any future move here must move BOTH sides together.
 *
 * @module components/sections/discount/DiscountFilters
 */

import React from "react";
import { Search, ArrowUpDown, Check, SlidersHorizontal, X } from "lucide-react";
import {
  CATEGORY_CHIPS,
  DISCOUNT_SORTS,
  fmtAu,
  type DiscountSort,
} from "@/utils/partner-discounts/discount-catalogue";
import { cn } from "@/utils/cn";
import { Z_INDEX } from "@/constants/z-index";

export interface DiscountFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  category: string | null;
  onCategoryChange: (value: string | null) => void;
  openOnly: boolean;
  onOpenOnlyChange: (value: boolean) => void;
  sort: DiscountSort;
  onSortChange: (value: DiscountSort) => void;
  signedIn: boolean;
  /** How many rows the current filters return — the sheet's CTA states it. */
  resultCount: number;
  onReset: () => void;
}

export default function DiscountFilters(props: DiscountFiltersProps) {
  const [sortOpen, setSortOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const sortRef = React.useRef<HTMLDivElement | null>(null);

  const activeCount =
    (props.category ? 1 : 0) + (props.openOnly ? 1 : 0) + (props.query.trim() ? 1 : 0);
  const sortLabel = (DISCOUNT_SORTS.find((s) => s.key === props.sort) ?? DISCOUNT_SORTS[0]).label;

  // A dropdown that only closes on its own trigger is a trap on a page this long.
  React.useEffect(() => {
    if (!sortOpen) return;
    const onDown = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSortOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortOpen]);

  React.useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  return (
    <div className="flex flex-col gap-[11px]">
      <div className="flex items-center gap-2.5">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            strokeWidth={2.3}
            aria-hidden
            className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2"
            style={{ color: "var(--dc-mu2)" }}
          />
          <input
            type="text"
            value={props.query}
            onChange={(e) => props.onQueryChange(e.target.value)}
            placeholder="Search offer names and value lines"
            aria-label="Search offer names and value lines"
            className="w-full font-sans font-semibold outline-none"
            style={{
              height: 46,
              padding: "0 16px 0 42px",
              borderRadius: 999,
              border: "1px solid var(--dc-ln2)",
              background: "var(--dc-sf)",
              color: "var(--dc-tx)",
              fontSize: 13.5,
            }}
          />
        </div>

        {/* Sort lives on the page at desktop and inside the sheet on a phone. */}
        <div ref={sortRef} className="relative hidden flex-none lg:block">
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            aria-expanded={sortOpen}
            aria-haspopup="listbox"
            className="ta-dc-ib inline-flex items-center gap-[9px] whitespace-nowrap font-sans font-bold"
            style={{
              height: 46,
              padding: "0 15px",
              borderRadius: 14,
              border: "1px solid var(--dc-ln2)",
              background: "var(--dc-sf)",
              color: "var(--dc-mu)",
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            <ArrowUpDown size={15} strokeWidth={2.3} className="flex-none" />
            <span style={{ color: "var(--dc-tx)" }}>{sortLabel}</span>
          </button>

          {sortOpen && (
            <div
              role="listbox"
              className="ta-dc-drop absolute right-0 z-30 flex flex-col gap-0.5"
              style={{
                top: 52,
                width: 224,
                padding: 6,
                borderRadius: 15,
                background: "var(--dc-sf)",
                border: "1px solid var(--dc-ln2)",
                boxShadow: "0 26px 56px -26px rgba(0,0,0,.85)",
              }}
            >
              {DISCOUNT_SORTS.map((s) => (
                <SortRow
                  key={s.key}
                  label={s.label}
                  on={s.key === props.sort}
                  onPick={() => {
                    props.onSortChange(s.key);
                    setSortOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {props.signedIn && (
          <button
            type="button"
            onClick={() => props.onOpenOnlyChange(!props.openOnly)}
            aria-pressed={props.openOnly}
            className="ta-dc-ib hidden flex-none items-center gap-[9px] font-sans font-bold lg:inline-flex"
            style={{
              height: 46,
              padding: "0 15px",
              borderRadius: 14,
              cursor: "pointer",
              fontSize: 12.5,
              background: props.openOnly ? "rgba(238,0,0,.1)" : "var(--dc-sf)",
              border: `1px solid ${props.openOnly ? "rgba(238,0,0,.45)" : "var(--dc-ln2)"}`,
              color: props.openOnly ? "#ff6b6b" : "var(--dc-mu)",
            }}
          >
            <CheckBox on={props.openOnly} />
            <span className="whitespace-nowrap">Only what I can use</span>
          </button>
        )}

        {activeCount > 0 && (
          <button
            type="button"
            onClick={props.onReset}
            className="ta-dc-btn hidden flex-none whitespace-nowrap font-sans font-bold lg:inline-flex lg:items-center"
            style={{
              height: 46,
              padding: "0 15px",
              borderRadius: 14,
              border: "1px solid var(--dc-ln2)",
              background: "var(--dc-chip)",
              color: "var(--dc-mu)",
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        )}

        {/* Phone: one button for everything else. */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="ta-dc-ib relative inline-flex flex-none items-center gap-2 font-sans font-bold lg:hidden"
          style={{
            height: 46,
            padding: "0 14px",
            borderRadius: 14,
            border: "1px solid var(--dc-ln2)",
            background: "var(--dc-sf)",
            color: "var(--dc-tx)",
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          <SlidersHorizontal size={15} strokeWidth={2.3} />
          Filter
          {activeCount > 0 && (
            <span
              className="grid place-items-center font-sans font-black"
              style={{
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                padding: "0 5px",
                background: "#ee0000",
                color: "#fff",
                fontSize: 10,
              }}
            >
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Category chips — desktop only; the sheet carries them on a phone. */}
      <div className="hidden flex-wrap gap-[7px] lg:flex">
        {CATEGORY_CHIPS.map((c) => (
          <CategoryChip
            key={c.label}
            label={c.label}
            count={c.count}
            on={props.category === c.value}
            onPick={() => props.onCategoryChange(c.value)}
          />
        ))}
      </div>

      {sheetOpen && (
        <FilterSheet
          {...props}
          onClose={() => setSheetOpen(false)}
          activeCount={activeCount}
        />
      )}
    </div>
  );
}

function SortRow({ label, on, onPick }: { label: string; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      onClick={onPick}
      className="flex w-full items-center justify-between gap-2.5 whitespace-nowrap text-left font-sans"
      style={{
        padding: "11px 12px",
        borderRadius: 11,
        border: 0,
        cursor: "pointer",
        fontSize: 12.5,
        fontWeight: on ? 800 : 600,
        background: on ? "rgba(238,0,0,.1)" : "transparent",
        color: on ? "#ff6b6b" : "var(--dc-mu)",
      }}
    >
      <span>{label}</span>
      {on && <Check size={14} strokeWidth={3} className="flex-none" />}
    </button>
  );
}

function CheckBox({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="grid flex-none place-items-center"
      style={{
        width: 19,
        height: 19,
        borderRadius: 6,
        border: `1px solid ${on ? "#ee0000" : "var(--dc-ln2)"}`,
        background: on ? "#ee0000" : "transparent",
        color: "#fff",
      }}
    >
      {on && <Check size={11} strokeWidth={3.4} />}
    </span>
  );
}

function CategoryChip({
  label,
  count,
  on,
  onPick,
}: {
  label: string;
  count: number;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className="inline-flex flex-none items-center gap-[7px] whitespace-nowrap font-sans"
      style={{
        borderRadius: 999,
        padding: "9px 13px",
        minHeight: 36,
        cursor: "pointer",
        fontSize: 11.5,
        lineHeight: 1,
        fontWeight: on ? 800 : 700,
        background: on ? "rgba(238,0,0,.12)" : "var(--dc-chip)",
        border: `1px solid ${on ? "rgba(238,0,0,.5)" : "var(--dc-ln)"}`,
        color: on ? "#ff6b6b" : "var(--dc-mu)",
      }}
    >
      <span>{label}</span>
      <span
        className="font-sans font-bold"
        style={{ fontSize: 9.5, color: on ? "#ff6b6b" : "var(--dc-mu2)", opacity: 0.85 }}
      >
        {fmtAu(count)}
      </span>
    </button>
  );
}

/** Bottom sheet: sort, the toggle and the chips, over a sticky "show N offers" CTA. */
function FilterSheet({
  category,
  onCategoryChange,
  openOnly,
  onOpenOnlyChange,
  sort,
  onSortChange,
  signedIn,
  resultCount,
  onReset,
  onClose,
  activeCount,
}: DiscountFiltersProps & { onClose: () => void; activeCount: number }) {
  return (
    <div
      className="fixed inset-0 flex flex-col justify-end lg:hidden"
      style={{ zIndex: Z_INDEX.MODAL_BASE }}
    >
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="ta-dc-scrim absolute inset-0"
        style={{ background: "rgba(6,6,8,.72)", backdropFilter: "blur(5px)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filter offers"
        className="ta-dc-sheet ta-dc-noscroll relative flex max-h-[88%] flex-col overflow-auto"
        style={{
          borderRadius: "24px 24px 0 0",
          background: "var(--dc-sf)",
          borderTop: "1px solid var(--dc-ln2)",
          padding: "18px 14px 0",
        }}
      >
        <span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: 7,
            width: 38,
            height: 4,
            borderRadius: 99,
            background: "var(--dc-ln2)",
          }}
        />

        <div className="mb-3 flex items-start gap-2.5">
          <span
            className="flex-1 font-poppins font-black"
            style={{ fontSize: 15, color: "var(--dc-tx)" }}
          >
            Filter
          </span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="font-sans font-bold"
              style={{ fontSize: 12, color: "#ff6b6b", cursor: "pointer" }}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ta-dc-ib grid flex-none place-items-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: "1px solid var(--dc-ln)",
              background: "var(--dc-chip)",
              color: "var(--dc-mu)",
              cursor: "pointer",
            }}
          >
            <X size={17} strokeWidth={2.3} />
          </button>
        </div>

        <div className="flex flex-col gap-3 pb-4">
          {signedIn && (
            <button
              type="button"
              onClick={() => onOpenOnlyChange(!openOnly)}
              aria-pressed={openOnly}
              className="flex w-full items-start gap-[11px] text-left"
              style={{
                padding: "14px 15px",
                borderRadius: 15,
                cursor: "pointer",
                background: openOnly ? "rgba(238,0,0,.08)" : "var(--dc-ins)",
                border: `1px solid ${openOnly ? "rgba(238,0,0,.4)" : "var(--dc-ln)"}`,
              }}
            >
              <CheckBox on={openOnly} />
              <span
                className="font-sans font-bold"
                style={{ fontSize: 13, color: "var(--dc-tx)" }}
              >
                Only what I can use
              </span>
            </button>
          )}

          <div className="flex flex-col gap-1.5">
            <SheetLabel>Sort</SheetLabel>
            {DISCOUNT_SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onSortChange(s.key)}
                aria-pressed={s.key === sort}
                className="flex w-full items-center justify-between gap-2.5 text-left font-sans"
                style={{
                  minHeight: 46,
                  padding: 13,
                  borderRadius: 11,
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: s.key === sort ? 800 : 600,
                  background: s.key === sort ? "rgba(238,0,0,.1)" : "transparent",
                  border: `1px solid ${s.key === sort ? "rgba(238,0,0,.4)" : "var(--dc-ln)"}`,
                  color: s.key === sort ? "#ff6b6b" : "var(--dc-mu)",
                }}
              >
                <span>{s.label}</span>
                {s.key === sort && <Check size={14} strokeWidth={3} className="flex-none" />}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <SheetLabel>Category</SheetLabel>
            <div className="flex flex-wrap gap-[7px]">
              {CATEGORY_CHIPS.map((c) => (
                <CategoryChip
                  key={c.label}
                  label={c.label}
                  count={c.count}
                  on={category === c.value}
                  onPick={() => onCategoryChange(c.value)}
                />
              ))}
            </div>
          </div>
        </div>

        <div
          className="sticky bottom-0 -mx-3.5 mt-auto px-3.5 pb-4 pt-3"
          style={{ background: "var(--dc-sf)", borderTop: "1px solid var(--dc-ln)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="ta-dc-btn flex w-full items-center justify-center font-poppins font-black"
            style={{
              height: 50,
              borderRadius: 14,
              border: 0,
              cursor: "pointer",
              fontSize: 13.5,
              background: "linear-gradient(180deg,#ff2a2a,#ee0000 62%,#c40d0d)",
              color: "#fff",
              boxShadow: "0 14px 30px -12px rgba(238,0,0,.8)",
            }}
          >
            Show {resultCount === 1 ? "1 offer" : `${fmtAu(resultCount)} offers`}
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn("font-sans font-extrabold uppercase")}
      style={{ fontSize: 9, letterSpacing: ".15em", color: "var(--dc-mu2)" }}
    >
      {children}
    </span>
  );
}
