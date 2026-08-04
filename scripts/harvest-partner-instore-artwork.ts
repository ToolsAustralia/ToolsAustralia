/**
 * Harvests artwork references for the partner catalogue's **In-Store Offer** rows and commits
 * them to `src/data/partner-catalog/instore-offer-artwork.json`.
 *
 * WHY A SEPARATE SCRIPT FROM `probe-partner-catalog-images.ts`
 * That probe derives a URL from the offer id (`product_image/{offerId}.{ext}`) and asks the
 * public bucket whether it exists. It works for 948 of 1,833 offers and returns **0 of 877**
 * for the "In-Store Offer" category — not because those offers lack artwork, but because
 * theirs is keyed by an internal **merchant** id that appears nowhere in the CSV we are given.
 * Read off the live portal, offer 1068399 (pureBIO New Zealand) renders
 * `merchant_logo/1032063.jpeg`; there is no function from 1068399 to 1032063.
 *
 * So this script does not guess a URL — it reads the vendor's own listing pages and records
 * whichever image the portal itself uses per offer. That is strictly better evidence than a
 * derived path, and it is how the two earlier wrong conclusions about this bucket (`big_image/`
 * at 3%, then "product_image is effectively complete") would both have been avoided.
 *
 * WHY THE LISTING, NOT THE DETAIL PAGES
 * `/products/modern_search?...cat=In-store+Offers` paginates 15 tiles per page and each tile
 * carries both the `view_smart/{offerId}` link and the `<img>`. That is ~60 page loads for the
 * whole category instead of ~880 — an order of magnitude less load on the vendor for the same
 * data.
 *
 * REQUIRES A LIVE PORTAL SESSION, so unlike the probe this can NEVER run in CI. It signs in to
 * Tools Australia with a real member account and uses the existing SSO hand-off, because the
 * portal has no other entry point. Credentials come from env and are never written to disk:
 *
 *   PARTNER_HARVEST_EMAIL=...        # a member with active partner access
 *   PARTNER_HARVEST_PASSWORD=...
 *   PARTNER_HARVEST_ORIGIN=https://toolsaustralia.com.au   # optional, defaults to prod
 *
 * Run it by hand when the catalogue CSV changes, then re-emit the generated files:
 *
 *   npm run harvest:partner-instore-artwork -- --dry-run   # crawl, report, write nothing
 *   npm run harvest:partner-instore-artwork
 *   npm run build:partner-catalog
 *
 * READ-ONLY against the vendor: it navigates listing pages and reads `<img>` srcs. It never
 * redeems, purchases, or edits anything. It is deliberately unhurried (a pause between pages)
 * because it is a guest in someone else's system.
 *
 * Exit codes: 0 ok · 1 fatal (bad config / login failed) · 2 completed but below the expected
 * coverage floor, i.e. the crawl "worked" but found far less than the CSV says exists — which
 * is exactly the silent-failure shape that produced the earlier 3% mistake.
 */

import { config } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";

// Same convention as scripts/build-chat-knowledge-pack.ts — tsx does not load .env.local.
config({ path: ".env.local" });
config();

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, "src/data/partner-catalog/offers-list-breakdown.csv");
const OUT_PATH = path.join(ROOT, "src/data/partner-catalog/instore-offer-artwork.json");

/** The CSV's category label for the rows this script exists to serve. */
const INSTORE_CATEGORY = "In-Store Offer";
/** The portal's label for the same set — it differs in case and pluralisation. */
const PORTAL_CATEGORY = "In-store Offers ";

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_PAGES = 200;
/** Stop after this many consecutive pages that add nothing new. */
const EMPTY_STREAK_LIMIT = 2;
/** Politeness pause between listing pages, ms. */
const PAGE_DELAY_MS = 700;
/** Fail loudly (exit 2) below this share of the CSV's in-store rows. */
const COVERAGE_FLOOR = 0.8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal RFC4180-aware row splitter — fields legitimately contain commas inside quotes. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); out.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); out.push(row); }
  return out;
}

async function readInStoreIds(): Promise<Set<string>> {
  const rows = parseCsv(await fs.readFile(CSV_PATH, "utf8"));
  const head = rows[0].map((h) => h.trim());
  const iId = head.indexOf("ID"), iCat = head.indexOf("Category");
  if (iId < 0 || iCat < 0) throw new Error("CSV is missing an ID or Category column");
  const ids = new Set<string>();
  for (const r of rows.slice(1)) {
    if (r[iId] && (r[iCat] || "").trim() === INSTORE_CATEGORY) ids.add(r[iId].trim());
  }
  return ids;
}

function listingUrl(portalOrigin: string, page: number): string {
  const q = new URLSearchParams({
    "data[Product][keywords]": "",
    "data[Product][cat]": PORTAL_CATEGORY,
    "data[Product][search_state_id]": "",
    submit: "Submit",
    f: "benefits",
    sort: "viewed_desc",
  }).toString();
  return page === 1
    ? `${portalOrigin}/products/modern_search?${q}`
    : `${portalOrigin}/products/modern_search/keywords:/cat:${encodeURIComponent(PORTAL_CATEGORY)}/search_state_id:/page:${page}?${q}`;
}

