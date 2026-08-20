/**
 * Find CAPTURED mini-draw payments that could never have been granted.
 *
 * ── What it looks for ──────────────────────────────────────────────────────────────────────
 *
 * `handleMiniDrawWebhook` grants entries against a specific draw, read from
 * `paymentIntent.metadata.miniDrawId`. If that key is absent it logs and returns WITHOUT
 * granting and WITHOUT refunding — money in, nothing out.
 *
 * Until 2026-08-20 both `/api/stripe/create-one-time-purchase` and
 * `…-existing-user` would accept a mini-draw catalogue id (`mini-pack-1..8`,
 * `additional-{tradie,foreman,boss,power,vip}-pack-mini`), synthesise a one-time package from it,
 * stamp `type: "mini-draw"` — and never set `miniDrawId`, because neither route has a draw in
 * scope. Those routes now reject mini ids with a 400 (`isMiniDrawPackageId`), but this script
 * answers the historical question: did it ever actually fire?
 *
 * Expected result is ZERO. No live UI path ever posted a mini id to those routes — every
 * mini-draw buying surface posts to `/api/mini-draw/purchase`, which does set `miniDrawId`. This
 * exists to verify that rather than assume it, and to catch any external/legacy client.
 *
 * ── Why Stripe is the source of truth here ─────────────────────────────────────────────────
 *
 * The failure mode is "the webhook granted nothing", so there is no `PaymentEvent{BenefitsGranted}`
 * row and no `users.miniDrawPackages` entry to find. Mongo cannot see a purchase it never
 * recorded. So the scan starts from Stripe (which definitely has the charge) and cross-checks
 * INTO Mongo to prove nothing was granted.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────────────────────
 *
 *   npm run find:stranded-mini-draw-payments
 *
 *   Options (positional `--key=value`):
 *     --since=YYYY-MM-DD   Only scan PaymentIntents created on/after this date.
 *                          Default: 2025-11-14 — the repo's initial commit, which is when
 *                          exposure OPENS. Do not be tempted to date it from 2026-05-14 (when
 *                          the five `additional-*-pack-mini` ids landed): `mini-pack-1..8`
 *                          existed from day one, the synthesise-a-fake-package branch was
 *                          already in `create-one-time-purchase`, and the webhook of the day
 *                          had the same `if (!miniDrawId) return` bail. Starting later would
 *                          skip ~5.5 months of the window and print a false "Clean".
 *     --until=YYYY-MM-DD   Upper bound. Default: now.
 *     --verbose            Print every mini-draw PaymentIntent inspected, not just the bad ones.
 *
 * Output: CSV to stdout, progress + summary to stderr — so `> findings.csv` keeps the CSV clean.
 *
 * Exit codes: 0 = no stranded payments, 1 = stranded payments found, 2 = the script itself failed.
 *
 * Safety: READ-ONLY. No writes to Mongo or Stripe. Never issues a refund — deciding
 * refund-vs-manual-grant is a human call (see docs/REFUND_REVERSAL.md).
 *
 * Env: MONGODB_URI, STRIPE_SECRET_KEY (from .env.local).
 */

import { config } from "dotenv";
import path from "path";
import mongoose from "mongoose";

config({ path: path.resolve(process.cwd(), ".env.local") });

type Finding = {
  paymentIntentId: string;
  createdIso: string;
  amountAud: string;
  status: string;
  packageId: string;
  userEmail: string;
  metadataType: string;
  grantedInMongo: string;
  verdict: string;
};

