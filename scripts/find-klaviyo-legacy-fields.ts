#!/usr/bin/env npx tsx

/**
 * READ-ONLY audit: find Klaviyo assets that reference legacy camelCase keys
 * which the client codebase is migrating away from.
 *
 * Two token categories scanned in a single pass:
 *
 * 1. `identify` — `firstName` / `lastName` / `userId`
 *    Used by the old client-side `identify` call. If a template merge tag,
 *    flow filter, segment condition, campaign body, or form references these
 *    they would silently break after the migration to `first_name` /
 *    `last_name` / `user_id`.
 *
 * 2. `event_param` — `productId` / `productName` / `numItems` / `contentName`
 *    / `contentIds` / `entriesGranted` / `redeemMethod`
 *    Used by the old `KlaviyoEventParams` shape on `Added to Cart`,
 *    `Removed from Cart`, `Viewed Product`, and the `Monthly Redeemable
 *    Redeemed` event. Migrated to `product_id` / `product_name` / `num_items`
 *    / etc. Any flow or segment filter that keyed off the camelCase variant
 *    would silently stop matching new events.
 *
 * Scans (GET only — never mutates):
 *   - Templates           (html / text — where merge tags render)
 *   - Flows               (definition: filters + splits, AND flow-actions
 *                          inline message content)
 *   - Segments            (definition: condition tree)
 *   - Campaigns           (Draft + Scheduled, email + SMS) including
 *                          campaign-messages with their `definition` content
 *   - Forms               LIST ONLY — Klaviyo API does not expose form-version
 *                          content on revision 2025-10-15, so forms are
 *                          enumerated and flagged for MANUAL review in the
 *                          Klaviyo dashboard.
 *
 * API quirks handled (Klaviyo revision 2025-10-15):
 *   - LIST endpoints reject `additional-fields=definition`; single-resource
 *     endpoint /flows/{id}/ accepts it (used for per-flow deep scan).
 *   - /templates/ and /segments/ list page[size] capped at 10.
 *   - /flows/ list page[size] capped at 50.
 *   - /campaigns/ list REQUIRES a `filter` parameter (channel + status).
 *   - /forms/ list works but /form-versions/{id}/ does NOT return form
 *     content (no definition / html / body / content attrs).
 *
 * Usage:
 *   npm run find:klaviyo-legacy-fields
 *   npx tsx scripts/find-klaviyo-legacy-fields.ts [--json]
 *
 * Options:
 *   --json   Emit machine-readable JSON instead of the human-readable report.
 *
 * Safety: READ-ONLY. Only HTTP GET requests to the Klaviyo API. No DB, no writes.
 *
 * Env:
 *   KLAVIYO_PRIVATE_API_KEY   (required)
 *   KLAVIYO_API_REVISION      (optional; defaults to 2025-10-15)
 *
 * @module scripts/find-klaviyo-legacy-fields
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const API_KEY = process.env.KLAVIYO_PRIVATE_API_KEY?.trim();
const REVISION = process.env.KLAVIYO_API_REVISION?.trim() || "2025-10-15";
const BASE = "https://a.klaviyo.com/api";
const OUTPUT_JSON = process.argv.includes("--json");

// Two distinct token categories. Each token is word-boundaried so `firstName`
// does not match `first_name`, and `userId` matches `{{ person.userId }}`.
type TokenCategory = "identify" | "event_param";
const TOKENS: { token: string; category: TokenCategory }[] = [
  // Identify-call legacy keys
  { token: "firstName", category: "identify" },
  { token: "lastName", category: "identify" },
  { token: "userId", category: "identify" },
  // Event-param legacy keys (KlaviyoEventParams migration)
  { token: "productId", category: "event_param" },
  { token: "productName", category: "event_param" },
  { token: "numItems", category: "event_param" },
  { token: "contentName", category: "event_param" },
  { token: "contentIds", category: "event_param" },
  { token: "entriesGranted", category: "event_param" },
  { token: "redeemMethod", category: "event_param" },
];
const TOKEN_REGEXES = TOKENS.map((t) => ({ ...t, re: new RegExp(`\\b${t.token}\\b`) }));

type ResourceKind = "template" | "flow" | "segment" | "campaign";

interface KlaviyoResource {
  id: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}

interface KlaviyoListResponse {
  data?: KlaviyoResource[];
  included?: KlaviyoResource[];
  links?: { next?: string | null };
}

interface KlaviyoSingleResponse {
  data?: KlaviyoResource;
  included?: KlaviyoResource[];
}

interface Hit {
  resource: ResourceKind;
  id: string;
  name: string;
  tokens: { token: string; category: TokenCategory }[];
  extra?: string; // e.g. campaign status / channel
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function klaviyoGet<T = KlaviyoListResponse>(url: string): Promise<T> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Klaviyo-API-Key ${API_KEY}`,
        revision: REVISION,
        accept: "application/json",
      },
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
      const waitMs = (Number.isFinite(retryAfter) ? retryAfter : 2) * 1000;
      console.error(`   [rate-limit] 429 — waiting ${waitMs}ms (attempt ${attempt}/5)`);
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GET ${url} -> ${res.status} ${res.statusText} ${body.slice(0, 300)}`);
    }

    return (await res.json()) as T;
  }
  throw new Error(`GET ${url} -> exhausted retries (429)`);
}

/** Page through a list endpoint, following links.next. Returns data + included resources. */
async function fetchAllPages(url: string): Promise<{ data: KlaviyoResource[]; included: KlaviyoResource[] }> {
  let next: string | null = url;
  const data: KlaviyoResource[] = [];
  const included: KlaviyoResource[] = [];
  while (next) {
    const page: KlaviyoListResponse = await klaviyoGet<KlaviyoListResponse>(next);
    data.push(...(page.data ?? []));
    included.push(...(page.included ?? []));
    next = page.links?.next ?? null;
    if (next) await sleep(200);
  }
  return { data, included };
}

