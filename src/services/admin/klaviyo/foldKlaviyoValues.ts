/**
 * Pure shaper for Klaviyo campaign/flow *values-report* rows.
 *
 * The values-report (verified read-only probe, 2026-06-03) returns one row per
 * campaign/flow MESSAGE: `{ groupings: { <idKey>, send_channel, <message_id> },
 * statistics: { conversion_value, conversion_uniques, conversions } }`. This folds
 * those rows into per-entity (campaign_id | flow_id) totals, split by email/sms,
 * sorted by total revenue desc. React-free + network-free → unit-tested
 * (`npm run test:klaviyo-fold`).
 */

export type KlaviyoSendChannel = "email" | "sms" | "push" | "unknown";

export interface ValuesResultRow {
  groupings?: Record<string, string | undefined>;
  statistics?: {
    conversion_value?: number;
    conversions?: number;
    conversion_uniques?: number;
  };
}

export interface ChannelStat {
  revenue: number; // conversion_value (Klaviyo-attributed, dollars)
  conversions: number;
}

export interface EntityValues {
  entityId: string; // campaign_id | flow_id
  email: ChannelStat;
  sms: ChannelStat;
  total: ChannelStat; // email + sms + any other channel (push/unknown)
}

const zero = (): ChannelStat => ({ revenue: 0, conversions: 0 });
const num = (n: number | undefined): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);

function normalizeChannel(raw: string | undefined): KlaviyoSendChannel {
  const c = (raw ?? "").toLowerCase();
  return c === "email" || c === "sms" || c === "push" ? c : "unknown";
}

export function foldKlaviyoValues(
  results: ValuesResultRow[] | undefined,
  idKey: "campaign_id" | "flow_id"
): EntityValues[] {
  const map = new Map<string, EntityValues>();

  for (const row of results ?? []) {
    const id = row.groupings?.[idKey];
    if (!id) continue; // rows without the entity id can't be attributed — skip

    const channel = normalizeChannel(row.groupings?.send_channel);
    const revenue = num(row.statistics?.conversion_value);
    const conversions = num(row.statistics?.conversions);

    let entity = map.get(id);
    if (!entity) {
      entity = { entityId: id, email: zero(), sms: zero(), total: zero() };
      map.set(id, entity);
    }

    if (channel === "email") {
      entity.email.revenue += revenue;
      entity.email.conversions += conversions;
    } else if (channel === "sms") {
      entity.sms.revenue += revenue;
      entity.sms.conversions += conversions;
    }
    // push/unknown still contributes to the entity total, just not to an email/sms column.
    entity.total.revenue += revenue;
    entity.total.conversions += conversions;
  }

  return [...map.values()].sort((a, b) => b.total.revenue - a.total.revenue);
}