function parseArg(key: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${key}=`));
  return hit ? hit.slice(key.length + 3) : undefined;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function main(): Promise<number> {
  const verbose = process.argv.includes("--verbose");
  const since = new Date(`${parseArg("since") ?? "2025-11-14"}T00:00:00Z`);
  const untilArg = parseArg("until");
  const until = untilArg ? new Date(`${untilArg}T23:59:59Z`) : new Date();

  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
    console.error("Invalid --since/--until. Use YYYY-MM-DD.");
    return 2;
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set — cannot scan Stripe.");
    return 2;
  }

  console.error(`Scanning Stripe PaymentIntents ${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}`);

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const connectDB = (await import("../src/lib/mongodb")).default;
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) {
    console.error("No Mongo connection.");
    return 2;
  }

  // The mini-draw catalogue, so the report can say WHICH pack was charged.
  const { miniDrawPackages } = await import("../src/data/miniDrawPackages");
  const miniIds = new Set(miniDrawPackages.map((p) => p._id));

  /**
   * NO UP-FRONT TOTAL, deliberately.
   *
   * The repo convention is that a long script prints a denominator so progress has meaning.
   * Stripe's list API cannot supply one: there is no count endpoint, and the only way to learn
   * the total is to page the entire window — i.e. do the whole job twice. So this reports
   * processed / rate / elapsed instead, on the same adaptive cadence, and states the window up
   * front so the run is still bounded and legible.
   */
  const startedAt = Date.now();
  let scanned = 0;
  let miniDrawSeen = 0;
  let nextLogAt = 200;
  const findings: Finding[] = [];

  const params: Record<string, unknown> = {
    created: { gte: Math.floor(since.getTime() / 1000), lte: Math.floor(until.getTime() / 1000) },
    limit: 100,
  };

  for await (const pi of stripe.paymentIntents.list(params as never)) {
    scanned += 1;

    if (scanned >= nextLogAt) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const rate = elapsedSec > 0 ? scanned / elapsedSec : 0;
      console.error(
        `  ${scanned} scanned · ${miniDrawSeen} mini-draw · ${findings.length} stranded · ` +
          `${rate.toFixed(1)}/sec · ${elapsedSec.toFixed(0)}s elapsed`,
      );
      // Adaptive: roughly 20 lines regardless of run size.
      nextLogAt = scanned + Math.max(200, Math.floor(scanned / 2));
    }

    const md = pi.metadata ?? {};
    const isMiniDraw = md.type === "mini-draw" || md.packageType === "mini-draw";
    if (!isMiniDraw) continue;
    miniDrawSeen += 1;

    // Only a CAPTURED payment can strand money. An uncaptured/failed PI owes nobody anything.
    const captured = pi.status === "succeeded";
    const hasDrawId = typeof md.miniDrawId === "string" && md.miniDrawId.length > 0;

    if (verbose) {
      console.error(
        `    ${pi.id} status=${pi.status} pkg=${md.packageId ?? "?"} miniDrawId=${hasDrawId ? md.miniDrawId : "MISSING"}`,
      );
    }

    if (hasDrawId || !captured) continue;

    // Stranded candidate. Prove it against Mongo before reporting: if the entries DID land by
    // some other path, this is not a victim and must not be reported as one.
    const [grantedEvent, grantedOnUser] = await Promise.all([
      db.collection("paymentevents").findOne(
        { paymentIntentId: pi.id, eventType: "BenefitsGranted" },
        { projection: { _id: 1 } },
      ),
      db.collection("users").findOne(
        { "miniDrawPackages.stripePaymentIntentId": pi.id },
        { projection: { _id: 1 } },
      ),
    ]);

    const granted = Boolean(grantedEvent) || Boolean(grantedOnUser);

    findings.push({
      paymentIntentId: pi.id,
      createdIso: new Date(pi.created * 1000).toISOString(),
      amountAud: (pi.amount / 100).toFixed(2),
      status: pi.status,
      packageId: String(md.packageId ?? ""),
      userEmail: String(md.userEmail ?? ""),
      metadataType: String(md.type ?? md.packageType ?? ""),
      grantedInMongo: granted ? "YES" : "NO",
      verdict: granted
        ? "granted-anyway (investigate: which path granted it?)"
        : miniIds.has(String(md.packageId ?? ""))
          ? "STRANDED — charged, nothing granted"
          : "STRANDED — charged, nothing granted (packageId not in current mini catalogue)",
    });
  }

  const elapsedSec = (Date.now() - startedAt) / 1000;
  const stranded = findings.filter((f) => f.grantedInMongo === "NO");

  // CSV to stdout so it survives `> findings.csv`; everything else goes to stderr.
  if (findings.length > 0) {
    const cols: Array<keyof Finding> = [
      "paymentIntentId",
      "createdIso",
      "amountAud",
      "status",
      "packageId",
      "userEmail",
      "metadataType",
      "grantedInMongo",
      "verdict",
    ];
    console.log(cols.join(","));
    for (const f of findings) console.log(cols.map((c) => csvCell(f[c])).join(","));
  }

  const strandedAud = stranded.reduce((t, f) => t + Number(f.amountAud), 0);
  console.error("");
  console.error("─".repeat(72));
  console.error(`PaymentIntents scanned        : ${scanned}`);
  console.error(`  …carrying mini-draw metadata: ${miniDrawSeen}`);
  console.error(`  …captured with NO miniDrawId: ${findings.length}`);
  console.error(`STRANDED (nothing granted)    : ${stranded.length}  ($${strandedAud.toFixed(2)} AUD)`);
  console.error(`Elapsed                       : ${elapsedSec.toFixed(0)}s`);
  console.error("─".repeat(72));

  if (stranded.length === 0) {
    console.error("Clean — no captured mini-draw payment is missing its grant.");
    return 0;
  }

  console.error("");
  console.error("ACTION REQUIRED. `miniDrawId` is unrecoverable for these — the metadata never held");
  console.error("it — so the intended draw cannot be inferred, and it has almost certainly closed.");
  console.error("Refund is usually the defensible remedy. A manual admin grant writes MiniDraw");
  console.error("entries but NO PaymentEvent and NO miniDrawPackages row, which leaves the revenue");
  console.error("ledger wrong and makes refund-reversal unable to unwind it later.");
  return 1;
}

main()
  .then(async (code) => {
    await mongoose.disconnect().catch(() => {});
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("Script failed:", err);
    await mongoose.disconnect().catch(() => {});
    process.exit(2);
  });