/**
 * Scan a haystack for any of the configured tokens. Returns the matching
 * tokens (deduplicated) and their categories, or null if nothing matched.
 */
function scanHaystack(haystack: string): { token: string; category: TokenCategory }[] {
  const seen = new Map<string, TokenCategory>();
  for (const { token, category, re } of TOKEN_REGEXES) {
    if (re.test(haystack)) seen.set(token, category);
  }
  return Array.from(seen.entries()).map(([token, category]) => ({ token, category }));
}

function resourceName(r: KlaviyoResource): string {
  const attrs = r.attributes ?? {};
  return (
    (typeof attrs.name === "string" && attrs.name) ||
    (typeof attrs.title === "string" && attrs.title) ||
    r.id ||
    "(unnamed)"
  );
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error("[klaviyo-audit] Abort: KLAVIYO_PRIVATE_API_KEY missing in .env.local");
    process.exit(1);
  }

  const tokenLine = TOKENS.map((t) => t.token).join(", ");
  console.error(`[klaviyo-audit] revision=${REVISION}`);
  console.error(`[klaviyo-audit] hunting: ${tokenLine}\n`);

  const hits: Hit[] = [];
  const counts = { templates: 0, flows: 0, segments: 0, campaigns: 0, forms: 0 };
  const formInventory: { id: string; name: string; status: string }[] = [];

  // 1. Templates — html/text in default list attrs.
  console.error("[klaviyo-audit] scanning templates...");
  {
    const { data } = await fetchAllPages(`${BASE}/templates/?page[size]=10`);
    counts.templates = data.length;
    for (const t of data) {
      const tokens = scanHaystack(JSON.stringify(t.attributes ?? t));
      if (tokens.length > 0) hits.push({ resource: "template", id: t.id, name: resourceName(t), tokens });
    }
    console.error(`   ${data.length} templates scanned`);
  }

  // 2. Flows — deep per-flow fetch with definition + flow-actions include.
  console.error("[klaviyo-audit] scanning flows (deep)...");
  {
    const { data: flowList } = await fetchAllPages(`${BASE}/flows/?page[size]=50`);
    let deep = 0;
    for (const f of flowList) {
      try {
        const single = await klaviyoGet<KlaviyoSingleResponse>(
          `${BASE}/flows/${f.id}/?additional-fields[flow]=definition&include=flow-actions`
        );
        const flowData = single.data ?? f;
        const included = single.included ?? [];
        const haystack = JSON.stringify(flowData.attributes ?? flowData) + JSON.stringify(included);
        const tokens = scanHaystack(haystack);
        if (tokens.length > 0) hits.push({ resource: "flow", id: f.id, name: resourceName(flowData), tokens });
        deep++;
        await sleep(150);
      } catch (e) {
        console.error(`   [warn] failed to deep-fetch flow ${f.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
    counts.flows = deep;
    console.error(`   ${deep}/${flowList.length} flows deep-scanned`);
  }

  // 3. Segments — definition in default list attrs.
  console.error("[klaviyo-audit] scanning segments...");
  {
    const { data } = await fetchAllPages(`${BASE}/segments/?page[size]=10`);
    counts.segments = data.length;
    for (const s of data) {
      const tokens = scanHaystack(JSON.stringify(s.attributes ?? s));
      if (tokens.length > 0) hits.push({ resource: "segment", id: s.id, name: resourceName(s), tokens });
    }
    console.error(`   ${data.length} segments scanned`);
  }

  // 4. Campaigns — Draft + Scheduled, both channels, with campaign-messages include.
  //    Klaviyo /campaigns/ requires a `filter` param; we don't care about Sent
  //    campaigns (immutable, already delivered) so we only audit drafts +
  //    scheduled where a fix is still possible.
  console.error("[klaviyo-audit] scanning campaigns (Draft + Scheduled, email + SMS, with messages)...");
  {
    const channelStatuses: { channel: string; status: string }[] = [
      { channel: "email", status: "Draft" },
      { channel: "email", status: "Scheduled" },
      { channel: "sms", status: "Draft" },
      { channel: "sms", status: "Scheduled" },
    ];

    for (const { channel, status } of channelStatuses) {
      const filter = `equals(messages.channel,%22${channel}%22),equals(status,%22${status}%22)`;
      const url = `${BASE}/campaigns/?filter=${filter}&include=campaign-messages&page[size]=10`;
      try {
        const { data, included } = await fetchAllPages(url);
        counts.campaigns += data.length;
        // Index included messages by id so we can attach them to their owning campaign.
        const messagesByCampaignId = new Map<string, KlaviyoResource[]>();
        for (const campaign of data) {
          const rel = (campaign.relationships as { ["campaign-messages"]?: { data?: { id: string }[] } } | undefined);
          const messageIds = rel?.["campaign-messages"]?.data?.map((d) => d.id) ?? [];
          const msgs = included.filter((inc) => inc.type === "campaign-message" && messageIds.includes(inc.id));
          messagesByCampaignId.set(campaign.id, msgs);
        }
        for (const campaign of data) {
          const msgs = messagesByCampaignId.get(campaign.id) ?? [];
          const haystack = JSON.stringify(campaign.attributes ?? campaign) + JSON.stringify(msgs);
          const tokens = scanHaystack(haystack);
          if (tokens.length > 0) {
            hits.push({
              resource: "campaign",
              id: campaign.id,
              name: resourceName(campaign),
              tokens,
              extra: `${channel} / ${status}`,
            });
          }
        }
        console.error(`   ${data.length} ${channel} ${status} campaigns scanned`);
      } catch (e) {
        console.error(
          `   [warn] failed to scan ${channel} ${status} campaigns: ${e instanceof Error ? e.message : e}`
        );
      }
    }
    console.error(`   ${counts.campaigns} campaigns scanned in total`);
  }

  // 5. Forms — LIST ONLY. Klaviyo API does not expose form-version content
  //    on this revision so we can't scan. Output the inventory so the user
  //    can manually check each one in the Klaviyo UI.
  console.error("[klaviyo-audit] enumerating forms (API does not expose form-version content; MANUAL check required)...");
  {
    try {
      const { data } = await fetchAllPages(`${BASE}/forms/?page[size]=10`);
      counts.forms = data.length;
      for (const f of data) {
        const attrs = f.attributes ?? {};
        formInventory.push({
          id: f.id,
          name: resourceName(f),
          status: (typeof attrs.status === "string" && attrs.status) || "unknown",
        });
      }
      console.error(`   ${data.length} forms enumerated`);
    } catch (e) {
      console.error(`   [warn] failed to list forms: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ========================================================================
  // OUTPUT
  // ========================================================================

  if (OUTPUT_JSON) {
    console.log(
      JSON.stringify(
        {
          revision: REVISION,
          scanned: counts,
          hits,
          forms_requires_manual_check: formInventory,
        },
        null,
        2
      )
    );
    return;
  }

  console.log("");
  console.log("===== Klaviyo legacy-key audit =====");
  console.log(
    `Scanned: ${counts.templates} templates, ${counts.flows} flows (deep), ${counts.segments} segments, ${counts.campaigns} campaigns (Draft+Scheduled).`
  );

  const identifyHits = hits.filter((h) => h.tokens.some((t) => t.category === "identify"));
  const eventHits = hits.filter((h) => h.tokens.some((t) => t.category === "event_param"));

  console.log("");
  if (identifyHits.length === 0) {
    console.log("IDENTIFY tokens (firstName / lastName / userId): CLEAN.");
    console.log("  Safe to ship the client-identify snake_case migration.");
  } else {
    console.log(`IDENTIFY tokens found in ${identifyHits.length} asset(s):`);
    for (const h of identifyHits) {
      const ts = h.tokens.filter((t) => t.category === "identify").map((t) => t.token).join(", ");
      console.log(`  - [${h.resource}${h.extra ? " / " + h.extra : ""}] ${h.name} [${h.id}] -> ${ts}`);
    }
  }

  console.log("");
  if (eventHits.length === 0) {
    console.log("EVENT_PARAM tokens (productId / productName / numItems / contentName / contentIds / entriesGranted / redeemMethod): CLEAN.");
    console.log("  Safe to ship the event-params snake_case migration.");
  } else {
    console.log(`EVENT_PARAM tokens found in ${eventHits.length} asset(s):`);
    for (const h of eventHits) {
      const ts = h.tokens.filter((t) => t.category === "event_param").map((t) => t.token).join(", ");
      console.log(`  - [${h.resource}${h.extra ? " / " + h.extra : ""}] ${h.name} [${h.id}] -> ${ts}`);
    }
    console.log("  NOTE: token matches may be false positives if they appear in URLs or tracking");
    console.log("        params rather than merge tags / filter conditions. Review each in the");
    console.log("        Klaviyo UI before deciding whether a fix is needed.");
  }

  console.log("");
  console.log(`Forms (${counts.forms}) — MANUAL CHECK REQUIRED:`);
  console.log("  Klaviyo API does not expose form-version content on revision " + REVISION + ".");
  console.log("  Open each form below in Klaviyo and verify its First Name / Last Name field");
  console.log("  mappings point to `first_name` / `last_name` (not the camelCase variants), and");
  console.log("  that no merge tags inside the form body reference firstName / lastName / userId.");
  if (formInventory.length === 0) {
    console.log("  (no forms found)");
  } else {
    for (const f of formInventory) {
      console.log(`  - "${f.name}" [${f.id}] (status: ${f.status})`);
    }
  }

  console.log("");
}

main().catch((e) => {
  console.error("[klaviyo-audit] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
