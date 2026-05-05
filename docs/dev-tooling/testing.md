# Dev Tooling — Testing

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
npm run test:force-charge:dry -- --email=user@example.com
npm run test:force-charge:dry -- --customer=cus_xxx

# Live execution (requires an admin user in DB)
npm run test:force-charge:live -- --email=user@example.com --admin-email=admin@example.com
```

Both modes print `=== Target user ===`, `=== Eligibility ===`, and either `=== Plan (dry-run) ===` or `=== LIVE execution ===`. The live flag requires `--admin-email` and errors out if missing.

## Anti-checks

- Set `NODE_ENV=production` locally → all dev routes must 404
- Run a fix script twice → second run must skip
