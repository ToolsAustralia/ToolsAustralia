"use client";

import { useMemo, useRef, useState } from "react";
import { Users, Repeat, TrendingUp, Clock, DollarSign, Star, BarChart3, Download, Package } from "lucide-react";
import { Card, SectionTitle, MetricCard, DataTable, Segmented, type Column } from "@/components/admin/ui";
import { AdminDateRangeToolbar } from "@/components/admin/AdminDateRangeToolbar";
import { useAdminDateFilter } from "@/hooks/useAdminDateFilter";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import {
  useRepeatPurchaseSummary,
  useRepeatPurchaseUsers,
} from "@/hooks/queries/admin/useRepeatPurchaseAnalytics";
import { REPEAT_BUCKET_KEYS, type RepeatBucketKey, type RepeatMemberFilter, type RepeatSegment, type RepeatPurchaseUserRow } from "@/types/admin/repeatPurchase";

const BUCKET_LABEL: Record<RepeatBucketKey, string> = {
  "same-day": "Same day",
  "1-7d": "1–7 days",
  "7-30d": "7–30 days",
  "30-60d": "30–60 days",
  "60-90d": "60–90 days",
  "90-180d": "90–180 days",
  "180d+": "180+ days",
};
const WINDOW_LABEL: Record<number, string> = { 1: "1 day", 7: "1 week", 30: "1 month", 60: "2 months", 90: "3 months", 180: "6 months" };
const ACCENT = "#ee0000";
const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
/** Fewer buyers than this started with a pack → its rates are too noisy to trust; the row is dimmed + flagged. */
const LOW_N = 15;

const USER_COLUMNS: Column[] = [
  { key: "user", label: "User", sortable: false },
  { key: "first", label: "First purchase" },
  { key: "days", label: "Days to return", align: "right" },
  { key: "count", label: "One-time buys", align: "right" },
  { key: "last", label: "Last purchase" },
  { key: "spent", label: "Total spent", align: "right" },
  { key: "member", label: "Member?", align: "right", sortable: false },
];

/**
 * Table row = sortable primitives keyed to the column keys (so DataTable's header
 * sort works) + the source row carried on `src` for rendering. Not-returned users
 * sort their `days` to the end via a large sentinel.
 */
interface UserTableRow extends Record<string, unknown> {
  id: string;
  first: number;
  days: number;
  count: number;
  last: number;
  spent: number;
  member: number;
  src: RepeatPurchaseUserRow;
}

