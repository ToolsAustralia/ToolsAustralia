"use client";

import { useMemo, useState } from "react";
import { Mail, MessageSquare, Send, Clock, Zap } from "lucide-react";
import { Card, SectionTitle, DataTable, type Column } from "@/components/admin/ui";
import { HourlyBreakdownTable } from "@/components/admin/PlatformHourlyRevenueSection";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useKlaviyoAnalytics, type KlaviyoTimeframeKey } from "@/hooks/queries/admin/useKlaviyoAnalytics";
import { useHourlyRevenue, type HourlyRevenueBucket } from "@/hooks/queries/admin/useHourlyRevenue";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";

/**
 * Klaviyo analytics tab (Part C). Balanced layout: a "scheduled / about to send"
 * strip on top, Campaigns + Flows revenue tables (Klaviyo-attributed, email/SMS
 * split) in the middle, and the SERVER-SIDE Klaviyo hourly revenue (SHARED-1) at
 * the bottom. Campaign/flow revenue is Klaviyo's own attribution and will NOT match
 * the server-side klaviyo_email/sms totals used elsewhere — both are labeled.
 */
interface EntityRow extends Record<string, unknown> {
  id: string;
  name: string;
  status: string;
  emailRevenue: number;
  smsRevenue: number;
  totalRevenue: number;
  conversions: number;
}

interface HourRow {
  id: number;
  label: string;
  spend: number | null;
  revenue: number;
  profit: number | null;
  roas: number | null;
  conversions: number;
}

const ENTITY_COLUMNS: Column[] = [
  { key: "name", label: "Name", align: "left", sortable: false },
  { key: "status", label: "Status", align: "left", sortable: false },
  { key: "emailRevenue", label: "Email", align: "right", sortable: false },
  { key: "smsRevenue", label: "SMS", align: "right", sortable: false },
  { key: "totalRevenue", label: "Total", align: "right", sortable: false },
  { key: "conversions", label: "Conv.", align: "right", sortable: false },
];

function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

// Klaviyo's reporting API is keyword-timeframe based, so the tab's date filter is a
// relative-range selector. The same key drives the campaign/flow tables (native keyword)
// and the server-side hourly section (derived AEST window below).
const KLAVIYO_RANGES: { key: KlaviyoTimeframeKey; short: string; full: string; days: number }[] = [
  { key: "last_7_days", short: "7D", full: "Last 7 days", days: 7 },
  { key: "last_30_days", short: "30D", full: "Last 30 days", days: 30 },
  { key: "last_90_days", short: "90D", full: "Last 90 days", days: 90 },
  { key: "last_12_months", short: "12M", full: "Last 12 months", days: 365 },
];

// Trailing window for the keyword, as YYYY-MM-DD in AEST (the hourly API buckets by
// Australia/Sydney calendar days). Approximates Klaviyo's keyword window so the hourly
// section roughly mirrors the campaign/flow tables (the two attributions never match
// exactly — already disclaimed below).
function aestRangeForKeyword(range: KlaviyoTimeframeKey, now: Date): { start: string; end: string } {
  const TZ = "Australia/Sydney";
  const days = KLAVIYO_RANGES.find((r) => r.key === range)?.days ?? 30;
  return {
    start: formatInTimeZone(subDays(now, days - 1), TZ, "yyyy-MM-dd"),
    end: formatInTimeZone(now, TZ, "yyyy-MM-dd"),
  };
}

