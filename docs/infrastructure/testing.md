# Infrastructure — Testing

## Health check

```bash
curl http://localhost:3000/api/health
```

Should return 200 with simple JSON status.

## Cron simulation

```bash
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/major-draw-transition
```

## Migration dry-run

```bash
npm run migrate:<name>:dry
```

## npm test scripts

New test scripts added to `package.json` follow the `test:<scope>` convention and can be run independently:

```bash
npm run test:past-due-history   # pure aggregation helpers (no env vars needed)
```

## What's NOT well tested

- Cron endpoint auth thoroughness
- Cloudinary signing edge cases
- Env validation across all consumers
- DST handling in date helpers
