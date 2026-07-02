"use client";

import Link from "next/link";
import { ChevronRight, Ticket, Sparkles, CheckCircle, Trophy } from "lucide-react";
import { useMiniDraws } from "@/hooks/queries/useMiniDrawQueries";
import MiniDrawCard, { type MiniDrawCardData } from "@/components/features/MiniDrawCard";

interface DrawsMiniProps {
  /** Embedded per-user mini-draw participation (from the my-account payload). */
  participation?: Array<{ miniDrawId: unknown; totalEntries: number }>;
  hasActiveMembership: boolean;
}

function idToString(id: unknown): string {
  if (typeof id === "string") return id;
  if (id && typeof id === "object") {
    if ("_id" in id) return idToString((id as { _id: unknown })._id);
    if ("toString" in id && typeof (id as { toString: () => string }).toString === "function") {
      return (id as { toString: () => string }).toString();
    }
  }
  return "";
}

/** Entries-based mini draws — % filled + remaining + the user's own entries (via MiniDrawCard). */
export default function DrawsMini({ participation, hasActiveMembership }: DrawsMiniProps) {
  // Fetch a wider active set so we can rank the *top* mini draws by fill % below.
  const { data, isLoading } = useMiniDraws({ page: 1, limit: 40, status: "active", sortBy: "createdAt", sortOrder: "desc" });

  const participatingIds = new Set(
    (participation ?? []).filter((p) => p.totalEntries > 0).map((p) => idToString(p.miniDrawId)).filter(Boolean),
  );

  const all = (data?.miniDraws ?? []).map((md) => {
    const totalEntries = md.totalEntries || 0;
    const minimumEntries = md.minimumEntries || 0;
    const entriesRemaining = md.entriesRemaining !== undefined ? md.entriesRemaining : Math.max(minimumEntries - totalEntries, 0);
    const id = idToString(md._id);
    return { ...md, totalEntries, minimumEntries, entriesRemaining, requiresMembership: false, hasActiveMembership, isParticipant: participatingIds.has(id) };
  });

  // "Top mini draws" = the 8 with the highest fill % (closest to running), NOT the
  // newest or the ones with the most entries.
  const ranked = [...all]
    .map((d) => ({ ...d, fillPct: d.minimumEntries > 0 ? Math.min(d.totalEntries / d.minimumEntries, 1) : 0 }))
    .sort((a, b) => b.fillPct - a.fillPct)
    .slice(0, 8);
  const mine = ranked.filter((d) => d.isParticipant);
  const others = ranked.filter((d) => !d.isParticipant);
  const entered = mine.length > 0;

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-token bg-neutral-900 p-4 text-white dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10">
            <Ticket className="h-5 w-5" />
          </span>
          <p className="text-sm text-white/80">
            <strong className="text-white">No clock — they run when they fill.</strong> A mini draw closes the second it hits its entry target. Mini-pack entries count here only — they don&apos;t roll into the monthly major draw.
          </p>
        </div>
      </div>

      {entered && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">You&apos;re entered in {mine.length} active mini {mine.length === 1 ? "draw" : "draws"}.</p>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-black/[.05] dark:bg-white/[.06]" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <div className="rounded-3xl border border-token bg-surface py-14 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-black/[.05] text-muted-token dark:bg-white/[.06]">
            <Trophy className="h-6 w-6" />
          </span>
          <p className="font-semibold text-primary-token dark:text-white">No active mini draws right now</p>
          <p className="text-sm text-muted-token">Check back soon for new draws.</p>
        </div>
      ) : (
        <>
          {mine.length > 0 && (
            <>
              <h3 className="flex items-center gap-2 text-sm font-bold text-primary-token dark:text-white">
                <Ticket className="h-4 w-4 text-emerald-600 dark:text-emerald-500" /> Your active draws
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {mine.map((md, i) => (
                  <MiniDrawCard key={idToString(md._id)} miniDraw={md as MiniDrawCardData} index={i} />
                ))}
              </div>
            </>
          )}
          {others.length > 0 && (
            <>
              {mine.length > 0 && (
                <h3 className="flex items-center gap-2 pt-2 text-sm font-bold text-primary-token dark:text-white">
                  <Sparkles className="h-4 w-4 text-red-600 dark:text-red-500" /> Explore mini draws
                </h3>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {others.map((md, i) => (
                  <MiniDrawCard key={idToString(md._id)} miniDraw={md as MiniDrawCardData} index={i} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="text-center">
        <Link href="/mini-draws" className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 dark:text-red-500">
          View all mini draws <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
