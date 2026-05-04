# Infrastructure — Patterns

## P1. Validated env at boot

`lib/environment.ts` parses + validates env vars at startup. Missing/invalid → throw immediately. Don't lazy-validate (silent runtime failures).

## P2. Cron auth via shared secret

```ts
const secret = req.headers.get("x-cron-secret");
if (secret !== process.env.CRON_SECRET) return new Response("forbidden", { status: 403 });
// run job
```

## P3. Signed Cloudinary URLs

Client-direct uploads (don't proxy through our server). Server returns a signed URL; client POSTs the file directly to Cloudinary.

## P4. Sydney TZ via `date-fns-tz`

```ts
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
const sydneyNow = utcToZonedTime(new Date(), "Australia/Sydney");
```

## P5. Operational scripts dry-run by default

```ts
const live = process.argv.includes("--live");
if (!live) console.log("DRY RUN — not committing");
// ... compute changes ...
if (live) await commit();
```
