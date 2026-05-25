#!/usr/bin/env npx tsx

/**
 * READ-ONLY audit: find Klaviyo assets that reference legacy camelCase custom
 * properties (firstName / lastName / userId) instead of Klaviyo's standard
 * fields (first_name / last_name / user_id).
 *
 * Why: our client-side `identify` historically sent camelCase keys, creating
 * duplicate custom properties on profiles. Before we standardize the client to
 * snake_case (see docs/tracking + KLAVIYO audit), we must know which templates /
 * flows / segments still reference the old keys so they don't render blank or
 * break filtering after the change.
 *
 * Scans (GET only — never mutates):
 *   - Templates  (html / text / definition)
 *   - Flows      (definition: trigger filters + conditional splits)
 *   - Segments   (definition: conditions)
 *
 * Limitations: campaign/flow emails authored with INLINE content (not a saved
 * template) are only partially covered — saved/universal templates are the main
 * place merge tags live and are fully scanned here. Flow definition scanning
 * depends on the pinned revision supporting additional-fields[flow]=definition;
 * if not, the script logs a warning and falls back to a shallower scan.
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

// Legacy camelCase tokens we are hunting for. Word-boundaried so `firstName`
// does not match `first_name`, and `userId` matches `{{ person.userId }}`.
const LEGACY_TOKENS = ["firstName", "lastName", "userId"] as const;
const TOKEN_REGEXES = LEGACY_TOKENS.map((t) => ({ token: t, re: new RegExp(`\\b${t}\\b`) }));

type ResourceKind = "template" | "flow" | "segment";

interface KlaviyoResource {
  id: string;
  attributes?: Record<string, unknown>;
}

interface KlaviyoListResponse {
  data?: KlaviyoResource[];
  links?: { next?: string | null };
}

interface Hit {
  resource: ResourceKind;
  id: string;
  name: string;
  tokens: string[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function klaviyoGet(url: string): Promise<KlaviyoListResponse> {
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

    return (await res.json()) as KlaviyoListResponse;
  }
  throw new Error(`GET ${url} -> exhausted retries (429)`);
}

/**
 * Fetch all pages for a list endpoint, following links.next. `tryUrl` may carry
 * an additional-fields param; if the first request 400s (param unsupported on
 * this revision) we warn and fall back to `fallbackUrl` for the rest of the run.
 */
async function fetchAll(tryUrl: string, fallbackUrl: string): Promise<KlaviyoResource[]> {
  let url: string | null = tryUrl;
  let usedFallback = false;
  const out: KlaviyoResource[] = [];

  while (url) {
    let page: KlaviyoListResponse;
    try {
      page = await klaviyoGet(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!usedFallback && url === tryUrl && msg.includes("-> 400")) {
        console.error(`   [warn] additional-fields not supported on revision ${REVISION}; using shallow scan`);
        usedFallback = true;
        url = fallbackUrl;
        continue;
      }
      throw e;
    }

    out.push(...(page.data ?? []));
    url = page.links?.next ?? null;
    if (url) await sleep(200); // gentle pacing under Klaviyo steady-rate limits
  }

  return out;
}

function scan(resource: ResourceKind, item: KlaviyoResource): Hit | null {
  const haystack = JSON.stringify(item.attributes ?? item);
  const tokens = TOKEN_REGEXES.filter(({ re }) => re.test(haystack)).map(({ token }) => token);
  if (tokens.length === 0) return null;

  const attrs = item.attributes ?? {};
  const name =
    (typeof attrs.name === "string" && attrs.name) ||
    (typeof attrs.title === "string" && attrs.title) ||
    item.id ||
    "(unnamed)";

  return { resource, id: item.id, name, tokens };
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error("[klaviyo-audit] Abort: KLAVIYO_PRIVATE_API_KEY missing in .env.local");
    process.exit(1);
  }

  console.error(`[klaviyo-audit] revision=${REVISION}  hunting: ${LEGACY_TOKENS.join(", ")}\n`);

  const hits: Hit[] = [];

  // 1. Templates — html/text returned by default; definition for new-editor templates.
  console.error("[klaviyo-audit] scanning templates...");
  const templates = await fetchAll(
    `${BASE}/templates/?additional-fields[template]=definition&page[size]=100`,
    `${BASE}/templates/?page[size]=100`
  );
  for (const t of templates) {
    const hit = scan("template", t);
    if (hit) hits.push(hit);
  }
  console.error(`   ${templates.length} templates scanned`);

  // 2. Flows — definition carries trigger filters + conditional split logic.
  console.error("[klaviyo-audit] scanning flows...");
  const flows = await fetchAll(
    `${BASE}/flows/?additional-fields[flow]=definition&page[size]=50`,
    `${BASE}/flows/?page[size]=50`
  );
  for (const f of flows) {
    const hit = scan("flow", f);
    if (hit) hits.push(hit);
  }
  console.error(`   ${flows.length} flows scanned`);

  // 3. Segments — definition carries the condition tree.
  console.error("[klaviyo-audit] scanning segments...");
  const segments = await fetchAll(
    `${BASE}/segments/?additional-fields[segment]=definition&page[size]=100`,
    `${BASE}/segments/?page[size]=100`
  );
  for (const s of segments) {
    const hit = scan("segment", s);
    if (hit) hits.push(hit);
  }
  console.error(`   ${segments.length} segments scanned\n`);

  if (OUTPUT_JSON) {
    console.log(JSON.stringify({ revision: REVISION, scanned: { templates: templates.length, flows: flows.length, segments: segments.length }, hits }, null, 2));
    return;
  }

  if (hits.length === 0) {
    console.log("✅ CLEAN: no templates, flows, or segments reference firstName / lastName / userId.");
    console.log("   Safe to standardize the client identify to snake_case without breaking existing assets.");
    return;
  }

  console.log(`⚠️  ${hits.length} asset(s) reference legacy camelCase properties:\n`);
  for (const kind of ["template", "flow", "segment"] as const) {
    const group = hits.filter((h) => h.resource === kind);
    if (group.length === 0) continue;
    console.log(`${kind.toUpperCase()}S (${group.length}):`);
    for (const h of group) {
      console.log(`  • ${h.name}  [${h.id}]  → ${h.tokens.join(", ")}`);
    }
    console.log("");
  }
  console.log("Next: update these to first_name / last_name / user_id in Klaviyo BEFORE the client identify change,");
  console.log("or request the dual-write transition so they keep rendering during migration.");
}

main().catch((e) => {
  console.error("[klaviyo-audit] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
