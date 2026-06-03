"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ratio: number; // uncapped entries ÷ capacity — the rank key (can exceed 1 for over-subscribed draws)
  full: boolean;
}

const COLUMNS: Column[] = [
  { key: "name", label: "Mini Draw", align: "left", sortable: false },
  { key: "entries", label: "Entries", align: "right", sortable: false },
  { key: "status", label: "Status", align: "right", sortable: false },
];

/**
 * Top active mini draws ranked by progress (closest to drawing), for the admin Overview.
 *
 * Ranked client-side by fill ratio (entries ÷ capacity) — the draws nearest 100%
 * surface first — because the list route has no fill-ratio sort key. `useTopMiniDraws`
 * returns the full active pool; this card sorts + takes the top 5. Per-draw revenue
 * isn't derivable (entries are free, earned from packages — no priced tickets and no
 * `miniDrawId` on PaymentEvent), so the card shows name / capacity / entries / fill
 * only. "View all" links to the Mini Draws admin page.
 */
const TOP_N = 5;

export default function TopDrawsCard() {
  const router = useRouter();
  const { formatNumber } = useMetricsFormatting();
  const { data, isLoading } = useTopMiniDraws();

  // Clicking a row deep-links to the Mini Draws admin tab with its search box
  // pre-filled by the draw name (MiniDrawManagement reads `?search=`).
  const openDraw = (row: DrawRow) =>
    router.push(`/admin/mini-draws?search=${encodeURIComponent(row.name)}`);

  const rows: DrawRow[] = (data ?? [])
    .map((d) => {
      const capacity = d.minimumEntries || 0;
      const entries = d.totalEntries || 0;
      const ratio = capacity > 0 ? entries / capacity : 0;
      const fill = capacity > 0 ? Math.min(100, Math.round(ratio * 100)) : 0;
      return {
        id: d._id,
        name: d.name,
        entries,
        capacity,
        fill,
        ratio,
        full: capacity > 0 && entries >= capacity,
      };
    })
    // Closest to 100% first; entries break ties so a fuller-by-count draw wins at equal ratio.
    .sort((a, b) => b.ratio - a.ratio || b.entries - a.entries)
    .slice(0, TOP_N);

  const renderCell = (key: string, row: DrawRow) => {
    if (key === "name") {
      return (
        <div className="min-w-0">
          <p className="font-medium text-neutral-800 dark:text-neutral-100 truncate">{row.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-16 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: row.fill + "%", background: row.full ? "#f59e0b" : "#ee0000" }}
              />
            </div>
            <span className="num text-2xs font-bold text-neutral-500 dark:text-neutral-400">{row.fill}%</span>
          </div>
        </div>
      );
    }
    if (key === "status") {
      return (
        <span
          className={`text-2xs font-semibold whitespace-nowrap ${
            row.full
              ? "text-amber-600 dark:text-amber-500"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {row.full ? "● At capacity" : "● Open"}
        </span>
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
        subtitle="Active draws · closest to drawing"
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
        <DataTable<DrawRow> columns={COLUMNS} rows={rows} renderCell={renderCell} onRowClick={openDraw} />
      )}
    </Card>
  );
}
