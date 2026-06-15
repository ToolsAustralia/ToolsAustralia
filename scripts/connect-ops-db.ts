/**
 * Shared connect for ops scripts (seed / migrate / reconcile).
 *
 * Default: connects to the local/dev `MONGODB_URI` via the app's `connectDB`.
 *
 * With `--prod`: connects to `PROD_MONGODB_URI` instead, and — because the prod
 * Atlas string has NO `/<dbName>` path (so a bare connect silently lands on an
 * empty `test` DB) — forces the database to `Production` (override with
 * `PROD_DB_NAME`). It does this by rewriting `process.env.MONGODB_URI` BEFORE the
 * app's `connectDB` (or any service that calls it internally, e.g.
 * `recordAffiliateCommission`) is imported, so the WHOLE run uses prod uniformly
 * — no risk of a mid-run switch back to dev.
 *
 * Always prints `PROD|local · db="…" @ host` on startup so a prod run is
 * unmistakable in the logs.
 */

/** Insert/replace the database name in a mongodb(+srv) URI, preserving the query string. */
export function injectDbName(uri: string, dbName: string): string {
  const [beforeQuery, query] = uri.split("?");
  const schemeIdx = beforeQuery.indexOf("://");
  if (schemeIdx === -1) return uri; // not a URI we recognise; leave as-is
  const afterScheme = beforeQuery.slice(schemeIdx + 3); // user:pass@host[/db]
  const slashIdx = afterScheme.indexOf("/");
  const base =
    slashIdx === -1
      ? `${beforeQuery}/${dbName}` // no path → append
      : `${beforeQuery.slice(0, schemeIdx + 3 + slashIdx)}/${dbName}`; // replace existing path
  return query ? `${base}?${query}` : base;
}

/**
 * Connect the default Mongoose connection for an ops script and return mongoose.
 * @param label short run label for the startup log line
 */
export async function connectOpsDb(label: string) {
  const useProd = process.argv.includes("--prod");

  if (useProd) {
    const prodUri = process.env.PROD_MONGODB_URI;
    if (!prodUri) {
      console.error(`❌ ${label}: --prod was passed but PROD_MONGODB_URI is missing in .env.local`);
      process.exit(1);
    }
    const dbName = process.env.PROD_DB_NAME || "Production";
    // Rewrite MONGODB_URI so connectDB() and every internal caller use prod uniformly.
    process.env.MONGODB_URI = injectDbName(prodUri, dbName);
  }

  if (!process.env.MONGODB_URI) {
    console.error(`❌ ${label}: MONGODB_URI is not set in .env.local`);
    process.exit(1);
  }

  const mongoose = (await import("mongoose")).default;
  const connectDB = (await import("../src/lib/mongodb")).default;
  await connectDB();

  const dbName = mongoose.connection.db?.databaseName ?? "(unknown)";
  const uri = process.env.MONGODB_URI;
  const at = uri.indexOf("@");
  const host = at >= 0 ? uri.slice(at + 1).split("/")[0].split("?")[0] : "(host?)";
  console.log(`🔌 ${label} · ${useProd ? "PROD" : "local"} · db="${dbName}" @ ${host}`);

  if (useProd) {
    console.log("   ⚠️  Targeting PRODUCTION. Ctrl-C now if this was not intended.");
  }
  return mongoose;
}
