"use client";
import { useMemo, useState, type ReactNode, type MouseEvent } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export type Column = { key: string; label: string; align?: "left" | "right"; sortable?: boolean };

/**
 * Pins the first column while the rest scrolls horizontally. Opaque background matching `Card`,
 * or the scrolling cells show through underneath.
 *
 * OPT-IN, default off: most admin tables are narrow enough not to scroll, and pinning a column
 * they don't need would only cost them a stacking context. Turn it on for wide tables whose first
 * column is the row's IDENTITY — without it, scrolling right on a phone leaves a wall of numbers
 * with nothing naming the rows (acute when that identity is an image, like a brand wordmark).
 */
const STICKY_FIRST_COL = "sticky left-0 z-[1] bg-white dark:bg-neutral-900";

export function DataTable<T extends Record<string, unknown> & { id?: string | number }>({
  columns, rows, renderCell, onRowClick, onRowMouseEnter, onRowMouseLeave, footer, stickyFirstColumn = false,
}: {
  columns: Column[];
  rows: T[];
  renderCell?: (key: string, row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  onRowMouseEnter?: (row: T, e: MouseEvent<HTMLTableRowElement>) => void;
  onRowMouseLeave?: () => void;
  /** Pin the first column during horizontal scroll. See STICKY_FIRST_COL. */
  stickyFirstColumn?: boolean;
  /**
   * Optional totals row, rendered in a real `<tfoot>` so it stays aligned to the columns
   * and is announced as a footer rather than as one more data row.
   *
   * Supply the `<tr>`/`<td>`s yourself — a table's totals are rarely a plain column sum
   * (ROAS is revenue ÷ spend, not an average of the per-row ROAS values), so this component
   * deliberately does NOT try to compute them. It is NOT sorted with the body.
   */
  footer?: ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const key = sort.key;
    return [...rows].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
      return String(av).localeCompare(String(bv)) * sort.dir;
    });
  }, [rows, sort]);
  const toggle = (k: string) => setSort((p) => (p.key === k ? { key: k, dir: (-p.dir) as 1 | -1 } : { key: k, dir: 1 }));
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            {columns.map((c, ci) => (
              <th key={c.key} onClick={() => c.sortable !== false && toggle(c.key)}
                className={`py-2 px-2 text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 ${c.align === "right" ? "text-right" : "text-left"} ${c.sortable !== false ? "cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200 select-none" : ""} ${stickyFirstColumn && ci === 0 ? STICKY_FIRST_COL : ""}`}>
                <span className="inline-flex items-center gap-1">{c.label}
                  {sort.key === c.key && (sort.dir === 1 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {/* When rows are clickable they must also be reachable by keyboard — onClick
            alone leaves the drill-down modal unusable without a mouse (panel F-017).
            tabIndex/role/keydown below are applied ONLY when an onRowClick exists, so
            non-interactive tables stay out of the tab order. */}
        <tbody>
          {sorted.map((row, ri) => (
            <tr key={row.id ?? ri}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault(); // Space must activate, not scroll the page
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "button" : undefined}
              onMouseEnter={onRowMouseEnter ? (e) => onRowMouseEnter(row, e) : undefined}
              onMouseLeave={onRowMouseLeave}
              className={`border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors ${onRowClick ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400" : ""}`}>
              {columns.map((c, ci) => (
                <td key={c.key} className={`py-2.5 px-2 ${c.align === "right" ? "text-right" : "text-left"} ${stickyFirstColumn && ci === 0 ? STICKY_FIRST_COL : ""}`}>
                  {renderCell ? renderCell(c.key, row) : (row[c.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}
