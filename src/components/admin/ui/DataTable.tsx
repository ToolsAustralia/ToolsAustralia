"use client";
import { useMemo, useState, type ReactNode, type MouseEvent } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export type Column = { key: string; label: string; align?: "left" | "right"; sortable?: boolean };

export function DataTable<T extends Record<string, unknown> & { id?: string | number }>({
  columns, rows, renderCell, onRowClick, onRowMouseEnter, onRowMouseLeave,
}: {
  columns: Column[];
  rows: T[];
  renderCell?: (key: string, row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  onRowMouseEnter?: (row: T, e: MouseEvent<HTMLTableRowElement>) => void;
  onRowMouseLeave?: () => void;
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
            {columns.map((c) => (
              <th key={c.key} onClick={() => c.sortable !== false && toggle(c.key)}
                className={`py-2 px-2 text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 ${c.align === "right" ? "text-right" : "text-left"} ${c.sortable !== false ? "cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200 select-none" : ""}`}>
                <span className="inline-flex items-center gap-1">{c.label}
                  {sort.key === c.key && (sort.dir === 1 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr key={row.id ?? ri}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onMouseEnter={onRowMouseEnter ? (e) => onRowMouseEnter(row, e) : undefined}
              onMouseLeave={onRowMouseLeave}
              className={`border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}>
              {columns.map((c) => (
                <td key={c.key} className={`py-2.5 px-2 ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {renderCell ? renderCell(c.key, row) : (row[c.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
