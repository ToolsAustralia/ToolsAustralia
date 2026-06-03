/**
 * Klaviyo reporting service (SHARED-2) — read-only campaign/flow analytics for the
 * admin Klaviyo tab. Reuses the existing `klaviyo` singleton's auth / revision /
 * retry-backoff via its `reportingRequest` passthrough.
 *
 * Verified against the live API (read-only probe, 2026-06-03): scopes granted;
 * "Placed Order" metric resolves uniquely (resolved at runtime + cached); the
 * campaign/flow values-reports return one row per message carrying `send_channel`
 * + `<entity>_id`, so the pure `foldKlaviyoValues` shaper splits email vs SMS.
 *
 * The reporting endpoints are heavily throttled (≈2/min) — callers MUST cache
 * (see the route); this service does not retry beyond the client's backoff.
 */
import { klaviyo } from "@/lib/klaviyo";
import { foldKlaviyoValues, type EntityValues, type ValuesResultRow } from "./foldKlaviyoValues";

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const MAX_PAGES = 6; // safety cap on pagination (logged if hit)

export type KlaviyoTimeframeKey = "last_7_days" | "last_30_days" | "last_90_days" | "last_12_months";

// ---- Raw API response shapes (only the fields we read) ----
interface ListResponse<T> {
  data?: T[];
  links?: { next?: string | null };
}
interface MetricResource {
  id: string;
  attributes?: { name?: string; integration?: { name?: string; category?: string } };
}
interface CampaignResource {
  id: string;
  attributes?: { name?: string; status?: string; scheduled_at?: string | null; send_time?: string | null };
}
interface FlowResource {
  id: string;
  attributes?: { name?: string; status?: string; trigger_type?: string };
}
interface ValuesReportResponse {
  data?: { attributes?: { results?: ValuesResultRow[] } };
}

// ---- Output shapes ----
export interface CampaignRow extends EntityValues {
  name: string;
  status: string;
  scheduledAt: string | null;
}
export interface FlowRow extends EntityValues {
  name: string;
  status: string;
  triggerType: string;
}
export interface KlaviyoAnalytics {
  range: KlaviyoTimeframeKey;
  metricId: string;
  campaigns: CampaignRow[];
  flows: FlowRow[];
  scheduled: {
    upcomingCampaigns: Array<{ id: string; name: string; channel: "email" | "sms"; scheduledAt: string }>;
    liveFlows: Array<{ id: string; name: string; triggerType: string }>;
  };
  truncated: boolean; // a list hit the page cap (coverage may be partial)
}

/** Strip the absolute base off a Klaviyo `links.next` so it can be re-requested via reportingRequest. */
function toEndpoint(nextUrl: string | null | undefined): string | null {
  if (!nextUrl) return null;
  return nextUrl.startsWith(KLAVIYO_API_BASE) ? nextUrl.slice(KLAVIYO_API_BASE.length) : nextUrl;
}

async function getAllPages<T>(firstEndpoint: string): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let endpoint: string | null = firstEndpoint;
  let pages = 0;
  while (endpoint && pages < MAX_PAGES) {
    const res: ListResponse<T> = await klaviyo.reportingRequest<ListResponse<T>>(endpoint, "GET");
    if (Array.isArray(res.data)) items.push(...res.data);
    endpoint = toEndpoint(res.links?.next);
    pages += 1;
  }
  if (endpoint) {
    // Hit the page cap with more pages available — surface it (never silently truncate).
    console.error(`⚠️ [klaviyoReporting] page cap (${MAX_PAGES}) reached for "${firstEndpoint}"; results may be partial.`);
  }
  return { items, truncated: Boolean(endpoint) };
}

// ---- Conversion metric id (resolved once, cached) ----
let cachedConversionMetricId: string | null = null;

/**
 * Resolve the conversion metric id for the campaign/flow values-reports.
 *
 * Prefers `KLAVIYO_CONVERSION_METRIC_ID` — set this to the account's custom
 * **"Marketing Revenue"** metric (= Placed Order WHERE `is_renewal = 0`, i.e.
 * acquisition revenue, renewals excluded). Custom conversion metrics are NOT
 * returned by `/api/metrics/`, so they must be supplied by id. Falls back to
 * resolving the standard "Placed Order" event metric by name (includes renewals).
 */
export async function resolveConversionMetricId(): Promise<string> {
  if (cachedConversionMetricId) return cachedConversionMetricId;
  const envId = process.env.KLAVIYO_CONVERSION_METRIC_ID?.trim();
  if (envId) {
    cachedConversionMetricId = envId;
    return envId;
  }
  const { items } = await getAllPages<MetricResource>("/metrics/");
  const matches = items.filter((m) => (m.attributes?.name ?? "").toLowerCase() === "placed order");
  if (matches.length === 0) {
    throw new Error(
      'Klaviyo: no conversion metric — set KLAVIYO_CONVERSION_METRIC_ID (the "Marketing Revenue" metric id) or ensure a "Placed Order" metric exists.'
    );
  }
  // If multiple integrations report "Placed Order", prefer the API integration (the codebase's source), else first.
  const chosen = matches.find((m) => (m.attributes?.integration?.category ?? "").toLowerCase() === "api") ?? matches[0];
  cachedConversionMetricId = chosen.id;
  return chosen.id;
}

