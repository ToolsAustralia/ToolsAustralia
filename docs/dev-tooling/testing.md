# Dev Tooling — Testing

## `ops:*` is not `test:*` — the naming carries a safety guarantee (2026-08-06)

**`test:*` is safe to run blind. `ops:*` is not.** Anything under `test:` is a self-contained
assertion script you can sweep over in bulk; anything under `ops:` operates on real data,
takes required arguments, and may move money.

Six scripts were renamed `test:force-charge:*` / `test:recover-stranded*` → **`ops:`** for
exactly that reason. Three of them (`:live`) **charge real customers**, and while named
`test:*` they answered to any "run all the tests" loop — a sweep over every `test:*` script
invoked them, and only the missing-argument guard stopped them doing anything. That is one
CLI flag away from a very bad afternoon.

The rename is the guard: a bulk `test:*` runner can no longer reach them, and the prefix tells
you what you are about to run before you run it.

**When adding a script, pick the prefix by blast radius, not by folder.** Living in
`scripts/test-*.ts` does not make something a test — `ops:force-charge:live` did.

## Scenario scripts

```bash
npx tsx scripts/test-1-draw-ending-60mins.ts
npx tsx scripts/test-dst-transitions.ts
```

Each script mutates the dev DB to set up a specific timing scenario. Restore via reset script or manual cleanup.

## Test pixels page

Visit `http://localhost:3000/test-pixels/` to fire test events for each tracking provider. Verify in:
- Facebook Pixel Helper extension
- GTM debug mode
- Klaviyo activity feed
- TikTok Events Manager

## Force-charge test scripts

```bash
# Dry-run: print eligibility for a user (no writes)
npm run ops:force-charge:dry -- --email=user@example.com
npm run ops:force-charge:dry -- --customer=cus_xxx

# Live execution (requires an admin user in DB)
npm run ops:force-charge:live -- --email=user@example.com --admin-email=admin@example.com
```

Both modes print `=== Target user ===`, `=== Eligibility ===`, and either `=== Plan (dry-run) ===` or `=== LIVE execution ===`. The live flag requires `--admin-email` and errors out if missing.

## Stranded past-due recovery test script

Single-user diagnostic mirroring `test-force-charge.ts` but exercising the stranded-invoice recovery flow ([`src/server/admin/recoverStrandedPastDue.ts`](../../src/server/admin/recoverStrandedPastDue.ts)):

```bash
# Dry-run: scans open invoices for a stranded candidate and prints eligibility (no writes)
npm run ops:recover-stranded:dry -- --email=user@example.com
npm run ops:recover-stranded:dry -- --customer=cus_xxx
npm run ops:recover-stranded:dry -- --email=user@example.com --invoice=in_xxx

# Live execution: voids the dead invoice, finalizes the held draft, pays
npm run ops:recover-stranded:live -- --email=user@example.com --admin-email=admin@example.com
```

Flags: `--email=` or `--customer=` (required), `--invoice=` (optional; auto-scans for a stranded invoice otherwise), `--live`, `--admin-email=` (required when `--live`). Live mode calls the recovery flow with `bypassRecentRecoveryLock: true` so devs can re-run inside the 6h window during testing.

### Bulk variant — drain all stranded users in one run

[`scripts/test-recover-stranded-past-due-batch.ts`](../../scripts/test-recover-stranded-past-due-batch.ts) is the all-users companion. It loads every Mongo user with `subscription.status === "past_due"` and a Stripe customer, finds the first stranded open invoice per user, and (with `--live`) runs the recovery flow against each one sequentially with 500ms pacing.

```bash
# Dry-run everything (no writes)
npm run ops:recover-stranded-all:dry

# Dry-run first 5 past_due users
npm run ops:recover-stranded-all:dry -- --limit=5

# Live execution — requires --admin-email AND --confirm-bulk
npm run ops:recover-stranded-all:live -- --admin-email=admin@example.com --confirm-bulk
```

Flags: `--limit=N` (optional cap), `--live`, `--admin-email=` (required when `--live`), `--confirm-bulk` (extra safety gate required when `--live` — this script touches many real cards in one run). Per-user errors are printed and counted but never abort the batch. Final summary tallies scanned / no-stranded / not-eligible / recovered (success/failed/skipped) / errors.

## Anti-checks

- Set `NODE_ENV=production` locally → all dev routes must 404
- Run a fix script twice → second run must skip

## iGoDirect / MyRewards SSO connectivity probe

`npm run test:igodirect-sso` ([scripts/test-igodirect-sso.ts](../../scripts/test-igodirect-sso.ts)) — proves we can mint a valid MyRewards SSO token and round-trip it. **Production-safe:** it only ever sends iGoDirect's own emailed sample identity (`member_id: tools_reward_user`), which already exists on their side, so `/generatetoken` returns "User found" and creates no new permanent record. Steps: (1) offline secret proof (recomputes the HMAC over their sample token — no network); (2) mint with the production signer + POST `/generatetoken`; (3) replica-encoding retry only if the standard token is rejected; (4) read-only `/verifytoken` 302 check. `--no-network` runs only the offline proof. Needs `IGODIRECT_SSO_SECRET` in `.env.local`.

## ⚠️ TEMPORARY: MyRewards SSO test harness (REMOVE before merge)

`src/app/dev/rewards-sso/` — a throwaway dev page at **`/dev/rewards-sso`** (404 outside `development`, so it only runs on localhost — never on a deployed build) to manually verify the gated MyRewards SSO hand-off (`POST /api/partner-discount/sso`). **Flagged for removal** — delete the folder when done; the real entry button is part of the new rewards UI. Kept **uncommitted** (local-only) so it can't ship.
