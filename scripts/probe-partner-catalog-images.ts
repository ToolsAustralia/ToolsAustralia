/**
 * Probes which partner-catalogue offers actually have artwork in the vendor's media bucket
 * and commits the answer to `src/data/partner-catalog/offers-with-artwork.json`.
 *
 * WHY THIS EXISTS
 * Artwork lives at `product_image/{id}.{ext}` and the **extension varies per offer** — mostly
 * `.png`, `.jpg` for some — with the bucket answering 403 for the wrong one. Nothing in the id
 * predicts it, so the only way to build a correct `src` is to ask once and commit the answer.
 * `build:partner-catalog` reads this file and stamps each browse row; the catalogue page then
 * renders an image only where one exists, with the right extension, and never fires a request
 * that is going to 403 through our own image optimiser.
 *
 * WHAT THIS SCRIPT CANNOT SEE — read this before trusting its percentage.
 * It only ever asks "does `product_image/{offerId}.{ext}` exist?", so it can only find artwork
 * that is keyed by the OFFER id. It reports ~948/1833 (52%), and that shortfall is structural,
 * not random: every category lands at 97-100% except "In-Store Offer" (877 rows) at **0%**.
 * Those offers are not missing artwork — theirs is keyed by an internal MERCHANT id that
 * appears nowhere in the CSV, so no derived URL can ever reach it. `harvest-partner-instore-
 * artwork.ts` reads those off the vendor's own listing pages; between the two, real coverage
 * is ~98%. A 52% result here is CORRECT and expected, not a failure.
 *
 * PATH HISTORY — two wrong conclusions, both from guessing URLs instead of reading the
 * vendor's HTML:
 *   1. An earlier version probed `big_image/{id}.png` and concluded "64 of 1,833 (3%)".
 *      `big_image/` holds home-page hero banners; a handful of merchandised ids resolved
 *      there and the number looked plausible.
 *   2. Then `product_image/` was declared "effectively total" — the validating sample happened
 *      to contain no in-store offers, so the 877-row hole was invisible.
 * If a coverage figure here ever looks surprising, open one offer in the portal with a live
 * session and read its `<img>` src before believing the percentage.
 *
 * NOT part of `prebuild`. It makes ~1,800 network calls, which would make every `npm run dev`
 * slow and non-deterministic. Run it by hand when the catalogue CSV changes:
 *
 *   npm run probe:partner-catalog-images
 *   npm run build:partner-catalog        # re-emit the generated files
 *
 * Read-only against the vendor: HEAD requests to a public bucket, no auth, no writes.
 */

import { config } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";

// Same convention as scripts/build-chat-knowledge-pack.ts — tsx does not load .env.local.
config({ path: path.resolve(process.cwd(), ".env.local") });

const CSV_PATH = path.join(process.cwd(), "src", "data", "partner-catalog", "offers-list-breakdown.csv");
const OUT_PATH = path.join(process.cwd(), "src", "data", "partner-catalog", "offers-with-artwork.json");

/** Same base the client uses; kept in env so the vendor host stays out of the code. */
const MEDIA_BASE = (process.env.NEXT_PUBLIC_PARTNER_MEDIA_URL || "").trim().replace(/\/+$/, "");
const CONCURRENCY = 12;

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/** Ids only — reuses the committed generated map rather than re-parsing the CSV by hand. */
async function readOfferIds(): Promise<string[]> {
  const raw = await fs.readFile(CSV_PATH, "utf8");
  const ids: string[] = [];
  // The ID is the first field of every record and is always bare digits, so a line-wise
  // scan is enough here — full RFC-4180 parsing lives in build-partner-catalog-preview.ts.
  for (const line of raw.split(/\r?\n/).slice(1)) {
    const m = /^(\d+),/.exec(line);
    if (m) ids.push(m[1]);
  }
  return ids;
}

async function main(): Promise<void> {
  if (!MEDIA_BASE) {
    fail("NEXT_PUBLIC_PARTNER_MEDIA_URL is not set — cannot probe artwork. See .env.example.");
  }

  const ids = await readOfferIds();
  const total = ids.length;
  console.log(`Probing artwork for ${total} offers at ${MEDIA_BASE}/product_image/{id}.{png,jpg} …`);

  const withArtwork: Record<string, string> = {};
  let done = 0;
  let errors = 0;
  const started = Date.now();
  // ~20 progress lines regardless of catalogue size (CLAUDE.md ops-script convention).
  const step = Math.max(1, Math.floor(total / 20));

  /**
   * Returns the extension that resolves, "" for a genuine miss, or null on a network failure.
   *
   * The extension VARIES per offer — mostly `.png`, `.jpg` for some — and the bucket answers
   * 403 for the wrong one, so each candidate has to be tried. One retry per candidate: a
   * transient failure recorded as "no artwork" would be committed and never revisited.
   */
  const EXTS = ["png", "jpg", "jpeg", "webp"];
  async function probe(id: string): Promise<string | null> {
    let networkFailed = false;
    for (const ext of EXTS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`${MEDIA_BASE}/product_image/${id}.${ext}`, { method: "HEAD" });
          if (res.ok) return ext;
          break; // a clean non-200 means this extension is simply wrong for this offer
        } catch {
          if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
          else networkFailed = true;
        }
      }
    }
    return networkFailed ? null : "";
  }

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const hit = await probe(id);
      if (hit) withArtwork[id] = hit;
      else if (hit === null) errors++;
      done++;
      if (done % step === 0 || done === total) {
        const elapsed = (Date.now() - started) / 1000;
        const rate = done / Math.max(elapsed, 0.001);
        const eta = Math.round((total - done) / Math.max(rate, 0.001));
        console.log(
          `  ${done}/${total} (${Math.round((done / total) * 100)}%) · ${rate.toFixed(1)}/sec · ETA ${eta}s · found ${Object.keys(withArtwork).length}`
        );
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await fs.writeFile(OUT_PATH, `${JSON.stringify(Object.fromEntries(Object.entries(withArtwork).sort(([a],[b]) => Number(a) - Number(b))), null, 0)}\n`, "utf8");

  const pct = Math.round((Object.keys(withArtwork).length / total) * 100);
  console.log(`\n✓ ${Object.keys(withArtwork).length} of ${total} offers have artwork (${pct}%)`);
  console.log(`  wrote ${path.relative(process.cwd(), OUT_PATH)}`);
  if (errors) console.log(`  ⚠ ${errors} probe(s) failed on the network and were treated as "no artwork"`);
  console.log(`  next: npm run build:partner-catalog`);
}

main().catch((err) => fail(String(err)));