// ---- Campaigns / Flows lists ----
function campaignFilter(channel: "email" | "sms"): string {
  return encodeURIComponent(`equals(messages.channel,'${channel}')`);
}

async function listCampaigns(channel: "email" | "sms"): Promise<{ items: CampaignResource[]; truncated: boolean }> {
  // `-scheduled_at` puts upcoming (future-dated) sends first, so scheduled campaigns land on page 1.
  return getAllPages<CampaignResource>(`/campaigns/?filter=${campaignFilter(channel)}&sort=-scheduled_at&page%5Bsize%5D=50`);
}

async function listFlows(): Promise<{ items: FlowResource[]; truncated: boolean }> {
  return getAllPages<FlowResource>(`/flows/?page%5Bsize%5D=50`);
}

// ---- Values reports ----
async function getValues(
  endpoint: "campaign-values-reports" | "flow-values-reports",
  type: "campaign-values-report" | "flow-values-report",
  metricId: string,
  timeframe: KlaviyoTimeframeKey
): Promise<ValuesResultRow[]> {
  const res = await klaviyo.reportingRequest<ValuesReportResponse>(`/${endpoint}/`, "POST", {
    data: {
      type,
      attributes: {
        statistics: ["conversion_value", "conversion_uniques", "conversions"],
        timeframe: { key: timeframe },
        conversion_metric_id: metricId,
      },
    },
  });
  return res.data?.attributes?.results ?? [];
}

// ---- Orchestration ----
export async function getKlaviyoAnalytics(
  range: KlaviyoTimeframeKey,
  nowMs: number
): Promise<KlaviyoAnalytics> {
  const metricId = await resolveConversionMetricId();

  const [emailCampaigns, smsCampaigns, flowList, campaignValues, flowValues] = await Promise.all([
    listCampaigns("email"),
    listCampaigns("sms"),
    listFlows(),
    getValues("campaign-values-reports", "campaign-values-report", metricId, range),
    getValues("flow-values-reports", "flow-values-report", metricId, range),
  ]);

  const truncated = emailCampaigns.truncated || smsCampaigns.truncated || flowList.truncated;

  // name/status maps + channel for campaigns
  const campaignMeta = new Map<string, { name: string; status: string; scheduledAt: string | null; channel: "email" | "sms" }>();
  for (const c of emailCampaigns.items) {
    campaignMeta.set(c.id, { name: c.attributes?.name ?? `Campaign ${c.id}`, status: c.attributes?.status ?? "Unknown", scheduledAt: c.attributes?.scheduled_at ?? null, channel: "email" });
  }
  for (const c of smsCampaigns.items) {
    if (!campaignMeta.has(c.id)) {
      campaignMeta.set(c.id, { name: c.attributes?.name ?? `Campaign ${c.id}`, status: c.attributes?.status ?? "Unknown", scheduledAt: c.attributes?.scheduled_at ?? null, channel: "sms" });
    }
  }
  const flowMeta = new Map<string, { name: string; status: string; triggerType: string }>();
  for (const f of flowList.items) {
    flowMeta.set(f.id, { name: f.attributes?.name ?? `Flow ${f.id}`, status: f.attributes?.status ?? "unknown", triggerType: f.attributes?.trigger_type ?? "" });
  }

  const campaigns: CampaignRow[] = foldKlaviyoValues(campaignValues, "campaign_id").map((e) => {
    const meta = campaignMeta.get(e.entityId);
    return { ...e, name: meta?.name ?? `Campaign ${e.entityId}`, status: meta?.status ?? "Unknown", scheduledAt: meta?.scheduledAt ?? null };
  });

  const flows: FlowRow[] = foldKlaviyoValues(flowValues, "flow_id").map((e) => {
    const meta = flowMeta.get(e.entityId);
    return { ...e, name: meta?.name ?? `Flow ${e.entityId}`, status: meta?.status ?? "unknown", triggerType: meta?.triggerType ?? "" };
  });

  // Scheduled / about-to-send: upcoming Scheduled campaigns + live flows.
  const upcomingCampaigns = [...campaignMeta.entries()]
    .filter(([, m]) => m.status.toLowerCase() === "scheduled" && m.scheduledAt && Date.parse(m.scheduledAt) >= nowMs)
    .map(([id, m]) => ({ id, name: m.name, channel: m.channel, scheduledAt: m.scheduledAt as string }))
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));

  const liveFlows = [...flowMeta.entries()]
    .filter(([, m]) => m.status.toLowerCase() === "live")
    .map(([id, m]) => ({ id, name: m.name, triggerType: m.triggerType }));

  return { range, metricId, campaigns, flows, scheduled: { upcomingCampaigns, liveFlows }, truncated };
}
