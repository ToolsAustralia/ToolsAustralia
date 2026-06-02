"use client";

import Link from "next/link";
import { Trophy, ArrowRight } from "lucide-react";
import { Card, SectionTitle, DataTable, type Column } from "@/components/admin/ui";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useTopMiniDraws } from "@/hooks/queries/admin/useAdminMiniDrawsList";

interface DrawRow extends Record<string, unknown> {
  id: string;
  name: string;
  entries: number;
  capacity: number;
  fill: number;
  full: boolean;
}

const COLUMNS: Column[] = [
  { key: "name", label: "Mini Draw", align: "left", sortable: false },
  { key: "fill", label: "Capacity", align: "right", sortable: false },
  { key: "entries", label: "Entries", align: "right", sortable: false },
];

/**
 * Top active mini draws ranked by entries, for the admin Overview.
 *
 * Data is the server-sorted active mini-draw list (`useTopMiniDraws`). Per-draw
 * revenue isn't derivable (entries are free, earned from packages — no priced
 * tickets and no `miniDrawId` on PaymentEvent), so the card shows name / capacity
 * / entries only. "View all" links to the Mini Draws admin page.
 */
export default function TopDrawsCard() {
  const { formatNumber } = useMetricsFormatting();
  const { data, isLoading } = useTopMiniDraws(5);

  const rows: DrawRow[] = (data ?? []).map((d) => {
    const capacity = d.minimumEntries || 0;
    const entries = d.totalEntries || 0;
    const fill = capacity > 0 ? Math.min(100, Math.round((entries / capacity) * 100)) : 0;
    return {
      id: d._id,
      name: d.name,
      entries,
      capacity,
      fill,
      full: capacity > 0 && entries >= capacity,
    };
  });

  const renderCell = (key: string, row: DrawRow) => {
    if (key === "name") {
      return (
        <div className="min-w-0">
          <p className="font-medium text-neutral-800 dark:text-neutral-100 truncate">{row.name}</p>
          <span
            className={`text-2xs font-semibold ${
              row.full
                ? "text-amber-600 dark:text-amber-500"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {row.full ? "● At capacity — select winner" : "● Open"}
          </span>
        </div>
      );
    }
    if (key === "fill") {
      return (
        <div className="flex items-center gap-2 justify-end">
          <div className="w-16 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden hidden sm:block">
            <div
              className="h-full rounded-full"
              style={{ width: row.fill + "%", background: row.full ? "#f59e0b" : "#ee0000" }}
            />
          </div>
          <span className="num font-bold text-neutral-900 dark:text-white w-9 text-right">{row.fill}%</span>
        </div>
      );
    }
    // entries
    return <span className="num text-neutral-600 dark:text-neutral-300">{formatNumber(row.entries)}</span>;
  };

  const showSkeleton = isLoading && !data;

  return (
    <Card className="p-5 h-full">
      <SectionTitle
        title="Top mini draws"
        subtitle="Active draws by entries"
        icon={Trophy}
        right={
          <Link
            href="/admin/mini-draws"
            className="text-2xs font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white inline-flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" strokeWidth={2} />
          </Link>
        }
      />
      {showSkeleton ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 rounded-md bg-neutral-100 dark:bg-neutral-800/60 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-10 text-neutral-400 dark:text-neutral-500">
          <Trophy className="w-8 h-8 mb-3 opacity-60" strokeWidth={1.75} />
          <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">No active mini draws</p>
        </div>
      ) : (
        <DataTable<DrawRow> columns={COLUMNS} rows={rows} renderCell={renderCell} />
      )}
    </Card>
  );
}