/**
 * Reads the offer's OWN hero image off its detail page.
 *
 * WHY THIS PHASE EXISTS AT ALL — the listing (phase 1) is 15x cheaper, but it serves
 * `merchant_logo/`, which is the BRAND mark. Every offer from one merchant then renders the
 * same picture: eight "Explore" tours in a row all showed one blue logo, which reads as a
 * broken grid rather than eight offers. The detail page carries a real 640x480
 * `product_image/{mediaId}` that genuinely differs per offer (verified across six offers of
 * the same merchant: 131561 / 131566 / 131572 / 131578 / 131584 / 131590).
 *
 * THE TRAP: the page also renders a "Popular Offers" carousel of OTHER offers, each with its
 * own `product_image`. Those ids are identical on every page, so taking "any product_image"
 * silently stamps the same four pictures across the whole catalogue. They are distinguishable
 * structurally, not by size: carousel images sit INSIDE a link to another offer, the hero does
 * not. Filtering on `closest("a[href*='view_smart/']")` is therefore the reliable test —
 * do not "simplify" this to a dimension check.
 */
async function scrapeDetailHero(page: Page): Promise<{ mediaId: string; ext: string } | null> {
  return page.evaluate(() => {
    for (const img of Array.from(document.querySelectorAll("img"))) {
      const src = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src || "";
      const m = src.match(/\/webroot\/files\/product_image\/(\d+)\.(png|jpg|jpeg|webp)/i);
      if (!m) continue;
      // Skip the cross-sell carousel: those thumbnails are wrapped in a link to their offer.
      if (img.closest("a[href*='view_smart/']")) continue;
      return { mediaId: m[1], ext: m[2].toLowerCase() };
    }
    return null;
  });
}

/** Pairs every `view_smart/{id}` link on the page with the image in its tile. */
async function scrapeListing(page: Page): Promise<Array<[string, string, string, string]>> {
  return page.evaluate(() => {
    const out: Array<[string, string, string, string]> = [];
    for (const a of Array.from(document.querySelectorAll("a[href*='view_smart/']"))) {
      const id = (a.getAttribute("href") || "").match(/view_smart\/(\d+)/)?.[1];
      if (!id) continue;
      // Walk up a few levels: the <img> is a sibling within the tile, not inside the <a>.
      let node: Element | null = a, img: HTMLImageElement | null = null;
      for (let i = 0; i < 5 && node && !img; i++) {
        img = node.querySelector?.("img") ?? null;
        node = node.parentElement;
      }
      const src = img ? img.currentSrc || img.src : "";
      const m = src.match(/\/webroot\/files\/(product_image|merchant_logo)\/(\d+)\.(png|jpg|jpeg|webp)/i);
      if (m) out.push([id, m[1], m[2], m[3].toLowerCase()]);
    }
    return out;
  });
}

async function signInAndOpenPortal(page: Page, origin: string, email: string, password: string): Promise<string> {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.getByRole("textbox", { name: /password/i }).fill(password);
  await page.getByRole("button", { name: /sign in|log ?in/i }).first().click();
  await page.waitForURL("**/my-account**", { timeout: 45_000 });

  await page.goto(`${origin}/my-account/rewards`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /open partner portal/i }).first().click();
  // The hand-off is a server round-trip then a cross-origin redirect; give it room.
  await page.waitForURL(/myrewards\./, { timeout: 60_000 });
  await sleep(2000);
  return new URL(page.url()).origin;
}