export default function RepeatPurchaseAnalytics() {
  const df = useAdminDateFilter("all-time");
  const dateReady =
    (df.dateRange !== "current-draw" && df.dateRange !== "last-draw") || (!!df.startDate && !!df.endDate);
  const range = { startDate: df.startDate || undefined, endDate: df.endDate || undefined };

  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useRepeatPurchaseSummary(range);

  const [segment, setSegment] = useState<RepeatSegment>("all");
  const [bucket, setBucket] = useState<RepeatBucketKey | null>(null);
  const [member, setMember] = useState<RepeatMemberFilter>("all");
  const usersRef = useRef<HTMLDivElement>(null);
  const {
    rows: userRows,
    totalCount,
    hasMore,
    fetchNextPage,
    isFetchingNextPage,
    isLoading: usersLoading,
    isError: usersError,
  } = useRepeatPurchaseUsers({ segment, bucket: bucket ?? undefined, member, ...range }, { enabled: dateReady });

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ segment });
      if (bucket) params.set("bucket", bucket);
      if (member !== "all") params.set("member", member);
      if (range.startDate) params.set("startDate", range.startDate);
      if (range.endDate) params.set("endDate", range.endDate);
      const res = await fetch(`/api/admin/analytics/repeat-purchases/users/export?${params.toString()}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const cd = res.headers.get("content-disposition");
      const match = cd?.match(/filename="(.+)"/);
      const filename = match?.[1] ?? "repeat-purchases.csv";
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("repeat-purchase export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  const bucketMax = Math.max(1, ...(summary?.buckets ?? []).map((b) => b.users));

  // Clicking a bucket bar in the "How soon they bought again" chart drives the Users
  // list below: set (or toggle off) the bucket filter, then scroll the list into view.
  // A bucket only exists for a *returned* buyer, so if the segment is on "not yet
  // returned" we reset it to "all" — mirroring the bucket pills' own not-returned guard.
  const selectBucket = (b: RepeatBucketKey) => {
    if (segment === "not-returned") setSegment("all");
    setBucket((cur) => (cur === b ? null : b));
    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    usersRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  const rows: UserTableRow[] = useMemo(
    () =>
      userRows.map((r) => ({
        id: r.userId,
        first: new Date(r.firstPurchaseAt).getTime(),
        // not-returned users have no gap — sort them to the end of an ascending sort.
        days: r.daysToReturn ?? Number.MAX_SAFE_INTEGER,
        count: r.purchaseCount,
        last: new Date(r.lastPurchaseAt).getTime(),
        spent: r.totalSpent,
        member: r.becameMember ? 1 : 0,
        src: r,
      })),
    [userRows]
  );

  const renderCell = (key: string, row: UserTableRow) => {
    const r = row.src;
    switch (key) {
      case "user":
        return (
          <ClickableUserDisplay
            userId={r.userId}
            displayText={`${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.email || "Unknown"}
            subtext={r.email}
            className="text-sm font-medium"
          />
        );
      case "first":
        return (
          <div className="flex flex-col">
            <span className="text-sm text-neutral-800 dark:text-neutral-200">{fmtDate(r.firstPurchaseAt)}</span>
            <span className="text-2xs text-neutral-400">{r.firstPackageName ?? r.firstPackageId}</span>
          </div>
        );
      case "days":
        return r.daysToReturn == null ? (
          <span className="text-neutral-400 text-xs">Not yet</span>
        ) : r.daysToReturn === 0 ? (
          <span className="inline-flex rounded-full bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 px-2 py-0.5 text-2xs font-semibold">
            Same day
          </span>
        ) : (
          <span className="num tabular-nums">{r.daysToReturn}</span>
        );
      case "count":
        return <span className="num tabular-nums">{r.purchaseCount}</span>;
      case "last":
        return (
          <div className="flex flex-col">
            <span className="text-sm text-neutral-800 dark:text-neutral-200">{fmtDate(r.lastPurchaseAt)}</span>
            <span className="text-2xs text-neutral-400">{r.lastPackageName ?? r.lastPackageId}</span>
          </div>
        );
      case "spent":
        return <span className="num tabular-nums font-semibold">{money(r.totalSpent)}</span>;
      case "member":
        return r.becameMember ? (
          <span className="inline-flex rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 px-2 py-0.5 text-2xs font-semibold">
            Member
          </span>
        ) : (
          <span className="text-neutral-400">—</span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* empty:hidden — on mobile the dropdown portals to the header slot, leaving this wrapper childless. */}
      <div className="flex justify-end empty:hidden">
        <AdminDateRangeToolbar filter={df} />
      </div>

      {summaryError ? (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
          Couldn’t load repeat-purchase analytics. Try widening the date range or refreshing.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard title="One-time buyers" value={(summary?.oneTimeBuyers ?? 0).toLocaleString("en-AU")} sub="bought at least one pack" icon={Users} tone="slate" loading={summaryLoading} />
          <MetricCard title="Repeat buyers" value={(summary?.repeatBuyers ?? 0).toLocaleString("en-AU")} sub="came back and bought again" icon={Repeat} tone="red" loading={summaryLoading} />
          <MetricCard title="Repeat rate" value={summary ? `${(summary.repeatRate * 100).toFixed(1)}%` : "—"} sub="share of buyers who came back" icon={TrendingUp} tone="emerald" loading={summaryLoading} />
          <MetricCard title="Median days to return" value={summary?.medianDaysToReturn == null ? "—" : String(summary.medianDaysToReturn)} sub="half came back sooner, half later" icon={Clock} tone="violet" loading={summaryLoading} />
          <MetricCard title="Repeat revenue" value={money(summary?.repeatRevenue ?? 0)} sub="from their repeat purchases" icon={DollarSign} tone="amber" loading={summaryLoading} />
          <MetricCard title="Became members" value={(summary?.becameMembers ?? 0).toLocaleString("en-AU")} sub="later started a membership" icon={Star} tone="indigo" loading={summaryLoading} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <SectionTitle
            title="How soon they bought again"
            subtitle={`Days between the 1st and 2nd purchase · ${(summary?.repeatBuyers ?? 0).toLocaleString("en-AU")} buyers who came back · $ = revenue from their repeat purchases`}
            icon={BarChart3}
          />
          {summaryLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-8 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
              ))}
            </div>
          ) : (summary?.repeatBuyers ?? 0) === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 py-6 text-center">Nobody has bought again in this date range yet.</p>
          ) : (
            <div className="space-y-2.5">
              {(summary?.buckets ?? []).map((b) => (
                <button
                  key={b.bucket}
                  type="button"
                  onClick={() => selectBucket(b.bucket)}
                  aria-pressed={bucket === b.bucket}
                  title={`Show the ${BUCKET_LABEL[b.bucket].toLowerCase()} buyers below`}
                  className={`w-full text-left rounded-lg -mx-2 px-2 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 ${
                    bucket === b.bucket
                      ? "bg-red-50 dark:bg-red-950/30"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">{BUCKET_LABEL[b.bucket]}</span>
                    <div className="flex items-baseline gap-2 shrink-0">
                      <span className="text-xs font-bold text-neutral-900 dark:text-white num tabular-nums">{b.users.toLocaleString("en-AU")}</span>
                      <span className="text-2xs text-neutral-400 num tabular-nums w-10 text-right">{b.sharePct}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(b.users / bucketMax) * 100}%`, background: ACCENT }} />
                    </div>
                    <span className="text-2xs text-neutral-500 dark:text-neutral-400 num tabular-nums w-16 text-right shrink-0">{money(b.revenue)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle title="How many came back within…" subtitle="Share who bought again within each timeframe — counting only buyers who’ve had that long" icon={TrendingUp} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-2xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="py-2 px-2 text-left font-semibold">Within</th>
                  <th className="py-2 px-2 text-right font-semibold">Had the chance</th>
                  <th className="py-2 px-2 text-right font-semibold">Came back</th>
                  <th className="py-2 px-2 text-right font-semibold">Rate</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.windows ?? []).map((w) => (
                  <tr key={w.windowDays} className="border-b border-neutral-100 dark:border-neutral-800/60">
                    <td className="py-2.5 px-2 text-neutral-800 dark:text-neutral-200">{WINDOW_LABEL[w.windowDays]}</td>
                    <td className="py-2.5 px-2 text-right num tabular-nums">{w.eligible.toLocaleString("en-AU")}</td>
                    <td className="py-2.5 px-2 text-right num tabular-nums">{w.returned.toLocaleString("en-AU")}</td>
                    <td className="py-2.5 px-2 text-right num tabular-nums font-semibold">{(w.rate * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-neutral-400 leading-snug mt-3">
            Fewer buyers count toward the longer timeframes — someone who bought last week hasn’t had 6 months to come back yet. Counting only those who’ve had the full time keeps each rate fair.
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle
          title="By one-time package"
          subtitle="Which starting pack brings buyers back — and which just sells. Rates are per buyer who started with that pack; thin samples are flagged."
          icon={Package}
        />
        {summaryLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
            ))}
          </div>
        ) : (summary?.packages ?? []).length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 py-6 text-center">No one-time package activity in this range yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  <th className="py-1.5 px-2 text-left" />
                  <th className="py-1.5 px-2 text-center font-semibold border-b border-neutral-200 dark:border-neutral-800" colSpan={4}>
                    Started with this pack
                  </th>
                  <th className="py-1.5 px-2 text-center font-semibold border-b border-neutral-200 dark:border-neutral-800" colSpan={2}>
                    All purchases
                  </th>
                </tr>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-2xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="py-2 px-2 text-left font-semibold">Package</th>
                  <th className="py-2 px-2 text-right font-semibold">Buyers</th>
                  <th className="py-2 px-2 text-right font-semibold">Repeat rate</th>
                  <th className="py-2 px-2 text-right font-semibold">Became member</th>
                  <th className="py-2 px-2 text-right font-semibold">Downstream</th>
                  <th className="py-2 px-2 text-right font-semibold">Purchases</th>
                  <th className="py-2 px-2 text-right font-semibold">Gross</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.packages ?? []).map((p) => {
                  const noStarters = p.startedBuyers === 0; // only ever bought as a later/add-on purchase
                  const lowN = p.startedBuyers < LOW_N;
                  const dash = <span className="text-neutral-300 dark:text-neutral-600">—</span>;
                  return (
                    <tr
                      key={p.packageId}
                      className={`border-b border-neutral-100 dark:border-neutral-800/60 ${lowN ? "opacity-60" : ""}`}
                      title={
                        noStarters
                          ? "Nobody started with this pack — it only shows up as a later/add-on purchase, so it has gross figures but no starting-pack rates."
                          : lowN
                            ? `Small sample — ${p.startedBuyers} buyer${p.startedBuyers === 1 ? "" : "s"} started here, so these rates are noisy.`
                            : undefined
                      }
                    >
                      <td className="py-2.5 px-2 text-neutral-800 dark:text-neutral-200 font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{p.packageName}</span>
                          {noStarters ? (
                            <span className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 px-1.5 py-0.5 text-2xs font-semibold">
                              add-on only
                            </span>
                          ) : lowN ? (
                            <span className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 px-1.5 py-0.5 text-2xs font-semibold">
                              small sample
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right num tabular-nums">{p.startedBuyers.toLocaleString("en-AU")}</td>
                      <td className="py-2.5 px-2 text-right">
                        {noStarters ? (
                          dash
                        ) : (
                          <>
                            <span className="num tabular-nums font-semibold text-neutral-900 dark:text-white">{pct(p.startedRepeatRate)}</span>
                            <span className="block text-2xs text-neutral-400 num tabular-nums">{p.startedReturned} of {p.startedBuyers}</span>
                          </>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {noStarters ? (
                          dash
                        ) : (
                          <>
                            <span className="num tabular-nums font-semibold text-neutral-900 dark:text-white">{pct(p.startedMemberRate)}</span>
                            <span className="block text-2xs text-neutral-400 num tabular-nums">{p.startedBecameMembers} of {p.startedBuyers}</span>
                          </>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right num tabular-nums text-neutral-500 dark:text-neutral-400">{noStarters ? dash : money(p.startedRevenue)}</td>
                      <td className="py-2.5 px-2 text-right num tabular-nums text-neutral-500 dark:text-neutral-400">{p.purchases.toLocaleString("en-AU")}</td>
                      <td className="py-2.5 px-2 text-right num tabular-nums text-neutral-500 dark:text-neutral-400">{money(p.grossRevenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-2xs text-neutral-400 leading-snug mt-3">
          <strong>Started with this pack</strong> groups each buyer by their <em>first</em> one-time pack: repeat rate and member rate are the share of those buyers who came back or later subscribed, and <strong>Downstream</strong> is all their one-time spend. <strong>All purchases</strong> counts every time the pack was bought by people in this list, and its gross. Rows with fewer than {LOW_N} buyers are dimmed — too few to read a rate into.
        </p>
      </Card>

      <div ref={usersRef} className="scroll-mt-6">
      <Card className="p-5">
        <SectionTitle
          title="Users"
          subtitle="Click a name to open their profile. Filter the list, then Export CSV to pull a targeting list."
          icon={Users}
          right={
            <div className="flex items-center gap-3">
              <span className="text-2xs text-neutral-400">{totalCount ? `${totalCount.toLocaleString("en-AU")} users` : ""}</span>
              <button
                type="button"
                onClick={exportCsv}
                disabled={exporting || usersLoading || totalCount === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={2} />
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            </div>
          }
        />
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Segmented
            size="sm"
            value={segment}
            onChange={(v) => {
              setSegment(v as RepeatSegment);
              if (v === "not-returned") setBucket(null);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "returned", label: "Returned" },
              { value: "not-returned", label: "Not yet returned" },
            ]}
          />
          <Segmented
            size="sm"
            value={member}
            onChange={(v) => setMember(v as RepeatMemberFilter)}
            options={[
              { value: "all", label: "Any" },
              { value: "member", label: "Members" },
              { value: "non-member", label: "Non-members" },
            ]}
          />
          <div className="flex flex-wrap gap-1.5 ml-auto">
            {REPEAT_BUCKET_KEYS.map((b) => (
              <button
                key={b}
                type="button"
                disabled={segment === "not-returned"}
                onClick={() => setBucket((cur) => (cur === b ? null : b))}
                className={`text-2xs font-medium px-2.5 py-1 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  bucket === b
                    ? "border-red-500 text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400"
                    : "border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-300"
                }`}
              >
                {BUCKET_LABEL[b]}
              </button>
            ))}
          </div>
        </div>

        {usersError ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">Couldn’t load users.</p>
        ) : usersLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 py-8 text-center">No users match this filter.</p>
        ) : (
          <>
            <DataTable columns={USER_COLUMNS} rows={rows} renderCell={renderCell} />
            {hasMore && (
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 disabled:opacity-50 transition-colors"
                >
                  {isFetchingNextPage ? "Loading…" : `Load more (${rows.length} of ${totalCount.toLocaleString("en-AU")})`}
                </button>
              </div>
            )}
          </>
        )}
      </Card>
      </div>

      <p className="text-2xs text-neutral-400 leading-snug">
        <strong>Who’s here:</strong> people buying one-time packs <em>instead of</em> subscribing — the ones you could persuade to subscribe. That includes customers who’ve never subscribed <em>and</em> former members who let their membership lapse but keep buying one-time packs. <strong>Left out:</strong> people who were <strong>active members</strong> when they bought (they’re topping up an existing subscription, not choosing one-time over it). A one-time buyer who <em>later</em> subscribes stays, shown as “Member”. <strong>What counts:</strong> paid one-time pack purchases, refunds removed. <strong>Upsells and mini-draw packs don’t count</strong> — an upsell happens right after another purchase, and mini-draws are a separate product. Dates use <strong>Australian Eastern Time</strong>. Each account is counted on its own, so someone who used two email addresses shows up as two people. The date filter at the top uses each person’s <strong>first</strong> qualifying purchase.
      </p>
    </div>
  );
}