function fmtSchedule(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Render in the business timezone (Australia/Sydney) to match the AEST convention elsewhere.
  return d.toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function KlaviyoAnalyticsManagement() {
  const { fmtCompact } = useMetricsFormatting();
  const [range, setRange] = useState<KlaviyoTimeframeKey>("last_30_days");
  const { data: resp, isLoading, isError, error } = useKlaviyoAnalytics(range);
  const hourRange = useMemo(() => aestRangeForKeyword(range, new Date()), [range]);
  const { data: hourly } = useHourlyRevenue({ platform: "klaviyo", startDate: hourRange.start, endDate: hourRange.end });
  const rangeLabel = KLAVIYO_RANGES.find((r) => r.key === range)?.full ?? "";

  const a = resp?.data;

  const campaignRows: EntityRow[] = useMemo(
    () =>
      (a?.campaigns ?? []).map((c) => ({
        id: c.entityId,
        name: c.name,
        status: c.status,
        emailRevenue: c.email.revenue,
        smsRevenue: c.sms.revenue,
        totalRevenue: c.total.revenue,
        conversions: c.total.conversions,
      })),
    [a]
  );

  const flowRows: EntityRow[] = useMemo(
    () =>
      (a?.flows ?? []).map((f) => ({
        id: f.entityId,
        name: f.name,
        status: f.status,
        emailRevenue: f.email.revenue,
        smsRevenue: f.sms.revenue,
        totalRevenue: f.total.revenue,
        conversions: f.total.conversions,
      })),
    [a]
  );

  // Klaviyo is an owned channel: no ad spend → spend / profit / ROAS render "—".
  const hourRows: HourRow[] = useMemo(() => {
    const buckets: HourlyRevenueBucket[] =
      hourly?.hourly ?? Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, conversions: 0, spend: null }));
    return buckets.map((b) => ({
      id: b.hour,
      label: hourLabel(b.hour),
      spend: null,
      revenue: b.revenue,
      profit: null,
      roas: null,
      conversions: b.conversions,
    }));
  }, [hourly]);

  const renderEntity = (key: string, row: EntityRow) => {
    if (key === "name") return <span className="font-medium">{row.name}</span>;
    if (key === "status") return <span className="text-2xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{row.status}</span>;
    if (key === "emailRevenue") return <span className="num">{row.emailRevenue > 0 ? fmtCompact(row.emailRevenue) : "—"}</span>;
    if (key === "smsRevenue") return <span className="num">{row.smsRevenue > 0 ? fmtCompact(row.smsRevenue) : "—"}</span>;
    if (key === "totalRevenue") return <span className="num font-semibold">{fmtCompact(row.totalRevenue)}</span>;
    return <span className="num">{row.conversions.toLocaleString()}</span>;
  };

  if (isError) {
    return (
      <div className="rounded-xl border-2 border-dashed border-red-200 dark:border-red-900/40 bg-white dark:bg-neutral-900 p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">Couldn’t load Klaviyo analytics: {error instanceof Error ? error.message : "Unknown error"}</p>
        <p className="mt-1 text-2xs text-neutral-500">Klaviyo reporting is rate-limited (~2/min); try again shortly.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="inline-flex rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-0.5">
          {KLAVIYO_RANGES.map((r) => {
            const on = r.key === range;
            return (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                aria-pressed={on}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  on
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                <span className="hidden sm:inline">{r.full}</span>
                <span className="sm:hidden">{r.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      {resp?.stale && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-2xs text-amber-700 dark:text-amber-400">
          Showing the last cached snapshot (Klaviyo reporting was rate-limited).
        </div>
      )}

      {/* Scheduled / about to send */}
      <Card className="p-5">
        <SectionTitle title="Scheduled / about to send" subtitle="Upcoming campaigns + live flows" icon={Send} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Upcoming campaigns</p>
            {(a?.scheduled.upcomingCampaigns ?? []).length === 0 ? (
              <p className="text-sm text-neutral-400">{isLoading ? "Loading…" : "None scheduled."}</p>
            ) : (
              <ul className="space-y-1.5">
                {a!.scheduled.upcomingCampaigns.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {c.channel === "sms" ? <MessageSquare className="w-3.5 h-3.5 text-purple-500 shrink-0" /> : <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="text-2xs text-neutral-500 shrink-0">{fmtSchedule(c.scheduledAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">
              Live flows{a ? ` (${a.scheduled.liveFlows.length})` : ""}
            </p>
            {(a?.scheduled.liveFlows ?? []).length === 0 ? (
              <p className="text-sm text-neutral-400">{isLoading ? "Loading…" : "No live flows."}</p>
            ) : (
              <ul className="space-y-1.5">
                {a!.scheduled.liveFlows.slice(0, 12).map((f) => (
                  <li key={f.id} className="flex items-center gap-1.5 text-sm">
                    <Zap className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </li>
                ))}
                {a!.scheduled.liveFlows.length > 12 && (
                  <li className="text-2xs text-neutral-400">…and {a!.scheduled.liveFlows.length - 12} more</li>
                )}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {/* Revenue tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-5 min-w-0">
          <SectionTitle title="Campaigns" subtitle={`Klaviyo-attributed revenue · ${rangeLabel.toLowerCase()}`} icon={Mail} />
          <DataTable<EntityRow> columns={ENTITY_COLUMNS} rows={campaignRows} renderCell={renderEntity} />
          {!isLoading && campaignRows.length === 0 && <p className="text-sm text-neutral-400 mt-3">No campaign revenue in range.</p>}
        </Card>
        <Card className="p-5 min-w-0">
          <SectionTitle title="Flows" subtitle={`Klaviyo-attributed revenue · ${rangeLabel.toLowerCase()}`} icon={Zap} />
          <DataTable<EntityRow> columns={ENTITY_COLUMNS} rows={flowRows} renderCell={renderEntity} />
          {!isLoading && flowRows.length === 0 && <p className="text-sm text-neutral-400 mt-3">No flow revenue in range.</p>}
        </Card>
      </div>

      {/* Server-side hourly (Klaviyo channel) */}
      <Card className="p-5">
        <SectionTitle
          title="Klaviyo revenue by hour (server-side)"
          subtitle={`From your payment attribution (convertingPlatform = klaviyo email + sms), ${rangeLabel.toLowerCase()} (AEST)`}
          icon={Clock}
        />
        <HourlyBreakdownTable rows={hourRows} fmtCompact={fmtCompact} />
      </Card>

      <p className="text-2xs text-neutral-400 leading-snug">
        Campaign / flow revenue above is <strong>Klaviyo-attributed</strong> (Klaviyo’s own “Placed Order” conversion value). The hourly
        table is your <strong>server-side</strong> attribution (convertingPlatform). The two use different attribution windows and will not
        match exactly — that’s expected.
      </p>
    </div>
  );
}