async function main(): Promise<void> {
  const email = process.env.PARTNER_HARVEST_EMAIL?.trim();
  const password = process.env.PARTNER_HARVEST_PASSWORD?.trim();
  const origin = (process.env.PARTNER_HARVEST_ORIGIN?.trim() || "https://toolsaustralia.com.au").replace(/\/+$/, "");
  if (!email || !password) {
    console.error("FATAL: set PARTNER_HARVEST_EMAIL and PARTNER_HARVEST_PASSWORD (see .env.example).");
    process.exit(1);
  }

  const expected = await readInStoreIds();
  console.log(`Harvesting artwork for ${expected.size} "${INSTORE_CATEGORY}" rows${DRY_RUN ? " (DRY RUN — nothing will be written)" : ""}`);
  console.log(`Signing in at ${origin} as ${email.replace(/(.).*(@.*)/, "$1***$2")}\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const found = new Map<string, string>();
  let pagesDone = 0, errors = 0, offPageIds = 0;
  const startedAt = Date.now();

  try {
    const portalOrigin = await signInAndOpenPortal(page, origin, email, password);
    console.log(`Portal session established at ${portalOrigin}\n`);

    let emptyStreak = 0;
    for (let n = 1; n <= MAX_PAGES && emptyStreak < EMPTY_STREAK_LIMIT; n++) {
      try {
        await page.goto(listingUrl(portalOrigin, n), { waitUntil: "domcontentloaded", timeout: 45_000 });
        await sleep(PAGE_DELAY_MS);
        const rows = await scrapeListing(page);
        let added = 0;
        for (const [id, folder, mediaId, ext] of rows) {
          // Ignore ids the listing shows that are not in-store rows of ours (the portal's
          // persistent header/footer carousels leak a few merchandised offers onto every page).
          if (!expected.has(id)) { offPageIds++; continue; }
          if (found.has(id)) continue;
          found.set(id, `${folder === "product_image" ? "p" : "m"}:${mediaId}.${ext}`);
          added++;
        }
        pagesDone = n;
        emptyStreak = added === 0 ? emptyStreak + 1 : 0;

        const pct = Math.round((found.size / expected.size) * 100);
        const rate = found.size / Math.max(1, (Date.now() - startedAt) / 1000);
        const eta = rate > 0 ? Math.round((expected.size - found.size) / rate) : 0;
        console.log(`  page ${String(n).padStart(3)} · +${String(added).padStart(2)} · ${found.size}/${expected.size} (${pct}%) · ${rate.toFixed(1)}/s · ETA ${eta}s`);
      } catch (err) {
        errors++;
        emptyStreak++;
        console.error(`  page ${n}: ERROR ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
    // ── PHASE 2 ── upgrade each merchant logo to the offer's own hero image.
    // Phase 1's result is kept as the fallback, so a detail page that fails still leaves the
    // offer with a picture rather than reverting it to a letter tile.
    const targets = [...found.keys()];
    console.log(`\nPhase 2 — reading per-offer hero images from ${targets.length} detail pages`);
    const phase2Start = Date.now();
    let upgraded = 0, heroMisses = 0;
    const logEvery = Math.max(1, Math.floor(targets.length / 20));

    for (let i = 0; i < targets.length; i++) {
      const id = targets[i];
      try {
        await page.goto(`${portalOrigin}/products/view_smart/${id}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
        const hero = await scrapeDetailHero(page);
        if (hero) { found.set(id, `p:${hero.mediaId}.${hero.ext}`); upgraded++; }
        else heroMisses++;
      } catch {
        errors++;
      }
      if ((i + 1) % logEvery === 0 || i === targets.length - 1) {
        const done = i + 1;
        const rate = done / Math.max(1, (Date.now() - phase2Start) / 1000);
        const eta = rate > 0 ? Math.round((targets.length - done) / rate) : 0;
        console.log(`  ${String(done).padStart(4)}/${targets.length} (${Math.round((done / targets.length) * 100)}%) · ${upgraded} upgraded · ${rate.toFixed(1)}/s · ETA ${eta}s`);
      }
    }
    console.log(`Phase 2 done — ${upgraded} upgraded to a per-offer image, ${heroMisses} kept the merchant logo`);
  } finally {
    await browser.close();
  }

  const missing = [...expected].filter((id) => !found.has(id));
  const byFolder = { merchant_logo: 0, product_image: 0 };
  for (const v of found.values()) {
    if (v.startsWith("m:")) byFolder.merchant_logo++;
    else byFolder.product_image++;
  }

  console.log(`\nDONE — ${pagesDone} pages, ${errors} errors, ${Math.round((Date.now() - startedAt) / 1000)}s`);
  console.log(`  matched     : ${found.size}/${expected.size} (${Math.round((found.size / expected.size) * 100)}%)`);
  console.log(`  merchant_logo: ${byFolder.merchant_logo}   product_image: ${byFolder.product_image}`);
  console.log(`  unmatched   : ${missing.length}${missing.length ? ` (e.g. ${missing.slice(0, 5).join(", ")})` : ""}`);
  if (offPageIds) console.log(`  ignored ${offPageIds} tile(s) for offers outside the in-store set (header/footer carousels)`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — not writing. Re-run without --dry-run to commit.");
    return;
  }

  const payload = {
    // No timestamp: this file is committed, and a changing timestamp would make every re-run
    // look like a change even when the mapping is identical.
    source: "portal In-store Offers listing (modern_search), read with a live member session",
    note: "offerId -> '<p|m>:<mediaId>.<ext>' — p = product_image/, m = merchant_logo/. Keyed by the VENDOR's internal media id, which is not derivable from the offer id.",
    offers: Object.fromEntries([...found.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
  await fs.writeFile(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${path.relative(ROOT, OUT_PATH)} (${found.size} entries)`);
  console.log("Next: npm run build:partner-catalog");

  if (found.size < expected.size * COVERAGE_FLOOR) {
    console.error(`\nWARNING: coverage ${Math.round((found.size / expected.size) * 100)}% is below the ${COVERAGE_FLOOR * 100}% floor.`);
    console.error("Suspect a changed listing URL, a dead session, or a changed tile structure BEFORE believing the number.");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
